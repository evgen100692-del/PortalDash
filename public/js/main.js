// Роутинг между разделами дашборда.
// Раздел «Карточка объекта» реализован (см. objectCard.js), остальные пока заглушки.
const PAGE_TITLES = {
  objectCard: 'Карточка объекта',
  analytics: 'Сводная аналитика',
  heatmap: 'Рейтинг расхода химии',
  suppliers: 'Поставщики',
  alerts: 'Уведомления',
  finance: 'Финансы',
  exportPanel: 'Экспорт'
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

  const isObjectCard = pageKey === 'objectCard';
  document.getElementById('page-objectCard').hidden = !isObjectCard;

  const placeholder = document.getElementById('page-placeholder');
  placeholder.hidden = isObjectCard;
  if (!isObjectCard) {
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
