// Роутинг между разделами дашборда.
// «Карточка объекта» и «Химия» реализованы, остальные пункты — заглушки.
const PAGE_TITLES = {
  analytics: 'Сводная аналитика',
  heatmap: 'Рейтинг расхода химии',
  finance: 'Финансы',
  exportPanel: 'Экспорт'
};

// pageKey -> id секции с реализованным содержимым.
const REAL_PAGES = {
  objectCard: 'page-objectCard',
  chemicals: 'page-chemicals',
  faq: 'page-faq',
  alerts: 'page-alerts'
};

function navigate(pageKey) {
  document.querySelectorAll('#sidebar nav a').forEach(a => {
    a.classList.toggle('active', a.dataset.page === pageKey);
  });

  // Уходим со страниц-деталей и чистим их хэш без hashchange.
  document.getElementById('page-objectDetail').hidden = true;
  document.getElementById('page-objectTests').hidden = true;
  document.getElementById('page-objectComplaints').hidden = true;
  document.getElementById('page-chemicalDetail').hidden = true;
  document.getElementById('page-faqItem').hidden = true;
  try { sessionStorage.removeItem('chemBackTo'); } catch { /* нет доступа */ }
  if (/^#(object|chemical|faq)-/.test(location.hash)) {
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

// ---------- Сворачивание боковой панели ----------
const sidebarToggle = document.getElementById('sidebar-toggle');
const applySidebarState = collapsed => {
  document.body.classList.toggle('sidebar-collapsed', collapsed);
  sidebarToggle.setAttribute('aria-label', collapsed ? 'Развернуть меню' : 'Свернуть меню');
  sidebarToggle.setAttribute('title', collapsed ? 'Развернуть меню' : 'Свернуть меню');
};
let sidebarCollapsed = false;
try { sidebarCollapsed = localStorage.getItem('sidebarCollapsed') === '1'; } catch { /* нет доступа */ }
applySidebarState(sidebarCollapsed);
sidebarToggle.addEventListener('click', () => {
  sidebarCollapsed = !document.body.classList.contains('sidebar-collapsed');
  applySidebarState(sidebarCollapsed);
  try { localStorage.setItem('sidebarCollapsed', sidebarCollapsed ? '1' : '0'); } catch { /* нет доступа */ }
});

// Прямые ссылки на страницы-детали (#object-<id> / #chemical-<id>) открывают
// objectCard.js / chemicalCard.js — здесь только подсвечиваем нужный пункт меню.
const initialHash = location.hash;
if (/^#object-\d+(-tests|-complaints)?$/.test(initialHash)) {
  document.querySelector('#sidebar nav a[data-page="objectCard"]').classList.add('active');
  Object.values(REAL_PAGES).forEach(id => { document.getElementById(id).hidden = true; });
} else if (/^#chemical-\d+$/.test(initialHash)) {
  document.querySelector('#sidebar nav a[data-page="chemicals"]').classList.add('active');
  Object.values(REAL_PAGES).forEach(id => { document.getElementById(id).hidden = true; });
} else if (/^#faq-\d+$/.test(initialHash)) {
  document.querySelector('#sidebar nav a[data-page="faq"]').classList.add('active');
  Object.values(REAL_PAGES).forEach(id => { document.getElementById(id).hidden = true; });
} else {
  navigate('objectCard');
}
