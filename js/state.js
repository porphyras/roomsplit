/**
 * Модель данных AppState (ТЗ 2.3): создание пустого состояния,
 * генерация id и проверка структуры прочитанных из хранилища данных.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./config.js'), require('./errors.js'));
  } else {
    root.RoomSplit.state = factory(root.RoomSplit.config, root.RoomSplit.errors);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (config, errors) {
  'use strict';

  function createDefaultState() {
    return {
      schemaVersion: config.SCHEMA_VERSION,
      residents: [],
      tasks: [],
      expenses: [],
      payments: [],
    };
  }

  /** UUID, если браузер умеет, иначе timestamp + случайный суффикс (ТЗ 2.3). */
  function generateId(prefix) {
    const cryptoApi = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
    const body = cryptoApi && typeof cryptoApi.randomUUID === 'function'
      ? cryptoApi.randomUUID()
      : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    return prefix + '-' + body;
  }

  function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }

  function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function invalid() {
    throw new errors.AppError('STATE_INVALID');
  }

  /**
   * Проверяет, что данные соответствуют схеме и все ссылки целы.
   * Возвращает «чистую» копию только с известными полями, иначе бросает STATE_INVALID.
   */
  function validateState(raw) {
    if (!isPlainObject(raw)) invalid();
    // Миграция: в v1 погашений не было — считаем, что список пуст.
    const isV1 = raw.schemaVersion === 1;
    if (!isV1 && raw.schemaVersion !== config.SCHEMA_VERSION) invalid();
    if (!Array.isArray(raw.residents) || !Array.isArray(raw.tasks) || !Array.isArray(raw.expenses)) invalid();
    const rawPayments = isV1 ? [] : raw.payments;
    if (!Array.isArray(rawPayments)) invalid();

    const residentIds = new Set();
    const residents = raw.residents.map(function (r) {
      if (!isPlainObject(r) || !isNonEmptyString(r.id) || !isNonEmptyString(r.name)) invalid();
      if (residentIds.has(r.id)) invalid();
      residentIds.add(r.id);
      return { id: r.id, name: r.name };
    });

    const taskIds = new Set();
    const statuses = Object.values(config.TASK_STATUS);
    const tasks = raw.tasks.map(function (t) {
      if (!isPlainObject(t) || !isNonEmptyString(t.id) || !isNonEmptyString(t.title)) invalid();
      if (taskIds.has(t.id) || !residentIds.has(t.assigneeId) || statuses.indexOf(t.status) === -1) invalid();
      taskIds.add(t.id);
      const task = { id: t.id, title: t.title, assigneeId: t.assigneeId, status: t.status };
      if (typeof t.createdAt === 'string') task.createdAt = t.createdAt;
      if (typeof t.completedAt === 'string') task.completedAt = t.completedAt;
      return task;
    });

    const expenseIds = new Set();
    const expenses = raw.expenses.map(function (e) {
      if (!isPlainObject(e) || !isNonEmptyString(e.id) || !isNonEmptyString(e.title)) invalid();
      if (expenseIds.has(e.id)) invalid();
      if (!Number.isSafeInteger(e.amountKopecks) || e.amountKopecks <= 0) invalid();
      if (!residentIds.has(e.payerId) || !Array.isArray(e.participantIds) || !e.participantIds.length) invalid();
      if (new Set(e.participantIds).size !== e.participantIds.length) invalid();
      e.participantIds.forEach(function (id) { if (!residentIds.has(id)) invalid(); });
      if (e.participantIds.indexOf(e.payerId) === -1) invalid();
      expenseIds.add(e.id);
      const expense = {
        id: e.id,
        title: e.title,
        amountKopecks: e.amountKopecks,
        payerId: e.payerId,
        participantIds: e.participantIds.slice(),
      };
      if (typeof e.createdAt === 'string') expense.createdAt = e.createdAt;
      return expense;
    });

    const paymentIds = new Set();
    const payments = rawPayments.map(function (p) {
      if (!isPlainObject(p) || !isNonEmptyString(p.id) || paymentIds.has(p.id)) invalid();
      if (!residentIds.has(p.fromId) || !residentIds.has(p.toId) || p.fromId === p.toId) invalid();
      if (!Number.isSafeInteger(p.amountKopecks) || p.amountKopecks <= 0) invalid();
      paymentIds.add(p.id);
      const payment = { id: p.id, fromId: p.fromId, toId: p.toId, amountKopecks: p.amountKopecks };
      if (typeof p.createdAt === 'string') payment.createdAt = p.createdAt;
      return payment;
    });

    return {
      schemaVersion: config.SCHEMA_VERSION,
      residents: residents,
      tasks: tasks,
      expenses: expenses,
      payments: payments,
    };
  }

  return {
    createDefaultState: createDefaultState,
    generateId: generateId,
    validateState: validateState,
  };
});
