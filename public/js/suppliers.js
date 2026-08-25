// Модуль 4: Реестр поставщиков и качества химии
async function renderSuppliers() {
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="page-title">Реестр поставщиков и качества химии</div>
    <div class="panel filters-row">
      <select id="sup-status">
        <option value="">Все статусы</option>
        <option value="used">Используется</option>
        <option value="test">На тесте</option>
        <option value="not_used">Отказ</option>
      </select>
      <button id="sup-apply">Фильтровать</button>
    </div>
    <div class="panel"><table id="sup-table"></table></div>
  `;
  document.getElementById('sup-apply').addEventListener('click', loadSuppliers);
  loadSuppliers();
}

function statusBadge(status) {
  const map = { used: 'Используется', test: 'На тесте', not_used: 'Отказ' };
  return `<span class="badge badge-${status}">${map[status] || status}</span>`;
}

async function loadSuppliers() {
  const status = document.getElementById('sup-status').value;
  const params = new URLSearchParams();
  if (status) params.set('status', status);

  const products = await api.get(`/api/suppliers/products/all?${params}`);
  const table = document.getElementById('sup-table');
  table.innerHTML = `
    <thead><tr><th>Поставщик</th><th>Продукт</th><th>Вид химии</th><th>Статус</th><th>Причина отказа</th><th>Цена закупки</th><th>Цена франчайзи</th></tr></thead>
    <tbody>
      ${products.map(p => `
        <tr>
          <td>${p.supplier_name}</td>
          <td>${p.product_name}</td>
          <td>${p.chemical_type_name || '—'}</td>
          <td>${statusBadge(p.status)}</td>
          <td>${p.reject_reason || '—'}</td>
          <td>${p.price_purchase ? p.price_purchase + ' ₽' : '—'}</td>
          <td>${p.price_franchise ? p.price_franchise + ' ₽' : '—'}</td>
        </tr>
      `).join('') || '<tr><td colspan="7">Нет данных</td></tr>'}
    </tbody>
  `;
}
