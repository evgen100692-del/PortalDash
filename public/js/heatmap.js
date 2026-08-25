// Модуль 3: Тепловая карта расхода по объектам
async function renderHeatmap() {
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="page-title">Тепловая карта расхода</div>
    <div class="panel filters-row">
      <input type="date" id="hm-from">
      <input type="date" id="hm-to">
      <button id="hm-apply">Построить</button>
    </div>
    <div class="panel"><table id="hm-table"></table></div>
  `;
  document.getElementById('hm-apply').addEventListener('click', loadHeatmap);
  loadHeatmap();
}

function heatColor(value, max) {
  const ratio = max ? Math.min(value / max, 1) : 0;
  const r = 200 + Math.round(55 * ratio);
  const g = Math.round(122 * (1 - ratio));
  const b = 20;
  return `rgb(${r}, ${g}, ${b})`;
}

async function loadHeatmap() {
  const params = new URLSearchParams();
  const from = document.getElementById('hm-from').value;
  const to = document.getElementById('hm-to').value;
  if (from) params.set('from', from);
  if (to) params.set('to', to);

  const rows = await api.get(`/api/heatmap?${params}`);
  const max = Math.max(...rows.map(r => r.total_writeoff || 0), 1);

  const table = document.getElementById('hm-table');
  table.innerHTML = `
    <thead><tr><th>Объект</th><th>Город</th><th>Списано всего</th><th>Ср. в неделю</th><th>Интенсивность</th></tr></thead>
    <tbody>
      ${rows.map(r => `
        <tr>
          <td>${r.object_name}</td>
          <td>${r.city || '—'}</td>
          <td>${r.total_writeoff}</td>
          <td>${r.avg_weekly_writeoff}</td>
          <td><div class="heat-cell" style="background:${heatColor(r.total_writeoff, max)}">${Math.round((r.total_writeoff / max) * 100)}%</div></td>
        </tr>
      `).join('') || '<tr><td colspan="5">Нет данных</td></tr>'}
    </tbody>
  `;
}
