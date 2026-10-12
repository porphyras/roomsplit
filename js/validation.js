/**
 * Нормализация ввода (ТЗ 3.2): trim строк, пустая строка = отсутствие значения,
 * дубли в списках убираются.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.RoomSplit.validation = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** Обрезает пробелы по краям и схлопывает повторяющиеся внутри. */
  function normalizeText(value) {
    if (typeof value !== 'string') return '';
    return value.replace(/\s+/g, ' ').trim();
  }

  function uniqueStrings(list) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    const out = [];
    list.forEach(function (item) {
      if (typeof item === 'string' && !seen.has(item)) {
        seen.add(item);
        out.push(item);
      }
    });
    return out;
  }

  function findById(list, id) {
    for (let i = 0; i < list.length; i += 1) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  return { normalizeText: normalizeText, uniqueStrings: uniqueStrings, findById: findById };
});
