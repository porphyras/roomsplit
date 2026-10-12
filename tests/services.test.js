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
