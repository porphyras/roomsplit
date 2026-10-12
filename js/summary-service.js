/**
 * Summary Service — Core-функция №3: собирает обязанности и долги в одно
 * представление. Сводка нигде не хранится, а строится заново из AppState.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./config.js'), require('./debt-calculator.js'), require('./validation.js'));
  } else {
    const RS = root.RoomSplit;
    RS.summaryService = factory(RS.config, RS.debtCalculator, RS.validation);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (config, debtCalculator, validation) {
  'use strict';

  function nameOf(state, id) {
    const resident = validation.findById(state.residents, id);
    return resident ? resident.name : '—';
  }

  /** getSummary(state) → { tasks, debts, expenses, residents, totals } */
  function getSummary(state) {
    const pending = [];
    const completed = [];
    state.tasks.forEach(function (task) {
      const view = Object.assign({}, task, { assigneeName: nameOf(state, task.assigneeId) });
      (task.status === config.TASK_STATUS.COMPLETED ? completed : pending).push(view);
    });

    const debts = debtCalculator.calculateDebts(state.expenses, state.residents).map(function (debt) {
      return Object.assign({}, debt, {
        debtorName: nameOf(state, debt.debtorId),
        creditorName: nameOf(state, debt.creditorId),
      });
    });

    // Новые расходы сверху.
    const expenses = state.expenses.slice().reverse().map(function (expense) {
      return Object.assign({}, expense, {
        payerName: nameOf(state, expense.payerId),
        participantNames: expense.participantIds.map(function (id) { return nameOf(state, id); }),
      });
    });

    const totalExpensesKopecks = state.expenses.reduce(function (sum, e) { return sum + e.amountKopecks; }, 0);

    return {
      residents: state.residents.slice(),
      tasks: pending.concat(completed),
      debts: debts,
      expenses: expenses,
      totals: {
        pendingTasks: pending.length,
        completedTasks: completed.length,
        expensesKopecks: totalExpensesKopecks,
      },
    };
  }

  return { getSummary: getSummary };
});
