'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseAmountToKopecks, formatKopecks, formatInputAmount } = require('../js/money.js');

const NBSP = '\u00A0';

test('разбор суммы в копейки', () => {
  const cases = {
    '3000': 300000,
    '3 000': 300000,
    '1500,5': 150050,
    '1500.50': 150050,
    '99.99': 9999,
    '0,01': 1,
    '250 ₽': 25000,
    '250р': 25000,
    '  42  ': 4200,
    ['10' + NBSP + '000']: 1000000,
  };
  Object.entries(cases).forEach(([input, expected]) => {
    assert.equal(parseAmountToKopecks(input), expected, input);
  });
  assert.equal(parseAmountToKopecks(12.34), 1234);
  assert.equal(parseAmountToKopecks(300), 30000);
});

test('некорректные суммы → AMOUNT_INVALID', () => {
  ['', '   ', '0', '0,00', '-100', 'abc', '10,999', '1.2.3', '1e5', ',5', 'Infinity'].forEach((input) => {
    assert.throws(() => parseAmountToKopecks(input), { code: 'AMOUNT_INVALID', field: 'amount' }, input);
  });
  [null, undefined, NaN, Infinity, {}, []].forEach((input) => {
    assert.throws(() => parseAmountToKopecks(input), { code: 'AMOUNT_INVALID' });
  });
});

test('слишком большая сумма → AMOUNT_TOO_LARGE', () => {
  assert.equal(parseAmountToKopecks('10000000'), 1000000000);
  assert.throws(() => parseAmountToKopecks('10000000,01'), { code: 'AMOUNT_TOO_LARGE' });
  assert.throws(() => parseAmountToKopecks('999999999999'), { code: 'AMOUNT_TOO_LARGE' });
});

test('форматирование копеек', () => {
  assert.equal(formatKopecks(100000), '1' + NBSP + '000' + NBSP + '₽');
  assert.equal(formatKopecks(33334), '333,34' + NBSP + '₽');
  assert.equal(formatKopecks(5), '0,05' + NBSP + '₽');
  assert.equal(formatKopecks(0), '0' + NBSP + '₽');
  assert.equal(formatKopecks(123456789), '1' + NBSP + '234' + NBSP + '567,89' + NBSP + '₽');
  assert.equal(formatKopecks(-150), '−1,50' + NBSP + '₽');
});

test('понятные сообщения: что именно не так с суммой', () => {
  const messageOf = (input) => {
    try {
      parseAmountToKopecks(input);
    } catch (e) {
      return [e.code, e.message];
    }
    return null;
  };
  assert.deepEqual(messageOf(''), ['AMOUNT_INVALID', 'Введите сумму']);
  assert.deepEqual(messageOf('abc'), ['AMOUNT_INVALID', 'Введите сумму числом, например 1500 или 1500,50']);
  assert.deepEqual(messageOf('-100'), ['AMOUNT_INVALID', 'Сумма должна быть больше нуля']);
  assert.deepEqual(messageOf('0'), ['AMOUNT_INVALID', 'Сумма должна быть больше нуля']);
  assert.deepEqual(messageOf('10,999'), ['AMOUNT_INVALID', 'Не больше двух знаков после запятой — это копейки']);
  // Баг из ручного теста: 17 девяток показывали «должна быть больше 0».
  assert.deepEqual(messageOf('99999999999999999'), ['AMOUNT_TOO_LARGE', 'Слишком большая сумма: максимум 10 000 000 ₽']);
  assert.deepEqual(messageOf('0000000000000000000005'), null, 'ведущие нули — не «слишком большая»');
});

test('значение для поля ввода всегда с копейками', () => {
  assert.equal(formatInputAmount(300000), '3' + NBSP + '000,00');
  assert.equal(formatInputAmount(150050), '1' + NBSP + '500,50');
  assert.equal(formatInputAmount(5), '0,05');
  assert.equal(parseAmountToKopecks(formatInputAmount(123456789)), 123456789, 'формат читается обратно');
});
