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

  const NBSP = ' ';
  const AMOUNT_PATTERN = /^(\d{1,12})(?:\.(\d{1,2}))?$/;

  /**
   * Переводит ввод пользователя в копейки.
   * Принимает «3000», «3 000», «1500,5», «99.99», «250 ₽».
   * Бросает AMOUNT_INVALID / AMOUNT_TOO_LARGE.
   */
  function parseAmountToKopecks(input) {
    let text;
    if (typeof input === 'number') {
      if (!Number.isFinite(input)) throw new errors.AppError('AMOUNT_INVALID');
      text = String(input);
    } else if (typeof input === 'string') {
      text = input;
    } else {
      throw new errors.AppError('AMOUNT_INVALID');
    }

    const normalized = text
      .replace(/[\s  ]/g, '')
      .replace(/(₽|руб\.?|р\.?)$/i, '')
      .replace(',', '.');

    const match = AMOUNT_PATTERN.exec(normalized);
    if (!match) throw new errors.AppError('AMOUNT_INVALID');

    const rubles = Number(match[1]);
    const kopecks = Number((match[2] || '').padEnd(2, '0'));
    const total = rubles * 100 + kopecks;

    if (total <= 0) throw new errors.AppError('AMOUNT_INVALID');
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

  return { parseAmountToKopecks: parseAmountToKopecks, formatKopecks: formatKopecks };
});
