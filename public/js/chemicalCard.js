(() => {
  const modal = document.querySelector('#chemical-modal');
  const modalTitle = document.querySelector('#chemical-modal-title');
  const confirmModal = document.querySelector('#chemical-confirm-modal');
  const deleteModal = document.querySelector('#chemical-delete-modal');
  const form = document.querySelector('#chemical-form');
  const photoInput = document.querySelector('#chemical-photo');
  const photoReqMark = photoInput.closest('.field').querySelector('.req');
  const photoEditHint = document.querySelector('#chemical-photo-edit-hint');
  const preview = document.querySelector('#chemical-photo-preview');
  const formEl = name => form.elements[name];
  const cards = document.querySelector('#chemical-cards');
  const emptyState = document.querySelector('#chemicals-empty');
  const filtersBar = document.querySelector('#chemical-filters');
  const filterSelects = [...filtersBar.querySelectorAll('select[data-filter]')];
  const filtersReset = document.querySelector('#chemical-filters-reset');

  const listPage = document.querySelector('#page-chemicals');
  const detailPage = document.querySelector('#page-chemicalDetail');
  const detailTitle = document.querySelector('#chemical-detail-title');
  const detailPhoto = document.querySelector('#chemical-detail-photo');
  const detailFields = document.querySelector('#chemical-detail-fields');

  const imageTypeRe = /^image\/(png|jpe?g)$/;
  let previewUrl = null;
  let chemicalsById = {};
  let allChemicals = [];
  let editingId = null;
  let currentDetailChemical = null;

  const stageBlocks = [...form.querySelectorAll('.test-stage')];

  const stageParts = stage => ({
    block: form.querySelector(`.test-stage[data-stage="${stage}"]`),
    mode: form.querySelector(`[name="stage${stage}_mode"]`),
    date: form.querySelector(`[name="stage${stage}_date"]`),
    commentField: form.querySelector(`.stage-comment[data-stage="${stage}"]`),
    comment: form.querySelector(`[name="stage${stage}_comment"]`)
  });

  const clearPreview = () => {
    if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
    preview.hidden = true;
    preview.removeAttribute('src');
  };

  // Показывает поле даты и комментария в зависимости от режима этапа.
  const syncStage = stage => {
    const { mode, date, commentField, comment } = stageParts(stage);
    const useDate = mode.value === 'date';
    date.hidden = !useDate;
    if (!useDate) { date.value = ''; }
    const showComment = useDate && !!date.value;
    commentField.hidden = !showComment;
    if (!showComment) { comment.value = ''; commentField.classList.remove('invalid'); }
    if (!useDate) date.closest('.test-stage').classList.remove('invalid');
  };

  const resetForm = () => {
    form.reset();
    clearPreview();
    form.querySelectorAll('.field').forEach(field => field.classList.remove('invalid'));
    [1, 2, 3].forEach(stage => {
      stageParts(stage).mode.value = 'none';
      syncStage(stage);
    });
    editingId = null;
    modalTitle.textContent = 'Добавить химию';
    photoInput.required = true;
    photoReqMark.hidden = false;
    photoEditHint.hidden = true;
  };

  const closeForm = () => {
    modal.hidden = true;
    confirmModal.hidden = true;
    document.body.style.overflow = '';
    editingId = null;
  };

  const checkField = field => {
    const isPhoto = field.contains(photoInput);
    const controls = [...field.querySelectorAll('input[required], select[required], textarea[required]')];
    if (!controls.length && !isPhoto) return true;
    let bad = controls.some(control => !String(control.value).trim());
    if (isPhoto) {
      const file = photoInput.files[0];
      if (editingId != null && !file) bad = false;   // при редактировании фото можно не менять
      else bad = !file || !imageTypeRe.test(file.type);
    }
    field.classList.toggle('invalid', bad);
    return !bad;
  };

  const validateStage = stage => {
    const { block, mode, date, commentField, comment } = stageParts(stage);
    if (mode.value !== 'date') { block.classList.remove('invalid'); return true; }
    const dateOk = !!date.value;
    block.classList.toggle('invalid', !dateOk);
    if (!dateOk) return false;
    const commentOk = !!comment.value.trim();
    commentField.classList.toggle('invalid', !commentOk);
    return commentOk;
  };

  const validate = () => {
    let valid = true;
    form.querySelectorAll('.field').forEach(field => {
      if (field.classList.contains('test-stage') || field.classList.contains('stage-comment')) return;
      if (!checkField(field)) valid = false;
    });
    [1, 2, 3].forEach(stage => { if (!validateStage(stage)) valid = false; });
    return valid;
  };

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
      card.innerHTML = `<img alt=""><div class="chem-card__name"></div>`;
      const img = card.querySelector('img');
      img.src = chemical.photo_url;
      img.alt = chemical.name;
      card.querySelector('.chem-card__name').textContent = chemical.name;
      card.onclick = () => { location.hash = `#chemical-${chemical.id}`; };
      card.onkeydown = event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); location.hash = `#chemical-${chemical.id}`; }
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
    detailPhoto.src = chemical.photo_url || '';
    detailPhoto.alt = chemical.name || 'Фото химии';

    const rows = [
      ['Наименование', chemical.name || '—'],
      ['Цена', chemical.price != null ? `${chemical.price} ₽` : '—'],
      ['Объём', chemical.volume != null ? String(chemical.volume) : '—'],
      ['Поставщик', chemical.supplier || '—'],
      ['Тип химии', chemical.chem_type || '—'],
      ['Наличие документации', chemical.has_docs ? 'Есть' : 'Документы отсутствуют'],
      ['Этап тестирования', chemical.test_stage || '—'],
      ['Результат тестирования', chemical.result || '—']
    ];

    (chemical.stages || []).forEach(stage => {
      const value = stage.date
        ? `${formatDate(stage.date)} — ${stage.comment || ''}`.trim()
        : 'Тестирование не проводилось';
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
    listPage.hidden = false;
  };

  const route = () => {
    const match = location.hash.match(/^#chemical-(\d+)$/);
    if (match) openDetail(match[1]);
    else if (!detailPage.hidden) closeDetail();
  };

  window.addEventListener('hashchange', route);
  document.querySelector('#chemical-detail-back').onclick = () => { location.hash = ''; };

  // ---------- Редактирование химии ----------
  const openEditModal = chemical => {
    resetForm();
    editingId = chemical.id;
    modalTitle.textContent = 'Редактировать химию';
    photoInput.required = false;
    photoReqMark.hidden = true;
    photoEditHint.hidden = false;

    formEl('name').value = chemical.name || '';
    formEl('price').value = chemical.price != null ? chemical.price : '';
    formEl('volume').value = chemical.volume != null ? chemical.volume : '';
    formEl('supplier').value = chemical.supplier || '';
    formEl('chem_type').value = chemical.chem_type || '';
    formEl('test_stage').value = chemical.test_stage || '';
    formEl('result').value = chemical.result || '';
    formEl('has_docs').checked = !!chemical.has_docs;

    (chemical.stages || []).forEach((stageData, index) => {
      const stage = index + 1;
      if (stage > 3) return;
      const { mode, date, comment } = stageParts(stage);
      if (stageData && stageData.date) {
        mode.value = 'date';
        syncStage(stage);
        date.value = stageData.date;
        syncStage(stage);
        comment.value = stageData.comment || '';
      } else {
        mode.value = 'none';
        syncStage(stage);
      }
    });

    if (chemical.photo_url) { preview.src = chemical.photo_url; preview.hidden = false; }

    modal.hidden = false;
    document.body.style.overflow = 'hidden';
  };

  document.querySelector('#chemical-detail-edit').onclick = () => {
    if (currentDetailChemical) openEditModal(currentDetailChemical);
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
    } catch (error) {
      alert(error.message);
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

  // Пересобирает варианты каждого фильтра (по остальным активным фильтрам) и список карточек.
  const refresh = () => {
    const filters = activeFilters();

    filterSelects.forEach(sel => {
      const key = sel.dataset.filter;
      const others = { ...filters };
      delete others[key];
      const pool = allChemicals.filter(chemical => matchesFilters(chemical, others));

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

    render(allChemicals.filter(chemical => matchesFilters(chemical, filters)));
  };

  const setData = list => {
    allChemicals = list;
    chemicalsById = {};
    list.forEach(chemical => { chemicalsById[chemical.id] = chemical; });
    filtersBar.hidden = !list.length;
    refresh();
  };

  filterSelects.forEach(sel => sel.addEventListener('change', refresh));
  filtersReset.addEventListener('click', () => {
    filterSelects.forEach(sel => { sel.value = ''; });
    refresh();
  });

  // ---------- Обработчики ----------
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

  stageBlocks.forEach(block => {
    const stage = block.dataset.stage;
    const { mode, date } = stageParts(stage);
    mode.addEventListener('change', () => syncStage(stage));
    date.addEventListener('input', () => syncStage(stage));
  });

  const revalidateFrom = event => {
    const field = event.target.closest('.field');
    if (field && field.classList.contains('invalid')) {
      if (field.classList.contains('test-stage') || field.classList.contains('stage-comment')) {
        validateStage(field.dataset.stage);
      } else {
        checkField(field);
      }
    }
  };
  form.addEventListener('input', revalidateFrom);
  form.addEventListener('change', revalidateFrom);

  document.querySelector('#add-chemical-button').onclick = () => {
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
    if (!photoInput.files.length) data.delete('photo');
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
    } catch (error) {
      alert(error.message);
    }
  };

  getChemicals()
    .then(list => { setData(list); route(); })
    .catch(() => { setData([]); route(); });
  resetForm();
})();
