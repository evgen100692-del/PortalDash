(() => {
  const modal = document.querySelector('#chemical-modal');
  const modalTitle = document.querySelector('#chemical-modal-title');
  const confirmModal = document.querySelector('#chemical-confirm-modal');
  const deleteModal = document.querySelector('#chemical-delete-modal');
  const form = document.querySelector('#chemical-form');
  const photoInput = document.querySelector('#chemical-photo');
  const photoEditHint = document.querySelector('#chemical-photo-edit-hint');
  const preview = document.querySelector('#chemical-photo-preview');
  const hasDocsBox = document.querySelector('#chemical-has-docs');
  const docsBlock = document.querySelector('#chemical-docs');
  const importantDocCurrents = [...docsBlock.querySelectorAll('.chem-doc-current')];
  const otherDocsCurrent = form.querySelector('.chem-doc-current[data-doc="other"]');
  const formEl = name => form.elements[name];
  const cards = document.querySelector('#chemical-cards');
  const emptyState = document.querySelector('#chemicals-empty');
  const countLabel = document.querySelector('#chemicals-count');
  const filtersBar = document.querySelector('#chemical-filters');
  const filterSelects = [...filtersBar.querySelectorAll('select[data-filter]')];
  const filtersReset = document.querySelector('#chemical-filters-reset');
  const searchInput = document.querySelector('#chemical-search');

  const listPage = document.querySelector('#page-chemicals');
  const detailPage = document.querySelector('#page-chemicalDetail');
  const detailTitle = document.querySelector('#chemical-detail-title');
  const detailPhotos = document.querySelector('#chemical-detail-photos');
  const detailFields = document.querySelector('#chemical-detail-fields');

  const imageTypeRe = /^image\/(png|jpe?g)$/;
  const documentTypeRe = /^(image\/(png|jpe?g)|application\/pdf)$/;
  let photoItems = [];
  let photoSequence = 0;
  let chemicalsById = {};
  let allChemicals = [];
  let allObjectsData = [];   // объекты (для блока «Применяется на объектах»)
  let editingId = null;
  let currentDetailChemical = null;
  let otherDocumentItems = [];
  let otherDocumentSequence = 0;

  const asList = value => {
    if (Array.isArray(value)) return value;
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; }
    catch { return []; }
  };

  // Небольшая задержка для поля поиска — не фильтруем на каждый символ.
  const debounce = (fn, ms = 200) => {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
  };

  // Выбранные фильтры храним в query-строке (cf_*) — чтобы делиться ссылкой
  // и не терять выбор при перезагрузке.
  const URL_PREFIX = 'cf_';
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

  const stageBlocks = [...form.querySelectorAll('.test-stage')];
  const stageObjectSelects = [...form.querySelectorAll('.stage-object select')];
  let objectOptions = [];  // id и наименования объектов для полей «Объект тестирования»

  // Заполняет выпадающие списки объектов на этапах 2 и 3 адресами из раздела «Объекты».
  const loadObjectOptions = async () => {
    try {
      const list = await getObjects();
      allObjectsData = list;
      objectOptions = list.filter(item => item.name || item.address)
        .map(item => ({ value: String(item.id), label: item.name || item.address }))
        .sort((a, b) => a.label.localeCompare(b.label, 'ru'));
    } catch { /* оставляем прежние значения */ }
    stageObjectSelects.forEach(sel => {
      const current = sel.value;
      sel.innerHTML = '<option value="">Выберите объект</option>';
      objectOptions.forEach(item => {
        const option = document.createElement('option');
        option.value = item.value;
        option.textContent = item.label;
        sel.append(option);
      });
      sel.value = current;
    });
  };

  const stageParts = stage => ({
    block: form.querySelector(`.test-stage[data-stage="${stage}"]`),
    mode: form.querySelector(`[name="stage${stage}_mode"]`),
    date: form.querySelector(`[name="stage${stage}_date"]`),
    commentField: form.querySelector(`.stage-comment[data-stage="${stage}"]`),
    comment: form.querySelector(`[name="stage${stage}_comment"]`),
    objectField: form.querySelector(`.stage-object[data-stage="${stage}"]`),
    objectSelect: form.querySelector(`[name="stage${stage}_object"]`)
  });

  const clearPreview = () => {
    photoItems.filter(item => item.file).forEach(item => URL.revokeObjectURL(item.url));
    photoItems = [];
    preview.hidden = true;
    preview.innerHTML = '';
  };

  const showPhotoPreview = () => {
    preview.innerHTML = '';
    photoItems.forEach((item, index) => {
      const card = document.createElement('span');
      card.className = 'photo-preview-item';
      card.draggable = true;
      card.dataset.key = item.key;
      const img = document.createElement('img');
      img.src = item.url;
      img.alt = `Фото ${index + 1}`;
      const order = document.createElement('span');
      order.className = 'photo-preview-item__order';
      order.textContent = String(index + 1);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'photo-preview-item__remove';
      remove.setAttribute('aria-label', `Удалить фотографию ${index + 1}`);
      remove.textContent = '×';
      remove.onclick = () => {
        if (item.file) URL.revokeObjectURL(item.url);
        photoItems = photoItems.filter(candidate => candidate.key !== item.key);
        showPhotoPreview();
      };
      card.addEventListener('dragstart', () => card.classList.add('is-dragging'));
      card.addEventListener('dragend', () => card.classList.remove('is-dragging'));
      card.addEventListener('dragover', event => event.preventDefault());
      card.addEventListener('drop', event => {
        event.preventDefault();
        const dragging = preview.querySelector('.is-dragging');
        if (!dragging || dragging === card) return;
        const from = photoItems.findIndex(candidate => candidate.key === dragging.dataset.key);
        const to = photoItems.findIndex(candidate => candidate.key === item.key);
        const [moved] = photoItems.splice(from, 1);
        photoItems.splice(to, 0, moved);
        showPhotoPreview();
      });
      card.append(img, order, remove);
      preview.append(card);
    });
    preview.hidden = !photoItems.length;
  };

  const setExistingPhotos = urls => {
    clearPreview();
    photoItems = urls.map(url => ({ key: `existing:${url}`, token: url, url }));
    showPhotoPreview();
  };

  // Показывает поля даты, комментария и объекта в зависимости от режима этапа.
  const syncStage = stage => {
    const { mode, date, commentField, comment, objectField, objectSelect } = stageParts(stage);
    const useDate = mode.value === 'date';
    date.hidden = !useDate;
    if (!useDate) { date.value = ''; }
    // Комментарий и объект появляются, когда для этапа выбрана дата.
    const showExtra = useDate && !!date.value;
    commentField.hidden = !showExtra;
    if (!showExtra) { comment.value = ''; commentField.classList.remove('invalid'); }
    if (objectField) {
      objectField.hidden = !showExtra;
      if (!showExtra) { objectSelect.value = ''; objectField.classList.remove('invalid'); }
    }
    if (!useDate) date.closest('.test-stage').classList.remove('invalid');
  };

  const syncDocs = () => {
    docsBlock.hidden = !hasDocsBox.checked;
  };

  const renderOtherDocuments = () => {
    otherDocsCurrent.innerHTML = '';
    otherDocumentItems.forEach((file, index) => {
      const row = document.createElement('span');
      row.className = 'chem-doc-current-list__item';
      row.draggable = true;
      row.dataset.key = file.key;
      const order = document.createElement('span');
      order.className = 'chem-doc-current-list__order';
      order.textContent = String(index + 1);
      const link = document.createElement('a');
      link.href = file.url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = file.name || 'Документ';
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'link-danger';
      remove.textContent = 'удалить';
      remove.onclick = () => {
        if (file.file) URL.revokeObjectURL(file.url);
        otherDocumentItems = otherDocumentItems.filter(candidate => candidate.key !== file.key);
        renderOtherDocuments();
      };
      row.addEventListener('dragstart', () => row.classList.add('is-dragging'));
      row.addEventListener('dragend', () => row.classList.remove('is-dragging'));
      row.addEventListener('dragover', event => event.preventDefault());
      row.addEventListener('drop', event => {
        event.preventDefault();
        const dragging = otherDocsCurrent.querySelector('.is-dragging');
        if (!dragging || dragging === row) return;
        const from = otherDocumentItems.findIndex(candidate => candidate.key === dragging.dataset.key);
        const to = otherDocumentItems.findIndex(candidate => candidate.key === file.key);
        const [moved] = otherDocumentItems.splice(from, 1);
        otherDocumentItems.splice(to, 0, moved);
        renderOtherDocuments();
      });
      row.append(order, link, remove);
      otherDocsCurrent.append(row);
    });
    otherDocsCurrent.hidden = !otherDocumentItems.length;
  };

  const clearOtherDocuments = () => {
    otherDocumentItems.filter(item => item.file).forEach(item => URL.revokeObjectURL(item.url));
    otherDocumentItems = [];
    renderOtherDocuments();
  };

  const resetForm = () => {
    form.reset();
    clearPreview();
    form.querySelectorAll('.field').forEach(field => field.classList.remove('invalid'));
    [1, 2, 3].forEach(stage => {
      stageParts(stage).mode.value = 'none';
      syncStage(stage);
    });
    importantDocCurrents.forEach(el => { el.hidden = true; el.textContent = ''; });
    clearOtherDocuments();
    formEl('doc_other_order').value = '[]';
    syncDocs();
    editingId = null;
    modalTitle.textContent = 'Добавить химию';
    photoEditHint.hidden = false;
  };

  const closeForm = () => {
    modal.hidden = true;
    confirmModal.hidden = true;
    document.body.style.overflow = '';
    editingId = null;
    clearPreview();
    clearOtherDocuments();
  };

  // Сервер проверяет обязательное название и связи; здесь отдельно проверяем фотографии.
  const checkField = field => {
    if (field.contains(photoInput)) {
      const file = photoInput.files[0];
      const bad = photoItems.length > 10 || (!!file && !imageTypeRe.test(file.type));
      field.classList.toggle('invalid', bad);
      return !bad;
    }
    field.classList.remove('invalid');
    return true;
  };

  const validate = () => checkField(photoInput.closest('.field'));

  const render = list => {
    cards.innerHTML = '';
    emptyState.hidden = !!list.length;
    emptyState.textContent = allChemicals.length
      ? 'По выбранным фильтрам ничего не найдено.'
      : 'Химия пока не добавлена.';
    list.forEach(chemical => {
      const card = document.createElement('article');
      card.className = 'chem-card';
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.innerHTML = `<img alt=""><div class="chem-card__body"><div class="chem-card__name"></div><dl class="card-meta"></dl></div>`;
      const img = card.querySelector('img');
      const firstPhoto = asList(chemical.photo_urls)[0];
      if (firstPhoto) {
        img.src = firstPhoto;
      }
      img.alt = chemical.name;
      card.querySelector('.chem-card__name').textContent = chemical.name;

      const meta = card.querySelector('.card-meta');
      const addMeta = (label, value, reject) => {
        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        dd.textContent = value && String(value).trim() ? value : '—';
        if (reject) dd.className = 'reject';
        meta.append(dt, dd);
      };
      addMeta('Поставщик', chemical.supplier);
      addMeta('Тип', chemical.chem_type);
      addMeta('Результат', chemical.result, chemical.result === 'Отказ');
      const documentNames = asList(chemical.other_documents).map(file => file && file.name).filter(Boolean);
      if (documentNames.length) addMeta('Прочие документы', documentNames.join(', '));

      const openThis = () => {
        try { sessionStorage.removeItem('chemBackTo'); } catch { /* нет доступа */ }
        location.hash = `#chemical-${chemical.id}`;
      };
      card.onclick = openThis;
      card.onkeydown = event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openThis(); }
      };
      cards.append(card);
    });
  };

  // ---------- Страница химии ----------
  const formatDate = value => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('ru-RU');
  };

  const renderDetail = chemical => {
    detailTitle.textContent = chemical.name || 'Химия';
    detailPhotos.innerHTML = '';
    asList(chemical.photo_urls).forEach((url, index) => {
      const img = document.createElement('img');
      img.src = url;
      img.alt = `${chemical.name || 'Химия'} — фото ${index + 1}`;
      img.dataset.fullImage = '';
      detailPhotos.append(img);
    });

    const rows = [
      ['Наименование', chemical.name || '—'],
      ['Цена', chemical.price != null && chemical.price !== '' ? `${chemical.price} ₽` : '—'],
      ['Объём', chemical.volume != null && chemical.volume !== '' ? String(chemical.volume) : '—'],
      ['Поставщик', chemical.supplier || '—'],
      ['Тип химии', chemical.chem_type || '—'],
      ['Наличие документации', chemical.has_docs ? 'Есть' : 'Документы отсутствуют']
    ];
    if (chemical.has_docs) {
      rows.push(['Честный знак', chemical.has_honest_sign ? 'Есть' : 'Нет']);
    }
    rows.push(['Этап тестирования', chemical.test_stage || '—']);
    rows.push(['Результат тестирования', chemical.result || '—']);

    (chemical.stages || []).forEach(stage => {
      let value;
      if (stage.date) {
        value = `${formatDate(stage.date)} — ${stage.comment || ''}`.trim();
        if (stage.object) value += ` (объект: ${stage.object})`;
      } else {
        value = 'Тестирование не проводилось';
      }
      rows.push([stage.stage, value]);
    });

    rows.push(['Добавлена', formatDate(chemical.created_at)]);

    detailFields.innerHTML = '';
    rows.forEach(([label, value]) => {
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = value;
      detailFields.append(dt, dd);
    });

    // Ссылки на загруженные документы
    if (chemical.has_docs) {
      const docs = [
        ['Паспорт безопасности', chemical.doc_safety_url],
        ['Свидетельство о государственной регистрации', chemical.doc_registration_url]
      ];
      docs.forEach(([label, url]) => {
        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        if (url) {
          const link = document.createElement('a');
          link.href = url;
          link.target = '_blank';
          link.rel = 'noopener';
          link.className = 'chem-link';
          link.textContent = 'Открыть';
          dd.append(link);
        } else {
          dd.textContent = '—';
        }
        detailFields.append(dt, dd);
      });
    }
    const otherDt = document.createElement('dt');
    otherDt.textContent = 'Прочая документация';
    const otherDd = document.createElement('dd');
    if (asList(chemical.other_documents).length) {
      const list = document.createElement('div');
      list.className = 'chem-other-documents';
      asList(chemical.other_documents).forEach(file => {
        const link = document.createElement('a');
        link.href = file.url;
        link.target = '_blank';
        link.rel = 'noopener';
        link.className = 'chem-link';
        link.textContent = file.name || 'Документ';
        list.append(link);
      });
      otherDd.append(list);
    } else {
      otherDd.textContent = '—';
    }
    detailFields.append(otherDt, otherDd);

    // Объекты, где применяется эта химия — обратная ссылка на раздел «Объекты».
    const relatedDt = document.createElement('dt');
    relatedDt.textContent = 'Применяется на объектах';
    const relatedDd = document.createElement('dd');
    const related = allObjectsData
      .filter(obj => asList(obj.chemical_ids).map(Number).includes(Number(chemical.id)))
      .sort((a, b) => String(a.name || a.address || '').localeCompare(String(b.name || b.address || ''), 'ru'));
    if (!related.length) {
      relatedDd.textContent = '—';
    } else {
      const wrap = document.createElement('div');
      wrap.className = 'chem-detail-objects';
      related.forEach((obj, index) => {
        const link = document.createElement('a');
        link.className = 'chem-link';
        link.href = `#object-${obj.id}`;
        link.textContent = obj.name || obj.address || `#${obj.id}`;
        wrap.append(link);
        if (index < related.length - 1) wrap.append(document.createTextNode(', '));
      });
      relatedDd.append(wrap);
    }
    detailFields.append(relatedDt, relatedDd);
  };

  const showDetailPage = () => {
    document.querySelectorAll('#content > .page').forEach(page => { page.hidden = page !== detailPage; });
    window.scrollTo(0, 0);
  };

  const openDetail = async id => {
    let chemical = chemicalsById[id];
    if (!chemical) {
      try { chemical = await getChemical(id); } catch { location.hash = ''; return; }
    }
    currentDetailChemical = chemical;
    renderDetail(chemical);
    showDetailPage();
  };

  const closeDetail = () => {
    detailPage.hidden = true;
    // Список химии показываем только при возврате «домой»; если ушли на страницу
    // объекта (#object-…), её покажет objectCard.js.
    if (!location.hash) listPage.hidden = false;
  };

  const route = () => {
    const match = location.hash.match(/^#chemical-(\d+)$/);
    if (match) openDetail(match[1]);
    else if (!detailPage.hidden) closeDetail();
  };

  window.addEventListener('hashchange', route);
  document.querySelector('#chemical-detail-back').onclick = () => {
    let back = '';
    try {
      back = sessionStorage.getItem('chemBackTo') || '';
      sessionStorage.removeItem('chemBackTo');
    } catch { /* нет доступа */ }
    // Если химию открыли со страницы объекта (или его «Тестирований») — вернуться туда,
    // иначе к списку химии.
    location.hash = /^#object-\d+(-tests)?$/.test(back) ? back : '';
  };

  // ---------- Редактирование химии ----------
  const openEditModal = async chemical => {
    await loadObjectOptions();
    resetForm();
    editingId = chemical.id;
    modalTitle.textContent = 'Редактировать химию';

    formEl('name').value = chemical.name || '';
    formEl('price').value = chemical.price != null ? chemical.price : '';
    formEl('volume').value = chemical.volume != null ? chemical.volume : '';
    formEl('supplier').value = chemical.supplier || '';
    formEl('chem_type').value = chemical.chem_type || '';
    formEl('test_stage').value = chemical.test_stage || '';
    formEl('result').value = chemical.result || '';
    formEl('has_docs').checked = !!chemical.has_docs;
    formEl('has_honest_sign').checked = !!chemical.has_honest_sign;
    syncDocs();
    const docMap = { safety: chemical.doc_safety_url, registration: chemical.doc_registration_url };
    importantDocCurrents.forEach(el => {
      const key = el.dataset.doc;
      formEl(`doc_${key}_remove`).value = '';
      const url = docMap[key];
      el.innerHTML = '';
      if (url) {
        el.append(document.createTextNode('Загружен — '));
        const link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = 'открыть';
        el.append(link);
        el.append(document.createTextNode(' · '));
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'link-danger';
        del.textContent = 'удалить';
        del.onclick = () => {
          formEl(`doc_${key}_remove`).value = 'true';
          el.textContent = 'Файл будет удалён при сохранении';
        };
        el.append(del);
        el.hidden = false;
      } else {
        el.hidden = true;
      }
    });
    otherDocumentItems = asList(chemical.other_documents).map(file => ({ ...file, key: `existing:${file.url}`, token: file.url }));
    renderOtherDocuments();

    (chemical.stages || []).forEach((stageData, index) => {
      const stage = index + 1;
      if (stage > 3) return;
      const { mode, date, comment, objectSelect } = stageParts(stage);
      if (stageData && stageData.date) {
        mode.value = 'date';
        syncStage(stage);
        date.value = stageData.date;
        syncStage(stage);
        comment.value = stageData.comment || '';
        if (objectSelect) objectSelect.value = stageData.object_id == null ? '' : String(stageData.object_id);
      } else {
        mode.value = 'none';
        syncStage(stage);
      }
    });

    setExistingPhotos(asList(chemical.photo_urls));

    modal.hidden = false;
    document.body.style.overflow = 'hidden';
  };

  document.querySelector('#chemical-detail-edit').onclick = () => {
    if (currentDetailChemical) openEditModal(currentDetailChemical);
  };
  document.querySelector('#chemical-detail-info').onclick = () => {
    if (currentDetailChemical && window.openEntityNotifications) {
      window.openEntityNotifications({ entity: 'chemical', id: currentDetailChemical.id, name: currentDetailChemical.name });
    }
  };

  // ---------- Удаление химии ----------
  document.querySelector('#chemical-detail-delete').onclick = () => { deleteModal.hidden = false; };
  document.querySelector('#chemical-delete-no').onclick = () => { deleteModal.hidden = true; };
  document.querySelector('#chemical-delete-yes').onclick = async () => {
    if (!currentDetailChemical) return;
    try {
      await deleteChemical(currentDetailChemical.id);
      deleteModal.hidden = true;
      location.hash = '';
      setData(await getChemicals());
      window.toast('Химия удалена');
    } catch (error) {
      window.toast(error.message, 'error');
    }
  };

  // ---------- Фильтры ----------
  const filterValue = (chemical, key) =>
    key === 'has_docs' ? String(chemical.has_docs) : (chemical[key] || '');
  const filterLabel = (chemical, key) =>
    key === 'has_docs' ? (chemical.has_docs ? 'Есть' : 'Отсутствуют') : (chemical[key] || '');

  const activeFilters = () => {
    const active = {};
    filterSelects.forEach(sel => { if (sel.value) active[sel.dataset.filter] = sel.value; });
    return active;
  };

  const matchesFilters = (chemical, filters) =>
    Object.entries(filters).every(([key, value]) => filterValue(chemical, key) === value);

  const term = () => searchInput.value.trim().toLowerCase();
  const matchesSearch = chemical => {
    const t = term();
    return !t || String(chemical.name || '').toLowerCase().includes(t);
  };

  // Пересобирает варианты каждого фильтра (по остальным активным фильтрам) и список карточек.
  const refresh = () => {
    const filters = activeFilters();

    filterSelects.forEach(sel => {
      const key = sel.dataset.filter;
      const others = { ...filters };
      delete others[key];
      const pool = allChemicals.filter(chemical => matchesFilters(chemical, others) && matchesSearch(chemical));

      const optionMap = new Map();
      pool.forEach(chemical => {
        const value = filterValue(chemical, key);
        if (value !== '' && !optionMap.has(value)) optionMap.set(value, filterLabel(chemical, key));
      });

      const current = sel.value;
      if (current && !optionMap.has(current)) {
        const known = allChemicals.find(chemical => filterValue(chemical, key) === current);
        optionMap.set(current, known ? filterLabel(known, key) : current);
      }

      const entries = [...optionMap.entries()].sort((a, b) => a[1].localeCompare(b[1], 'ru'));
      sel.innerHTML = '';
      const all = document.createElement('option');
      all.value = '';
      all.textContent = 'Все';
      sel.append(all);
      entries.forEach(([value, label]) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        sel.append(option);
      });
      sel.value = current;
    });

    render(allChemicals.filter(chemical => matchesFilters(chemical, filters) && matchesSearch(chemical)));
    writeFiltersToUrl();
  };

  const setData = list => {
    allChemicals = list;
    countLabel.textContent = `Всего химии: ${list.length}`;
    chemicalsById = {};
    list.forEach(chemical => { chemicalsById[chemical.id] = chemical; });
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

  // ---------- Обработчики ----------
  photoInput.onchange = () => {
    const file = photoInput.files[0];
    if (file && imageTypeRe.test(file.type) && photoItems.length < 10) {
      photoSequence += 1;
      photoItems.push({ key: `new:${photoSequence}`, file, url: URL.createObjectURL(file) });
      showPhotoPreview();
    } else if (file && photoItems.length >= 10) {
      window.toast('Можно добавить не более 10 фотографий', 'error');
    } else if (file) {
      window.toast('Фотография должна быть в формате PNG, JPG или JPEG', 'error');
    }
    photoInput.value = '';
    const field = photoInput.closest('.field');
    if (field.classList.contains('invalid')) checkField(field);
  };

  stageBlocks.forEach(block => {
    const stage = block.dataset.stage;
    const { mode, date } = stageParts(stage);
    mode.addEventListener('change', () => syncStage(stage));
    date.addEventListener('input', () => syncStage(stage));
  });

  const revalidateFrom = event => {
    const field = event.target.closest('.field');
    if (field && field.classList.contains('invalid')) checkField(field);
  };
  form.addEventListener('input', revalidateFrom);
  form.addEventListener('change', revalidateFrom);
  hasDocsBox.addEventListener('change', syncDocs);
  ['safety', 'registration'].forEach(key => {
    formEl(`doc_${key}`).addEventListener('change', () => { formEl(`doc_${key}_remove`).value = ''; });
  });
  formEl('doc_other').addEventListener('change', () => {
    const file = formEl('doc_other').files[0];
    formEl('doc_other').value = '';
    if (!file) return;
    if (!documentTypeRe.test(file.type)) {
      window.toast('Документ должен быть в формате PDF, PNG, JPG или JPEG', 'error');
      return;
    }
    if (otherDocumentItems.length >= 10) {
      window.toast('Можно добавить не более 10 файлов прочей документации', 'error');
      return;
    }
    otherDocumentSequence += 1;
    otherDocumentItems.push({
      key: `new:${otherDocumentSequence}`,
      file,
      name: file.name,
      url: URL.createObjectURL(file)
    });
    renderOtherDocuments();
  });

  document.querySelector('#add-chemical-button').onclick = async () => {
    await loadObjectOptions();
    resetForm();
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
  };

  const askCancel = () => { confirmModal.hidden = false; };
  document.querySelector('#chemical-modal-close').onclick = askCancel;
  document.querySelector('#chemical-cancel').onclick = askCancel;
  document.querySelector('#chemical-confirm-cancel').onclick = () => { confirmModal.hidden = true; };
  document.querySelector('#chemical-confirm-ok').onclick = closeForm;

  form.onsubmit = async event => {
    event.preventDefault();
    if (!validate()) return;
    const data = new FormData(form);
    data.set('has_docs', formEl('has_docs').checked ? 'true' : 'false');
    data.set('has_honest_sign', formEl('has_honest_sign').checked ? 'true' : 'false');
    data.delete('photos');
    const newPhotos = photoItems.filter(item => item.file);
    newPhotos.forEach(item => data.append('photos', item.file, item.file.name));
    data.set('photo_order', JSON.stringify(photoItems.map(item => item.file ? `new:${newPhotos.indexOf(item)}` : item.token)));
    if (!formEl('doc_safety').files.length) data.delete('doc_safety');
    if (!formEl('doc_registration').files.length) data.delete('doc_registration');
    data.delete('doc_other');
    const newDocuments = otherDocumentItems.filter(item => item.file);
    newDocuments.forEach(item => data.append('doc_other', item.file, item.file.name));
    data.set('doc_other_order', JSON.stringify(otherDocumentItems.map(item => item.file ? `new:${newDocuments.indexOf(item)}` : item.token)));
    const savingId = editingId;
    try {
      if (savingId != null) await updateChemical(savingId, data);
      else await createChemical(data);
      setData(await getChemicals());
      closeForm();
      if (savingId != null && location.hash === `#chemical-${savingId}`) {
        currentDetailChemical = chemicalsById[savingId] || currentDetailChemical;
        if (currentDetailChemical) renderDetail(currentDetailChemical);
      }
      window.toast(savingId != null ? 'Химия обновлена' : 'Химия добавлена');
    } catch (error) {
      window.toast(error.message, 'error');
    }
  };

  loadObjectOptions().then(() => {
    if (currentDetailChemical && !detailPage.hidden) renderDetail(currentDetailChemical);
  });
  window.skeletonCards(document.querySelector('#chemical-cards'));
  getChemicals()
    .then(list => { setData(list); route(); })
    .catch(() => { setData([]); route(); });
  resetForm();
})();
