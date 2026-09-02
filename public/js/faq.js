(() => {
  const listPage = document.querySelector('#page-faq');
  const itemPage = document.querySelector('#page-faqItem');
  const listBox = document.querySelector('#faq-list');
  const itemTitle = document.querySelector('#faq-item-title');
  const itemBody = document.querySelector('#faq-item-body');
  const savedFlag = document.querySelector('#faq-item-saved');
  const deleteBtn = document.querySelector('#faq-item-delete');
  const deleteModal = document.querySelector('#faq-delete-modal');

  // Поля, извлечённые из регламента «Стандарты автохимии сети «Портал»».
  const DOC_FIELDS = [
    { key: 'title', label: 'Название стандарта' },
    { key: 'supplier', label: 'Генеральный поставщик' },
    { key: 'complexType', label: 'Тип комплексов' },
    { key: 'author', label: 'Автор (технолог по химии)' },
    { key: 'status', label: 'Статус документа' },
    { key: 'revision', label: 'Год / редакция' },
    { key: 'summary', label: 'Краткое описание', multiline: true },
    { key: 'qualityControl', label: 'Контроль качества и заказы', multiline: true }
  ];
  const POSITION_FIELDS = [
    { key: 'category', label: 'Категория' },
    { key: 'name', label: 'Наименование' },
    { key: 'packaging', label: 'Фасовка / тип' },
    { key: 'article', label: 'Артикул' },
    { key: 'characteristics', label: 'Характеристики / тип пены', multiline: true },
    { key: 'consumption', label: 'Нормативный расход' },
    { key: 'application', label: 'Применение', multiline: true },
    { key: 'purpose', label: 'Ключевое назначение' },
    { key: 'supplier', label: 'Поставщик' },
    { key: 'note', label: 'Примечание', multiline: true }
  ];

  let items = [];
  let itemsById = {};
  let currentItem = null;

  const field = (label, attr, value, multiline) => {
    const wrap = document.createElement('label');
    wrap.className = 'faq-field';
    const span = document.createElement('span');
    span.textContent = label;
    const control = document.createElement(multiline ? 'textarea' : 'input');
    if (multiline) control.rows = 2;
    else control.type = 'text';
    control.value = value || '';
    control.setAttribute(attr.name, attr.value);
    wrap.append(span, control);
    return wrap;
  };

  const buildPosition = (data, index) => {
    const box = document.createElement('div');
    box.className = 'faq-position';

    const head = document.createElement('div');
    head.className = 'faq-position__head';
    const name = document.createElement('span');
    name.className = 'faq-position__name';
    name.textContent = `Позиция ${index + 1}`;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove-field';
    remove.textContent = '− Удалить';
    remove.onclick = () => { box.remove(); renumberPositions(); };
    head.append(name, remove);
    box.append(head);

    const grid = document.createElement('div');
    grid.className = 'faq-grid';
    POSITION_FIELDS.forEach(f => {
      grid.append(field(f.label, { name: 'data-pos', value: f.key }, (data || {})[f.key], f.multiline));
    });
    box.append(grid);
    return box;
  };

  const renumberPositions = () => {
    itemBody.querySelectorAll('.faq-position').forEach((box, i) => {
      box.querySelector('.faq-position__name').textContent = `Позиция ${i + 1}`;
    });
  };

  const renderEditor = item => {
    itemTitle.textContent = item.title || 'Вопрос';
    savedFlag.hidden = true;
    deleteBtn.hidden = item.kind === 'standards';
    itemBody.innerHTML = '';

    const titleField = field('Заголовок вопроса', { name: 'data-title', value: '1' }, item.title, false);
    itemBody.append(titleField);

    if (item.kind === 'standards') {
      const docGroup = document.createElement('div');
      docGroup.className = 'faq-group';
      const docTitle = document.createElement('h3');
      docTitle.className = 'faq-group__title';
      docTitle.textContent = 'Общие сведения';
      docGroup.append(docTitle);
      const docGrid = document.createElement('div');
      docGrid.className = 'faq-grid';
      const doc = (item.data && item.data.doc) || {};
      DOC_FIELDS.forEach(f => {
        docGrid.append(field(f.label, { name: 'data-doc', value: f.key }, doc[f.key], f.multiline));
      });
      docGroup.append(docGrid);
      itemBody.append(docGroup);

      const posGroup = document.createElement('div');
      posGroup.className = 'faq-group';
      const posHead = document.createElement('div');
      posHead.className = 'faq-group__head';
      const posTitle = document.createElement('h3');
      posTitle.className = 'faq-group__title';
      posTitle.textContent = 'Позиции химии';
      const addPos = document.createElement('button');
      addPos.type = 'button';
      addPos.className = 'add-field';
      addPos.textContent = '+ Добавить позицию';
      addPos.onclick = () => {
        const box = buildPosition({}, posList.children.length);
        posList.append(box);
        box.scrollIntoView({ block: 'nearest' });
      };
      posHead.append(posTitle, addPos);
      posGroup.append(posHead);

      const posList = document.createElement('div');
      posList.className = 'faq-positions';
      posList.id = 'faq-positions';
      ((item.data && item.data.positions) || []).forEach((pos, i) => posList.append(buildPosition(pos, i)));
      posGroup.append(posList);

      const emptyHint = document.createElement('p');
      emptyHint.className = 'faq-hint';
      emptyHint.textContent = 'Позиции пока не добавлены — заполните по мере утверждения химии.';
      posGroup.append(emptyHint);

      itemBody.append(posGroup);
    } else {
      const answerGroup = document.createElement('div');
      answerGroup.className = 'faq-group';
      answerGroup.append(field('Ответ', { name: 'data-answer', value: '1' }, (item.data && item.data.answer) || '', true));
      answerGroup.querySelector('textarea').rows = 8;
      itemBody.append(answerGroup);
    }
  };

  const collect = () => {
    const title = itemBody.querySelector('[data-title]').value.trim();
    if (currentItem.kind === 'standards') {
      const doc = {};
      DOC_FIELDS.forEach(f => {
        doc[f.key] = itemBody.querySelector(`[data-doc="${f.key}"]`).value;
      });
      const positions = [...itemBody.querySelectorAll('.faq-position')].map(box => {
        const pos = {};
        POSITION_FIELDS.forEach(f => {
          pos[f.key] = box.querySelector(`[data-pos="${f.key}"]`).value;
        });
        return pos;
      });
      return { title, data: { doc, positions } };
    }
    return { title, data: { answer: itemBody.querySelector('[data-answer]').value } };
  };

  // ---------- Список ----------
  const renderList = list => {
    items = list;
    itemsById = {};
    listBox.innerHTML = '';
    list.forEach(item => {
      itemsById[item.id] = item;
      const card = document.createElement('article');
      card.className = 'faq-card';
      card.tabIndex = 0;
      card.setAttribute('role', 'button');

      const title = document.createElement('div');
      title.className = 'faq-card__title';
      title.textContent = item.title;
      card.append(title);

      const preview = document.createElement('div');
      preview.className = 'faq-card__preview';
      if (item.kind === 'standards') {
        const count = ((item.data && item.data.positions) || []).length;
        preview.textContent = count
          ? `Стандарт химии сети · позиций: ${count}`
          : 'Шаблон полей стандарта химии — заполняется вручную';
      } else {
        preview.textContent = ((item.data && item.data.answer) || '').slice(0, 140) || 'Ответ не заполнен';
      }
      card.append(preview);

      const open = () => { location.hash = `#faq-${item.id}`; };
      card.onclick = open;
      card.onkeydown = event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
      };
      listBox.append(card);
    });
  };

  const showItemPage = () => {
    document.querySelectorAll('#content > .page').forEach(page => { page.hidden = page !== itemPage; });
    window.scrollTo(0, 0);
  };

  const openItem = async id => {
    let item = itemsById[id];
    if (!item) {
      try { item = await getFaqItem(id); } catch { location.hash = ''; return; }
    }
    currentItem = item;
    renderEditor(item);
    showItemPage();
  };

  const closeItem = () => {
    itemPage.hidden = true;
    if (!location.hash) listPage.hidden = false;
  };

  const route = () => {
    const match = location.hash.match(/^#faq-(\d+)$/);
    if (match) { openItem(match[1]); return; }
    if (!itemPage.hidden) closeItem();
  };

  window.addEventListener('hashchange', route);

  // ---------- Кнопки ----------
  document.querySelector('#faq-item-back').onclick = () => { location.hash = ''; };

  document.querySelector('#faq-item-save').onclick = async () => {
    if (!currentItem) return;
    try {
      const updated = await updateFaq(currentItem.id, collect());
      currentItem = updated;
      itemsById[updated.id] = updated;
      const idx = items.findIndex(i => i.id === updated.id);
      if (idx !== -1) items[idx] = updated;
      itemTitle.textContent = updated.title;
      savedFlag.hidden = false;
      clearTimeout(savedFlag._t);
      savedFlag._t = setTimeout(() => { savedFlag.hidden = true; }, 2000);
    } catch (error) {
      alert(error.message);
    }
  };

  document.querySelector('#add-faq-button').onclick = async () => {
    try {
      const created = await createFaq({ title: 'Новый вопрос', answer: '' });
      renderList(await getFaq());
      location.hash = `#faq-${created.id}`;
    } catch (error) {
      alert(error.message);
    }
  };

  deleteBtn.onclick = () => { deleteModal.hidden = false; };
  document.querySelector('#faq-delete-no').onclick = () => { deleteModal.hidden = true; };
  document.querySelector('#faq-delete-yes').onclick = async () => {
    if (!currentItem) return;
    try {
      await deleteFaq(currentItem.id);
      deleteModal.hidden = true;
      location.hash = '';
      renderList(await getFaq());
    } catch (error) {
      deleteModal.hidden = true;
      alert(error.message);
    }
  };

  getFaq()
    .then(list => { renderList(list); route(); })
    .catch(() => { renderList([]); route(); });
})();
