// Модуль 2: Сводная аналитика — закуплено vs списано vs остаток
let analyticsChart = null;

async function renderAnalytics() {
  const content = document.getElementById('content');
  const filters = await api.get('/api/analytics/filters');

  content.innerHTML = `
    <div class="page-title">Сводная аналитика по закупкам</div>
    <div class="panel filters-row">
      <select id="an-chem"><option value="">Все виды химии</option>${filters.chemical_types.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}</select>
      <select id="an-city"><option value="">Все города</option>${filters.cities.map(c => `<option value="${c.city}">${c.city}</option>`).join('')}</select>
      <select id="an-tu"><option value="">Все ответственные</option>${filters.responsibles.map(r => `<option value="${r.responsible_tu}">${r.responsible_tu}</option>`).join('')}</select>
      <select id="an-granularity"><option value="week">По неделям</option><option value="month">По месяцам</option></select>
      <input type="date" id="an-from">
      <input type="date" id="an-to">
      <button id="an-apply">Применить</button>
    </div>
    <div class="panel"><canvas id="an-canvas" height="90"></canvas></div>
  `;

  document.getElementById('an-apply').addEventListener('click', loadAnalytics);
  loadAnalytics();
}

async function loadAnalytics() {
  const params = new URLSearchParams();
  const chem = document.getElementById('an-chem').value;
  const city = document.getElementById('an-city').value;
  const tu = document.getElementById('an-tu').value;
  const granularity = document.getElementById('an-granularity').value;
  const from = document.getElementById('an-from').value;
  const to = document.getElementById('an-to').value;

  if (chem) params.set('chemical_type_id', chem);
  if (city) params.set('city', city);
  if (tu) params.set('tu', tu);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  params.set('granularity', granularity);

  const data = await api.get(`/api/analytics/summary?${params}`);

  const ctx = document.getElementById('an-canvas');
  if (analyticsChart) analyticsChart.destroy();
  analyticsChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(d => d.period),
      datasets: [
        { label: 'Закуплено', data: data.map(d => d.purchased), borderColor: '#ff7a1a', backgroundColor: 'rgba(255,122,26,0.15)', tension: 0.25 },
        { label: 'Списано', data: data.map(d => d.written_off), borderColor: '#e5484d', backgroundColor: 'rgba(229,72,77,0.1)', tension: 0.25 },
        { label: 'Остаток', data: data.map(d => d.balance), borderColor: '#3ecf8e', backgroundColor: 'rgba(62,207,142,0.1)', tension: 0.25 }
      ]
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
}
