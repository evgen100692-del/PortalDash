(() => {
  const modal = document.querySelector('#chemical-modal');
  const confirmModal = document.querySelector('#chemical-confirm-modal');
  const form = document.querySelector('#chemical-form');
  const photoInput = document.querySelector('#chemical-photo');
  const preview = document.querySelector('#chemical-photo-preview');
  const cards = document.querySelector('#chemical-cards');
  const emptyState = document.querySelector('#chemicals-empty');

  const imageTypeRe = /^image\/(png|jpe?g)$/;
  let previewUrl = null;

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
  };

  const closeForm = () => {
    modal.hidden = true;
    confirmModal.hidden = true;
    document.body.style.overflow = '';
  };

  const checkField = field => {
    const isPhoto = field.contains(photoInput);
    const controls = [...field.querySelectorAll('input[required], select[required], textarea[required]')];
    if (!controls.length && !isPhoto) return true;
    let bad = controls.some(control => !String(control.value).trim());
    if (isPhoto) {
      const file = photoInput.files[0];
      bad = !file || !imageTypeRe.test(file.type);
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
    list.forEach(chemical => {
      const card = document.createElement('article');
      card.className = 'chem-card';
      card.innerHTML = `<img alt=""><div class="chem-card__name"></div>`;
      const img = card.querySelector('img');
      img.src = chemical.photo_url;
      img.alt = chemical.name;
      card.querySelector('.chem-card__name').textContent = chemical.name;
      cards.append(card);
    });
  };

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
    data.set('has_docs', form.has_docs.checked ? 'true' : 'false');
    try {
      await createChemical(data);
      render(await getChemicals());
      closeForm();
    } catch (error) {
      alert(error.message);
    }
  };

  getChemicals().then(render).catch(() => render([]));
  resetForm();
})();
