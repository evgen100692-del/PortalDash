// Роутинг между разделами дашборда.
// «Карточка объекта» и «Химия» реализованы, остальные пункты — заглушки.
const PAGE_TITLES = {
  analytics: 'Сводная аналитика',
  heatmap: 'Рейтинг расхода химии',
  alerts: 'Уведомления',
  finance: 'Финансы',
  exportPanel: 'Экспорт'
};

// pageKey -> id секции с реализованным содержимым.
const REAL_PAGES = {
  objectCard: 'page-objectCard',
  chemicals: 'page-chemicals'
};

function navigate(pageKey) {
  document.querySelectorAll('#sidebar nav a').forEach(a => {
    a.classList.toggle('active', a.dataset.page === pageKey);
  });

  // Уходим с карточки объекта — закрываем её страницу и чистим хэш без hashchange.
  document.getElementById('page-objectDetail').hidden = true;
  if (location.hash.startsWith('#object-')) {
    history.replaceState(null, '', location.pathname + location.search);
  }

  const targetId = REAL_PAGES[pageKey] || null;
  Object.values(REAL_PAGES).forEach(id => {
    document.getElementById(id).hidden = id !== targetId;
  });

  const placeholder = document.getElementById('page-placeholder');
  placeholder.hidden = !!targetId;
  if (!targetId) {
    placeholder.querySelector('.placeholder-title').textContent = PAGE_TITLES[pageKey] || 'Раздел';
  }
}

document.querySelectorAll('#sidebar nav a').forEach(a => {
  a.addEventListener('click', () => navigate(a.dataset.page));
});

// При прямой ссылке на страницу объекта (#object-<id>) её открывает objectCard.js.
if (!/^#object-\d+$/.test(location.hash)) {
  navigate('objectCard');
} else {
  document.querySelector('#sidebar nav a[data-page="objectCard"]').classList.add('active');
}
