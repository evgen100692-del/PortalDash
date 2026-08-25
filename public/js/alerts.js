// Модуль 5: Уведомления по минимальным остаткам
async function renderAlerts() {
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="page-title">Уведомления по остаткам</div>
    <div class="panel" id="alerts-list">Загрузка…</div>
  `;

  const alerts = await api.get('/api/alerts');
  const listEl = document.getElementById('alerts-list');

  if (!alerts.length) {
    listEl.innerHTML = '<p style="color:var(--success)">Все остатки в норме — заказов не требуется.</p>';
    return;
  }

  listEl.innerHTML = alerts.map(a => `
    <div class="alert-card">
      <strong>${a.object_name}</strong> — ${a.chemical_type_name}<br>
      Остаток: <strong style="color:var(--danger)">${a.balance}</strong> (порог: ${a.min_balance}), обновлено ${a.week_start_date}
      <div style="margin-top:6px"><span class="badge badge-not_used">Требует заказа</span></div>
    </div>
  `).join('');
}
