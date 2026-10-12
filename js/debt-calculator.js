/**
 * Debt Calculator — алгоритм расчёта долгов по ТЗ 3.2.
 *
 * 1. Баланс каждого жильца = 0.
 * 2. Каждый расход делится поровну: floor(amount / N) каждому,
 *    остаток копеек раздаётся по одной, начиная с первого в participantIds.
 * 3. Плательщику +amount, каждому участнику −доля.
 *    Плюс — ему должны, минус — он должен.
 * 4. Должники и кредиторы попарно гасят балансы, пока все не станут нулём.
 *
 * Долги нигде не хранятся: источник истины — расходы.
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

  /** { [residentId]: баланс в копейках } по всем расходам. */
  function calculateBalances(expenses, residents) {
    const balances = {};
    residents.forEach(function (r) { balances[r.id] = 0; });

    expenses.forEach(function (expense) {
      assertValidExpense(expense, balances);
      balances[expense.payerId] += expense.amountKopecks;
      splitAmount(expense.amountKopecks, expense.participantIds).forEach(function (part) {
        balances[part.residentId] -= part.shareKopecks;
      });
    });

    return balances;
  }

  /** Debt[] = [{ debtorId, creditorId, amountKopecks }] без нулевых и «самому себе». */
  function calculateDebts(expenses, residents) {
    const balances = calculateBalances(expenses, residents);

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

  return {
    splitAmount: splitAmount,
    calculateBalances: calculateBalances,
    calculateDebts: calculateDebts,
  };
});
