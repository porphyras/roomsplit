/**
 * Конфигурация RoomSplit: константы приложения и тексты кодов ошибок.
 * Все остальные модули берут значения только отсюда.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.RoomSplit = root.RoomSplit || {};
    root.RoomSplit.config = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TASK_STATUS = Object.freeze({
    PENDING: 'pending',
    COMPLETED: 'completed',
  });

  const TASK_STATUS_LABELS = Object.freeze({
    pending: 'Не выполнено',
    completed: 'Выполнено',
  });

  const LIMITS = Object.freeze({
    NAME_MAX_LENGTH: 40,
    TITLE_MAX_LENGTH: 80,
    MAX_RESIDENTS: 20,
    // 10 000 000 ₽ — защита от опечаток вроде лишних нулей.
    MAX_AMOUNT_KOPECKS: 1000000000,
  });

  /**
   * Уточнённые тексты для AMOUNT_INVALID: код по ТЗ один,
   * но пользователю говорим, что именно не так с суммой.
   */
  const AMOUNT_MESSAGES = Object.freeze({
    EMPTY: 'Введите сумму',
    NOT_A_NUMBER: 'Введите сумму числом, например 1500 или 1500,50',
    NOT_POSITIVE: 'Сумма должна быть больше нуля',
    TOO_MANY_DECIMALS: 'Не больше двух знаков после запятой — это копейки',
  });

  /** Сколько записей показывать на главной, чтобы экран не рос бесконечно. */
  const UI = Object.freeze({
    EXPENSES_PREVIEW: 5,
    DONE_TASKS_PAGE: 10,
    PAYMENTS_PAGE: 10,
  });

  /**
   * Коды ошибок из ТЗ (раздел 3.1) и несколько дополнительных,
   * появившихся из-за функций сверх ТЗ (удаление расхода и жильца).
   * field — поле формы, рядом с которым показывается сообщение.
   */
  const ERRORS = Object.freeze({
    RESIDENT_NAME_REQUIRED: { message: 'Введите имя жильца', field: 'name' },
    RESIDENT_NAME_DUPLICATE: { message: 'Жилец с таким именем уже есть', field: 'name' },
    RESIDENT_NAME_TOO_LONG: { message: 'Имя не длиннее ' + LIMITS.NAME_MAX_LENGTH + ' символов', field: 'name' },
    RESIDENTS_LIMIT: { message: 'Можно добавить не больше ' + LIMITS.MAX_RESIDENTS + ' жильцов', field: 'name' },
    RESIDENT_IN_USE: { message: 'Нельзя удалить жильца, пока у него есть обязанности, расходы или погашения' },
    TASK_TITLE_REQUIRED: { message: 'Введите название обязанности', field: 'title' },
    TASK_TITLE_TOO_LONG: { message: 'Название не длиннее ' + LIMITS.TITLE_MAX_LENGTH + ' символов', field: 'title' },
    TASK_NOT_FOUND: { message: 'Обязанность не найдена — возможно, она уже удалена' },
    RESIDENT_NOT_FOUND: { message: 'Выберите жильца из списка' },
    INVALID_STATUS: { message: 'Статус должен быть «Не выполнено» или «Выполнено»', field: 'status' },
    EXPENSE_TITLE_REQUIRED: { message: 'Введите название расхода', field: 'title' },
    EXPENSE_TITLE_TOO_LONG: { message: 'Название не длиннее ' + LIMITS.TITLE_MAX_LENGTH + ' символов', field: 'title' },
    EXPENSE_NOT_FOUND: { message: 'Расход не найден — возможно, он уже удалён' },
    DEBT_NOT_FOUND: { message: 'Этого долга уже нет — возможно, он погашен или пересчитан' },
    PAYMENT_EXCEEDS_DEBT: { message: 'Нельзя вернуть больше, чем долг', field: 'amount' },
    PAYMENT_NOT_FOUND: { message: 'Погашение не найдено — возможно, оно уже удалено' },
    AMOUNT_INVALID: { message: 'Введите сумму больше нуля, например 1500 или 1500,50', field: 'amount' },
    AMOUNT_TOO_LARGE: { message: 'Слишком большая сумма: максимум 10 000 000 ₽', field: 'amount' },
    PARTICIPANTS_EMPTY: { message: 'Отметьте хотя бы одного участника', field: 'participantIds' },
    PAYER_NOT_IN_PARTICIPANTS: { message: 'Плательщик должен быть среди участников расхода', field: 'participantIds' },
    INVALID_EXPENSE_DATA: { message: 'Данные расхода повреждены — расчёт долгов невозможен' },
    STATE_PARSE_ERROR: { message: 'Не удалось прочитать сохранённые данные. Они сохранены в резервную копию, приложение запущено с чистого листа.' },
    STATE_INVALID: { message: 'Сохранённые данные имеют неверный формат. Они сохранены в резервную копию, приложение запущено с чистого листа.' },
    STORAGE_WRITE_ERROR: { message: 'Не удалось сохранить данные в браузере. Изменение не применено — попробуйте ещё раз.' },
    STORAGE_UNAVAILABLE: { message: 'Браузер запретил хранение данных (например, приватный режим). Приложение работает, но после закрытия вкладки данные пропадут.' },
  });

  return Object.freeze({
    APP_NAME: 'RoomSplit',
    STORAGE_KEY: 'roomsplit_state_v1',
    BACKUP_KEY_PREFIX: 'roomsplit_state_v1_backup_',
    // v2: добавлен список погашений payments. Данные v1 обновляются автоматически.
    SCHEMA_VERSION: 2,
    CURRENCY_SYMBOL: '₽',
    TASK_STATUS: TASK_STATUS,
    TASK_STATUS_LABELS: TASK_STATUS_LABELS,
    LIMITS: LIMITS,
    UI: UI,
    AMOUNT_MESSAGES: AMOUNT_MESSAGES,
    ERRORS: ERRORS,
  });
});
