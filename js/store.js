/**
 * Store — точка входа для интерфейса. Реализует контракты из ТЗ 3.1:
 * валидация → изменение AppState → сохранение в LocalStorage.
 * Если запись не удалась, состояние откатывается, и пользователь видит ошибку.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./errors.js'),
      require('./state.js'),
      require('./storage.js'),
      require('./debt-calculator.js'),
      require('./resident-service.js'),
      require('./task-service.js'),
      require('./expense-service.js'),
      require('./payment-service.js'),
      require('./summary-service.js'),
      require('./demo-data.js')
    );
  } else {
    const RS = root.RoomSplit;
    RS.store = factory(
      RS.errors, RS.state, RS.storage, RS.debtCalculator,
      RS.residentService, RS.taskService, RS.expenseService, RS.paymentService, RS.summaryService, RS.demoData
    );
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (
  errors, stateModule, storageModule, debtCalculator,
  residentService, taskService, expenseService, paymentService, summaryService, demoData
) {
  'use strict';

  /**
   * Режимы хранения:
   *  - persist   — обычная работа с LocalStorage;
   *  - memory    — LocalStorage недоступен, данные живут до закрытия вкладки;
   *  - protected — старые данные повреждены и их не удалось скопировать,
   *                поэтому запись запрещена, пока пользователь явно не сбросит данные.
   */
  function createStore(options) {
    const opts = options || {};
    let storage = Object.prototype.hasOwnProperty.call(opts, 'storage')
      ? opts.storage
      : storageModule.getBrowserStorage();

    const loaded = storageModule.loadState(storage);
    let state = loaded.state;
    let mode;
    if (!storage || (loaded.error && loaded.error.code === 'STORAGE_UNAVAILABLE')) {
      mode = 'memory';
      storage = null;
    } else {
      mode = loaded.canPersist ? 'persist' : 'protected';
    }

    function commit(nextState) {
      if (mode === 'protected') throw new errors.AppError('STORAGE_WRITE_ERROR');
      if (mode === 'persist') storageModule.saveState(nextState, storage);
      state = nextState;
    }

    function run(result) {
      commit(result.state);
      return result;
    }

    return {
      loadError: loaded.error,
      backupKey: loaded.backupKey,
      getMode: function () { return mode; },
      getState: function () { return JSON.parse(JSON.stringify(state)); },

      addResident: function (payload) {
        return run(residentService.addResident(state, payload)).resident;
      },
      removeResident: function (id) {
        run(residentService.removeResident(state, id));
        return { success: true };
      },

      createTask: function (payload) {
        return run(taskService.createTask(state, payload)).task;
      },
      updateTask: function (id, payload) {
        return run(taskService.updateTask(state, id, payload)).task;
      },
      updateTaskStatus: function (id, status) {
        return run(taskService.updateTaskStatus(state, id, status)).task;
      },
      deleteTask: function (id) {
        run(taskService.deleteTask(state, id));
        return { success: true };
      },

      /** Возвращает расход и пересчитанный список долгов (ТЗ 3.1). */
      createExpense: function (payload) {
        const expense = run(expenseService.createExpense(state, payload)).expense;
        return { expense: expense, debts: debtCalculator.calculateDebts(state.expenses, state.residents, state.payments) };
      },
      deleteExpense: function (id) {
        run(expenseService.deleteExpense(state, id));
        return { success: true };
      },

      /** Погашение долга (сверх ТЗ): { payment, remainingKopecks }. */
      createPayment: function (payload) {
        const result = run(paymentService.createPayment(state, payload));
        return { payment: result.payment, remainingKopecks: result.remainingKopecks };
      },
      deletePayment: function (id) {
        run(paymentService.deletePayment(state, id));
        return { success: true };
      },

      getSummary: function () {
        return summaryService.getSummary(state);
      },

      loadDemo: function () {
        commit(demoData.buildDemoState());
        return { success: true };
      },

      /** Явный сброс по кнопке: очищает хранилище и снимает режим protected. */
      reset: function () {
        if (storage) storageModule.clearState(storage);
        if (mode === 'protected') mode = 'persist';
        state = stateModule.createDefaultState();
        return { success: true };
      },
    };
  }

  return { createStore: createStore };
});
