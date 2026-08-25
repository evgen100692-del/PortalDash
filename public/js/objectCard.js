// Модуль 1: Карточка объекта
async function renderObjectCard() {
  const content = document.getElementById('content');
  const objects = await api.get('/api/objects');

  content.innerHTML = `
    <div class="page-title">Карточка объекта</div>
    <div class="panel filters-row">
      <select id="oc-object-select">
        <option value="">Выберите объект…</option>
        ${objects.map(o => `<option value="${o.id}">${o.name} (${o.city})</option>`).join('')}
      </select>
      <input type="date" id="oc-from">
      <input type="date" id="oc-to">
      <button id="oc-load">Показать историю</button>
    </div>
    <div id="oc-profile"></div>
    <div id="oc-history"></div>
  `;

  document.getElementById('oc-object-select').addEventListener('change', loadObjectProfile);
  document.getElementById('oc-load').addEventListener('click', loadObjectHistory);
}

async function loadObjectProfile() {
  const id = document.getElementById('oc-object-select').value;
  const profileEl = document.getElementById('oc-profile');
  if (!id) { profileEl.innerHTML = ''; return; }

  const obj = await api.get(`/api/objects/${id}`);
  profileEl.innerHTML = `
    <div class="panel">
      <div class="kpi-grid">
        <div class="kpi-card"><div class="label">Адрес</div><div class="value" style="font-size:14px">${obj.address || '—'}</div></div>
        <div class="kpi-card"><div class="label">Ответственный ТУ</div><div class="value" style="font-size:14px">${obj.responsible_tu || '—'}</div></div>
        <div class="kpi-card"><div class="label">Телефон</div><div class="value" style="font-size:14px">${obj.phone || '—'}</div></div>
        <div class="kpi-card"><div class="label">Город</div><div class="value" style="font-size:14px">${obj.city || '—'}</div></div>
      </div>
      <h3 style="color:var(--orange)">Текущие остатки по видам химии</h3>
      <table>
        <thead><tr><th>Вид химии</th><th>Остаток</th><th>Дата обновления</th></tr></thead>
        <tbody>
          ${obj.current_balances.map(b => `<tr><td>${b.chemical_type}</td><td>${b.balance}</td><td>${b.week_start_date}</td></tr>`).join('') || '<tr><td colspan="3">Нет данных</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

async function loadObjectHistory() {
  const id = document.getElementById('oc-object-select').value;
  if (!id) return;
  const from = document.getElementById('oc-from').value;
  const to = document.getElementById('oc-to').value;

  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);

  const history = await api.get(`/api/objects/${id}/history?${params}`);
  const historyEl = document.getElementById('oc-history');
  historyEl.innerHTML = `
    <div class="panel">
      <h3 style="color:var(--orange)">История поставок / списаний</h3>
      <table>
        <thead><tr><th>Неделя</th><th>Вид химии</th><th>Списание</th><th>Остаток</th><th>Заказ ТУ</th><th>Доставка факт</th><th>Стоимость</th></tr></thead>
        <tbody>
          ${history.map(h => `<tr><td>${h.week_start_date}</td><td>${h.chemical_type}</td><td>${h.writeoff}</td><td>${h.balance}</td><td>${h.delivery_order}</td><td>${h.delivery_fact}</td><td>${h.cost} ₽</td></tr>`).join('') || '<tr><td colspan="7">Нет данных за период</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}
