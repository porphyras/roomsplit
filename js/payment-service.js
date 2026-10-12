/**
 * Payment Service — погашение долгов (сверх ТЗ).
 * Погашение — запись «кто кому сколько вернул». Можно вернуть часть долга,
 * но не больше, чем должен. Ошибочное погашение можно удалить — долг вернётся.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./errors.js'), require('./state.js'), require('./validation.js'), require('./debt-calculator.js'));
  } else {
    const RS = root.RoomSplit;
    RS.paymentService = factory(RS.errors, RS.state, RS.validation, RS.debtCalculator);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (errors, stateModule, validation, debtCalculator) {
  'use strict';

  /** Текущий долг fromId → toId в копейках (0, если долга нет). */
  function currentDebt(state, fromId, toId) {
    const debt = debtCalculator.calculateDebts(state.expenses, state.residents, state.payments)
      .find(function (d) { return d.debtorId === fromId && d.creditorId === toId; });
    return debt ? debt.amountKopecks : 0;
  }

  /** createPayment({ fromId, toId, amountKopecks }) → { state, payment, remainingKopecks } */
  function createPayment(state, payload) {
    const data = payload || {};
    if (!validation.findById(state.residents, data.fromId) || !validation.findById(state.residents, data.toId)) {
      throw new errors.AppError('RESIDENT_NOT_FOUND');
    }

    const owed = data.fromId === data.toId ? 0 : currentDebt(state, data.fromId, data.toId);
    if (!owed) throw new errors.AppError('DEBT_NOT_FOUND');

    const amount = data.amountKopecks;
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new errors.AppError('AMOUNT_INVALID');
    if (amount > owed) throw new errors.AppError('PAYMENT_EXCEEDS_DEBT');

    const payment = {
      id: stateModule.generateId('payment'),
      fromId: data.fromId,
      toId: data.toId,
      amountKopecks: amount,
      createdAt: new Date().toISOString(),
    };
    return {
      state: Object.assign({}, state, { payments: state.payments.concat([payment]) }),
      payment: payment,
      remainingKopecks: owed - amount,
    };
  }

  /** deletePayment(id) → { state, success: true } */
  function deletePayment(state, id) {
    if (!validation.findById(state.payments, id)) throw new errors.AppError('PAYMENT_NOT_FOUND');
    return {
      state: Object.assign({}, state, { payments: state.payments.filter(function (p) { return p.id !== id; }) }),
      success: true,
    };
  }

  return { currentDebt: currentDebt, createPayment: createPayment, deletePayment: deletePayment };
});
