/**
 * Resident Service. Функции чистые: принимают AppState и возвращают новый,
 * исходный объект не меняется. При ошибке бросается AppError, состояние не трогается.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./config.js'), require('./errors.js'), require('./state.js'), require('./validation.js'));
  } else {
    const RS = root.RoomSplit;
    RS.residentService = factory(RS.config, RS.errors, RS.state, RS.validation);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (config, errors, stateModule, validation) {
  'use strict';

  /** addResident({ name }) → { state, resident } */
  function addResident(state, payload) {
    const name = validation.normalizeText(payload && payload.name);

    if (!name) throw new errors.AppError('RESIDENT_NAME_REQUIRED');
    if (name.length > config.LIMITS.NAME_MAX_LENGTH) throw new errors.AppError('RESIDENT_NAME_TOO_LONG');
    const key = validation.nameKey(name);
    const duplicate = state.residents.some(function (r) { return validation.nameKey(r.name) === key; });
    if (duplicate) throw new errors.AppError('RESIDENT_NAME_DUPLICATE');
    if (state.residents.length >= config.LIMITS.MAX_RESIDENTS) throw new errors.AppError('RESIDENTS_LIMIT');

    const resident = { id: stateModule.generateId('resident'), name: name };
    return {
      state: Object.assign({}, state, { residents: state.residents.concat([resident]) }),
      resident: resident,
    };
  }

  /**
   * Сверх ТЗ: удаление жильца, у которого ещё нет ни задач, ни расходов
   * (например, опечатка в имени). Если ссылки есть — удаление блокируется (ТЗ 2.3).
   */
  function removeResident(state, residentId) {
    if (!validation.findById(state.residents, residentId)) throw new errors.AppError('RESIDENT_NOT_FOUND');

    const inUse = state.tasks.some(function (t) { return t.assigneeId === residentId; })
      || state.expenses.some(function (e) {
        return e.payerId === residentId || e.participantIds.indexOf(residentId) !== -1;
      })
      || state.payments.some(function (p) { return p.fromId === residentId || p.toId === residentId; });
    if (inUse) throw new errors.AppError('RESIDENT_IN_USE');

    return {
      state: Object.assign({}, state, {
        residents: state.residents.filter(function (r) { return r.id !== residentId; }),
      }),
      success: true,
    };
  }

  return { addResident: addResident, removeResident: removeResident };
});
