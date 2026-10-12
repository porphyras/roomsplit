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

  // Невидимые символы (zero-width space, мягкий перенос и т.п.) и управляющие символы.
  const INVISIBLE = /[\u200B-\u200D\u2060\uFEFF\u00AD]/g;
  const CONTROL = /[\u0000-\u001F\u007F-\u009F]/g;

  /**
   * Обрезает пробелы по краям, схлопывает повторяющиеся внутри и убирает
   * невидимые символы — иначе можно создать «пустое» имя, которое не видно на экране.
   */
  function normalizeText(value) {
    if (typeof value !== 'string') return '';
    return value.replace(INVISIBLE, '').replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();
  }

  /** Ключ для сравнения имён: без регистра и без разницы между «ё» и «е». */
  function nameKey(value) {
    return normalizeText(value).toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
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

  return { normalizeText: normalizeText, nameKey: nameKey, uniqueStrings: uniqueStrings, findById: findById };
});
