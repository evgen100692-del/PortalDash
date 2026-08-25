// Модуль 6: Финансовый блок
let financeChart = null;

async function renderFinance() {
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="page-title">Финансовый блок</div>
    <div class="panel filters-row">
      <input type="date" id="fin-from">
      <input type="date" id="fin-to">
      <select id="fin-granularity"><option value="week">По неделям</option><option value="month">По месяцам</option></select>
      <button id="fin-apply">Применить</button>
    </div>
    <div class="panel"><canvas id="fin-canvas" height="80"></canvas></div>
    <div class="panel">
      <h3 style="color:var(--orange)">Разбивка по поставщикам</h3>
      <table id="fin-supplier-table"></table>
    </div>
  `;
  document.getElementById('fin-apply').addEventListener('click', loadFinance);
  loadFinance();
}

async function loadFinance() {
  const params = new URLSearchParams();
  const from = document.getElementById('fin-from').value;
  const to = document.getElementById('fin-to').value;
  const granularity = document.getElementById('fin-granularity').value;
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  params.set('granularity', granularity);

  const summary = await api.get(`/api/finance/summary?${params}`);
  const bySupplier = await api.get(`/api/finance/by-supplier?${from ? `from=${from}&` : ''}${to ? `to=${to}` : ''}`);

  const ctx = document.getElementById('fin-canvas');
  if (financeChart) financeChart.destroy();
  financeChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: summary.map(s => s.period),
      datasets: [{ label: 'Стоимость закупок, ₽', data: summary.map(s => s.total_cost), backgroundColor: '#ff7a1a' }]
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: '#f5f5f5' } } },
      scales: {
        x: { ticks: { color: '#9a9a9a' }, grid: { color: '#2a2a2a' } },
        y: { ticks: { color: '#9a9a9a' }, grid: { color: '#2a2a2a' } }
      }
    }
  });

  const table = document.getElementById('fin-supplier-table');
  table.innerHTML = `
    <thead><tr><th>Поставщик</th><th>Сумма закупок, ₽</th><th>Кол-во поставок</th></tr></thead>
    <tbody>
      ${bySupplier.map(s => `<tr><td>${s.supplier_name || 'Не указан'}</td><td>${s.total_cost || 0} ₽</td><td>${s.deliveries_count}</td></tr>`).join('') || '<tr><td colspan="3">Нет данных</td></tr>'}
    </tbody>
  `;
}
