'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseAmountToKopecks, formatKopecks } = require('../js/money.js');

const NBSP = ' ';

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
