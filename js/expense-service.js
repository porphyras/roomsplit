/**
 * Expense Service — Core-функция №2: сохранение расходов.
 * Долги отдельно не хранятся — их считает Debt Calculator.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./config.js'), require('./errors.js'), require('./state.js'), require('./validation.js'));
  } else {
    const RS = root.RoomSplit;
    RS.expenseService = factory(RS.config, RS.errors, RS.state, RS.validation);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (config, errors, stateModule, validation) {
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

  /** Сверх ТЗ: удаление ошибочно внесённого расхода. Долги пересчитаются автоматически. */
  function deleteExpense(state, id) {
    if (!validation.findById(state.expenses, id)) throw new errors.AppError('EXPENSE_NOT_FOUND');
    return {
      state: Object.assign({}, state, { expenses: state.expenses.filter(function (e) { return e.id !== id; }) }),
      success: true,
    };
  }

  return { createExpense: createExpense, deleteExpense: deleteExpense };
});
