(() => {
  const modal = document.querySelector('#object-modal');
  const modalTitle = document.querySelector('#object-modal-title');
  const confirmModal = document.querySelector('#confirm-modal');
  const form = document.querySelector('#object-form');
  const photoInput = document.querySelector('#object-photo');
  const photoField = photoInput.closest('.field');
  const photoEditHint = document.querySelector('#photo-edit-hint');
  const preview = document.querySelector('#photo-preview');
  const chemistry = document.querySelector('#chemistry-fields');

  const listPage = document.querySelector('#page-objectCard');
  const detailPage = document.querySelector('#page-objectDetail');
  const detailTitle = document.querySelector('#detail-title');
  const detailPhoto = document.querySelector('#detail-photo');
  const detailFields = document.querySelector('#detail-fields');
  const testsPage = document.querySelector('#page-objectTests');
  const testsTitle = document.querySelector('#object-tests-title');
  const testsList = document.querySelector('#object-tests-list');
  const eventsList = document.querySelector('#object-events-list');
  const eventModal = document.querySelector('#object-event-modal');
  const eventDeleteModal = document.querySelector('#object-event-delete-modal');
  const eventForm = document.querySelector('#object-event-form');
  const eventPhotoInput = document.querySelector('#object-event-photo');
  const eventPhotoList = document.querySelector('#object-event-photo-list');

  const filtersBar = document.querySelector('#object-filters');
  const filterSelects = [...filtersBar.querySelectorAll('select[data-filter]')];
  const filtersReset = document.querySelector('#object-filters-reset');
  const searchInput = document.querySelector('#object-search');
  const countLabel = document.querySelector('#objects-count');

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

  const STAGE3 = 'Этап №3 - Полевой долгосрочный';
  let chemistryOptions = [];        // id и названия из раздела «Химия» для формы
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
      chemistryOptions = list.filter(item => item.name)
        .map(item => ({ value: String(item.id), label: item.name }))
        .sort((a, b) => a.label.localeCompare(b.label, 'ru'));
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
  let eventPhotoFiles = [];
  let eventPreviewUrls = [];
  let pendingDeleteEventId = null;

  const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[char]));

  const options = values =>
    `<option value="">Выберите значение</option>${values.map(item => {
      const value = item && typeof item === 'object' ? item.value : item;
      const label = item && typeof item === 'object' ? item.label : item;
      return `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`;
    }).join('')}`;

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
    if (selectedValue != null && selectedValue !== '') {
      select.value = String(selectedValue);
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
    chemistry.innerHTML = '';
    addRow(chemistry, 'chemical_ids', chemistryOptions);
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

  // Сервер проверяет обязательный адрес и связи; здесь отдельно проверяем формат фото.
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
      card.innerHTML = `<img alt=""><div class="object-card__body"><div class="object-card__address"><span class="object-card__address-text"></span><span class="object-card__icons"></span></div><dl class="card-meta"></dl></div>`;
      const img = card.querySelector('img');
      if (object.photo_url) {
        img.src = object.photo_url;
      }
      img.alt = object.name || object.address || '';
      card.querySelector('.object-card__address-text').textContent = object.name || object.address;
      const icons = card.querySelector('.object-card__icons');
      if (object.has_complaints) {
        const warning = document.createElement('span');
        warning.className = 'object-card__warning';
        warning.title = 'На объекте есть жалобы';
        warning.setAttribute('aria-label', 'На объекте есть жалобы');
        warning.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2 1 21h22L12 2zm1 15h-2v-2h2v2zm0-4h-2V8h2v5z"/></svg>';
        icons.append(warning);
      }
      icons.append(buildMapLink(object.address));

      const meta = card.querySelector('.card-meta');
      const addMeta = (label, value) => {
        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        dd.textContent = value && String(value).trim() ? value : '—';
        meta.append(dt, dd);
      };
      addMeta('Адрес', object.address);
      addMeta('Боксы', object.boxes);
      addMeta('Управляющий', object.manager);

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
    detailTitle.textContent = object.name || object.address || 'Объект';
    if (object.photo_url) detailPhoto.src = object.photo_url;
    else detailPhoto.removeAttribute('src');
    detailPhoto.alt = object.name || object.address || 'Фотография объекта';

    detailFields.innerHTML = '';

    const addRow = (label, fill) => {
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      fill(dd);
      detailFields.append(dt, dd);
    };
    const text = value => dd => { dd.textContent = value; };

    addRow('Наименование объекта', text(object.name || '—'));
    addRow('Адрес объекта', text(object.address || '—'));
    addRow('Количество боксов', text(object.boxes || '—'));
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
    addRow('Добавлен', text(formatDate(object.created_at)));
    renderEvents(object);
  };

  const renderEvents = object => {
    eventsList.innerHTML = '';
    const events = [...asList(object.events)].sort((a, b) => String(b.date).localeCompare(String(a.date)) || Number(b.id) - Number(a.id));
    if (!events.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'События пока не добавлены.';
      eventsList.append(empty);
      return;
    }
    events.forEach(event => {
      const card = document.createElement('article');
      card.className = 'object-event';
      const head = document.createElement('div');
      head.className = 'object-event__head';
      const date = document.createElement('div');
      date.className = 'object-event__date';
      date.textContent = formatDay(event.date);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'button-danger object-event__delete';
      remove.title = 'Удалить событие';
      remove.setAttribute('aria-label', `Удалить событие от ${formatDay(event.date)}`);
      remove.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 3v1H4v2h16V4h-5V3H9zM6 8v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8H6zm3 3h2v8H9v-8zm4 0h2v8h-2v-8z"/></svg>';
      remove.onclick = () => {
        pendingDeleteEventId = event.id;
        eventDeleteModal.hidden = false;
      };
      head.append(date, remove);
      card.append(head);
      if (event.comment) {
        const comment = document.createElement('p');
        comment.className = 'object-event__comment';
        comment.textContent = event.comment;
        card.append(comment);
      }
      if (asList(event.photo_urls).length) {
        const gallery = document.createElement('div');
        gallery.className = 'object-event__photos';
        asList(event.photo_urls).forEach((url, index) => {
          const img = document.createElement('img');
          img.src = url;
          img.alt = `Фотография события ${index + 1}`;
          img.dataset.fullImage = '';
          gallery.append(img);
        });
        card.append(gallery);
      }
      if (asList(event.documents).length) {
        const documents = document.createElement('div');
        documents.className = 'object-event__documents';
        asList(event.documents).forEach(file => {
          const link = document.createElement('a');
          link.href = file.url;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.textContent = file.name || 'Документ';
          documents.append(link);
        });
        card.append(documents);
      }
      eventsList.append(card);
    });
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
    testsTitle.textContent = object.name || object.address ? `Тестирования — ${object.name || object.address}` : 'Тестирования';

    const items = [];
    chemicalsList.forEach(chemical => {
      (chemical.stages || []).forEach(stage => {
        if (stage.date && Number(stage.object_id) === Number(object.id)) {
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
      window.openEntityNotifications({ entity: 'object', id: currentDetailObject.id, name: currentDetailObject.name || currentDetailObject.address });
    }
  };
  document.querySelector('#object-tests-back').onclick = () => {
    location.hash = currentTestsObject ? `#object-${currentTestsObject.id}` : '';
  };

  // ---------- События объекта ----------
  const clearEventPhotos = () => {
    eventPreviewUrls.forEach(URL.revokeObjectURL);
    eventPreviewUrls = [];
    eventPhotoFiles = [];
    eventPhotoList.innerHTML = '';
  };

  const renderEventPhotoFiles = () => {
    eventPreviewUrls.forEach(URL.revokeObjectURL);
    eventPreviewUrls = eventPhotoFiles.map(file => URL.createObjectURL(file));
    eventPhotoList.innerHTML = '';
    eventPhotoFiles.forEach((file, index) => {
      const item = document.createElement('span');
      item.className = 'attachment-chip attachment-chip--photo';
      const img = document.createElement('img');
      img.src = eventPreviewUrls[index];
      img.alt = file.name;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'attachment-chip__remove';
      remove.setAttribute('aria-label', `Удалить ${file.name}`);
      remove.textContent = '×';
      remove.onclick = () => { eventPhotoFiles.splice(index, 1); renderEventPhotoFiles(); };
      item.append(img, remove);
      eventPhotoList.append(item);
    });
  };

  const closeEventModal = () => {
    eventModal.hidden = true;
    document.body.style.overflow = '';
    clearEventPhotos();
    eventForm.reset();
  };

  document.querySelector('#add-object-event').onclick = () => {
    if (!currentDetailObject) return;
    eventForm.reset();
    clearEventPhotos();
    eventForm.elements.date.value = new Date().toISOString().slice(0, 10);
    eventModal.hidden = false;
    document.body.style.overflow = 'hidden';
  };
  document.querySelector('#object-event-close').onclick = closeEventModal;
  document.querySelector('#object-event-cancel').onclick = closeEventModal;
  eventModal.addEventListener('click', event => { if (event.target === eventModal) closeEventModal(); });
  document.querySelector('#object-event-delete-no').onclick = () => {
    eventDeleteModal.hidden = true;
    pendingDeleteEventId = null;
  };
  document.querySelector('#object-event-delete-yes').onclick = async () => {
    if (!currentDetailObject || pendingDeleteEventId == null) return;
    try {
      const updated = await deleteObjectEvent(currentDetailObject.id, pendingDeleteEventId);
      currentDetailObject = updated;
      objectsById[updated.id] = updated;
      const index = allObjects.findIndex(object => Number(object.id) === Number(updated.id));
      if (index !== -1) allObjects[index] = updated;
      eventDeleteModal.hidden = true;
      pendingDeleteEventId = null;
      renderDetail(updated);
      window.toast('Событие удалено');
    } catch (error) {
      window.toast(error.message, 'error');
    }
  };
  eventPhotoInput.addEventListener('change', () => {
    const file = eventPhotoInput.files[0];
    eventPhotoInput.value = '';
    if (!file) return;
    if (!imageTypeRe.test(file.type)) { window.toast('Фотография должна быть в формате PNG, JPG или JPEG', 'error'); return; }
    if (eventPhotoFiles.length >= 10) { window.toast('Можно добавить не более 10 фотографий', 'error'); return; }
    eventPhotoFiles.push(file);
    renderEventPhotoFiles();
  });
  eventForm.onsubmit = async event => {
    event.preventDefault();
    if (!currentDetailObject || !eventForm.elements.date.value) {
      window.toast('Укажите дату события', 'error');
      return;
    }
    const data = new FormData();
    data.set('date', eventForm.elements.date.value);
    data.set('comment', eventForm.elements.comment.value);
    eventPhotoFiles.forEach(file => data.append('photos', file, file.name));
    [...eventForm.elements.documents.files].forEach(file => data.append('documents', file, file.name));
    try {
      const updated = await addObjectEvent(currentDetailObject.id, data);
      currentDetailObject = updated;
      objectsById[updated.id] = updated;
      const index = allObjects.findIndex(object => Number(object.id) === Number(updated.id));
      if (index !== -1) allObjects[index] = updated;
      renderDetail(updated);
      closeEventModal();
      window.toast('Событие добавлено');
    } catch (error) {
      window.toast(error.message, 'error');
    }
  };

  // ---------- Фильтры ----------
  // Значения объекта для конкретного фильтра (всегда массив вариантов).
  const objectFilterValues = (object, key) => {
    if (key === 'boxes') return [String(object.boxes ?? '')];
    if (key === 'has_complaints') return [String(Boolean(object.has_complaints))];
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
    const matchesSearch = object => !term || [object.name, object.address].some(value => String(value || '').toLowerCase().includes(term));

    filterSelects.forEach(sel => {
      const key = sel.dataset.filter;
      if (key === 'test_chem' || key === 'has_complaints') return;

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
      [...values].sort((a, b) => key === 'boxes' ? Number(a) - Number(b) : a.localeCompare(b, 'ru')).forEach(value => {
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
    countLabel.textContent = `Всего объектов: ${list.length}`;
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
  document.addEventListener('complaints-changed', async event => {
    try {
      const list = await getObjects();
      setData(list);
      const id = event.detail && event.detail.objectId;
      if (id && currentDetailObject && Number(currentDetailObject.id) === Number(id)) {
        currentDetailObject = objectsById[id] || currentDetailObject;
      }
    } catch { /* список обновится при следующей загрузке */ }
  });

  // ---------- Редактирование объекта ----------
  const openEditModal = async object => {
    await loadChemistryOptions();
    resetForm();
    editingId = object.id;
    modalTitle.textContent = 'Редактировать объект';
    photoEditHint.hidden = false;

    form.name.value = object.name || '';
    form.address.value = object.address || '';
    form.boxes.value = String(object.boxes || '');
    form.manager.value = object.manager || '';
    form.manager_phone.value = object.manager_phone || '';
    chemistry.innerHTML = '';
    const chemistryValues = asList(object.chemical_ids);
    (chemistryValues.length ? chemistryValues : ['']).forEach(value => addRow(chemistry, 'chemical_ids', chemistryOptions, value));

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
      chemistryOptions
    );
  });

  form.onsubmit = async event => {
    event.preventDefault();
    if (!validate()) return;
    const data = new FormData(form);
    data.delete('chemical_ids');
    data.append('chemical_ids', JSON.stringify([...form.querySelectorAll('[name="chemical_ids"]')].map(input => input.value).filter(Boolean)));
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
