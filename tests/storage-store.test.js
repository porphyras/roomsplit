'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../js/config.js');
const { loadState, saveState } = require('../js/storage.js');
const { validateState, createDefaultState } = require('../js/state.js');
const { createStore } = require('../js/store.js');
const { buildDemoState } = require('../js/demo-data.js');
const { calculateDebts } = require('../js/debt-calculator.js');
const { createMemoryStorage } = require('./helpers.js');

const KEY = config.STORAGE_KEY;

test('ключ хранилища из ТЗ', () => {
  assert.equal(KEY, 'roomsplit_state_v1');
});

test('первый запуск: пустое состояние без ошибок', () => {
  const result = loadState(createMemoryStorage());
  assert.deepEqual(result.state, createDefaultState());
  assert.equal(result.error, null);
});

test('saveState → loadState возвращает то же самое', () => {
  const storage = createMemoryStorage();
  const state = buildDemoState();
  assert.deepEqual(saveState(state, storage), { success: true });
  assert.deepEqual(loadState(storage).state, state);
});

test('битый JSON: данные копируются в резерв, не затираются', () => {
  const storage = createMemoryStorage({ [KEY]: '{oops' });
  const result = loadState(storage);
  assert.equal(result.error.code, 'STATE_PARSE_ERROR');
  assert.deepEqual(result.state, createDefaultState());
  assert.ok(result.backupKey.startsWith(config.BACKUP_KEY_PREFIX));
  assert.equal(storage.getItem(result.backupKey), '{oops');
  assert.equal(storage.getItem(KEY), '{oops', 'оригинал на месте до первого сохранения');
});

test('неверная структура → STATE_INVALID с резервной копией', () => {
  const broken = JSON.stringify({ schemaVersion: 1, residents: [], tasks: [{ id: 't', title: 'x', assigneeId: 'ghost', status: 'pending' }], expenses: [] });
  const storage = createMemoryStorage({ [KEY]: broken });
  const result = loadState(storage);
  assert.equal(result.error.code, 'STATE_INVALID');
  assert.equal(storage.getItem(result.backupKey), broken);
});

test('validateState ловит нарушения схемы и ссылок', () => {
  const good = buildDemoState();
  assert.deepEqual(validateState(good), good);

  const mutations = [
    (s) => { s.schemaVersion = 99; },
    (s) => { delete s.payments; },
    (s) => { s.payments[0].toId = s.payments[0].fromId; },
    (s) => { s.payments[0].fromId = 'ghost'; },
    (s) => { s.payments[0].amountKopecks = -1; },
    (s) => { s.payments.push(Object.assign({}, s.payments[0])); },
    (s) => { s.residents = null; },
    (s) => { s.residents.push({ id: s.residents[0].id, name: 'Клон' }); },
    (s) => { s.residents[0].name = '  '; },
    (s) => { s.tasks[0].status = 'done'; },
    (s) => { s.tasks[0].assigneeId = 'ghost'; },
    (s) => { s.expenses[0].amountKopecks = 10.5; },
    (s) => { s.expenses[0].amountKopecks = 0; },
    (s) => { s.expenses[0].payerId = 'ghost'; },
    (s) => { s.expenses[0].participantIds = []; },
    (s) => { s.expenses[0].participantIds.push(s.expenses[0].participantIds[0]); },
    (s) => { s.expenses[2].participantIds = ['resident-demo-artem']; },
  ];
  mutations.forEach((mutate, i) => {
    const s = buildDemoState();
    mutate(s);
    assert.throws(() => validateState(s), { code: 'STATE_INVALID' }, 'мутация #' + i);
  });
  assert.throws(() => validateState(null), { code: 'STATE_INVALID' });
  assert.throws(() => validateState([]), { code: 'STATE_INVALID' });
});

test('store: сценарий демонстрации из ТЗ 5.3 с «перезагрузкой страницы»', () => {
  const storage = createMemoryStorage();
  let store = createStore({ storage });

  const artem = store.addResident({ name: 'Артём' });
  const maxim = store.addResident({ name: 'Максим' });
  const nikita = store.addResident({ name: 'Никита' });

  const task = store.createTask({ title: 'Вынести мусор', assigneeId: maxim.id });
  store.updateTaskStatus(task.id, 'completed');

  const first = store.createExpense({
    title: 'Продукты', amountKopecks: 300000, payerId: artem.id, participantIds: [artem.id, maxim.id, nikita.id],
  });
  assert.deepEqual(first.debts, [
    { debtorId: maxim.id, creditorId: artem.id, amountKopecks: 100000 },
    { debtorId: nikita.id, creditorId: artem.id, amountKopecks: 100000 },
  ]);

  store.createExpense({
    title: 'Интернет', amountKopecks: 90000, payerId: maxim.id, participantIds: [artem.id, maxim.id, nikita.id],
  });

  // «Обновить страницу» — новый store на том же хранилище.
  store = createStore({ storage });
  assert.equal(store.loadError, null);
  const summary = store.getSummary();
  assert.equal(summary.residents.length, 3);
  assert.equal(summary.tasks[0].status, 'completed');
  assert.deepEqual(summary.debts.map((d) => [d.debtorName, d.creditorName, d.amountKopecks]), [
    ['Максим', 'Артём', 40000],
    ['Никита', 'Артём', 130000],
  ]);
});

test('store: ошибка записи откатывает изменение (ТЗ 3.1)', () => {
  const storage = createMemoryStorage();
  const store = createStore({ storage });
  store.addResident({ name: 'Артём' });

  storage.failWrites = true;
  assert.throws(() => store.addResident({ name: 'Максим' }), { code: 'STORAGE_WRITE_ERROR' });
  assert.equal(store.getState().residents.length, 1, 'в памяти изменения нет');

  storage.failWrites = false;
  store.addResident({ name: 'Максим' });
  assert.equal(createStore({ storage }).getState().residents.length, 2, 'повтор действия сработал');
});

test('store: ошибка валидации не трогает хранилище', () => {
  const storage = createMemoryStorage();
  const store = createStore({ storage });
  store.addResident({ name: 'Артём' });
  const saved = storage.getItem(KEY);
  assert.throws(() => store.addResident({ name: '' }), { code: 'RESIDENT_NAME_REQUIRED' });
  assert.equal(storage.getItem(KEY), saved);
});

test('store: без LocalStorage работает в памяти', () => {
  const store = createStore({ storage: null });
  assert.equal(store.getMode(), 'memory');
  assert.equal(store.loadError.code, 'STORAGE_UNAVAILABLE');
  store.addResident({ name: 'Артём' });
  assert.equal(store.getState().residents.length, 1);
});

test('store: если резервную копию сделать нельзя — запись запрещена до явного сброса', () => {
  const storage = createMemoryStorage({ [KEY]: '{oops' });
  storage.failWrites = true; // backup не удастся
  const store = createStore({ storage });
  assert.equal(store.getMode(), 'protected');
  storage.failWrites = false;

  assert.throws(() => store.addResident({ name: 'Артём' }), { code: 'STORAGE_WRITE_ERROR' });
  assert.equal(storage.getItem(KEY), '{oops', 'повреждённые данные не затёрты');

  store.reset();
  assert.equal(store.getMode(), 'persist');
  store.addResident({ name: 'Артём' });
  assert.equal(JSON.parse(storage.getItem(KEY)).residents.length, 1);
});

test('store: демо-данные валидны и дают ожидаемые долги', () => {
  const storage = createMemoryStorage();
  const store = createStore({ storage });
  store.loadDemo();
  const state = createStore({ storage }).getState();
  assert.deepEqual(validateState(state), state);
  // Артём +1475, Максим −400, Никита −1075; Никита уже вернул 500 → осталось 575
  assert.deepEqual(calculateDebts(state.expenses, state.residents, state.payments).map((d) => d.amountKopecks), [40000, 57500]);
});

test('store: getState отдаёт копию, а не внутреннее состояние', () => {
  const store = createStore({ storage: createMemoryStorage() });
  store.addResident({ name: 'Артём' });
  store.getState().residents.push({ id: 'x', name: 'Взлом' });
  assert.equal(store.getState().residents.length, 1);
});

test('store: reset очищает данные', () => {
  const storage = createMemoryStorage();
  const store = createStore({ storage });
  store.loadDemo();
  store.reset();
  assert.equal(storage.getItem(KEY), null);
  assert.deepEqual(store.getState(), createDefaultState());
});

test('миграция: данные v1 (без погашений) загружаются и обновляются до v2', () => {
  const v1 = buildDemoState();
  v1.schemaVersion = 1;
  delete v1.payments;
  const storage = createMemoryStorage({ [KEY]: JSON.stringify(v1) });
  const result = loadState(storage);
  assert.equal(result.error, null);
  assert.equal(result.state.schemaVersion, 2);
  assert.deepEqual(result.state.payments, []);
  assert.equal(result.state.expenses.length, 3, 'расходы на месте');

  const store = createStore({ storage });
  store.addResident({ name: 'Лиза' });
  assert.equal(JSON.parse(storage.getItem(KEY)).schemaVersion, 2, 'после сохранения уже v2');
});

test('store: погашение долга частями и отмена погашения', () => {
  const storage = createMemoryStorage();
  const store = createStore({ storage });
  const a = store.addResident({ name: 'Артём' });
  const m = store.addResident({ name: 'Максим' });
  store.createExpense({ title: 'Продукты', amountKopecks: 200000, payerId: a.id, participantIds: [a.id, m.id] });

  const debtNow = () => store.getSummary().debts.map((d) => [d.debtorName, d.creditorName, d.amountKopecks]);
  assert.deepEqual(debtNow(), [['Максим', 'Артём', 100000]]);

  const part = store.createPayment({ fromId: m.id, toId: a.id, amountKopecks: 40000 });
  assert.equal(part.remainingKopecks, 60000);
  assert.deepEqual(debtNow(), [['Максим', 'Артём', 60000]]);

  assert.throws(() => store.createPayment({ fromId: m.id, toId: a.id, amountKopecks: 60001 }), { code: 'PAYMENT_EXCEEDS_DEBT', field: 'amount' });
  assert.throws(() => store.createPayment({ fromId: a.id, toId: m.id, amountKopecks: 100 }), { code: 'DEBT_NOT_FOUND' });

  const rest = store.createPayment({ fromId: m.id, toId: a.id, amountKopecks: 60000 });
  assert.equal(rest.remainingKopecks, 0);
  assert.deepEqual(debtNow(), []);
  assert.deepEqual(store.getSummary().payments.map((p) => [p.fromName, p.toName, p.amountKopecks]), [
    ['Максим', 'Артём', 60000],
    ['Максим', 'Артём', 40000],
  ]);

  // «Перезагрузка» и удаление ошибочного погашения — долг возвращается.
  const reloaded = createStore({ storage });
  reloaded.deletePayment(rest.payment.id);
  assert.deepEqual(reloaded.getSummary().debts.map((d) => d.amountKopecks), [60000]);
  assert.throws(() => reloaded.deletePayment(rest.payment.id), { code: 'PAYMENT_NOT_FOUND' });
  assert.throws(() => reloaded.removeResident(m.id), { code: 'RESIDENT_IN_USE' });
});

test('две вкладки: устаревшая копия не затирает изменения другой вкладки', () => {
  const storage = createMemoryStorage();
  const tab1 = createStore({ storage });
  tab1.loadDemo();
  const tab2 = createStore({ storage }); // открыта с теми же данными

  const artem = tab1.getState().residents[0];
  tab1.createExpense({ title: 'Из вкладки 1', amountKopecks: 10000, payerId: artem.id, participantIds: [artem.id] });
  tab2.createTask({ title: 'Из вкладки 2', assigneeId: artem.id });

  const saved = JSON.parse(storage.getItem(KEY));
  assert.ok(saved.expenses.some((e) => e.title === 'Из вкладки 1'), 'расход первой вкладки сохранился');
  assert.ok(saved.tasks.some((t) => t.title === 'Из вкладки 2'), 'задача второй вкладки сохранилась');

  // Вкладка 1 узнаёт об изменениях второй.
  assert.equal(tab1.reload(), true);
  assert.ok(tab1.getState().tasks.some((t) => t.title === 'Из вкладки 2'));
  assert.equal(tab1.reload(), false, 'повторно — без изменений');

  // Сброс в одной вкладке виден в другой.
  tab2.reset();
  assert.equal(tab1.reload(), true);
  assert.equal(tab1.getState().residents.length, 0);
});
