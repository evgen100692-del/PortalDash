// Модуль 7: Экспорт отчётов PDF/Excel
async function renderExportPanel() {
  const content = document.getElementById('content');
  const objects = await api.get('/api/objects');

  content.innerHTML = `
    <div class="page-title">Экспорт отчётов</div>

    <div class="panel">
      <h3 style="color:var(--orange)">Отчёт по объекту</h3>
      <div class="filters-row">
        <select id="exp-object">${objects.map(o => `<option value="${o.id}">${o.name}</option>`).join('')}</select>
        <button id="exp-object-pdf">Скачать PDF</button>
        <button id="exp-object-excel" class="secondary">Скачать Excel</button>
      </div>
    </div>

    <div class="panel">
      <h3 style="color:var(--orange)">Сводный отчёт за период</h3>
      <div class="filters-row">
        <input type="date" id="exp-from">
        <input type="date" id="exp-to">
        <button id="exp-period-pdf">Скачать PDF</button>
      </div>
    </div>
  `;

  document.getElementById('exp-object-pdf').addEventListener('click', () => {
    const id = document.getElementById('exp-object').value;
    window.open(`/api/export/pdf/object/${id}`, '_blank');
  });
  document.getElementById('exp-object-excel').addEventListener('click', () => {
    const id = document.getElementById('exp-object').value;
    window.open(`/api/export/excel/object/${id}`, '_blank');
  });
  document.getElementById('exp-period-pdf').addEventListener('click', () => {
    const from = document.getElementById('exp-from').value;
    const to = document.getElementById('exp-to').value;
    window.open(`/api/export/pdf/period?from=${from}&to=${to}`, '_blank');
  });
}
