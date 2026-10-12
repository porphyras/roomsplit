/**
 * Демо-данные: квартира из примера в бизнес-гипотезе (Артём, Максим, Никита).
 * Нужны, чтобы проверяющий за один клик увидел приложение заполненным.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./config.js'));
  } else {
    root.RoomSplit.demoData = factory(root.RoomSplit.config);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (config) {
  'use strict';

  function buildDemoState() {
    const now = Date.now();
    const at = function (minutesAgo) { return new Date(now - minutesAgo * 60000).toISOString(); };
    const P = config.TASK_STATUS.PENDING;
    const C = config.TASK_STATUS.COMPLETED;

    return {
      schemaVersion: config.SCHEMA_VERSION,
      residents: [
        { id: 'resident-demo-artem', name: 'Артём' },
        { id: 'resident-demo-maxim', name: 'Максим' },
        { id: 'resident-demo-nikita', name: 'Никита' },
      ],
      tasks: [
        { id: 'task-demo-1', title: 'Вынести мусор', assigneeId: 'resident-demo-maxim', status: P, createdAt: at(300) },
        { id: 'task-demo-2', title: 'Убрать кухню', assigneeId: 'resident-demo-artem', status: P, createdAt: at(240) },
        { id: 'task-demo-3', title: 'Купить бытовую химию', assigneeId: 'resident-demo-nikita', status: C, createdAt: at(180), completedAt: at(90) },
      ],
      expenses: [
        {
          id: 'expense-demo-1',
          title: 'Продукты',
          amountKopecks: 300000,
          payerId: 'resident-demo-artem',
          participantIds: ['resident-demo-artem', 'resident-demo-maxim', 'resident-demo-nikita'],
          createdAt: at(120),
        },
        {
          id: 'expense-demo-2',
          title: 'Интернет за месяц',
          amountKopecks: 90000,
          payerId: 'resident-demo-maxim',
          participantIds: ['resident-demo-artem', 'resident-demo-maxim', 'resident-demo-nikita'],
          createdAt: at(60),
        },
        {
          id: 'expense-demo-3',
          title: 'Бытовая химия',
          amountKopecks: 45000,
          payerId: 'resident-demo-nikita',
          participantIds: ['resident-demo-nikita', 'resident-demo-artem'],
          createdAt: at(30),
        },
      ],
      payments: [
        // Никита уже вернул Артёму часть долга.
        { id: 'payment-demo-1', fromId: 'resident-demo-nikita', toId: 'resident-demo-artem', amountKopecks: 50000, createdAt: at(10) },
      ],
    };
  }

  return { buildDemoState: buildDemoState };
});
