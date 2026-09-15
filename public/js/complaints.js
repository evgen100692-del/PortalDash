(() => {
  const page = document.querySelector('#page-objectComplaints');
  const listBox = document.querySelector('#object-complaints-list');
  const title = document.querySelector('#object-complaints-title');
  const addBtn = document.querySelector('#object-complaints-add');

  const modal = document.querySelector('#complaint-modal');
  const form = document.querySelector('#complaint-form');
  const aboutChemBox = document.querySelector('#complaint-about-chem');
  const chemField = document.querySelector('#complaint-chem');
  const chemSelect = form.elements.chemical_name;

  const deleteModal = document.querySelector('#complaint-delete-modal');
  let pendingDeleteId = null;

  let currentObject = null;
  let currentList = [];

  const formatDay = value => {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('ru-RU');
  };

  // ---------- Список жалоб ----------
  const render = list => {
    currentList = list;
    listBox.innerHTML = '';
    if (!list.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'Жалоб по этому объекту пока нет.';
      listBox.append(empty);
      return;
    }
    list.forEach(item => {
      const card = document.createElement('article');
      card.className = 'complaint-item';

      const head = document.createElement('div');
      head.className = 'complaint-item__head';
      const subject = document.createElement('span');
      subject.className = 'complaint-item__subject';
      subject.textContent = item.subject || 'Без темы';
      head.append(subject);
      if (item.date) {
        const date = document.createElement('span');
        date.className = 'complaint-item__date';
        date.textContent = formatDay(item.date);
        head.append(date);
      }
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'complaint-item__del';
      del.setAttribute('aria-label', 'Удалить жалобу');
      del.title = 'Удалить жалобу';
      del.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M9 3v1H4v2h16V4h-5V3H9zM6 8v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8H6zm3 3h2v8H9v-8zm4 0h2v8h-2v-8z"/></svg>';
      del.onclick = () => { pendingDeleteId = item.id; deleteModal.hidden = false; };
      head.append(del);
      card.append(head);

      if (item.about_chemistry) {
        const chem = document.createElement('div');
        chem.className = 'complaint-item__chem';
        chem.textContent = item.chemical_name
          ? `Жалоба на химию: ${item.chemical_name}`
          : 'Жалоба на химию';
        card.append(chem);
      }

      if (item.comment) {
        const comment = document.createElement('p');
        comment.className = 'complaint-item__comment';
        comment.textContent = item.comment;
        card.append(comment);
      }
      listBox.append(card);
    });
  };

  const showPage = () => {
    document.querySelectorAll('#content > .page').forEach(p => { p.hidden = p !== page; });
    window.scrollTo(0, 0);
  };

  const refresh = async () => {
    if (!currentObject) return;
    try { render(await getComplaints(currentObject.id)); }
    catch { render([]); }
  };

  const open = async id => {
    let object = null;
    try { object = await getObject(id); } catch { location.hash = ''; return; }
    if (!object) { location.hash = ''; return; }
    currentObject = object;
    title.textContent = object.name || object.address ? `Жалобы — ${object.name || object.address}` : 'Жалобы';
    render([]);
    showPage();
    refresh();
  };

  const close = () => {
    page.hidden = true;
    if (!location.hash) document.getElementById('page-objectCard').hidden = false;
  };

  const route = () => {
    const match = location.hash.match(/^#object-(\d+)-complaints$/);
    if (match) { open(match[1]); return; }
    if (!page.hidden) close();
  };
  window.addEventListener('hashchange', route);

  document.querySelector('#object-complaints-back').onclick = () => {
    location.hash = currentObject ? `#object-${currentObject.id}` : '';
  };

  // ---------- Модалка добавления ----------
  const closeModal = () => { modal.hidden = true; document.body.style.overflow = ''; };

  aboutChemBox.addEventListener('change', () => {
    chemField.hidden = !aboutChemBox.checked;
    if (!aboutChemBox.checked) chemSelect.value = '';
  });

  addBtn.onclick = async () => {
    form.reset();
    chemField.hidden = true;
    chemSelect.innerHTML = '<option value="">Выберите химию</option>';
    try {
      const chems = await getChemicals();
      [...new Set(chems.map(c => c.name).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'ru'))
        .forEach(name => {
          const option = document.createElement('option');
          option.value = name;
          option.textContent = name;
          chemSelect.append(option);
        });
    } catch { /* без списка */ }
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
  };

  document.querySelector('#complaint-modal-close').onclick = closeModal;
  document.querySelector('#complaint-cancel').onclick = closeModal;
  modal.addEventListener('click', event => { if (event.target === modal) closeModal(); });

  form.onsubmit = async event => {
    event.preventDefault();
    if (!currentObject) return;
    const payload = {
      object_id: currentObject.id,
      subject: form.elements.subject.value,
      date: form.elements.date.value,
      about_chemistry: aboutChemBox.checked,
      chemical_name: aboutChemBox.checked ? chemSelect.value : '',
      comment: form.elements.comment.value
    };
    try {
      await createComplaint(payload);
      closeModal();
      await refresh();
      document.dispatchEvent(new CustomEvent('complaints-changed', { detail: { objectId: currentObject.id } }));
      window.toast('Жалоба добавлена');
    } catch (error) {
      window.toast(error.message, 'error');
    }
  };

  // ---------- Удаление жалобы ----------
  document.querySelector('#complaint-delete-no').onclick = () => { deleteModal.hidden = true; pendingDeleteId = null; };
  document.querySelector('#complaint-delete-yes').onclick = async () => {
    if (pendingDeleteId == null) return;
    try {
      await deleteComplaint(pendingDeleteId);
      deleteModal.hidden = true;
      pendingDeleteId = null;
      await refresh();
      document.dispatchEvent(new CustomEvent('complaints-changed', { detail: { objectId: currentObject && currentObject.id } }));
      window.toast('Жалоба удалена');
    } catch (error) {
      deleteModal.hidden = true;
      window.toast(error.message, 'error');
    }
  };

  route();
})();
