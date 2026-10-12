/**
 * Единый формат ошибки (ТЗ 3.1): { code, message, field }.
 * Валидация может вернуть сразу несколько ошибок — они лежат в errors,
 * а code/message/field берутся из первой.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./config.js'));
  } else {
    root.RoomSplit.errors = factory(root.RoomSplit.config);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (config) {
  'use strict';

  /** message — необязательное уточнение текста для этого конкретного случая. */
  function describe(code, field, message) {
    const known = config.ERRORS[code];
    const item = { code: code, message: message || (known ? known.message : code) };
    const resolvedField = field || (known && known.field);
    if (resolvedField) item.field = resolvedField;
    return item;
  }

  class AppError extends Error {
    constructor(code, field, message) {
      const item = describe(code, field, message);
      super(item.message);
      this.name = 'AppError';
      this.code = item.code;
      if (item.field) this.field = item.field;
      this.errors = [item];
    }

    toJSON() {
      const out = { code: this.code, message: this.message };
      if (this.field) out.field = this.field;
      return out;
    }
  }

  /** Собирает ошибки валидации и бросает их одним AppError. */
  function throwIfAny(items) {
    if (!items.length) return;
    const error = new AppError(items[0].code, items[0].field, items[0].message);
    error.errors = items.map(function (it) { return describe(it.code, it.field, it.message); });
    throw error;
  }

  function isAppError(value) {
    return value instanceof AppError;
  }

  return { AppError: AppError, describe: describe, throwIfAny: throwIfAny, isAppError: isAppError };
});
