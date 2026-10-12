'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { splitAmount, calculateBalances, calculateDebts } = require('../js/debt-calculator.js');
const { ARTEM, MAXIM, NIKITA, RESIDENTS, ALL, expense } = require('./helpers.js');

function sumOf(list, key) {
  return list.reduce((s, x) => s + x[key], 0);
}

test('пример из ТЗ: Артём заплатил 3000 ₽ за троих', () => {
  const debts = calculateDebts([expense('e1', 300000, ARTEM.id, ALL)], RESIDENTS);
  assert.deepEqual(debts, [
    { debtorId: MAXIM.id, creditorId: ARTEM.id, amountKopecks: 100000 },
    { debtorId: NIKITA.id, creditorId: ARTEM.id, amountKopecks: 100000 },
  ]);
});

test('балансы из примера ТЗ: +2000, −1000, −1000', () => {
  const balances = calculateBalances([expense('e1', 300000, ARTEM.id, ALL)], RESIDENTS);
  assert.deepEqual(balances, { [ARTEM.id]: 200000, [MAXIM.id]: -100000, [NIKITA.id]: -100000 });
});

test('без расходов долгов нет', () => {
  assert.deepEqual(calculateDebts([], RESIDENTS), []);
  assert.deepEqual(calculateDebts([], []), []);
});

test('узкое место из гипотезы: три расхода от трёх разных плательщиков', () => {
  const expenses = [
    expense('food', 300000, ARTEM.id, ALL), // по 1000
    expense('net', 90000, MAXIM.id, ALL), // по 300
    expense('chem', 60000, NIKITA.id, ALL), // по 200
  ];
  // Артём: +3000 −1000 −300 −200 = +1500
  // Максим: −1000 +900 −300 −200 = −600
  // Никита: −1000 −300 +600 −200 = −900
  assert.deepEqual(calculateBalances(expenses, RESIDENTS), {
    [ARTEM.id]: 150000, [MAXIM.id]: -60000, [NIKITA.id]: -90000,
  });
  assert.deepEqual(calculateDebts(expenses, RESIDENTS), [
    { debtorId: MAXIM.id, creditorId: ARTEM.id, amountKopecks: 60000 },
    { debtorId: NIKITA.id, creditorId: ARTEM.id, amountKopecks: 90000 },
  ]);
});

test('встречные расходы взаимно гасятся', () => {
  const expenses = [
    expense('a', 100000, ARTEM.id, [ARTEM.id, MAXIM.id]),
    expense('b', 100000, MAXIM.id, [ARTEM.id, MAXIM.id]),
  ];
  assert.deepEqual(calculateDebts(expenses, RESIDENTS), []);
});

test('частичное погашение: остаётся только разница', () => {
  const expenses = [
    expense('a', 100000, ARTEM.id, [ARTEM.id, MAXIM.id]), // Максим должен 500
    expense('b', 40000, MAXIM.id, [ARTEM.id, MAXIM.id]), // Артём должен 200
  ];
  assert.deepEqual(calculateDebts(expenses, RESIDENTS), [
    { debtorId: MAXIM.id, creditorId: ARTEM.id, amountKopecks: 30000 },
  ]);
});

test('расход только на самого плательщика не создаёт долга самому себе', () => {
  assert.deepEqual(calculateDebts([expense('e', 50000, ARTEM.id, [ARTEM.id])], RESIDENTS), []);
});

test('жилец, не участвующий в расходе, ничего не должен', () => {
  const debts = calculateDebts([expense('e', 100000, ARTEM.id, [ARTEM.id, MAXIM.id])], RESIDENTS);
  assert.deepEqual(debts, [{ debtorId: MAXIM.id, creditorId: ARTEM.id, amountKopecks: 50000 }]);
  assert.ok(debts.every((d) => d.debtorId !== NIKITA.id && d.creditorId !== NIKITA.id));
});

test('делимость на копейки: 100 ₽ на троих = 33,34 + 33,33 + 33,33', () => {
  assert.deepEqual(splitAmount(10000, ['a', 'b', 'c']), [
    { residentId: 'a', shareKopecks: 3334 },
    { residentId: 'b', shareKopecks: 3333 },
    { residentId: 'c', shareKopecks: 3333 },
  ]);
});

test('остаток копеек раздаётся по одной, начиная с первого участника', () => {
  const shares = splitAmount(1002, ['a', 'b', 'c', 'd']).map((s) => s.shareKopecks);
  assert.deepEqual(shares, [251, 251, 250, 250]);
});

test('1 копейка на троих', () => {
  const shares = splitAmount(1, ['a', 'b', 'c']).map((s) => s.shareKopecks);
  assert.deepEqual(shares, [1, 0, 0]);
});

test('долги при неделимой сумме: копейка не теряется и не появляется из воздуха', () => {
  // Максим платит 100 ₽ за [Артём, Максим, Никита] — Артём первый, ему достаётся лишняя копейка.
  const debts = calculateDebts([expense('e', 10000, MAXIM.id, ALL)], RESIDENTS);
  assert.deepEqual(debts, [
    { debtorId: ARTEM.id, creditorId: MAXIM.id, amountKopecks: 3334 },
    { debtorId: NIKITA.id, creditorId: MAXIM.id, amountKopecks: 3333 },
  ]);
});

test('один должник раскладывается на нескольких кредиторов', () => {
  const expenses = [
    expense('a', 60000, ARTEM.id, [ARTEM.id, NIKITA.id]), // Никита должен Артёму 300
    expense('b', 40000, MAXIM.id, [MAXIM.id, NIKITA.id]), // Никита должен Максиму 200
  ];
  assert.deepEqual(calculateDebts(expenses, RESIDENTS), [
    { debtorId: NIKITA.id, creditorId: ARTEM.id, amountKopecks: 30000 },
    { debtorId: NIKITA.id, creditorId: MAXIM.id, amountKopecks: 20000 },
  ]);
});

test('свойство: на случайных данных сумма долгов сходится с балансами', () => {
  let seed = 42;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const residents = Array.from({ length: 6 }, (_, i) => ({ id: 'r' + i, name: 'Жилец ' + i }));

  for (let round = 0; round < 300; round += 1) {
    const expenses = [];
    const count = 1 + Math.floor(random() * 12);
    for (let k = 0; k < count; k += 1) {
      const participants = residents.filter(() => random() < 0.6).map((r) => r.id);
      if (!participants.length) participants.push(residents[0].id);
      const payer = participants[Math.floor(random() * participants.length)];
      expenses.push(expense('e' + k, 1 + Math.floor(random() * 5000000), payer, participants));
    }

    const balances = calculateBalances(expenses, residents);
    const debts = calculateDebts(expenses, residents);

    assert.equal(Object.values(balances).reduce((s, b) => s + b, 0), 0, 'сумма балансов = 0');
    debts.forEach((d) => {
      assert.ok(Number.isInteger(d.amountKopecks) && d.amountKopecks > 0);
      assert.notEqual(d.debtorId, d.creditorId);
    });

    // После «выплаты» всех долгов балансы должны обнулиться.
    const after = Object.assign({}, balances);
    debts.forEach((d) => {
      after[d.debtorId] += d.amountKopecks;
      after[d.creditorId] -= d.amountKopecks;
    });
    assert.ok(Object.values(after).every((b) => b === 0), 'все балансы закрыты');

    const owed = Object.values(balances).filter((b) => b > 0).reduce((s, b) => s + b, 0);
    assert.equal(sumOf(debts, 'amountKopecks'), owed);
  }
});

test('повреждённый расход → INVALID_EXPENSE_DATA', () => {
  const bad = [
    expense('e', 0, ARTEM.id, ALL),
    expense('e', 10.5, ARTEM.id, ALL),
    expense('e', 100, 'r-ghost', ALL),
    expense('e', 100, ARTEM.id, []),
    expense('e', 100, ARTEM.id, [ARTEM.id, 'r-ghost']),
    expense('e', 100, ARTEM.id, [ARTEM.id, ARTEM.id]),
  ];
  bad.forEach((e) => {
    assert.throws(() => calculateDebts([e], RESIDENTS), { code: 'INVALID_EXPENSE_DATA' });
  });
});

test('погашение уменьшает долг, полное — закрывает его', () => {
  const expenses = [expense('e1', 300000, ARTEM.id, ALL)];
  const pay = (from, to, amountKopecks) => ({ id: 'p' + amountKopecks, fromId: from, toId: to, amountKopecks });
  assert.deepEqual(calculateDebts(expenses, RESIDENTS, [pay(MAXIM.id, ARTEM.id, 40000)]), [
    { debtorId: MAXIM.id, creditorId: ARTEM.id, amountKopecks: 60000 },
    { debtorId: NIKITA.id, creditorId: ARTEM.id, amountKopecks: 100000 },
  ]);
  assert.deepEqual(calculateDebts(expenses, RESIDENTS, [pay(MAXIM.id, ARTEM.id, 100000)]), [
    { debtorId: NIKITA.id, creditorId: ARTEM.id, amountKopecks: 100000 },
  ]);
  // Без третьего аргумента — как раньше (совместимость с контрактом ТЗ).
  assert.equal(calculateDebts(expenses, RESIDENTS).length, 2);
});

test('повреждённое погашение → INVALID_EXPENSE_DATA', () => {
  const bad = [
    { id: 'p', fromId: MAXIM.id, toId: MAXIM.id, amountKopecks: 100 },
    { id: 'p', fromId: 'ghost', toId: ARTEM.id, amountKopecks: 100 },
    { id: 'p', fromId: MAXIM.id, toId: ARTEM.id, amountKopecks: 0 },
  ];
  bad.forEach((p) => assert.throws(() => calculateDebts([], RESIDENTS, [p]), { code: 'INVALID_EXPENSE_DATA' }));
});

// ---------- Закрытие расходов ----------
const { calculateOutstanding } = require('../js/debt-calculator.js');
const payment = (fromId, toId, amountKopecks) => ({ id: 'p' + fromId + amountKopecks, fromId, toId, amountKopecks });

test('расход закрывается, когда все вернули свои доли', () => {
  const e1 = expense('e1', 300000, ARTEM.id, ALL);
  assert.deepEqual(calculateOutstanding([e1], RESIDENTS, []), { e1: 200000 });
  assert.deepEqual(calculateOutstanding([e1], RESIDENTS, [payment(MAXIM.id, ARTEM.id, 100000)]), { e1: 100000 });
  assert.deepEqual(calculateOutstanding([e1], RESIDENTS, [payment(MAXIM.id, ARTEM.id, 100000), payment(NIKITA.id, ARTEM.id, 100000)]), { e1: 0 });
});

test('расход только на плательщика закрыт сразу', () => {
  assert.deepEqual(calculateOutstanding([expense('e', 5000, ARTEM.id, [ARTEM.id])], RESIDENTS, []), { e: 0 });
});

test('возвраты засчитываются в самые старые расходы', () => {
  const old = expense('old', 200000, ARTEM.id, [ARTEM.id, MAXIM.id]); // Максим должен 1000
  const fresh = expense('fresh', 60000, ARTEM.id, [ARTEM.id, MAXIM.id]); // ещё 300
  assert.deepEqual(calculateOutstanding([old, fresh], RESIDENTS, [payment(MAXIM.id, ARTEM.id, 100000)]), { old: 0, fresh: 30000 });
  assert.deepEqual(calculateOutstanding([old, fresh], RESIDENTS, [payment(MAXIM.id, ARTEM.id, 50000)]), { old: 50000, fresh: 30000 });
});

test('встречные долги тоже закрывают расходы', () => {
  const a = expense('a', 100000, ARTEM.id, [ARTEM.id, MAXIM.id]); // Максим должен 500
  const m = expense('m', 100000, MAXIM.id, [ARTEM.id, MAXIM.id]); // Артём должен 500
  assert.deepEqual(calculateOutstanding([a, m], RESIDENTS, []), { a: 0, m: 0 });
});

test('сумма «ждёт возврата» по всем расходам = сумма текущих долгов', () => {
  let seed = 99;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return Math.floor((seed / 2147483648) * n); };
  for (let round = 0; round < 300; round += 1) {
    const expenses = [];
    for (let k = 0, n = 1 + rnd(6); k < n; k += 1) {
      const participants = ALL.filter(() => rnd(10) < 7);
      if (!participants.length) participants.push(ALL[rnd(3)]);
      expenses.push(expense('e' + k, 1 + rnd(400000), participants[rnd(participants.length)], participants));
    }
    const payments = [];
    calculateDebts(expenses, RESIDENTS).forEach((d) => {
      if (rnd(2)) payments.push(payment(d.debtorId, d.creditorId, 1 + rnd(d.amountKopecks)));
    });
    const totalDebt = calculateDebts(expenses, RESIDENTS, payments).reduce((s, d) => s + d.amountKopecks, 0);
    const out = calculateOutstanding(expenses, RESIDENTS, payments);
    const totalOutstanding = Object.values(out).reduce((s, v) => s + v, 0);
    assert.equal(totalOutstanding, totalDebt, 'прогон ' + round);
    if (totalDebt === 0) assert.ok(Object.values(out).every((v) => v === 0), 'нет долгов — все расходы закрыты');
  }
});
