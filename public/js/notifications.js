(() => {
  const listBox = document.querySelector('#notifications-list');
  const emptyState = document.querySelector('#notifications-empty');

  const filtersBar = document.querySelector('#notifications-filters');
  const fAction = document.querySelector('#notif-filter-action');
  const fEntity = document.querySelector('#notif-filter-entity');
  const fFrom = document.querySelector('#notif-filter-from');
  const fTo = document.querySelector('#notif-filter-to');
  const fReset = document.querySelector('#notif-filters-reset');

  const infoModal = document.querySelector('#info-modal');
  const infoTitle = document.querySelector('#info-modal-title');
  const infoList = document.querySelector('#info-modal-list');
  const infoEmpty = document.querySelector('#info-modal-empty');

  const ACTION_LABEL = { create: 'Добавление', update: 'Изменение', delete: 'Удаление' };
  const ENTITY_LABEL = { object: 'Объект', chemical: 'Химия' };

  let allNotes = [];

  const formatWhen = value => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('ru-RU');
  };

  const buildCard = item => {
    const card = document.createElement('article');
    card.className = `notification notification--${item.action}`;

    const head = document.createElement('div');
    head.className = 'notification__head';

    const badge = document.createElement('span');
    badge.className = 'notification__badge';
    badge.textContent = ACTION_LABEL[item.action] || item.action;
    head.append(badge);

    const kind = document.createElement('span');
    kind.className = 'notification__kind';
    kind.textContent = ENTITY_LABEL[item.entity] || item.entity;
    head.append(kind);

    if (item.action !== 'delete' && item.entity_id != null) {
      const link = document.createElement('a');
      link.className = 'notification__name notification__name--link';
      link.href = `#${item.entity}-${item.entity_id}`;
      link.textContent = item.entity_name || `#${item.entity_id}`;
      head.append(link);
    } else {
      const name = document.createElement('span');
      name.className = 'notification__name';
      name.textContent = item.entity_name || `#${item.entity_id}`;
      head.append(name);
    }

    const when = document.createElement('span');
    when.className = 'notification__when';
    when.textContent = formatWhen(item.created_at);
    head.append(when);

    card.append(head);

    if (Array.isArray(item.changes) && item.changes.length) {
      const changes = document.createElement('ul');
      changes.className = 'notification__changes';
      item.changes.forEach(change => {
        const li = document.createElement('li');
        const label = document.createElement('span');
        label.className = 'notification__field';
        label.textContent = `${change.label}: `;
        const from = document.createElement('span');
        from.className = 'notification__from';
        from.textContent = change.from;
        const arrow = document.createElement('span');
        arrow.className = 'notification__arrow';
        arrow.textContent = ' → ';
        const to = document.createElement('span');
        to.className = 'notification__to';
        to.textContent = change.to;
        li.append(label, from, arrow, to);
        changes.append(li);
      });
      card.append(changes);
    }
    return card;
  };

  const fillList = (container, list) => {
    container.innerHTML = '';
    list.forEach(item => container.append(buildCard(item)));
  };

  // ---------- Раздел «Уведомления» ----------
  const applyFilters = () => {
    const action = fAction.value;
    const entity = fEntity.value;
    const from = fFrom.value ? new Date(fFrom.value + 'T00:00:00') : null;
    const to = fTo.value ? new Date(fTo.value + 'T23:59:59.999') : null;

    const filtered = allNotes.filter(note => {
      if (action && note.action !== action) return false;
      if (entity && note.entity !== entity) return false;
      const when = new Date(note.created_at);
      if (from && when < from) return false;
      if (to && when > to) return false;
      return true;
    });

    emptyState.hidden = !!filtered.length;
    emptyState.textContent = allNotes.length
      ? 'По выбранным фильтрам ничего не найдено.'
      : 'Изменений в объектах и химии пока не было.';
    fillList(listBox, filtered);
  };

  const refresh = () => {
    getNotifications().then(list => {
      allNotes = list;
      filtersBar.hidden = !list.length;
      applyFilters();
    }).catch(() => {
      allNotes = [];
      filtersBar.hidden = true;
      applyFilters();
    });
  };

  [fAction, fEntity, fFrom, fTo].forEach(el => el.addEventListener('change', applyFilters));
  fReset.addEventListener('click', () => {
    fAction.value = '';
    fEntity.value = '';
    fFrom.value = '';
    fTo.value = '';
    applyFilters();
  });

  const alertsLink = document.querySelector('#sidebar nav a[data-page="alerts"]');
  if (alertsLink) alertsLink.addEventListener('click', refresh);

  // ---------- Модалка уведомлений конкретной страницы ----------
  const closeInfo = () => { infoModal.hidden = true; document.body.style.overflow = ''; };
  document.querySelector('#info-modal-close').onclick = closeInfo;
  infoModal.addEventListener('click', event => {
    if (event.target === infoModal) closeInfo();
    if (event.target.closest('a')) closeInfo();
  });

  window.openEntityNotifications = async ({ entity, id, name }) => {
    infoTitle.textContent = name ? `Уведомления — ${name}` : 'Уведомления';
    infoList.innerHTML = '';
    infoEmpty.hidden = true;
    infoModal.hidden = false;
    document.body.style.overflow = 'hidden';
    try {
      const list = await getEntityNotifications(entity, id);
      infoEmpty.hidden = !!list.length;
      fillList(infoList, list);
    } catch {
      infoEmpty.hidden = false;
    }
  };

  refresh();
})();
