(() => {
  const modal = document.querySelector('#object-modal');
  const modalTitle = document.querySelector('#object-modal-title');
  const confirmModal = document.querySelector('#confirm-modal');
  const form = document.querySelector('#object-form');
  const photoInput = document.querySelector('#object-photo');
  const photoField = photoInput.closest('.field');
  const photoRequiredMark = photoField.querySelector('.req');
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

  const robotOptions = ['Рязань', 'RCV'];
  const chemistryOptions = ['Эмульсия «365»', 'JD', 'Эмульсион «Вуаль»'];
  const imageTypeRe = /^image\/(png|jpe?g)$/;

  let previewUrl = null;
  let objectsById = {};
  let editingId = null;
  let currentDetailObject = null;

  const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[char]));

  const options = values =>
    `<option value="">Выберите значение</option>${values.map(value => `<option>${escapeHtml(value)}</option>`).join('')}`;

  // Ссылка-иконка на Яндекс.Карты с адресом объекта.
  const buildMapLink = address => {
    const link = document.createElement('a');
    link.className = 'map-link';
    link.href = 'https://yandex.ru/maps/?text=' + encodeURIComponent(address || '');
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
    row.innerHTML = `<select name="${name}" required>${options(values)}</select><button type="button" class="remove-field" aria-label="Удалить">−</button>`;
    if (selectedValue) row.querySelector('select').value = selectedValue;
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
    photoInput.required = true;
    photoRequiredMark.hidden = false;
    photoEditHint.hidden = true;
  };

  const closeForm = () => {
    modal.hidden = true;
    confirmModal.hidden = true;
    document.body.style.overflow = '';
    editingId = null;
  };

  // Помечает .field как invalid, если хотя бы один обязательный контрол внутри не заполнен.
  const checkField = field => {
    const controls = [...field.querySelectorAll('[required]')];
    if (!controls.length) return true;
    let bad = controls.some(control => !String(control.value).trim());
    if (field.contains(photoInput)) {
      const file = photoInput.files[0];
      if (editingId != null && !file) bad = false;          // при редактировании фото можно не менять
      else bad = !file || !imageTypeRe.test(file.type);
    }
    field.classList.toggle('invalid', bad);
    return !bad;
  };

  const validate = () => {
    let valid = true;
    form.querySelectorAll('.field').forEach(field => {
      if (!checkField(field)) valid = false;
    });
    return valid;
  };

  // ---------- Список карточек ----------
  const render = list => {
    objectsById = {};
    const cards = document.querySelector('#object-cards');
    cards.innerHTML = '';
    document.querySelector('#objects-empty').hidden = !!list.length;
    list.forEach(object => {
      objectsById[object.id] = object;
      const card = document.createElement('article');
      card.className = 'object-card';
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.innerHTML = `<img alt=""><div class="object-card__address"><span class="object-card__address-text"></span></div>`;
      const img = card.querySelector('img');
      img.src = object.photo_url;
      img.alt = object.address;
      card.querySelector('.object-card__address-text').textContent = object.address;
      card.querySelector('.object-card__address').append(buildMapLink(object.address));
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

  const renderDetail = object => {
    detailTitle.textContent = object.address || 'Объект';
    detailPhoto.src = object.photo_url || '';
    detailPhoto.alt = object.address || 'Фотография объекта';

    const rows = [
      ['Адрес объекта', object.address || '—'],
      ['Количество боксов/роботов', object.boxes || '—'],
      ['Установленные роботы', asList(object.robots).join(', ') || '—'],
      ['Установленная химия', asList(object.chemistry).join(', ') || '—'],
      ['Управляющий', object.manager || '—'],
      ['Водоотведение', object.drainage || '—'],
      ['Добавлен', formatDate(object.created_at)]
    ];

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
    listPage.hidden = true;
    placeholderPage.hidden = true;
    detailPage.hidden = false;
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
    listPage.hidden = false;
  };

  const route = () => {
    const match = location.hash.match(/^#object-(\d+)$/);
    if (match) openDetail(match[1]);
    else closeDetail();
  };

  window.addEventListener('hashchange', route);
  document.querySelector('#detail-back').onclick = () => { location.hash = ''; };

  // ---------- Редактирование объекта ----------
  const openEditModal = object => {
    resetForm();
    editingId = object.id;
    modalTitle.textContent = 'Редактировать объект';
    photoInput.required = false;
    photoRequiredMark.hidden = true;
    photoEditHint.hidden = false;

    form.address.value = object.address || '';
    form.boxes.value = String(object.boxes || '');
    form.manager.value = object.manager || '';
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

  document.querySelector('#add-object-button').onclick = () => {
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
      const list = await getObjects();
      render(list);
      closeForm();
      if (savingId != null && location.hash === `#object-${savingId}`) {
        currentDetailObject = objectsById[savingId] || currentDetailObject;
        if (currentDetailObject) renderDetail(currentDetailObject);
      }
    } catch (error) {
      alert(error.message);
    }
  };

  getObjects()
    .then(list => { render(list); route(); })
    .catch(() => { render([]); route(); });
  resetForm();
})();
