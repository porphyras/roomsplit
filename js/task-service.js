/**
 * Task Service — Core-функция №1: создание, назначение, смена статуса, удаление.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./config.js'), require('./errors.js'), require('./state.js'), require('./validation.js'));
  } else {
    const RS = root.RoomSplit;
    RS.taskService = factory(RS.config, RS.errors, RS.state, RS.validation);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (config, errors, stateModule, validation) {
  'use strict';

  const STATUSES = Object.values(config.TASK_STATUS);

  function collectTaskErrors(state, title, assigneeId, status) {
    const problems = [];
    if (!title) problems.push({ code: 'TASK_TITLE_REQUIRED' });
    else if (title.length > config.LIMITS.TITLE_MAX_LENGTH) problems.push({ code: 'TASK_TITLE_TOO_LONG' });
    if (!validation.findById(state.residents, assigneeId)) problems.push({ code: 'RESIDENT_NOT_FOUND', field: 'assigneeId' });
    if (STATUSES.indexOf(status) === -1) problems.push({ code: 'INVALID_STATUS' });
    return problems;
  }

  /**
   * Сохраняет время выполнения (для истории выполненных дел):
   * при переходе в completed ставит completedAt, при возврате в pending убирает.
   */
  function withStatus(task, status) {
    const next = Object.assign({}, task, { status: status });
    if (status === config.TASK_STATUS.COMPLETED) {
      if (task.status !== config.TASK_STATUS.COMPLETED || !task.completedAt) next.completedAt = new Date().toISOString();
    } else {
      delete next.completedAt;
    }
    return next;
  }

  function replaceTask(state, task) {
    return Object.assign({}, state, {
      tasks: state.tasks.map(function (t) { return t.id === task.id ? task : t; }),
    });
  }

  function requireTask(state, id) {
    const task = validation.findById(state.tasks, id);
    if (!task) throw new errors.AppError('TASK_NOT_FOUND');
    return task;
  }

  /** createTask({ title, assigneeId, status? }) → { state, task }. Статус по умолчанию — pending. */
  function createTask(state, payload) {
    const data = payload || {};
    const title = validation.normalizeText(data.title);
    const status = data.status === undefined ? config.TASK_STATUS.PENDING : data.status;
    errors.throwIfAny(collectTaskErrors(state, title, data.assigneeId, status));

    const task = withStatus({
      id: stateModule.generateId('task'),
      title: title,
      assigneeId: data.assigneeId,
      status: config.TASK_STATUS.PENDING,
      createdAt: new Date().toISOString(),
    }, status);
    return { state: Object.assign({}, state, { tasks: state.tasks.concat([task]) }), task: task };
  }

  /** updateTask(id, { title, assigneeId, status }) — экран редактирования обязанности. */
  function updateTask(state, id, payload) {
    const current = requireTask(state, id);
    const data = payload || {};
    const title = data.title === undefined ? current.title : validation.normalizeText(data.title);
    const assigneeId = data.assigneeId === undefined ? current.assigneeId : data.assigneeId;
    const status = data.status === undefined ? current.status : data.status;
    errors.throwIfAny(collectTaskErrors(state, title, assigneeId, status));

    const task = withStatus(Object.assign({}, current, { title: title, assigneeId: assigneeId }), status);
    return { state: replaceTask(state, task), task: task };
  }

  /** updateTaskStatus(id, status) → { state, task } */
  function updateTaskStatus(state, id, status) {
    const current = requireTask(state, id);
    if (STATUSES.indexOf(status) === -1) throw new errors.AppError('INVALID_STATUS');
    const task = withStatus(current, status);
    return { state: replaceTask(state, task), task: task };
  }

  /** deleteTask(id) → { state, success: true } */
  function deleteTask(state, id) {
    requireTask(state, id);
    return {
      state: Object.assign({}, state, { tasks: state.tasks.filter(function (t) { return t.id !== id; }) }),
      success: true,
    };
  }

  return {
    createTask: createTask,
    updateTask: updateTask,
    updateTaskStatus: updateTaskStatus,
    deleteTask: deleteTask,
  };
});
