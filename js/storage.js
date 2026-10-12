/**
 * Чтение и запись AppState в LocalStorage (ТЗ 3.1, «Поведение при сбоях»).
 * Повреждённые данные никогда не затираются молча: сначала они
 * копируются в резервный ключ, и только потом приложение стартует с пустым состоянием.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./config.js'), require('./errors.js'), require('./state.js'));
  } else {
    root.RoomSplit.storage = factory(root.RoomSplit.config, root.RoomSplit.errors, root.RoomSplit.state);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (config, errors, stateModule) {
  'use strict';

  /** localStorage браузера или null, если доступ запрещён. */
  function getBrowserStorage() {
    try {
      const storage = globalThis.localStorage;
      if (!storage) return null;
      const probe = '__roomsplit_probe__';
      storage.setItem(probe, '1');
      storage.removeItem(probe);
      return storage;
    } catch (e) {
      return null;
    }
  }

  function backupRaw(storage, raw) {
    const key = config.BACKUP_KEY_PREFIX + Date.now();
    try {
      storage.setItem(key, raw);
      return key;
    } catch (e) {
      return null;
    }
  }

  /**
   * Возвращает { state, error, backupKey, canPersist }.
   * canPersist = false означает, что запись запрещена: иначе мы бы затёрли
   * данные, для которых не удалось сделать резервную копию.
   */
  function loadState(storage) {
    if (!storage) {
      return {
        state: stateModule.createDefaultState(),
        error: new errors.AppError('STORAGE_UNAVAILABLE'),
        backupKey: null,
        canPersist: false,
      };
    }

    let raw;
    try {
      raw = storage.getItem(config.STORAGE_KEY);
    } catch (e) {
      return {
        state: stateModule.createDefaultState(),
        error: new errors.AppError('STORAGE_UNAVAILABLE'),
        backupKey: null,
        canPersist: false,
      };
    }

    if (raw === null || raw === undefined) {
      return { state: stateModule.createDefaultState(), error: null, backupKey: null, canPersist: true };
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return recoverFrom(storage, raw, 'STATE_PARSE_ERROR');
    }

    try {
      return { state: stateModule.validateState(parsed), error: null, backupKey: null, canPersist: true };
    } catch (e) {
      return recoverFrom(storage, raw, 'STATE_INVALID');
    }
  }

  function recoverFrom(storage, raw, code) {
    const backupKey = backupRaw(storage, raw);
    return {
      state: stateModule.createDefaultState(),
      error: new errors.AppError(code),
      backupKey: backupKey,
      canPersist: backupKey !== null,
    };
  }

  function saveState(state, storage) {
    if (!storage) throw new errors.AppError('STORAGE_WRITE_ERROR');
    try {
      storage.setItem(config.STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      throw new errors.AppError('STORAGE_WRITE_ERROR');
    }
    return { success: true };
  }

  function clearState(storage) {
    if (!storage) return { success: true };
    try {
      storage.removeItem(config.STORAGE_KEY);
    } catch (e) {
      throw new errors.AppError('STORAGE_WRITE_ERROR');
    }
    return { success: true };
  }

  return {
    getBrowserStorage: getBrowserStorage,
    loadState: loadState,
    saveState: saveState,
    clearState: clearState,
  };
});
