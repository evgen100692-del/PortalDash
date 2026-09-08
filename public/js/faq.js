(() => {
  const listPage = document.querySelector('#page-faq');
  const viewPage = document.querySelector('#page-faqView');
  const editPage = document.querySelector('#page-faqItem');
  const listBox = document.querySelector('#faq-list');

  const viewTitle = document.querySelector('#faq-view-title');
  const viewBody = document.querySelector('#faq-view-body');
  const viewEditBtn = document.querySelector('#faq-view-edit');

  const editTitle = document.querySelector('#faq-item-title');
  const editBody = document.querySelector('#faq-item-body');
  const savedFlag = document.querySelector('#faq-item-saved');
  const deleteBtn = document.querySelector('#faq-item-delete');
  const deleteModal = document.querySelector('#faq-delete-modal');

  let items = [];
  let itemsById = {};
  let currentItem = null;   // редактируемый; id === null для нового

  // ---------- Полноэкранный просмотр файла ----------
  const viewer = document.querySelector('#faq-file-viewer');
  const viewerName = viewer.querySelector('.file-viewer__name');
  const viewerDownload = viewer.querySelector('.file-viewer__download');
  const viewerBody = viewer.querySelector('.file-viewer__body');

  const isPdf = (url, name) => /\.pdf(?:$|[?#])/i.test(url) || /\.pdf$/i.test(name || '');
  const isImage = (url, name) =>
    /\.(png|jpe?g|gif|webp|bmp|svg)(?:$|[?#])/i.test(url) || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name || '');

  const openViewer = (url, name) => {
    viewerName.textContent = name || '';
    viewerDownload.href = url;
    viewerDownload.setAttribute('download', name || '');
    viewerBody.innerHTML = '';
    if (isPdf(url, name)) {
      const frame = document.createElement('iframe');
      frame.src = url + '#toolbar=0&navpanes=0&statusbar=0&scrollbar=1&view=FitH';
      frame.className = 'file-viewer__frame';
      frame.setAttribute('title', name || 'Документ');
      viewerBody.append(frame);
    } else if (isImage(url, name)) {
      const img = document.createElement('img');
      img.src = url;
      img.alt = name || '';
      img.className = 'file-viewer__img';
      viewerBody.append(img);
    } else {
      const msg = document.createElement('div');
      msg.className = 'file-viewer__msg';
      msg.textContent = 'Предпросмотр для этого формата недоступен — файл можно скачать.';
      viewerBody.append(msg);
    }
    viewer.hidden = false;
    document.body.style.overflow = 'hidden';
  };
  const closeViewer = () => {
    viewer.hidden = true;
    viewerBody.innerHTML = '';
    document.body.style.overflow = '';
  };
  viewer.querySelector('.file-viewer__close').onclick = closeViewer;
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !viewer.hidden) closeViewer();
  });

  // ---------- Редактор: строка файла ----------
  const buildFileRow = data => {
    const row = document.createElement('div');
    row.className = 'faq-file';

    const urlInput = document.createElement('input');
    urlInput.type = 'hidden';
    urlInput.className = 'faq-file__url';
    urlInput.value = (data && data.url) || '';

    const nameInput = document.createElement('input');
    nameInput.type = 'hidden';
    nameInput.className = 'faq-file__name-input';
    nameInput.value = (data && data.name) || '';

    const head = document.createElement('div');
    head.className = 'faq-file__head';

    const commentWrap = document.createElement('label');
    commentWrap.className = 'faq-field';
    const commentSpan = document.createElement('span');
    commentSpan.textContent = 'Краткое содержание';
    const commentInput = document.createElement('textarea');
    commentInput.className = 'faq-file__comment';
    commentInput.rows = 2;
    commentInput.value = (data && data.comment) || '';
    commentWrap.append(commentSpan, commentInput);

    const removeBtn = () => {
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'remove-field';
      rm.textContent = '− Удалить';
      rm.onclick = () => row.remove();
      return rm;
    };

    const renderHead = () => {
      head.innerHTML = '';
      if (urlInput.value) {
        const name = document.createElement('span');
        name.className = 'faq-file__name';
        name.textContent = nameInput.value || 'файл';
        head.append(name);

        const openBtn = document.createElement('button');
        openBtn.type = 'button';
        openBtn.className = 'faq-file__open';
        openBtn.textContent = 'Открыть';
        openBtn.onclick = () => openViewer(urlInput.value, nameInput.value);
        head.append(openBtn);

        const dl = document.createElement('a');
        dl.className = 'faq-file__dl';
        dl.href = urlInput.value;
        dl.setAttribute('download', nameInput.value || '');
        dl.textContent = 'Скачать';
        head.append(dl);

        head.append(removeBtn());
      } else {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.className = 'faq-file__input';
        fileInput.onchange = async () => {
          const file = fileInput.files[0];
          if (!file) return;
          try {
            const res = await uploadFaqFile(file);
            urlInput.value = res.url;
            nameInput.value = res.name || file.name;
            renderHead();
          } catch (error) {
            alert(error.message);
            fileInput.value = '';
          }
        };
        head.append(fileInput, removeBtn());
      }
    };
    renderHead();

    row.append(urlInput, nameInput, head, commentWrap);
    return row;
  };

  // ---------- Редактор ----------
  const renderEditor = item => {
    editTitle.textContent = item.id == null ? 'Новый вопрос' : 'Редактирование вопроса';
    savedFlag.hidden = true;
    deleteBtn.hidden = item.id == null;
    editBody.innerHTML = '';

    const titleField = document.createElement('label');
    titleField.className = 'faq-field';
    titleField.innerHTML = '<span>Заголовок вопроса</span>';
    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.id = 'faq-edit-title';
    titleInput.value = item.title || '';
    titleField.append(titleInput);
    editBody.append(titleField);

    // Блок ответа — поле добавляется/убирается кнопкой.
    const answerGroup = document.createElement('div');
    answerGroup.className = 'faq-group';
    editBody.append(answerGroup);

    const renderAnswer = (value, present) => {
      answerGroup.innerHTML = '';
      const head = document.createElement('div');
      head.className = 'faq-group__head';
      const title = document.createElement('h3');
      title.className = 'faq-group__title';
      title.textContent = 'Ответ';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = present ? 'remove-field' : 'add-field';
      btn.textContent = present ? '− Удалить ответ' : '+ Добавить ответ';
      head.append(title, btn);
      answerGroup.append(head);

      if (present) {
        const field = document.createElement('label');
        field.className = 'faq-field';
        const textarea = document.createElement('textarea');
        textarea.id = 'faq-edit-answer';
        textarea.rows = 8;
        textarea.value = value || '';
        field.append(textarea);
        answerGroup.append(field);
        btn.onclick = () => renderAnswer(document.querySelector('#faq-edit-answer').value, false);
      } else {
        btn.onclick = () => renderAnswer(value || '', true);
      }
    };
    const existingAnswer = (item.data && item.data.answer) || '';
    renderAnswer(existingAnswer, !!existingAnswer.trim());

    const filesGroup = document.createElement('div');
    filesGroup.className = 'faq-group';
    const filesHead = document.createElement('div');
    filesHead.className = 'faq-group__head';
    const filesTitle = document.createElement('h3');
    filesTitle.className = 'faq-group__title';
    filesTitle.textContent = 'Файлы';
    const addFile = document.createElement('button');
    addFile.type = 'button';
    addFile.className = 'add-field';
    addFile.textContent = '+ Добавить файл';
    addFile.onclick = () => {
      const row = buildFileRow({});
      filesList.append(row);
      row.scrollIntoView({ block: 'nearest' });
    };
    filesHead.append(filesTitle, addFile);
    filesGroup.append(filesHead);

    const filesList = document.createElement('div');
    filesList.className = 'faq-files';
    ((item.data && item.data.files) || []).forEach(file => filesList.append(buildFileRow(file)));
    filesGroup.append(filesList);
    editBody.append(filesGroup);
  };

  const collect = () => {
    const files = [...editBody.querySelectorAll('.faq-file')].map(row => ({
      url: row.querySelector('.faq-file__url').value,
      name: row.querySelector('.faq-file__name-input').value,
      comment: row.querySelector('.faq-file__comment').value
    })).filter(file => file.url);
    const answerEl = document.querySelector('#faq-edit-answer');
    return {
      title: document.querySelector('#faq-edit-title').value.trim(),
      data: { answer: answerEl ? answerEl.value : '', files }
    };
  };

  // ---------- Просмотр ----------
  const renderView = item => {
    viewTitle.textContent = item.title || 'Вопрос';
    viewBody.innerHTML = '';

    const answerText = (item.data && item.data.answer) || '';
    if (answerText.trim()) {
      const answer = document.createElement('div');
      answer.className = 'faq-view__answer';
      answer.textContent = answerText;
      viewBody.append(answer);
    }

    const files = (item.data && item.data.files) || [];
    if (files.length) {
      const heading = document.createElement('div');
      heading.className = 'faq-view__files-title';
      heading.textContent = 'Файлы';
      viewBody.append(heading);

      files.forEach(file => {
        const card = document.createElement('div');
        card.className = 'faq-view__file';

        const name = document.createElement('div');
        name.className = 'faq-view__file-name';
        name.textContent = file.name || 'файл';
        card.append(name);

        if (file.comment) {
          const comment = document.createElement('div');
          comment.className = 'faq-view__file-comment';
          comment.textContent = file.comment;
          card.append(comment);
        }

        const actions = document.createElement('div');
        actions.className = 'faq-view__file-actions';
        const openBtn = document.createElement('button');
        openBtn.type = 'button';
        openBtn.className = 'faq-file__open';
        openBtn.textContent = 'Открыть';
        openBtn.onclick = () => openViewer(file.url, file.name);
        const dl = document.createElement('a');
        dl.className = 'faq-file__dl';
        dl.href = file.url;
        dl.setAttribute('download', file.name || '');
        dl.textContent = 'Скачать';
        actions.append(openBtn, dl);
        card.append(actions);

        viewBody.append(card);
      });
    }
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
      const answer = ((item.data && item.data.answer) || '').trim().slice(0, 140);
      const fileCount = ((item.data && item.data.files) || []).length;
      preview.textContent = [answer, fileCount ? `файлов: ${fileCount}` : '']
        .filter(Boolean).join(' · ');
      card.append(preview);

      const open = () => { location.hash = `#faq-${item.id}`; };
      card.onclick = open;
      card.onkeydown = event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
      };
      listBox.append(card);
    });
  };

  const showPage = target => {
    document.querySelectorAll('#content > .page').forEach(page => { page.hidden = page !== target; });
    window.scrollTo(0, 0);
  };

  const loadItem = async id => {
    if (itemsById[id]) return itemsById[id];
    try { return await getFaqItem(id); } catch { return null; }
  };

  const openView = async id => {
    const item = await loadItem(id);
    if (!item) { location.hash = ''; return; }
    currentItem = item;
    renderView(item);
    showPage(viewPage);
  };

  const openEdit = async id => {
    if (id === 'new') {
      currentItem = { id: null, title: '', data: { answer: '', files: [] } };
    } else {
      const item = await loadItem(id);
      if (!item) { location.hash = ''; return; }
      currentItem = item;
    }
    renderEditor(currentItem);
    showPage(editPage);
  };

  const route = () => {
    const hash = location.hash;
    if (hash === '#faq-new') { openEdit('new'); return; }
    const edit = hash.match(/^#faq-(\d+)-edit$/);
    if (edit) { openEdit(edit[1]); return; }
    const view = hash.match(/^#faq-(\d+)$/);
    if (view) { openView(view[1]); return; }
    if (!viewPage.hidden || !editPage.hidden) {
      viewPage.hidden = true;
      editPage.hidden = true;
      if (!location.hash) listPage.hidden = false;
    }
  };
  window.addEventListener('hashchange', route);

  // ---------- Кнопки ----------
  document.querySelector('#add-faq-button').onclick = () => { location.hash = '#faq-new'; };

  viewEditBtn.onclick = () => {
    if (currentItem && currentItem.id != null) location.hash = `#faq-${currentItem.id}-edit`;
  };
  document.querySelector('#faq-view-back').onclick = () => { location.hash = ''; };

  document.querySelector('#faq-item-back').onclick = () => {
    location.hash = currentItem && currentItem.id != null ? `#faq-${currentItem.id}` : '';
  };

  document.querySelector('#faq-item-save').onclick = async () => {
    if (!currentItem) return;
    const payload = collect();
    try {
      if (currentItem.id == null) {
        const created = await createFaq(payload);
        renderList(await getFaq());
        location.hash = `#faq-${created.id}`;
      } else {
        const updated = await updateFaq(currentItem.id, payload);
        itemsById[updated.id] = updated;
        const idx = items.findIndex(i => i.id === updated.id);
        if (idx !== -1) items[idx] = updated;
        renderList(items);
        location.hash = `#faq-${updated.id}`;
      }
    } catch (error) {
      alert(error.message);
    }
  };

  deleteBtn.onclick = () => { deleteModal.hidden = false; };
  document.querySelector('#faq-delete-no').onclick = () => { deleteModal.hidden = true; };
  document.querySelector('#faq-delete-yes').onclick = async () => {
    if (!currentItem || currentItem.id == null) { deleteModal.hidden = true; return; }
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
