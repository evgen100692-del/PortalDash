// Общие UI-хелперы: всплывающие уведомления (тосты) и скелетоны загрузки.
(() => {
  let root = null;
  const ensureRoot = () => {
    if (!root || !document.body.contains(root)) {
      root = document.createElement('div');
      root.id = 'toast-root';
      document.body.append(root);
    }
    return root;
  };

  // window.toast('Объект сохранён')            — успех
  // window.toast('Не удалось сохранить', 'error')
  // window.toast('Файл будет удалён', 'info')
  window.toast = (message, type = 'success') => {
    if (!message) return;
    const box = ensureRoot();
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.setAttribute('role', 'status');
    el.textContent = message;
    box.append(el);
    requestAnimationFrame(() => el.classList.add('toast--in'));
    const remove = () => {
      el.classList.remove('toast--in');
      setTimeout(() => el.remove(), 300);
    };
    const timer = setTimeout(remove, type === 'error' ? 4500 : 3000);
    el.addEventListener('click', () => { clearTimeout(timer); remove(); });
  };

  // Рисует карточки-заглушки на время загрузки списка.
  window.skeletonCards = (container, count = 6) => {
    if (!container) return;
    container.innerHTML = '';
    for (let i = 0; i < count; i += 1) {
      const card = document.createElement('div');
      card.className = 'skeleton-card';
      card.innerHTML =
        '<div class="skeleton-card__img"></div>' +
        '<div class="skeleton-card__line"></div>' +
        '<div class="skeleton-card__line skeleton-card__line--short"></div>';
      container.append(card);
    }
  };

  const imageViewer = document.querySelector('#image-viewer-modal');
  const imageViewerImage = document.querySelector('#image-viewer-image');
  let previousOverflow = '';
  const closeImageViewer = () => {
    if (!imageViewer || imageViewer.hidden) return;
    imageViewer.hidden = true;
    imageViewerImage.removeAttribute('src');
    document.body.style.overflow = previousOverflow;
  };
  window.openImageViewer = (src, alt = 'Фотография') => {
    if (!imageViewer || !src) return;
    imageViewerImage.src = src;
    imageViewerImage.alt = alt;
    previousOverflow = document.body.style.overflow;
    imageViewer.hidden = false;
    document.body.style.overflow = 'hidden';
  };
  document.querySelector('#image-viewer-close')?.addEventListener('click', closeImageViewer);
  imageViewer?.addEventListener('click', event => { if (event.target === imageViewer) closeImageViewer(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeImageViewer(); });
  document.addEventListener('click', event => {
    const image = event.target.closest('img[data-full-image]');
    if (!image || !image.currentSrc && !image.src) return;
    event.preventDefault();
    event.stopPropagation();
    window.openImageViewer(image.currentSrc || image.src, image.alt);
  }, true);
})();
