/**
 * Store — точка входа для интерфейса. Реализует контракты из ТЗ 3.1:
 * валидация → изменение AppState → сохранение в LocalStorage.
 * Если запись не удалась, состояние откатывается, и пользователь видит ошибку.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./config.js'),
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
      RS.config, RS.errors, RS.state, RS.storage, RS.debtCalculator,
      RS.residentService, RS.taskService, RS.expenseService, RS.paymentService, RS.summaryService, RS.demoData
    );
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (
  config, errors, stateModule, storageModule, debtCalculator,
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

    function readRaw() {
      try {
        return storage.getItem(config.STORAGE_KEY);
      } catch (e) {
        return undefined;
      }
    }

    // Последняя версия данных, которую эта вкладка прочитала или записала.
    let lastRaw = mode === 'persist' ? readRaw() : undefined;

    /**
     * Если данные изменила другая вкладка — подхватываем их, чтобы не затереть
     * чужие изменения своей устаревшей копией. Возвращает true, если состояние обновилось.
     */
    function sync() {
      if (mode !== 'persist') return false;
      const raw = readRaw();
      if (raw === undefined || raw === lastRaw) return false;
      lastRaw = raw;
      if (raw === null) {
        state = stateModule.createDefaultState();
        return true;
      }
      try {
        state = stateModule.validateState(JSON.parse(raw));
        return true;
      } catch (e) {
        return false; // чужие данные повреждены — оставляем свою копию
      }
    }

    function commit(nextState) {
      if (mode === 'protected') throw new errors.AppError('STORAGE_WRITE_ERROR');
      if (mode === 'persist') {
        storageModule.saveState(nextState, storage);
        lastRaw = JSON.stringify(nextState);
      }
      state = nextState;
    }

    /** Действие всегда считается от самых свежих данных. */
    function run(change) {
      sync();
      const result = change(state);
      commit(result.state);
      return result;
    }

    return {
      loadError: loaded.error,
      backupKey: loaded.backupKey,
      getMode: function () { return mode; },
      getState: function () {
        sync();
        return JSON.parse(JSON.stringify(state));
      },

      /** Перечитать данные (другая вкладка что-то изменила). true — если что-то поменялось. */
      reload: sync,

      addResident: function (payload) {
        return run(function (s) { return residentService.addResident(s, payload); }).resident;
      },
      removeResident: function (id) {
        run(function (s) { return residentService.removeResident(s, id); });
        return { success: true };
      },

      createTask: function (payload) {
        return run(function (s) { return taskService.createTask(s, payload); }).task;
      },
      updateTask: function (id, payload) {
        return run(function (s) { return taskService.updateTask(s, id, payload); }).task;
      },
      updateTaskStatus: function (id, status) {
        return run(function (s) { return taskService.updateTaskStatus(s, id, status); }).task;
      },
      deleteTask: function (id) {
        run(function (s) { return taskService.deleteTask(s, id); });
        return { success: true };
      },

      /** Возвращает расход и пересчитанный список долгов (ТЗ 3.1). */
      createExpense: function (payload) {
        const expense = run(function (s) { return expenseService.createExpense(s, payload); }).expense;
        return { expense: expense, debts: debtCalculator.calculateDebts(state.expenses, state.residents, state.payments) };
      },
      /** → { success, cancelledKopecks } — сколько погашений отменено вместе с расходом. */
      deleteExpense: function (id) {
        const result = run(function (s) { return expenseService.deleteExpense(s, id); });
        return { success: true, cancelledKopecks: result.cancelledKopecks };
      },
      previewDeleteExpense: function (id) {
        sync();
        return expenseService.previewDeleteExpense(state, id);
      },

      /** Погашение долга (сверх ТЗ): { payment, remainingKopecks }. */
      createPayment: function (payload) {
        const result = run(function (s) { return paymentService.createPayment(s, payload); });
        return { payment: result.payment, remainingKopecks: result.remainingKopecks };
      },
      deletePayment: function (id) {
        run(function (s) { return paymentService.deletePayment(s, id); });
        return { success: true };
      },

      getSummary: function () {
        sync();
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
        lastRaw = null;
        return { success: true };
      },
    };
  }

  return { createStore: createStore };
});
