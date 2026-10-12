/**
 * Debt Calculator — алгоритм расчёта долгов по ТЗ 3.2.
 *
 * 1. Баланс каждого жильца = 0.
 * 2. Каждый расход делится поровну: floor(amount / N) каждому,
 *    остаток копеек раздаётся по одной, начиная с первого в participantIds.
 * 3. Плательщику +amount, каждому участнику −доля.
 *    Плюс — ему должны, минус — он должен.
 * 4. Погашение долга (сверх ТЗ) — обратный перевод: вернувшему +сумма, получившему −сумма.
 * 5. Должники и кредиторы попарно гасят балансы, пока все не станут нулём.
 *
 * Долги нигде не хранятся: источник истины — расходы и погашения.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./errors.js'));
  } else {
    root.RoomSplit.debtCalculator = factory(root.RoomSplit.errors);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (errors) {
  'use strict';

  /** Делит сумму на доли так, что их сумма всегда равна amount. */
  function splitAmount(amountKopecks, participantIds) {
    const count = participantIds.length;
    const base = Math.floor(amountKopecks / count);
    const remainder = amountKopecks - base * count;
    return participantIds.map(function (residentId, index) {
      return { residentId: residentId, shareKopecks: base + (index < remainder ? 1 : 0) };
    });
  }

  function assertValidExpense(expense, balances) {
    const valid = expense
      && Number.isSafeInteger(expense.amountKopecks)
      && expense.amountKopecks > 0
      && Object.prototype.hasOwnProperty.call(balances, expense.payerId)
      && Array.isArray(expense.participantIds)
      && expense.participantIds.length > 0
      && new Set(expense.participantIds).size === expense.participantIds.length
      && expense.participantIds.every(function (id) {
        return Object.prototype.hasOwnProperty.call(balances, id);
      });
    if (!valid) throw new errors.AppError('INVALID_EXPENSE_DATA');
  }

  function assertValidPayment(payment, balances) {
    const has = function (id) { return Object.prototype.hasOwnProperty.call(balances, id); };
    const valid = payment
      && Number.isSafeInteger(payment.amountKopecks)
      && payment.amountKopecks > 0
      && has(payment.fromId)
      && has(payment.toId)
      && payment.fromId !== payment.toId;
    if (!valid) throw new errors.AppError('INVALID_EXPENSE_DATA');
  }

  /** { [residentId]: баланс в копейках } по всем расходам и погашениям. */
  function calculateBalances(expenses, residents, payments) {
    const balances = {};
    residents.forEach(function (r) { balances[r.id] = 0; });

    expenses.forEach(function (expense) {
      assertValidExpense(expense, balances);
      balances[expense.payerId] += expense.amountKopecks;
      splitAmount(expense.amountKopecks, expense.participantIds).forEach(function (part) {
        balances[part.residentId] -= part.shareKopecks;
      });
    });

    (payments || []).forEach(function (payment) {
      assertValidPayment(payment, balances);
      balances[payment.fromId] += payment.amountKopecks;
      balances[payment.toId] -= payment.amountKopecks;
    });

    return balances;
  }

  /**
   * Debt[] = [{ debtorId, creditorId, amountKopecks }] без нулевых и «самому себе».
   * payments — необязательный список погашений.
   */
  function calculateDebts(expenses, residents, payments) {
    const balances = calculateBalances(expenses, residents, payments);

    // Порядок — как в списке жильцов, чтобы результат был предсказуемым.
    const debtors = [];
    const creditors = [];
    residents.forEach(function (r) {
      const balance = balances[r.id];
      if (balance < 0) debtors.push({ id: r.id, left: -balance });
      if (balance > 0) creditors.push({ id: r.id, left: balance });
    });

    const debts = [];
    let i = 0;
    let j = 0;
    while (i < debtors.length && j < creditors.length) {
      const debtor = debtors[i];
      const creditor = creditors[j];
      const amount = Math.min(debtor.left, creditor.left);
      if (amount > 0 && debtor.id !== creditor.id) {
        debts.push({ debtorId: debtor.id, creditorId: creditor.id, amountKopecks: amount });
      }
      debtor.left -= amount;
      creditor.left -= amount;
      if (debtor.left === 0) i += 1;
      if (creditor.left === 0) j += 1;
    }

    return debts;
  }

  /**
   * Сколько по каждому расходу ещё не вернули (сверх ТЗ, для закрытия расходов).
   * Погашения вносятся на общий долг, поэтому правило такое: всё, что жилец уже
   * вернул (деньгами или встречными долгами), засчитывается в его доли
   * в самых старых расходах. Расход закрыт, когда доли всех участников покрыты.
   * → { [expenseId]: копейки, которые ещё ждут возврата }
   */
  function calculateOutstanding(expenses, residents, payments) {
    const balances = calculateBalances(expenses, residents, payments);

    // Сколько жилец должен по чужим расходам в сумме.
    const owedShares = {};
    residents.forEach(function (r) { owedShares[r.id] = 0; });
    expenses.forEach(function (expense) {
      splitAmount(expense.amountKopecks, expense.participantIds).forEach(function (part) {
        if (part.residentId !== expense.payerId) owedShares[part.residentId] += part.shareKopecks;
      });
    });

    // Из них уже покрыто: всё, кроме текущего долга.
    const covered = {};
    residents.forEach(function (r) {
      covered[r.id] = Math.max(0, owedShares[r.id] - Math.max(0, -balances[r.id]));
    });

    const outstanding = {};
    expenses.forEach(function (expense) { // от старых к новым
      let left = 0;
      splitAmount(expense.amountKopecks, expense.participantIds).forEach(function (part) {
        if (part.residentId === expense.payerId) return;
        const take = Math.min(covered[part.residentId], part.shareKopecks);
        covered[part.residentId] -= take;
        left += part.shareKopecks - take;
      });
      outstanding[expense.id] = left;
    });
    return outstanding;
  }

  return {
    splitAmount: splitAmount,
    calculateBalances: calculateBalances,
    calculateDebts: calculateDebts,
    calculateOutstanding: calculateOutstanding,
  };
});
