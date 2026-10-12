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

  /**
   * getSummary(state) → { tasks, pendingTasks, completedTasks, debts, expenses, residents, totals }
   * tasks — все задачи (сначала невыполненные), pendingTasks — для главного экрана,
   * completedTasks — история выполненных, новые сверху.
   */
  function getSummary(state) {
    const pending = [];
    const completed = [];
    state.tasks.forEach(function (task) {
      const view = Object.assign({}, task, { assigneeName: nameOf(state, task.assigneeId) });
      (task.status === config.TASK_STATUS.COMPLETED ? completed : pending).push(view);
    });

    // История: последние выполненные сверху (у старых записей без completedAt — по дате создания).
    const doneAt = function (task) { return task.completedAt || task.createdAt || ''; };
    const history = completed.slice().sort(function (a, b) {
      return doneAt(a) < doneAt(b) ? 1 : doneAt(a) > doneAt(b) ? -1 : 0;
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
      pendingTasks: pending,
      completedTasks: history,
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
