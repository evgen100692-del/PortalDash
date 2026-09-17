(() => {
  const status = document.getElementById('analytics-sync-status');
  const syncButton = document.getElementById('analytics-sync');
  const objectFilter = document.getElementById('analytics-object');
  const objectShortcut = document.getElementById('analytics-object-shortcut');
  const fromFilter = document.getElementById('analytics-from');
  const toFilter = document.getElementById('analytics-to');
  const errorBox = document.getElementById('analytics-error');
  const overview = document.getElementById('analytics-overview');
  const detail = document.getElementById('analytics-detail');
  let loaded = false;

  const dateTime = value => value ? new Date(value).toLocaleString('ru-RU') : '—';
  const shortDate = value => value ? new Date(value).toLocaleDateString('ru-RU') : '—';
  const escapeHtml = value => String(value == null ? '' : value).replace(/[&<>\"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' })[char]);

  function table(columns, rows, emptyText) {
    if (!rows.length) return `<p class="empty-state">${escapeHtml(emptyText)}</p>`;
    return `<table class="analytics-table"><thead><tr>${columns.map(column => `<th>${escapeHtml(column.label)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${columns.map(column => `<td>${escapeHtml(column.format ? column.format(row[column.key], row) : row[column.key])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }

  function barChart(container, rows, labelKey, valueKey, emptyText, limit = 14) {
    container.innerHTML = '';
    const visibleRows = rows.slice(-limit);
    if (!visibleRows.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = emptyText;
      container.append(empty);
      return;
    }
    const max = Math.max(...visibleRows.map(row => Number(row[valueKey]) || 0), 1);
    visibleRows.forEach(row => {
      const item = document.createElement('div');
      item.className = 'bar-chart__item';
      const label = document.createElement('span');
      label.className = 'bar-chart__label';
      label.textContent = labelKey === 'date' ? shortDate(`${row[labelKey]}T00:00:00`) : row[labelKey];
      label.title = row[labelKey];
      const track = document.createElement('span');
      track.className = 'bar-chart__track';
      const bar = document.createElement('span');
      bar.className = 'bar-chart__bar';
      bar.style.width = `${Math.max(3, (Number(row[valueKey]) || 0) / max * 100)}%`;
      track.append(bar);
      const value = document.createElement('strong');
      value.textContent = row[valueKey];
      item.append(label, track, value);
      container.append(item);
    });
  }

  function renderCards(cards, selectedObject) {
    const items = selectedObject
      ? [
          ['Проверок', cards.inspections, 'За выбранный период'],
          ['Неисправностей', cards.issues, cards.issues ? 'Требуют проверки' : 'Ничего не обнаружено'],
          ['Последняя проверка', shortDate(cards.last_inspection), dateTime(cards.last_inspection)]
        ]
      : [
          ['Объектов', cards.objects, 'В общей аналитике'],
          ['Проверок', cards.inspections, 'За выбранный период'],
          ['Неисправностей', cards.issues, 'Всего за период'],
          ['Требуют внимания', cards.problem_objects, 'Объектов с неисправностями']
        ];
    document.getElementById('analytics-cards').innerHTML = items.map(([label, value, note], index) => `<article class="analytics-card${index === items.length - 1 && !selectedObject && cards.problem_objects ? ' analytics-card--warning' : ''}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></article>`).join('');
  }

  function selectObject(name) {
    objectFilter.value = name;
    load();
  }

  function renderAttention(data) {
    const container = document.getElementById('analytics-attention');
    const checks = new Map(data.checks.map(item => [item.object, item]));
    const rows = data.issues_by_object.slice(0, 6).map(item => ({ ...item, ...checks.get(item.object) }));
    if (!rows.length) {
      container.innerHTML = '<div class="analytics-success"><span aria-hidden="true">✓</span><div><strong>Критичных отклонений нет</strong><p>За выбранный период неисправности не обнаружены.</p></div></div>';
      return;
    }
    container.innerHTML = rows.map((row, index) => `<button class="attention-item" type="button" data-object="${escapeHtml(row.object)}"><span class="attention-item__rank">${index + 1}</span><span class="attention-item__body"><strong>${escapeHtml(row.object)}</strong><small>Последняя проверка ${escapeHtml(shortDate(row.last_inspection))}</small></span><span class="attention-item__count">${escapeHtml(row.count)}<small>неиспр.</small></span><span class="attention-item__arrow" aria-hidden="true">→</span></button>`).join('');
    container.querySelectorAll('[data-object]').forEach(button => button.addEventListener('click', () => selectObject(button.dataset.object)));
  }

  function renderDetailTables(data) {
    document.getElementById('analytics-chemistry').innerHTML = table([
      { key: 'label', label: 'Показатель' }, { key: 'value', label: 'Значение' },
      { key: 'timestamp', label: 'Дата', format: shortDate }
    ], data.chemistry, 'Нет данных об остатках химии.');
    document.getElementById('analytics-issues').innerHTML = table([
      { key: 'label', label: 'Узел' }, { key: 'value', label: 'Состояние' },
      { key: 'administrator', label: 'Администратор' }, { key: 'timestamp', label: 'Дата', format: dateTime }
    ], data.recent_issues, 'За выбранный период неисправности не обнаружены.');
    document.getElementById('analytics-technical').innerHTML = table([
      { key: 'label', label: 'Показатель' }, { key: 'value', label: 'Значение' },
      { key: 'timestamp', label: 'Дата', format: dateTime }
    ], data.technical, 'Нет технических замеров.');
    document.getElementById('analytics-checks').innerHTML = table([
      { key: 'inspections', label: 'Проверок' }, { key: 'issues', label: 'Неисправностей' },
      { key: 'last_inspection', label: 'Последняя проверка', format: dateTime }
    ], data.checks, 'За выбранный период проверок нет.');
  }

  function fillObjectSelects(objects, selected) {
    objectFilter.innerHTML = '<option value="">Все объекты</option>';
    objectShortcut.innerHTML = '<option value="">Выберите объект</option>';
    objects.forEach(name => {
      objectFilter.append(new Option(name, name));
      objectShortcut.append(new Option(name, name));
    });
    objectFilter.value = objects.includes(selected) ? selected : '';
    objectShortcut.value = '';
  }

  function render(data) {
    status.textContent = data.sync.running
      ? 'Идёт синхронизация…'
      : data.sync.last_success_at
        ? `Обновлено: ${dateTime(data.sync.last_success_at)} · Следующее обновление: ${dateTime(data.sync.next_run_at)}`
        : 'Данные ещё не синхронизированы';
    errorBox.hidden = !data.sync.last_error;
    errorBox.textContent = data.sync.last_error ? `Последняя ошибка: ${data.sync.last_error}` : '';

    const requestedObject = objectFilter.value;
    fillObjectSelects(data.filters.objects, requestedObject);
    const selectedObject = objectFilter.value;
    renderCards(data.cards, selectedObject);
    overview.hidden = Boolean(selectedObject);
    detail.hidden = !selectedObject;

    if (selectedObject) {
      document.getElementById('analytics-detail-title').textContent = selectedObject;
      barChart(document.getElementById('analytics-detail-chart'), data.inspections_by_day, 'date', 'count', 'За выбранный период проверок нет.');
      renderDetailTables(data);
      return;
    }

    const firstDate = data.inspections_by_day[0]?.date;
    const lastDate = data.inspections_by_day.at(-1)?.date;
    document.getElementById('analytics-period-summary').textContent = firstDate ? `${shortDate(`${firstDate}T00:00:00`)} — ${shortDate(`${lastDate}T00:00:00`)}` : '';
    barChart(document.getElementById('analytics-inspections-chart'), data.inspections_by_day, 'date', 'count', 'За выбранный период проверок нет.');
    renderAttention(data);
  }

  async function load() {
    try {
      errorBox.hidden = true;
      const data = await getAnalyticsSummary({ object: objectFilter.value, from: fromFilter.value, to: toFilter.value });
      render(data);
      loaded = true;
    } catch (error) {
      errorBox.hidden = false;
      errorBox.textContent = error.message;
    }
  }

  [objectFilter, fromFilter, toFilter].forEach(input => input.addEventListener('change', load));
  objectShortcut.addEventListener('change', () => {
    if (objectShortcut.value) selectObject(objectShortcut.value);
  });
  document.getElementById('analytics-back-overview').addEventListener('click', () => selectObject(''));
  document.getElementById('analytics-reset').addEventListener('click', () => {
    objectFilter.value = '';
    fromFilter.value = '';
    toFilter.value = '';
    load();
  });
  document.querySelectorAll('[data-analytics-tab]').forEach(tab => tab.addEventListener('click', () => {
    document.querySelectorAll('[data-analytics-tab]').forEach(item => {
      const active = item === tab;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-selected', String(active));
    });
    document.querySelectorAll('[data-analytics-panel]').forEach(panel => {
      panel.hidden = panel.dataset.analyticsPanel !== tab.dataset.analyticsTab;
    });
  }));
  syncButton.addEventListener('click', async () => {
    syncButton.disabled = true;
    syncButton.textContent = 'Обновление…';
    try {
      const result = await syncAnalytics();
      window.toast(`Загружено вкладок: ${result.sheets}, строк: ${result.rows}`);
      await load();
    } catch (error) {
      window.toast(error.message, 'error');
      await load();
    } finally {
      syncButton.disabled = false;
      syncButton.textContent = 'Обновить сейчас';
    }
  });

  document.addEventListener('sidebar-navigate', event => {
    if (event.detail.pageKey === 'analytics' && !loaded) load();
  });
})();
