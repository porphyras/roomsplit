/**
 * Expense Service — Core-функция №2: сохранение расходов.
 * Долги отдельно не хранятся — их считает Debt Calculator.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./config.js'), require('./errors.js'), require('./state.js'),
      require('./validation.js'), require('./debt-calculator.js')
    );
  } else {
    const RS = root.RoomSplit;
    RS.expenseService = factory(RS.config, RS.errors, RS.state, RS.validation, RS.debtCalculator);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (config, errors, stateModule, validation, debtCalculator) {
  'use strict';

  /**
   * createExpense({ title, amountKopecks, payerId, participantIds }) → { state, expense }.
   * Сумма уже должна быть переведена в копейки (money.parseAmountToKopecks).
   */
  function createExpense(state, payload) {
    const data = payload || {};
    const title = validation.normalizeText(data.title);
    const amount = data.amountKopecks;
    const participantIds = validation.uniqueStrings(data.participantIds);
    const problems = [];

    if (!title) problems.push({ code: 'EXPENSE_TITLE_REQUIRED' });
    else if (title.length > config.LIMITS.TITLE_MAX_LENGTH) problems.push({ code: 'EXPENSE_TITLE_TOO_LONG' });

    if (!Number.isSafeInteger(amount) || amount <= 0) problems.push({ code: 'AMOUNT_INVALID' });
    else if (amount > config.LIMITS.MAX_AMOUNT_KOPECKS) problems.push({ code: 'AMOUNT_TOO_LARGE' });

    const payerExists = !!validation.findById(state.residents, data.payerId);
    if (!payerExists) problems.push({ code: 'RESIDENT_NOT_FOUND', field: 'payerId' });

    if (!participantIds.length) {
      problems.push({ code: 'PARTICIPANTS_EMPTY' });
    } else if (participantIds.some(function (id) { return !validation.findById(state.residents, id); })) {
      problems.push({ code: 'RESIDENT_NOT_FOUND', field: 'participantIds' });
    } else if (payerExists && participantIds.indexOf(data.payerId) === -1) {
      problems.push({ code: 'PAYER_NOT_IN_PARTICIPANTS' });
    }

    errors.throwIfAny(problems);

    const expense = {
      id: stateModule.generateId('expense'),
      title: title,
      amountKopecks: amount,
      payerId: data.payerId,
      participantIds: participantIds,
      createdAt: new Date().toISOString(),
    };
    return { state: Object.assign({}, state, { expenses: state.expenses.concat([expense]) }), expense: expense };
  }

  /**
   * Переплата каждого жильца: сколько он вернул сверх того, что должен по расходам.
   * { [residentId]: копейки ≥ 0 }
   */
  function overpayments(expenses, residents, payments) {
    const owedByExpenses = debtCalculator.calculateBalances(expenses, residents);
    const result = {};
    residents.forEach(function (r) {
      const netPaid = payments.reduce(function (sum, p) {
        if (p.fromId === r.id) return sum + p.amountKopecks;
        if (p.toId === r.id) return sum - p.amountKopecks;
        return sum;
      }, 0);
      result[r.id] = Math.max(0, netPaid - Math.max(0, -owedByExpenses[r.id]));
    });
    return result;
  }

  /**
   * Какие погашения отменить при удалении расхода. Если человек уже вернул деньги
   * за этот расход, после удаления они превратились бы в переплату и «обратный» долг.
   * Отменяется только переплата, которая появилась именно из-за удаления
   * (старые законные погашения за другие расходы не трогаются): сначала погашения
   * плательщику удаляемого расхода, от новых к старым.
   * → [{ paymentId, fromId, toId, cancelKopecks }]
   */
  function paymentsToCancel(state, expense) {
    const remaining = state.expenses.filter(function (e) { return e.id !== expense.id; });
    const before = overpayments(state.expenses, state.residents, state.payments);
    const after = overpayments(remaining, state.residents, state.payments);
    const cancel = [];

    state.residents.forEach(function (r) {
      let excess = after[r.id] - before[r.id];
      if (excess <= 0) return;
      const own = state.payments
        .map(function (p, index) { return { p: p, index: index }; })
        .filter(function (x) { return x.p.fromId === r.id; })
        .sort(function (a, b) {
          const toPayerA = a.p.toId === expense.payerId ? 0 : 1;
          const toPayerB = b.p.toId === expense.payerId ? 0 : 1;
          return toPayerA - toPayerB || b.index - a.index;
        });
      own.forEach(function (x) {
        if (excess <= 0) return;
        const cut = Math.min(excess, x.p.amountKopecks);
        cancel.push({ paymentId: x.p.id, fromId: x.p.fromId, toId: x.p.toId, cancelKopecks: cut });
        excess -= cut;
      });
    });
    return cancel;
  }

  /** Что произойдёт при удалении расхода — для предупреждения перед удалением. */
  function previewDeleteExpense(state, id) {
    const expense = validation.findById(state.expenses, id);
    if (!expense) throw new errors.AppError('EXPENSE_NOT_FOUND');
    const cancelled = paymentsToCancel(state, expense);
    return {
      cancelledPayments: cancelled,
      cancelledKopecks: cancelled.reduce(function (sum, c) { return sum + c.cancelKopecks; }, 0),
    };
  }

  /**
   * Сверх ТЗ: удаление расхода. Долги пересчитаются автоматически, а погашения,
   * внесённые за этот расход, отменяются — иначе появились бы обратные долги.
   * → { state, success, cancelledPayments, cancelledKopecks }
   */
  function deleteExpense(state, id) {
    const preview = previewDeleteExpense(state, id);
    const cutById = {};
    preview.cancelledPayments.forEach(function (c) {
      cutById[c.paymentId] = (cutById[c.paymentId] || 0) + c.cancelKopecks;
    });
    const payments = state.payments
      .map(function (p) {
        return cutById[p.id] ? Object.assign({}, p, { amountKopecks: p.amountKopecks - cutById[p.id] }) : p;
      })
      .filter(function (p) { return p.amountKopecks > 0; });

    return {
      state: Object.assign({}, state, {
        expenses: state.expenses.filter(function (e) { return e.id !== id; }),
        payments: payments,
      }),
      success: true,
      cancelledPayments: preview.cancelledPayments,
      cancelledKopecks: preview.cancelledKopecks,
    };
  }

  return {
    createExpense: createExpense,
    previewDeleteExpense: previewDeleteExpense,
    deleteExpense: deleteExpense,
  };
});
