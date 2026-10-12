'use strict';

/** Простая подмена localStorage для тестов. */
function createMemoryStorage(initial) {
  const data = new Map(Object.entries(initial || {}));
  return {
    failWrites: false,
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) {
      if (this.failWrites) throw new Error('QuotaExceededError');
      data.set(key, String(value));
    },
    removeItem(key) { data.delete(key); },
    keys() { return Array.from(data.keys()); },
    dump() { return Object.fromEntries(data); },
  };
}

const ARTEM = { id: 'r-artem', name: 'Артём' };
const MAXIM = { id: 'r-maxim', name: 'Максим' };
const NIKITA = { id: 'r-nikita', name: 'Никита' };
const RESIDENTS = [ARTEM, MAXIM, NIKITA];
const ALL = RESIDENTS.map((r) => r.id);

function expense(id, amountKopecks, payerId, participantIds) {
  return { id, title: 'Расход ' + id, amountKopecks, payerId, participantIds };
}

module.exports = { createMemoryStorage, ARTEM, MAXIM, NIKITA, RESIDENTS, ALL, expense };
