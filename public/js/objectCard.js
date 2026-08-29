(() => {
  const modal = document.querySelector('#object-modal');
  const confirmModal = document.querySelector('#confirm-modal');
  const form = document.querySelector('#object-form');
  const photoInput = document.querySelector('#object-photo');
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

  const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[char]));

  const options = values =>
    `<option value="">Выберите значение</option>${values.map(value => `<option>${escapeHtml(value)}</option>`).join('')}`;

  const addRow = (container, name, values) => {
    const row = document.createElement('div');
    row.className = 'repeatable-row';
    row.innerHTML = `<select name="${name}" required>${options(values)}</select><button type="button" class="remove-field" aria-label="Удалить">−</button>`;
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
  };

  const closeForm = () => {
    modal.hidden = true;
    confirmModal.hidden = true;
    document.body.style.overflow = '';
  };

  // Помечает .field как invalid, если хотя бы один обязательный контрол внутри не заполнен.
  const checkField = field => {
    const controls = [...field.querySelectorAll('[required]')];
    if (!controls.length) return true;
    let bad = controls.some(control => !String(control.value).trim());
    if (field.contains(photoInput)) {
      const file = photoInput.files[0];
      bad = !file || !imageTypeRe.test(file.type);
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
      card.innerHTML = `<img alt=""><div class="object-card__address"></div>`;
      const img = card.querySelector('img');
      img.src = object.photo_url;
      img.alt = object.address;
      card.querySelector('.object-card__address').textContent = object.address;
      card.onclick = () => { location.hash = `#object-${object.id}`; };
      card.onkeydown = event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); location.hash = `#object-${object.id}`; }
      };
      cards.append(card);
    });
  };

  // ---------- Страница объекта ----------
  const asList = value => (Array.isArray(value) ? value : []);

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
    try {
      await createObject(data);
      render(await getObjects());
      closeForm();
    } catch (error) {
      alert(error.message);
    }
  };

  getObjects()
    .then(list => { render(list); route(); })
    .catch(() => { render([]); route(); });
  resetForm();
})();
