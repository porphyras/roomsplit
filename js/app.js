/**
 * Интерфейс RoomSplit. Навигация линейная (ТЗ 3.3):
 * первый запуск → сводка → форма обязанности/расхода → сохранение → сводка.
 * Пользовательский текст выводится только через textContent, поэтому HTML из имён не исполняется.
 */
(function () {
  'use strict';

  const RS = window.RoomSplit;
  const config = RS.config;
  const money = RS.money;
  const errors = RS.errors;

  const SCREENS = ['loading', 'setup', 'main', 'task', 'expense'];
  const FORM_SCREENS = ['task', 'expense'];

  const ICONS = {
    edit: 'M4 20h4L19 9l-4-4L4 16v4zm10.5-13.5 3 3',
    trash: 'M5 7h14M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3',
    close: 'M6 6l12 12M18 6 6 18',
  };

  let store;
  let currentScreen = 'loading';
  let editingTaskId = null;
  let toastTimer = null;

  const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  // ---------- Утилиты DOM ----------

  function $(selector) {
    return document.querySelector(selector);
  }

  function el(tag, props, children) {
    const node = document.createElement(tag);
    Object.entries(props || {}).forEach(function (entry) {
      const key = entry[0];
      const value = entry[1];
      if (value === undefined || value === null || value === false) return;
      if (key === 'className') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'dataset') Object.assign(node.dataset, value);
      else if (key.indexOf('on') === 0) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? '' : value);
    });
    (children || []).forEach(function (child) {
      if (child === null || child === undefined) return;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  }

  function icon(name) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', ICONS[name]);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);
    return svg;
  }

  function iconButton(name, label, onClick, extraClass) {
    return el('button', {
      type: 'button',
      className: 'icon-btn' + (extraClass ? ' ' + extraClass : ''),
      'aria-label': label,
      title: label,
      onclick: onClick,
    }, [icon(name)]);
  }

  function plural(n, one, few, many) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
    return many;
  }

  function formatDate(iso) {
    if (!iso) return '';
    const date = new Date(iso);
    return isNaN(date.getTime()) ? '' : dateFormat.format(date);
  }

  // ---------- Сообщения ----------

  function showToast(text, isError) {
    const toast = $('#toast');
    toast.textContent = text;
    toast.className = 'toast' + (isError ? ' toast--error' : '');
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.hidden = true; }, isError ? 5000 : 2500);
  }

  function showBanner(parts, isError) {
    const banner = $('#banner');
    banner.textContent = '';
    parts.forEach(function (part) {
      banner.appendChild(typeof part === 'string' ? document.createTextNode(part) : part);
    });
    banner.className = 'banner' + (isError ? ' banner--error' : '');
    banner.hidden = false;
  }

  function hideBanner() {
    $('#banner').hidden = true;
  }

  function messageOf(error) {
    if (errors.isAppError(error)) return error.message;
    console.error(error);
    return 'Что-то пошло не так. Обновите страницу и попробуйте ещё раз.';
  }

  /** Ошибки действий вне форм (галочка, удаление) — всплывающим сообщением. */
  function attempt(action) {
    try {
      action();
      return true;
    } catch (error) {
      showToast(messageOf(error), true);
      return false;
    }
  }

  // ---------- Ошибки форм ----------

  function clearFormErrors(form) {
    form.querySelectorAll('[data-error-for]').forEach(function (node) { node.textContent = ''; });
    form.querySelectorAll('[aria-invalid]').forEach(function (node) { node.removeAttribute('aria-invalid'); });
  }

  function showFormErrors(form, error) {
    const items = errors.isAppError(error) ? error.errors : [{ message: messageOf(error) }];
    let firstControl = null;

    items.forEach(function (item) {
      let slot = item.field ? form.querySelector('[data-error-for="' + item.field + '"]') : null;
      if (!slot) slot = form.querySelector('[data-error-for="form"]');
      if (!slot) {
        showToast(item.message, true);
        return;
      }
      if (!slot.textContent) slot.textContent = item.message;

      const control = item.field && form.querySelector('[name="' + item.field + '"]');
      if (control) {
        control.setAttribute('aria-invalid', 'true');
        if (!firstControl) firstControl = control;
      } else if (item.field === 'participantIds' && !firstControl) {
        firstControl = form.querySelector('input[name="participantIds"]');
      }
    });

    if (firstControl) firstControl.focus();
  }

  /** Как только пользователь правит поле, его старая ошибка исчезает. */
  function clearFieldError(event) {
    const control = event.target;
    const form = control.form;
    if (!form || !control.name) return;
    const names = control.name === 'payerId' ? ['payerId', 'participantIds'] : [control.name];
    names.forEach(function (name) {
      const slot = form.querySelector('[data-error-for="' + name + '"]');
      if (slot) slot.textContent = '';
      form.querySelectorAll('[name="' + name + '"]').forEach(function (node) { node.removeAttribute('aria-invalid'); });
    });
    const formSlot = form.querySelector('[data-error-for="form"]');
    if (formSlot) formSlot.textContent = '';
  }

  document.addEventListener('input', clearFieldError);
  document.addEventListener('change', clearFieldError);

  /** Выполняет действие формы: при ошибке показывает сообщения у полей и возвращает false. */
  function submitWith(form, action) {
    clearFormErrors(form);
    try {
      action();
      return true;
    } catch (error) {
      showFormErrors(form, error);
      return false;
    }
  }

  // ---------- Навигация ----------

  function showScreen(name) {
    currentScreen = name;
    SCREENS.forEach(function (screen) {
      $('#screen-' + screen).hidden = screen !== name;
    });
    window.scrollTo(0, 0);
  }

  function focusFirst(selector) {
    const node = $(selector);
    if (node) node.focus({ preventScroll: true });
  }

  function goSetup() {
    renderSetup();
    showScreen('setup');
    focusFirst('#setup-name');
  }

  function goMain(focusTitle) {
    renderMain();
    showScreen('main');
    if (focusTitle) focusFirst('#main-title');
  }

  /** Формы кладутся в историю, чтобы «Назад» в браузере/телефоне возвращал на сводку. */
  function openForm(name) {
    showScreen(name);
    history.pushState({ roomsplit: name }, '');
  }

  function closeForm() {
    if (history.state && history.state.roomsplit === currentScreen) {
      history.back(); // popstate вернёт на сводку
    } else {
      goMain(true);
    }
  }

  window.addEventListener('popstate', function () {
    if (FORM_SCREENS.indexOf(currentScreen) !== -1) goMain(true);
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && FORM_SCREENS.indexOf(currentScreen) !== -1) closeForm();
  });

  // ---------- Первый запуск ----------

  function residentChip(resident, onRemove) {
    return el('li', { className: 'chip' }, [
      el('span', { className: 'chip__name', text: resident.name }),
      iconButton('close', 'Удалить жильца ' + resident.name, onRemove, 'icon-btn--danger'),
    ]);
  }

  function renderSetup() {
    const residents = store.getState().residents;
    const list = $('#setup-residents');
    list.textContent = '';
    residents.forEach(function (resident) {
      list.appendChild(residentChip(resident, function () {
        if (attempt(function () { store.removeResident(resident.id); })) renderSetup();
      }));
    });
    $('#setup-empty').hidden = residents.length > 0;
    $('#setup-continue').disabled = residents.length === 0;
  }

  $('#setup-resident-form').addEventListener('submit', function (event) {
    event.preventDefault();
    const form = event.currentTarget;
    const ok = submitWith(form, function () { store.addResident({ name: form.elements.name.value }); });
    if (ok) {
      form.reset();
      renderSetup();
    }
    form.elements.name.focus();
  });

  $('#setup-continue').addEventListener('click', function () {
    goMain(true);
  });

  $('#setup-demo').addEventListener('click', function () {
    if (attempt(function () { store.loadDemo(); })) {
      goMain(true);
      showToast('Загружены демо-данные');
    }
  });

  // ---------- Главная / сводка ----------

  function renderStats(summary) {
    const t = summary.totals;
    const parts = [
      summary.residents.length + ' ' + plural(summary.residents.length, 'жилец', 'жильца', 'жильцов'),
      t.pendingTasks + ' ' + plural(t.pendingTasks, 'дело', 'дела', 'дел') + ' в работе',
      'расходов на ' + money.formatKopecks(t.expensesKopecks),
    ];
    $('#main-stats').textContent = parts.join(' · ');
  }

  function renderTasks(tasks) {
    const list = $('#task-list');
    list.textContent = '';
    tasks.forEach(function (task) {
      const done = task.status === config.TASK_STATUS.COMPLETED;
      const checkbox = el('input', {
        type: 'checkbox',
        className: 'task-check',
        checked: done,
        'aria-label': (done ? 'Отметить невыполненной: ' : 'Отметить выполненной: ') + task.title,
        onchange: function (event) {
          const status = event.target.checked ? config.TASK_STATUS.COMPLETED : config.TASK_STATUS.PENDING;
          if (!attempt(function () { store.updateTaskStatus(task.id, status); })) event.target.checked = done;
          renderMain();
        },
      });
      const open = el('button', {
        type: 'button',
        className: 'task-open',
        'aria-label': 'Изменить: ' + task.title,
        onclick: function () { openTaskForm(task.id); },
      }, [
        el('div', { className: 'list__title', text: task.title }),
        el('div', { className: 'list__meta' }, [
          el('span', { className: 'badge' + (done ? ' badge--done' : ''), text: task.assigneeName }),
          ' ' + config.TASK_STATUS_LABELS[task.status].toLowerCase(),
        ]),
      ]);
      list.appendChild(el('li', { className: 'list__item' + (done ? ' is-done' : '') }, [
        checkbox,
        open,
        iconButton('edit', 'Изменить: ' + task.title, function () { openTaskForm(task.id); }),
      ]));
    });
    $('#task-empty').hidden = tasks.length > 0;
  }

  function renderDebts(debts) {
    const list = $('#debt-list');
    list.textContent = '';
    debts.forEach(function (debt) {
      list.appendChild(el('li', { className: 'list__item' }, [
        el('div', { className: 'list__body' }, [
          el('div', { className: 'debt-names' }, [
            el('span', { text: debt.debtorName }),
            el('span', { className: 'debt-arrow', text: '→', 'aria-hidden': 'true' }),
            el('span', { className: 'visually-hidden', text: ' должен ' }),
            el('span', { text: debt.creditorName }),
          ]),
        ]),
        el('div', { className: 'list__amount', text: money.formatKopecks(debt.amountKopecks) }),
      ]));
    });
    $('#debt-empty').hidden = debts.length > 0;
  }

  function renderExpenses(expenses) {
    const list = $('#expense-list');
    list.textContent = '';
    expenses.forEach(function (expense) {
      const meta = 'Платил(а) ' + expense.payerName + ' · делят: ' + expense.participantNames.join(', ');
      const date = formatDate(expense.createdAt);
      list.appendChild(el('li', { className: 'list__item' }, [
        el('div', { className: 'list__body' }, [
          el('div', { className: 'list__title', text: expense.title }),
          el('div', { className: 'list__meta' }, [
            meta,
            date ? ' · ' : null,
            date ? el('span', { className: 'nowrap', text: date }) : null,
          ]),
        ]),
        el('div', { className: 'list__amount', text: money.formatKopecks(expense.amountKopecks) }),
        iconButton('trash', 'Удалить расход: ' + expense.title, function () {
          const question = 'Удалить расход «' + expense.title + '» на ' + money.formatKopecks(expense.amountKopecks) + '? Долги будут пересчитаны.';
          if (!window.confirm(question)) return;
          if (attempt(function () { store.deleteExpense(expense.id); })) {
            renderMain();
            showToast('Расход удалён, долги пересчитаны');
          }
        }, 'icon-btn--danger'),
      ]));
    });
    $('#expense-empty').hidden = expenses.length > 0;
  }

  function renderResidents(residents) {
    const list = $('#resident-list');
    list.textContent = '';
    residents.forEach(function (resident) {
      list.appendChild(residentChip(resident, function () {
        if (!window.confirm('Удалить жильца «' + resident.name + '»?')) return;
        if (attempt(function () { store.removeResident(resident.id); })) {
          if (store.getState().residents.length === 0) goSetup();
          else renderMain();
        }
      }));
    });
  }

  function setCount(titleSelector, count) {
    const title = $(titleSelector);
    let badge = title.querySelector('.count');
    if (!badge) {
      badge = el('span', { className: 'count' });
      title.appendChild(badge);
    }
    badge.textContent = String(count);
    badge.hidden = count === 0;
  }

  function renderMain() {
    let summary;
    try {
      summary = store.getSummary();
    } catch (error) {
      showBanner([messageOf(error)], true);
      return;
    }
    renderStats(summary);
    renderTasks(summary.tasks);
    renderDebts(summary.debts);
    renderExpenses(summary.expenses);
    renderResidents(summary.residents);
    setCount('#tasks-title', summary.totals.pendingTasks);
    setCount('#debts-title', summary.debts.length);
    setCount('#expenses-title', summary.expenses.length);
    setCount('#residents-title', summary.residents.length);
  }

  $('#add-task').addEventListener('click', function () { openTaskForm(null); });
  $('#add-expense').addEventListener('click', openExpenseForm);

  $('#main-resident-form').addEventListener('submit', function (event) {
    event.preventDefault();
    const form = event.currentTarget;
    let resident;
    const ok = submitWith(form, function () { resident = store.addResident({ name: form.elements.name.value }); });
    if (ok) {
      form.reset();
      renderMain();
      showToast('Добавлен жилец: ' + resident.name);
    }
    form.elements.name.focus();
  });

  // ---------- Форма обязанности ----------

  function fillResidentSelect(select, selectedId) {
    select.textContent = '';
    store.getState().residents.forEach(function (resident) {
      select.appendChild(el('option', { value: resident.id, text: resident.name, selected: resident.id === selectedId }));
    });
  }

  function openTaskForm(taskId) {
    const form = $('#task-form');
    const task = taskId ? store.getState().tasks.find(function (t) { return t.id === taskId; }) : null;
    if (taskId && !task) {
      showToast(config.ERRORS.TASK_NOT_FOUND.message, true);
      renderMain();
      return;
    }

    editingTaskId = task ? task.id : null;
    form.reset();
    clearFormErrors(form);
    $('#task-form-title').textContent = task ? 'Редактирование обязанности' : 'Новая обязанность';
    form.elements.title.value = task ? task.title : '';
    fillResidentSelect(form.elements.assigneeId, task ? task.assigneeId : null);
    form.elements.status.value = task ? task.status : config.TASK_STATUS.PENDING;
    $('#task-delete').hidden = !task;

    openForm('task');
    focusFirst('#task-title');
  }

  $('#task-form').addEventListener('submit', function (event) {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = {
      title: form.elements.title.value,
      assigneeId: form.elements.assigneeId.value,
      status: form.elements.status.value,
    };
    const ok = submitWith(form, function () {
      if (editingTaskId) store.updateTask(editingTaskId, payload);
      else store.createTask(payload);
    });
    if (ok) {
      showToast(editingTaskId ? 'Обязанность сохранена' : 'Обязанность добавлена');
      closeForm();
    }
  });

  $('#task-delete').addEventListener('click', function () {
    if (!editingTaskId) return;
    const form = $('#task-form');
    if (!window.confirm('Удалить обязанность «' + form.elements.title.value.trim() + '»?')) return;
    const ok = submitWith(form, function () { store.deleteTask(editingTaskId); });
    if (ok) {
      showToast('Обязанность удалена');
      closeForm();
    }
  });

  // ---------- Форма расхода ----------

  function selectedParticipants(form) {
    return Array.prototype.filter.call(form.querySelectorAll('input[name="participantIds"]'), function (box) {
      return box.checked;
    }).map(function (box) { return box.value; });
  }

  function updateExpensePreview() {
    const form = $('#expense-form');
    const preview = $('#expense-preview');
    const ids = selectedParticipants(form);
    let amount;
    try {
      amount = money.parseAmountToKopecks(form.elements.amount.value);
    } catch (e) {
      amount = null;
    }
    if (!amount || !ids.length) {
      preview.textContent = '';
      return;
    }

    const shares = RS.debtCalculator.splitAmount(amount, ids).map(function (s) { return s.shareKopecks; });
    const max = Math.max.apply(null, shares);
    const min = Math.min.apply(null, shares);
    const people = ids.length + ' ' + plural(ids.length, 'участника', 'участника', 'участников');
    if (ids.length === 1) {
      preview.textContent = 'Расход только на одного человека — долгов не появится.';
    } else if (max === min) {
      preview.textContent = 'Делим на ' + people + ': по ' + money.formatKopecks(max) + ' с каждого.';
    } else {
      const extra = shares.filter(function (s) { return s === max; }).length;
      preview.textContent = 'Делим на ' + people + ': ' + extra + ' × ' + money.formatKopecks(max)
        + ' и ' + (ids.length - extra) + ' × ' + money.formatKopecks(min)
        + ' (лишние копейки — первым в списке).';
    }
  }

  function openExpenseForm() {
    const form = $('#expense-form');
    const residents = store.getState().residents;
    form.reset();
    clearFormErrors(form);
    fillResidentSelect(form.elements.payerId, residents.length ? residents[0].id : null);

    const box = $('#expense-participants');
    box.textContent = '';
    residents.forEach(function (resident) {
      box.appendChild(el('label', { className: 'check' }, [
        el('input', { type: 'checkbox', name: 'participantIds', value: resident.id, checked: true }),
        el('span', { text: resident.name }),
      ]));
    });

    updateExpensePreview();
    openForm('expense');
    focusFirst('#expense-title');
  }

  $('#expense-form').addEventListener('input', updateExpensePreview);
  $('#expense-form').addEventListener('change', updateExpensePreview);

  // Плательщик должен быть среди участников — отмечаем его автоматически.
  $('#expense-payer').addEventListener('change', function (event) {
    const box = $('#expense-form').querySelector('input[name="participantIds"][value="' + CSS.escape(event.target.value) + '"]');
    if (box) box.checked = true;
    updateExpensePreview();
  });

  $('#expense-all').addEventListener('click', function () {
    const boxes = $('#expense-form').querySelectorAll('input[name="participantIds"]');
    const allChecked = Array.prototype.every.call(boxes, function (b) { return b.checked; });
    boxes.forEach(function (b) { b.checked = !allChecked; });
    updateExpensePreview();
  });

  $('#expense-form').addEventListener('submit', function (event) {
    event.preventDefault();
    const form = event.currentTarget;
    let result;
    const ok = submitWith(form, function () {
      // Сумму разбираем отдельно, чтобы показать ошибку суммы вместе с остальными.
      let amountKopecks = null;
      let amountError = null;
      try {
        amountKopecks = money.parseAmountToKopecks(form.elements.amount.value);
      } catch (error) {
        amountError = error;
      }
      try {
        result = store.createExpense({
          title: form.elements.title.value,
          amountKopecks: amountKopecks,
          payerId: form.elements.payerId.value,
          participantIds: selectedParticipants(form),
        });
      } catch (error) {
        if (amountError && errors.isAppError(error)) {
          error.errors = error.errors.map(function (item) { return item.field === 'amount' ? amountError.errors[0] : item; });
        }
        throw error;
      }
    });
    if (ok) {
      const count = result.debts.length;
      showToast('Расход сохранён. ' + (count ? 'Долгов: ' + count : 'Все в расчёте'));
      closeForm();
    }
  });

  document.querySelectorAll('[data-action="cancel"]').forEach(function (button) {
    button.addEventListener('click', closeForm);
  });

  // ---------- Сброс данных ----------

  $('#reset-data').addEventListener('click', function () {
    if (!window.confirm('Удалить всех жильцов, обязанности и расходы? Это действие нельзя отменить.')) return;
    if (attempt(function () { store.reset(); })) {
      if (store.getMode() !== 'memory') hideBanner();
      if (history.state && history.state.roomsplit) history.replaceState(null, '');
      goSetup();
      showToast('Данные удалены');
    }
  });

  // ---------- Запуск ----------

  function reportLoadProblems() {
    const error = store.loadError;
    if (!error) return;
    const parts = [error.message];
    if (store.backupKey) {
      parts.push(' Резервная копия в LocalStorage: ');
      parts.push(el('code', { text: store.backupKey }));
      parts.push('.');
    }
    if (store.getMode() === 'protected') {
      parts.push(' Резервную копию сделать не удалось, поэтому сохранение отключено. Нажмите «Сбросить все данные» внизу страницы, чтобы начать заново.');
    }
    showBanner(parts, error.code !== 'STORAGE_UNAVAILABLE');
  }

  function init() {
    try {
      store = RS.store.createStore();
    } catch (error) {
      showBanner([messageOf(error)], true);
      return;
    }
    reportLoadProblems();
    // После перезагрузки на форме начинаем со сводки.
    if (history.state && history.state.roomsplit) history.replaceState(null, '');
    if (store.getState().residents.length) goMain(false);
    else goSetup();
  }

  init();
})();
