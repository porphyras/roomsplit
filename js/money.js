/**
 * Работа с деньгами. Все суммы внутри приложения — целые копейки (ТЗ 3.2),
 * поэтому ошибок округления float не бывает.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./config.js'), require('./errors.js'));
  } else {
    root.RoomSplit.money = factory(root.RoomSplit.config, root.RoomSplit.errors);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (config, errors) {
  'use strict';

  const NBSP = '\u00A0';
  const NUMBER_PATTERN = /^(\d+)(?:\.(\d+))?$/;
  const MAX_RUBLE_DIGITS = 12;

  function invalid(reason) {
    return new errors.AppError('AMOUNT_INVALID', null, config.AMOUNT_MESSAGES[reason]);
  }

  /**
   * Переводит ввод пользователя в копейки.
   * Принимает «3000», «3 000», «1500,5», «99.99», «250 ₽» — копейки писать не обязательно.
   * Бросает AMOUNT_INVALID (с уточнением, что не так) или AMOUNT_TOO_LARGE.
   */
  function parseAmountToKopecks(input) {
    let text;
    if (typeof input === 'number') {
      if (!Number.isFinite(input)) throw invalid('NOT_A_NUMBER');
      text = String(input);
    } else if (typeof input === 'string') {
      text = input;
    } else {
      throw invalid('EMPTY');
    }

    const normalized = text
      .replace(/[\s  ]/g, '')
      .replace(/(₽|руб\.?|р\.?)$/i, '')
      .replace(',', '.');

    if (!normalized) throw invalid('EMPTY');
    if (/^[-−–]/.test(normalized)) throw invalid('NOT_POSITIVE');

    const match = NUMBER_PATTERN.exec(normalized);
    if (!match) throw invalid('NOT_A_NUMBER');
    if (match[2] && match[2].length > 2) throw invalid('TOO_MANY_DECIMALS');
    // Длинное число не переводим в Number (потеряется точность) — сразу «слишком большая».
    if (match[1].replace(/^0+/, '').length > MAX_RUBLE_DIGITS) throw new errors.AppError('AMOUNT_TOO_LARGE');

    const rubles = Number(match[1]);
    const kopecks = Number((match[2] || '').padEnd(2, '0'));
    const total = rubles * 100 + kopecks;

    if (total <= 0) throw invalid('NOT_POSITIVE');
    if (total > config.LIMITS.MAX_AMOUNT_KOPECKS) throw new errors.AppError('AMOUNT_TOO_LARGE');
    return total;
  }

  function groupThousands(digits) {
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  }

  /** 100000 → «1 000 ₽», 33334 → «333,34 ₽». Пробелы неразрывные. */
  function formatKopecks(amount) {
    const sign = amount < 0 ? '−' : '';
    const abs = Math.abs(amount);
    const rubles = Math.floor(abs / 100);
    const rest = abs % 100;
    const fraction = rest ? ',' + String(rest).padStart(2, '0') : '';
    return sign + groupThousands(String(rubles)) + fraction + NBSP + config.CURRENCY_SYMBOL;
  }

  /** Значение для поля ввода: 150050 → «1 500,50» (всегда с копейками, без знака ₽). */
  function formatInputAmount(amount) {
    return groupThousands(String(Math.floor(amount / 100))) + ',' + String(amount % 100).padStart(2, '0');
  }

  return {
    parseAmountToKopecks: parseAmountToKopecks,
    formatKopecks: formatKopecks,
    formatInputAmount: formatInputAmount,
  };
});
