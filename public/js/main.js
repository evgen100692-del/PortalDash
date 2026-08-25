// Роутинг между модулями дашборда
const pages = {
  objectCard: renderObjectCard,
  analytics: renderAnalytics,
  heatmap: renderHeatmap,
  suppliers: renderSuppliers,
  alerts: renderAlerts,
  finance: renderFinance,
  exportPanel: renderExportPanel
};

function navigate(pageKey) {
  document.querySelectorAll('#sidebar nav a').forEach(a => {
    a.classList.toggle('active', a.dataset.page === pageKey);
  });
  const content = document.getElementById('content');
  content.innerHTML = '<div class="panel">Загрузка…</div>';
  (pages[pageKey] || (() => { content.innerHTML = '<div class="panel">Раздел в разработке</div>'; }))();
}

document.querySelectorAll('#sidebar nav a').forEach(a => {
  a.addEventListener('click', () => navigate(a.dataset.page));
});

navigate('objectCard');
