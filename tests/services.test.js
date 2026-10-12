'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createDefaultState } = require('../js/state.js');
const residentService = require('../js/resident-service.js');
const taskService = require('../js/task-service.js');
const expenseService = require('../js/expense-service.js');
const { getSummary } = require('../js/summary-service.js');
const { RESIDENTS, ARTEM, MAXIM, NIKITA, ALL } = require('./helpers.js');

function stateWithResidents() {
  return Object.assign(createDefaultState(), { residents: RESIDENTS.slice() });
}

function codes(fn) {
  try {
    fn();
  } catch (e) {
    return e.errors.map((x) => x.code);
  }
  assert.fail('ожидалась ошибка');
}

// ---------- Жильцы ----------

test('addResident: имя обрезается, жилец получает id', () => {
  const { state, resident } = residentService.addResident(createDefaultState(), { name: '  Артём   Иванов ' });
  assert.equal(resident.name, 'Артём Иванов');
  assert.match(resident.id, /^resident-/);
  assert.deepEqual(state.residents, [resident]);
});

test('addResident: пустое имя и дубликат (без учёта регистра)', () => {
  assert.throws(() => residentService.addResident(createDefaultState(), { name: '   ' }),
    { code: 'RESIDENT_NAME_REQUIRED', field: 'name' });
  assert.throws(() => residentService.addResident(createDefaultState(), {}), { code: 'RESIDENT_NAME_REQUIRED' });
  assert.throws(() => residentService.addResident(stateWithResidents(), { name: 'артём' }),
    { code: 'RESIDENT_NAME_DUPLICATE' });
});

test('addResident: исходное состояние не меняется', () => {
  const before = createDefaultState();
  residentService.addResident(before, { name: 'Артём' });
  assert.deepEqual(before.residents, []);
});

test('addResident: лимиты длины и количества', () => {
  assert.throws(() => residentService.addResident(createDefaultState(), { name: 'а'.repeat(41) }),
    { code: 'RESIDENT_NAME_TOO_LONG' });
  let state = createDefaultState();
  for (let i = 0; i < 20; i += 1) state = residentService.addResident(state, { name: 'Жилец ' + i }).state;
  assert.throws(() => residentService.addResident(state, { name: 'Лишний' }), { code: 'RESIDENTS_LIMIT' });
});

test('removeResident: можно удалить «свободного», нельзя — с задачами или расходами', () => {
  let state = stateWithResidents();
  state = taskService.createTask(state, { title: 'Мусор', assigneeId: MAXIM.id }).state;
  state = expenseService.createExpense(state, {
    title: 'Чай', amountKopecks: 100, payerId: ARTEM.id, participantIds: [ARTEM.id],
  }).state;

  assert.throws(() => residentService.removeResident(state, MAXIM.id), { code: 'RESIDENT_IN_USE' });
  assert.throws(() => residentService.removeResident(state, ARTEM.id), { code: 'RESIDENT_IN_USE' });
  assert.throws(() => residentService.removeResident(state, 'r-ghost'), { code: 'RESIDENT_NOT_FOUND' });

  const after = residentService.removeResident(state, NIKITA.id).state;
  assert.deepEqual(after.residents.map((r) => r.id), [ARTEM.id, MAXIM.id]);
});

// ---------- Обязанности ----------

test('createTask: статус по умолчанию — pending', () => {
  const { state, task } = taskService.createTask(stateWithResidents(), { title: ' Вынести мусор ', assigneeId: MAXIM.id });
  assert.equal(task.title, 'Вынести мусор');
  assert.equal(task.status, 'pending');
  assert.equal(task.assigneeId, MAXIM.id);
  assert.equal(state.tasks.length, 1);
});

test('createTask: все ошибки формы возвращаются сразу', () => {
  assert.deepEqual(
    codes(() => taskService.createTask(stateWithResidents(), { title: '', assigneeId: 'r-ghost', status: 'done' })),
    ['TASK_TITLE_REQUIRED', 'RESIDENT_NOT_FOUND', 'INVALID_STATUS']
  );
});

test('createTask: ошибка не меняет состояние (ТЗ 3.1)', () => {
  const state = stateWithResidents();
  assert.throws(() => taskService.createTask(state, { title: '', assigneeId: MAXIM.id }));
  assert.equal(state.tasks.length, 0);
});

test('updateTaskStatus / updateTask / deleteTask', () => {
  let state = stateWithResidents();
  const created = taskService.createTask(state, { title: 'Кухня', assigneeId: ARTEM.id });
  state = created.state;
  const id = created.task.id;

  let r = taskService.updateTaskStatus(state, id, 'completed');
  assert.equal(r.task.status, 'completed');
  state = r.state;

  assert.throws(() => taskService.updateTaskStatus(state, id, 'done'), { code: 'INVALID_STATUS' });
  assert.throws(() => taskService.updateTaskStatus(state, 'nope', 'pending'), { code: 'TASK_NOT_FOUND' });

  r = taskService.updateTask(state, id, { title: 'Убрать кухню', assigneeId: NIKITA.id, status: 'pending' });
  assert.deepEqual([r.task.title, r.task.assigneeId, r.task.status], ['Убрать кухню', NIKITA.id, 'pending']);
  state = r.state;

  assert.throws(() => taskService.updateTask(state, id, { title: ' ' }), { code: 'TASK_TITLE_REQUIRED' });

  const del = taskService.deleteTask(state, id);
  assert.equal(del.success, true);
  assert.equal(del.state.tasks.length, 0);
  assert.throws(() => taskService.deleteTask(del.state, id), { code: 'TASK_NOT_FOUND' });
});

// ---------- Расходы ----------

test('createExpense: валидный запрос из ТЗ', () => {
  const { state, expense } = expenseService.createExpense(stateWithResidents(), {
    title: 'Продукты', amountKopecks: 300000, payerId: ARTEM.id, participantIds: ALL,
  });
  assert.equal(expense.amountKopecks, 300000);
  assert.deepEqual(expense.participantIds, ALL);
  assert.equal(state.expenses.length, 1);
});

test('createExpense: невалидный запрос из ТЗ', () => {
  assert.deepEqual(
    codes(() => expenseService.createExpense(stateWithResidents(), {
      title: 'Продукты', amountKopecks: 0, payerId: ARTEM.id, participantIds: [],
    })),
    ['AMOUNT_INVALID', 'PARTICIPANTS_EMPTY']
  );
});

test('createExpense: дубли участников убираются', () => {
  const { expense } = expenseService.createExpense(stateWithResidents(), {
    title: 'Чай', amountKopecks: 100, payerId: ARTEM.id, participantIds: [ARTEM.id, MAXIM.id, ARTEM.id],
  });
  assert.deepEqual(expense.participantIds, [ARTEM.id, MAXIM.id]);
});

test('createExpense: граничные случаи', () => {
  const base = { title: 'Чай', amountKopecks: 100, payerId: ARTEM.id, participantIds: ALL };
  const s = stateWithResidents();
  const check = (patch, expected) => {
    assert.deepEqual(codes(() => expenseService.createExpense(s, Object.assign({}, base, patch))), expected);
  };
  check({ title: '  ' }, ['EXPENSE_TITLE_REQUIRED']);
  check({ title: 'х'.repeat(81) }, ['EXPENSE_TITLE_TOO_LONG']);
  check({ amountKopecks: -5 }, ['AMOUNT_INVALID']);
  check({ amountKopecks: 10.5 }, ['AMOUNT_INVALID']);
  check({ amountKopecks: '300' }, ['AMOUNT_INVALID']);
  check({ amountKopecks: 1000000001 }, ['AMOUNT_TOO_LARGE']);
  check({ payerId: 'r-ghost' }, ['RESIDENT_NOT_FOUND']);
  check({ participantIds: [ARTEM.id, 'r-ghost'] }, ['RESIDENT_NOT_FOUND']);
  check({ participantIds: [MAXIM.id, NIKITA.id] }, ['PAYER_NOT_IN_PARTICIPANTS']);
  check({ participantIds: 'всем' }, ['PARTICIPANTS_EMPTY']);
});

test('createExpense: у ошибок правильные поля формы', () => {
  try {
    expenseService.createExpense(stateWithResidents(), { title: '', amountKopecks: 0, payerId: 'x', participantIds: [] });
  } catch (e) {
    assert.deepEqual(e.errors.map((x) => x.field), ['title', 'amount', 'payerId', 'participantIds']);
    assert.deepEqual(e.toJSON(), { code: 'EXPENSE_TITLE_REQUIRED', message: 'Введите название расхода', field: 'title' });
    return;
  }
  assert.fail('ожидалась ошибка');
});

test('deleteExpense', () => {
  const created = expenseService.createExpense(stateWithResidents(), {
    title: 'Чай', amountKopecks: 100, payerId: ARTEM.id, participantIds: ALL,
  });
  const r = expenseService.deleteExpense(created.state, created.expense.id);
  assert.equal(r.state.expenses.length, 0);
  assert.throws(() => expenseService.deleteExpense(r.state, created.expense.id), { code: 'EXPENSE_NOT_FOUND' });
});

// ---------- Сводка ----------

test('getSummary: обязанности (сначала невыполненные) и долги с именами', () => {
  let state = stateWithResidents();
  state = taskService.createTask(state, { title: 'Купить химию', assigneeId: NIKITA.id, status: 'completed' }).state;
  state = taskService.createTask(state, { title: 'Вынести мусор', assigneeId: MAXIM.id }).state;
  state = taskService.createTask(state, { title: 'Убрать кухню', assigneeId: ARTEM.id }).state;
  state = expenseService.createExpense(state, {
    title: 'Продукты', amountKopecks: 300000, payerId: ARTEM.id, participantIds: ALL,
  }).state;

  const summary = getSummary(state);
  assert.deepEqual(summary.tasks.map((t) => [t.title, t.assigneeName]), [
    ['Вынести мусор', 'Максим'],
    ['Убрать кухню', 'Артём'],
    ['Купить химию', 'Никита'],
  ]);
  assert.deepEqual(summary.debts.map((d) => [d.debtorName, d.creditorName, d.amountKopecks]), [
    ['Максим', 'Артём', 100000],
    ['Никита', 'Артём', 100000],
  ]);
  assert.deepEqual(summary.totals, { pendingTasks: 2, completedTasks: 1, expensesKopecks: 300000 });
  assert.equal(summary.expenses[0].payerName, 'Артём');
});

// ---------- История выполненных ----------

test('completedAt ставится при выполнении и снимается при возврате в работу', () => {
  let state = stateWithResidents();
  const created = taskService.createTask(state, { title: 'Мусор', assigneeId: MAXIM.id });
  assert.equal(created.task.completedAt, undefined);

  let r = taskService.updateTaskStatus(created.state, created.task.id, 'completed');
  assert.ok(!Number.isNaN(Date.parse(r.task.completedAt)));
  const firstDone = r.task.completedAt;

  // Правка названия выполненной задачи не меняет время выполнения.
  r = taskService.updateTask(r.state, created.task.id, { title: 'Вынести мусор' });
  assert.equal(r.task.completedAt, firstDone);

  r = taskService.updateTaskStatus(r.state, created.task.id, 'pending');
  assert.equal('completedAt' in r.task, false);

  const direct = taskService.createTask(state, { title: 'Сразу готово', assigneeId: ARTEM.id, status: 'completed' });
  assert.ok(direct.task.completedAt);
});

test('getSummary: невыполненные отдельно, история — последние выполненные сверху', () => {
  const state = stateWithResidents();
  state.tasks = [
    { id: 't1', title: 'Старая', assigneeId: ARTEM.id, status: 'completed', createdAt: '2026-10-01T10:00:00.000Z', completedAt: '2026-10-02T10:00:00.000Z' },
    { id: 't2', title: 'В работе', assigneeId: MAXIM.id, status: 'pending', createdAt: '2026-10-03T10:00:00.000Z' },
    { id: 't3', title: 'Свежая', assigneeId: NIKITA.id, status: 'completed', createdAt: '2026-10-01T09:00:00.000Z', completedAt: '2026-10-05T10:00:00.000Z' },
    { id: 't4', title: 'Без даты выполнения', assigneeId: ARTEM.id, status: 'completed', createdAt: '2026-10-04T10:00:00.000Z' },
  ];
  const summary = getSummary(state);
  assert.deepEqual(summary.pendingTasks.map((t) => t.id), ['t2']);
  assert.deepEqual(summary.completedTasks.map((t) => t.id), ['t3', 't4', 't1']);
  assert.equal(summary.tasks.length, 4);
});

// ---------- Найдено при тестировании ----------

test('невидимые символы не дают создать «пустое» имя или название', () => {
  ['​', '​‌‍', '﻿', '­', '⁠ ​', '\n\t'].forEach((name) => {
    assert.throws(() => residentService.addResident(createDefaultState(), { name }), { code: 'RESIDENT_NAME_REQUIRED' }, JSON.stringify(name));
  });
  assert.throws(() => taskService.createTask(stateWithResidents(), { title: '​', assigneeId: ARTEM.id }), { code: 'TASK_TITLE_REQUIRED' });
  const { resident } = residentService.addResident(createDefaultState(), { name: 'Ар​тём\nИванов' });
  assert.equal(resident.name, 'Артём Иванов');
});

test('«Артём» и «Артем» — один и тот же жилец', () => {
  assert.throws(() => residentService.addResident(stateWithResidents(), { name: 'Артем' }), { code: 'RESIDENT_NAME_DUPLICATE' });
  assert.throws(() => residentService.addResident(stateWithResidents(), { name: 'АРТЕМ' }), { code: 'RESIDENT_NAME_DUPLICATE' });
});

// ---------- Удаление расхода, по которому уже были погашения ----------

const { calculateDebts } = require('../js/debt-calculator.js');
const paymentService = require('../js/payment-service.js');

function debtsOf(state) {
  return calculateDebts(state.expenses, state.residents, state.payments).map((d) => [d.debtorId, d.creditorId, d.amountKopecks]);
}
function addExpense(state, amountKopecks, payerId, participantIds) {
  return expenseService.createExpense(state, { title: 'Расход', amountKopecks, payerId, participantIds });
}
function pay(state, fromId, toId, amountKopecks) {
  return paymentService.createPayment(state, { fromId, toId, amountKopecks }).state;
}

test('баг из ручного теста: все вернули долги, расход удалили — обратных долгов нет', () => {
  const created = addExpense(stateWithResidents(), 300000, ARTEM.id, ALL);
  let state = pay(created.state, MAXIM.id, ARTEM.id, 100000);
  state = pay(state, NIKITA.id, ARTEM.id, 100000);
  assert.deepEqual(debtsOf(state), []);

  const preview = expenseService.previewDeleteExpense(state, created.expense.id);
  assert.equal(preview.cancelledKopecks, 200000);

  const result = expenseService.deleteExpense(state, created.expense.id);
  assert.equal(result.cancelledKopecks, 200000);
  assert.deepEqual(result.state.payments, []);
  assert.deepEqual(debtsOf(result.state), [], 'раньше здесь появлялись Артём → Максим и Артём → Никита');
});

test('удаление одного из расходов: отменяется только переплата', () => {
  let state = stateWithResidents();
  state = addExpense(state, 300000, ARTEM.id, ALL).state; // по 1000
  const second = addExpense(state, 30000, ARTEM.id, ALL); // по 100
  state = pay(second.state, MAXIM.id, ARTEM.id, 110000); // Максим вернул всё: 1100

  const result = expenseService.deleteExpense(state, second.expense.id);
  assert.equal(result.cancelledKopecks, 10000, 'отменено 100 ₽ — доля Максима в удалённом расходе');
  assert.equal(result.state.payments[0].amountKopecks, 100000);
  assert.deepEqual(debtsOf(result.state), [[NIKITA.id, ARTEM.id, 100000]]);
});

test('частичное погашение больше оставшегося долга урезается до него', () => {
  let state = stateWithResidents();
  const first = addExpense(state, 200000, ARTEM.id, [ARTEM.id, MAXIM.id]); // Максим должен 1000
  state = addExpense(first.state, 60000, ARTEM.id, [ARTEM.id, MAXIM.id]).state; // ещё 300
  state = pay(state, MAXIM.id, ARTEM.id, 50000); // вернул 500 из 1300

  const result = expenseService.deleteExpense(state, first.expense.id);
  assert.equal(result.cancelledKopecks, 20000, 'после удаления долг 300, вернул 500 → отменить 200');
  assert.deepEqual(debtsOf(result.state), []);
});

test('законные погашения за другие расходы не отменяются', () => {
  let state = stateWithResidents();
  state = addExpense(state, 200000, ARTEM.id, [ARTEM.id, MAXIM.id]).state; // Максим должен Артёму 1000
  state = pay(state, MAXIM.id, ARTEM.id, 100000); // и вернул
  const own = addExpense(state, 90000, MAXIM.id, [MAXIM.id, NIKITA.id]); // Никита должен Максиму 450
  const unrelated = addExpense(own.state, 40000, NIKITA.id, [NIKITA.id, ARTEM.id]); // Артём должен Никите 200
  state = unrelated.state;

  const r1 = expenseService.deleteExpense(state, own.expense.id);
  assert.equal(r1.cancelledKopecks, 0, 'удалили расход Максима — его старое погашение Артёму на месте');
  assert.equal(r1.state.payments.length, 1);

  const r2 = expenseService.deleteExpense(state, unrelated.expense.id);
  assert.equal(r2.cancelledKopecks, 0, 'удалили расход, где Максима нет');
  assert.equal(r2.state.payments[0].amountKopecks, 100000);
});

test('без погашений удаление расхода ничего лишнего не делает', () => {
  const created = addExpense(stateWithResidents(), 300000, ARTEM.id, ALL);
  const result = expenseService.deleteExpense(created.state, created.expense.id);
  assert.equal(result.cancelledKopecks, 0);
  assert.deepEqual(result.state.expenses, []);
});

test('свойство: удаление расхода не создаёт новых переплат (300 случайных прогонов)', () => {
  let seed = 2026;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return Math.floor((seed / 2147483648) * n); };
  const { calculateBalances } = require('../js/debt-calculator.js');
  const overpaid = (s) => {
    const owed = calculateBalances(s.expenses, s.residents);
    const out = {};
    s.residents.forEach((r) => {
      const net = s.payments.reduce((sum, p) => sum + (p.fromId === r.id ? p.amountKopecks : 0) - (p.toId === r.id ? p.amountKopecks : 0), 0);
      out[r.id] = Math.max(0, net - Math.max(0, -owed[r.id]));
    });
    return out;
  };

  for (let round = 0; round < 300; round += 1) {
    let state = stateWithResidents();
    for (let k = 0, n = 1 + rnd(5); k < n; k += 1) {
      const participants = ALL.filter(() => rnd(10) < 7);
      if (!participants.length) participants.push(ALL[rnd(3)]);
      state = addExpense(state, 100 + rnd(500000), participants[rnd(participants.length)], participants).state;
      // иногда кто-то что-то возвращает
      const debts = calculateDebts(state.expenses, state.residents, state.payments);
      if (debts.length && rnd(2)) {
        const d = debts[rnd(debts.length)];
        state = pay(state, d.debtorId, d.creditorId, 1 + rnd(d.amountKopecks));
      }
    }
    const victim = state.expenses[rnd(state.expenses.length)];
    const before = overpaid(state);
    const result = expenseService.deleteExpense(state, victim.id);
    const after = overpaid(result.state);

    ALL.forEach((id) => assert.ok(after[id] <= before[id], 'новая переплата у ' + id + ' в прогоне ' + round));
    result.state.payments.forEach((p) => assert.ok(Number.isSafeInteger(p.amountKopecks) && p.amountKopecks > 0));
    const paidBefore = state.payments.reduce((s, p) => s + p.amountKopecks, 0);
    const paidAfter = result.state.payments.reduce((s, p) => s + p.amountKopecks, 0);
    assert.equal(paidBefore - paidAfter, result.cancelledKopecks, 'отменено ровно столько, сколько сообщено');
  }
});
