(() => {
  const modal = document.querySelector('#object-modal');
  const modalTitle = document.querySelector('#object-modal-title');
  const confirmModal = document.querySelector('#confirm-modal');
  const form = document.querySelector('#object-form');
  const photoInput = document.querySelector('#object-photo');
  const photoField = photoInput.closest('.field');
  const photoEditHint = document.querySelector('#photo-edit-hint');
  const preview = document.querySelector('#photo-preview');
  const robots = document.querySelector('#robots-fields');
  const chemistry = document.querySelector('#chemistry-fields');

  const listPage = document.querySelector('#page-objectCard');
  const placeholderPage = document.querySelector('#page-placeholder');
  const detailPage = document.querySelector('#page-objectDetail');
  const detailTitle = document.querySelector('#detail-title');
  const detailPhoto = document.querySelector('#detail-photo');
  const detailFields = document.querySelector('#detail-fields');
  const testsPage = document.querySelector('#page-objectTests');
  const testsTitle = document.querySelector('#object-tests-title');
  const testsList = document.querySelector('#object-tests-list');

  const filtersBar = document.querySelector('#object-filters');
  const filterSelects = [...filtersBar.querySelectorAll('select[data-filter]')];
  const filtersReset = document.querySelector('#object-filters-reset');
  const searchInput = document.querySelector('#object-search');

  // Небольшая задержка для поля поиска — не фильтруем на каждый символ.
  const debounce = (fn, ms = 200) => {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
  };

  // Выбранные фильтры списка объектов храним в query-строке (of_*), чтобы ссылкой
  // можно было поделиться и не терять выбор при перезагрузке.
  const URL_PREFIX = 'of_';
  let urlFiltersApplied = false;
  const readFiltersFromUrl = () => {
    const params = new URLSearchParams(location.search);
    filterSelects.forEach(sel => {
      const value = params.get(URL_PREFIX + sel.dataset.filter);
      if (!value) return;
      if (![...sel.options].some(option => option.value === value)) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        sel.append(option);
      }
      sel.value = value;
    });
    const query = params.get(URL_PREFIX + 'q');
    if (query) searchInput.value = query;
  };
  const writeFiltersToUrl = () => {
    const params = new URLSearchParams(location.search);
    [...params.keys()].forEach(key => { if (key.startsWith(URL_PREFIX)) params.delete(key); });
    filterSelects.forEach(sel => { if (sel.value) params.set(URL_PREFIX + sel.dataset.filter, sel.value); });
    const query = searchInput.value.trim();
    if (query) params.set(URL_PREFIX + 'q', query);
    const qs = params.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
  };

  const robotOptions = ['Рязань', 'RCW'];
  const STAGE3 = 'Этап №3 - Полевой долгосрочный';
  let chemistryOptions = [];        // названия из раздела «Химия» для формы
  let testChemNames = new Set();      // названия химии на этапе тестирования №3
  let rejectChemNames = new Set();    // названия химии с результатом «Отказ»
  let approvedChemNames = new Set();  // названия химии с результатом «Одобрено»
  let chemicalIdByName = {};          // название химии -> id (для ссылок на страницу химии)
  let chemicalsList = [];             // полный список химии (для страницы «Тестирования»)
  const imageTypeRe = /^image\/(png|jpe?g)$/;

  // Подтягивает актуальные данные раздела «Химия»: названия для формы и наборы
  // названий для фильтра «Вид химии» (этап №3 = «Тестовая», результат «Отказ» /
  // «Одобрено» = «Действующая»).
  const loadChemistryOptions = async () => {
    try {
      const list = await getChemicals();
      chemicalsList = list;
      chemistryOptions = [...new Set(list.map(item => item.name).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'ru'));
      testChemNames = new Set(list.filter(item => item.test_stage === STAGE3).map(item => item.name));
      rejectChemNames = new Set(list.filter(item => item.result === 'Отказ').map(item => item.name));
      approvedChemNames = new Set(list.filter(item => item.result === 'Одобрено').map(item => item.name));
      chemicalIdByName = {};
      list.forEach(item => { if (item.name) chemicalIdByName[item.name] = item.id; });
    } catch { /* оставляем прежние значения */ }
  };

  let previewUrl = null;
  let objectsById = {};
  let allObjects = [];
  let editingId = null;
  let currentDetailObject = null;

  const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[char]));

  const options = values =>
    `<option value="">Выберите значение</option>${values.map(value => `<option>${escapeHtml(value)}</option>`).join('')}`;

  // Ссылка-иконка на Яндекс.Карты с адресом объекта (+ «Портал» в запросе).
  const buildMapLink = address => {
    const link = document.createElement('a');
    link.className = 'map-link';
    const query = [String(address || '').trim(), 'Портал'].filter(Boolean).join(' ');
    link.href = 'https://yandex.ru/maps/?text=' + encodeURIComponent(query);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.title = 'Показать на Яндекс.Картах';
    link.setAttribute('aria-label', 'Показать адрес на Яндекс.Картах');
    link.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>';
    link.addEventListener('click', event => event.stopPropagation());
    return link;
  };

  const addRow = (container, name, values, selectedValue) => {
    const row = document.createElement('div');
    row.className = 'repeatable-row';
    row.innerHTML = `<select name="${name}">${options(values)}</select><button type="button" class="remove-field" aria-label="Удалить">−</button>`;
    const select = row.querySelector('select');
    if (selectedValue) {
      if (![...select.options].some(option => option.value === selectedValue)) {
        const extra = document.createElement('option');
        extra.textContent = selectedValue;
        select.append(extra);
      }
      select.value = selectedValue;
    }
    row.querySelector('button').onclick = () => {
      if (container.children.length > 1) row.remove();
    };
    container.append(row);
  };

  const clearPreview = () => {
    if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
    preview.hidden = true;
    preview.removeAttribute('src');
  };

  const resetForm = () => {
    form.reset();
    clearPreview();
    robots.innerHTML = '';
    chemistry.innerHTML = '';
    addRow(robots, 'robots', robotOptions);
    addRow(chemistry, 'chemistry', chemistryOptions);
    form.querySelectorAll('.field').forEach(field => field.classList.remove('invalid'));
    editingId = null;
    modalTitle.textContent = 'Добавить объект';
    photoEditHint.hidden = true;
  };

  const closeForm = () => {
    modal.hidden = true;
    confirmModal.hidden = true;
    document.body.style.overflow = '';
    editingId = null;
  };

  // Все поля объекта необязательны — проверяем только формат фото, если оно выбрано.
  const checkField = field => {
    if (field.contains(photoInput)) {
      const file = photoInput.files[0];
      const bad = !!file && !imageTypeRe.test(file.type);
      field.classList.toggle('invalid', bad);
      return !bad;
    }
    field.classList.remove('invalid');
    return true;
  };

  const validate = () => checkField(photoInput.closest('.field'));

  // ---------- Список карточек ----------
  const render = list => {
    const cards = document.querySelector('#object-cards');
    cards.innerHTML = '';
    const empty = document.querySelector('#objects-empty');
    empty.hidden = !!list.length;
    empty.textContent = allObjects.length
      ? 'По выбранным фильтрам ничего не найдено.'
      : 'Объекты пока не добавлены.';
    list.forEach(object => {
      const card = document.createElement('article');
      card.className = 'object-card';
      // Объект с химией, у которой результат тестирования «Отказ» — красная рамка.
      if (asList(object.chemistry).some(name => rejectChemNames.has(name))) {
        card.classList.add('object-card--reject');
      }
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.innerHTML = `<img alt=""><div class="object-card__body"><div class="object-card__address"><span class="object-card__address-text"></span></div><dl class="card-meta"></dl></div>`;
      const img = card.querySelector('img');
      if (object.photo_url) img.src = object.photo_url;
      img.alt = object.address || '';
      card.querySelector('.object-card__address-text').textContent = object.address;
      card.querySelector('.object-card__address').append(buildMapLink(object.address));

      const meta = card.querySelector('.card-meta');
      const addMeta = (label, value) => {
        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        dd.textContent = value && String(value).trim() ? value : '—';
        meta.append(dt, dd);
      };
      addMeta('Боксы', object.boxes);
      addMeta('Роботы', asList(object.robots).join(', '));
      addMeta('Управляющий', object.manager);
      addMeta('Водоотвод', object.drainage);

      // Химия объекта; названия с результатом «Отказ» — красным.
      const chemDt = document.createElement('dt');
      chemDt.textContent = 'Химия';
      const chemDd = document.createElement('dd');
      const chemNames = asList(object.chemistry);
      if (!chemNames.length) {
        chemDd.textContent = '—';
      } else {
        chemNames.forEach((name, i) => {
          const span = document.createElement('span');
          span.textContent = name;
          if (rejectChemNames.has(name)) span.className = 'reject';
          chemDd.append(span);
          if (i < chemNames.length - 1) chemDd.append(', ');
        });
      }
      meta.append(chemDt, chemDd);

      card.onclick = () => { location.hash = `#object-${object.id}`; };
      card.onkeydown = event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); location.hash = `#object-${object.id}`; }
      };
      cards.append(card);
    });
  };

  // ---------- Страница объекта ----------
  const asList = value => {
    if (Array.isArray(value)) return value;
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; }
    catch { return []; }
  };

  const formatDate = value => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('ru-RU');
  };

  const formatDay = value => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('ru-RU');
  };

  const renderDetail = object => {
    detailTitle.textContent = object.address || 'Объект';
    if (object.photo_url) detailPhoto.src = object.photo_url;
    else detailPhoto.removeAttribute('src');
    detailPhoto.alt = object.address || 'Фотография объекта';

    detailFields.innerHTML = '';

    const addRow = (label, fill) => {
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      fill(dd);
      detailFields.append(dt, dd);
    };
    const text = value => dd => { dd.textContent = value; };

    addRow('Адрес объекта', text(object.address || '—'));
    addRow('Количество боксов/роботов', text(object.boxes || '—'));
    addRow('Установленные роботы', text(asList(object.robots).join(', ') || '—'));
    addRow('Установленная химия', dd => {
      const names = asList(object.chemistry);
      if (!names.length) { dd.textContent = '—'; return; }
      names.forEach((name, index) => {
        const id = chemicalIdByName[name];
        const node = id != null ? document.createElement('a') : document.createElement('span');
        node.textContent = name;
        if (id != null) {
          node.className = 'chem-link';
          node.href = `#chemical-${id}`;
          // Запоминаем объект, с которого открыли химию — чтобы «Назад» вернуло сюда.
          node.addEventListener('click', () => {
            try { sessionStorage.setItem('chemBackTo', location.hash); } catch { /* нет доступа */ }
          });
        }
        // Химия с результатом тестирования «Отказ» — красным.
        if (rejectChemNames.has(name)) node.classList.add('chem-reject');
        dd.append(node);
        if (index < names.length - 1) dd.append(', ');
      });
    });
    addRow('Управляющий', text(object.manager || '—'));
    addRow('Телефон управляющего', text(object.manager_phone || '—'));
    addRow('Водоотведение', text(object.drainage || '—'));
    addRow('Добавлен', text(formatDate(object.created_at)));
  };

  const showDetailPage = () => {
    document.querySelectorAll('#content > .page').forEach(page => { page.hidden = page !== detailPage; });
    window.scrollTo(0, 0);
  };

  const openDetail = async id => {
    let object = objectsById[id];
    if (!object) {
      try { object = await getObject(id); } catch { location.hash = ''; return; }
    }
    currentDetailObject = object;
    renderDetail(object);
    showDetailPage();
  };

  const closeDetail = () => {
    detailPage.hidden = true;
    if (!location.hash) listPage.hidden = false;  // список объектов показываем только при возврате «домой»
  };

  // ---------- Страница «Тестирования» объекта ----------
  let currentTestsObject = null;

  const showTestsPage = () => {
    document.querySelectorAll('#content > .page').forEach(page => { page.hidden = page !== testsPage; });
    window.scrollTo(0, 0);
  };

  const renderTests = object => {
    testsTitle.textContent = object.address ? `Тестирования — ${object.address}` : 'Тестирования';

    const items = [];
    chemicalsList.forEach(chemical => {
      (chemical.stages || []).forEach(stage => {
        if (stage.date && stage.object && stage.object === object.address) {
          items.push({
            chemId: chemical.id,
            chemName: chemical.name,
            stage: stage.stage,
            date: stage.date,
            comment: stage.comment || ''
          });
        }
      });
    });
    items.sort((a, b) => String(a.date).localeCompare(String(b.date)));

    testsList.innerHTML = '';
    if (!items.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'На этом объекте тестирования не проводились.';
      testsList.append(empty);
      return;
    }

    items.forEach(item => {
      const card = document.createElement('article');
      card.className = 'test-item';

      const head = document.createElement('div');
      head.className = 'test-item__head';
      const link = document.createElement('a');
      link.className = 'chem-link';
      link.href = `#chemical-${item.chemId}`;
      link.textContent = item.chemName;
      link.addEventListener('click', () => {
        try { sessionStorage.setItem('chemBackTo', location.hash); } catch { /* нет доступа */ }
      });
      head.append(link);
      const stage = document.createElement('span');
      stage.className = 'test-item__stage';
      stage.textContent = item.stage;
      head.append(stage);
      card.append(head);

      const date = document.createElement('div');
      date.className = 'test-item__date';
      date.textContent = formatDay(item.date);
      card.append(date);

      const comment = document.createElement('p');
      comment.className = 'test-item__comment';
      comment.textContent = item.comment || '—';
      card.append(comment);

      testsList.append(card);
    });
  };

  const openTests = async id => {
    let object = objectsById[id];
    if (!object) {
      try { object = await getObject(id); } catch { location.hash = ''; return; }
    }
    currentTestsObject = object;
    renderTests(object);
    showTestsPage();
  };

  const closeTests = () => {
    testsPage.hidden = true;
    if (!location.hash) listPage.hidden = false;
  };

  const route = () => {
    const testsMatch = location.hash.match(/^#object-(\d+)-tests$/);
    if (testsMatch) { openTests(testsMatch[1]); return; }
    const match = location.hash.match(/^#object-(\d+)$/);
    if (match) { openDetail(match[1]); return; }
    if (!detailPage.hidden) closeDetail();
    if (!testsPage.hidden) closeTests();
  };

  window.addEventListener('hashchange', route);
  document.querySelector('#detail-back').onclick = () => { location.hash = ''; };
  document.querySelector('#detail-tests').onclick = () => {
    if (currentDetailObject) location.hash = `#object-${currentDetailObject.id}-tests`;
  };
  document.querySelector('#detail-complaints').onclick = () => {
    if (currentDetailObject) location.hash = `#object-${currentDetailObject.id}-complaints`;
  };
  document.querySelector('#detail-info').onclick = () => {
    if (currentDetailObject && window.openEntityNotifications) {
      window.openEntityNotifications({ entity: 'object', id: currentDetailObject.id, name: currentDetailObject.address });
    }
  };
  document.querySelector('#object-tests-back').onclick = () => {
    location.hash = currentTestsObject ? `#object-${currentTestsObject.id}` : '';
  };

  // ---------- Фильтры ----------
  // Значения объекта для конкретного фильтра (всегда массив вариантов).
  const objectFilterValues = (object, key) => {
    if (key === 'robots') return asList(object.robots);
    if (key === 'chemistry') return asList(object.chemistry);
    if (key === 'test_chem') {
      const names = asList(object.chemistry);
      const result = [];
      if (names.some(name => testChemNames.has(name))) result.push('Тестовая');
      if (names.some(name => rejectChemNames.has(name))) result.push('Отказ');
      if (names.some(name => approvedChemNames.has(name))) result.push('Действующая');
      return result;
    }
    return [object[key] || ''];
  };

  const activeObjectFilters = () => {
    const active = {};
    filterSelects.forEach(sel => { if (sel.value) active[sel.dataset.filter] = sel.value; });
    return active;
  };

  const matchesObjectFilters = (object, filters) =>
    Object.entries(filters).every(([key, value]) => objectFilterValues(object, key).includes(value));

  // Пересобирает варианты фильтров (по остальным активным фильтрам) и список карточек.
  const refresh = () => {
    const filters = activeObjectFilters();
    const term = searchInput.value.trim().toLowerCase();
    const matchesSearch = object => !term || String(object.address || '').toLowerCase().includes(term);

    filterSelects.forEach(sel => {
      const key = sel.dataset.filter;
      if (key === 'test_chem') return;   // фиксированные варианты: Все / Да / Нет

      const others = { ...filters };
      delete others[key];
      const pool = allObjects.filter(object => matchesObjectFilters(object, others) && matchesSearch(object));

      const values = new Set();
      pool.forEach(object => objectFilterValues(object, key).forEach(value => {
        if (value !== '') values.add(value);
      }));
      const current = sel.value;
      if (current && !values.has(current)) values.add(current);

      sel.innerHTML = '';
      const all = document.createElement('option');
      all.value = '';
      all.textContent = 'Все';
      sel.append(all);
      [...values].sort((a, b) => a.localeCompare(b, 'ru')).forEach(value => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        sel.append(option);
      });
      sel.value = current;
    });

    render(allObjects.filter(object => matchesObjectFilters(object, filters) && matchesSearch(object)));
    writeFiltersToUrl();
  };

  const setData = list => {
    allObjects = list;
    objectsById = {};
    list.forEach(object => { objectsById[object.id] = object; });
    filtersBar.hidden = !list.length;
    if (!urlFiltersApplied) { urlFiltersApplied = true; readFiltersFromUrl(); }
    refresh();
  };

  filterSelects.forEach(sel => sel.addEventListener('change', refresh));
  searchInput.addEventListener('input', debounce(refresh));
  const resetFilters = () => {
    filterSelects.forEach(sel => { sel.value = ''; });
    searchInput.value = '';
    refresh();
  };
  filtersReset.addEventListener('click', resetFilters);
  // Уход в другой раздел через меню — очищаем фильтры и query-строку.
  document.addEventListener('sidebar-navigate', resetFilters);

  // ---------- Редактирование объекта ----------
  const openEditModal = async object => {
    await loadChemistryOptions();
    resetForm();
    editingId = object.id;
    modalTitle.textContent = 'Редактировать объект';
    photoEditHint.hidden = false;

    form.address.value = object.address || '';
    form.boxes.value = String(object.boxes || '');
    form.manager.value = object.manager || '';
    form.manager_phone.value = object.manager_phone || '';
    form.drainage.value = object.drainage || '';

    robots.innerHTML = '';
    chemistry.innerHTML = '';
    const robotValues = asList(object.robots);
    const chemistryValues = asList(object.chemistry);
    (robotValues.length ? robotValues : ['']).forEach(value => addRow(robots, 'robots', robotOptions, value));
    (chemistryValues.length ? chemistryValues : ['']).forEach(value => addRow(chemistry, 'chemistry', chemistryOptions, value));

    if (object.photo_url) {
      preview.src = object.photo_url;
      preview.hidden = false;
    }

    modal.hidden = false;
    document.body.style.overflow = 'hidden';
  };

  document.querySelector('#detail-edit').onclick = () => {
    if (currentDetailObject) openEditModal(currentDetailObject);
  };

  // ---------- Удаление объекта ----------
  const deleteModal = document.querySelector('#object-delete-modal');
  document.querySelector('#detail-delete').onclick = () => { deleteModal.hidden = false; };
  document.querySelector('#object-delete-no').onclick = () => { deleteModal.hidden = true; };
  document.querySelector('#object-delete-yes').onclick = async () => {
    if (!currentDetailObject) return;
    try {
      await deleteObject(currentDetailObject.id);
      deleteModal.hidden = true;
      location.hash = '';
      setData(await getObjects());
      window.toast('Объект удалён');
    } catch (error) {
      window.toast(error.message, 'error');
    }
  };

  // ---------- Форма добавления ----------
  photoInput.onchange = () => {
    clearPreview();
    const file = photoInput.files[0];
    if (file && imageTypeRe.test(file.type)) {
      previewUrl = URL.createObjectURL(file);
      preview.src = previewUrl;
      preview.hidden = false;
    }
    const field = photoInput.closest('.field');
    if (field.classList.contains('invalid')) checkField(field);
  };

  // Снимаем подсветку с поля, как только пользователь его исправил.
  const revalidateFrom = event => {
    const field = event.target.closest('.field');
    if (field && field.classList.contains('invalid')) checkField(field);
  };
  form.addEventListener('input', revalidateFrom);
  form.addEventListener('change', revalidateFrom);

  document.querySelector('#add-object-button').onclick = async () => {
    await loadChemistryOptions();
    resetForm();
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
  };

  const askCancel = () => { confirmModal.hidden = false; };
  document.querySelector('#modal-close').onclick = askCancel;
  document.querySelector('#cancel-object').onclick = askCancel;
  document.querySelector('#confirm-cancel').onclick = () => { confirmModal.hidden = true; };
  document.querySelector('#confirm-ok').onclick = closeForm;

  document.querySelectorAll('.add-field').forEach(button => {
    button.onclick = () => addRow(
      document.querySelector(`#${button.dataset.target}`),
      button.dataset.name,
      button.dataset.name === 'robots' ? robotOptions : chemistryOptions
    );
  });

  form.onsubmit = async event => {
    event.preventDefault();
    if (!validate()) return;
    const data = new FormData(form);
    data.delete('robots');
    data.delete('chemistry');
    data.append('robots', JSON.stringify([...form.querySelectorAll('[name="robots"]')].map(input => input.value)));
    data.append('chemistry', JSON.stringify([...form.querySelectorAll('[name="chemistry"]')].map(input => input.value)));
    if (!photoInput.files.length) data.delete('photo');
    const savingId = editingId;
    try {
      if (savingId != null) await updateObject(savingId, data);
      else await createObject(data);
      setData(await getObjects());
      closeForm();
      if (savingId != null && location.hash === `#object-${savingId}`) {
        currentDetailObject = objectsById[savingId] || currentDetailObject;
        if (currentDetailObject) renderDetail(currentDetailObject);
      }
      window.toast(savingId != null ? 'Объект обновлён' : 'Объект добавлен');
    } catch (error) {
      window.toast(error.message, 'error');
    }
  };

  loadChemistryOptions().then(() => {
    if (allObjects.length) refresh();
    if (currentDetailObject && !detailPage.hidden) renderDetail(currentDetailObject);
    if (currentTestsObject && !testsPage.hidden) renderTests(currentTestsObject);
  });
  window.skeletonCards(document.querySelector('#object-cards'));
  getObjects()
    .then(list => { setData(list); route(); })
    .catch(() => { setData([]); route(); });
  resetForm();
})();
