// Модуль 5: Уведомления по минимальным остаткам
const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
  const alerts = db.prepare(`
    SELECT o.id AS object_id, o.name AS object_name, ct.id AS chemical_type_id,
           ct.name AS chemical_type_name, wr.balance, st.min_balance,
           wr.week_start_date
    FROM stock_thresholds st
    JOIN objects o ON o.id = st.object_id
    JOIN chemical_types ct ON ct.id = st.chemical_type_id
    JOIN weekly_records wr ON wr.object_id = st.object_id AND wr.chemical_type_id = st.chemical_type_id
    WHERE wr.week_start_date = (
      SELECT MAX(week_start_date) FROM weekly_records wr2
      WHERE wr2.object_id = wr.object_id AND wr2.chemical_type_id = wr.chemical_type_id
    )
    AND wr.balance < st.min_balance
    ORDER BY (st.min_balance - wr.balance) DESC
  `).all();
  res.json(alerts);
});

router.post('/thresholds', (req, res) => {
  const { object_id, chemical_type_id, min_balance } = req.body;
  if (!object_id || !chemical_type_id || min_balance === undefined) {
    return res.status(400).json({ error: 'object_id, chemical_type_id, min_balance обязательны' });
  }
  db.prepare(`
    INSERT INTO stock_thresholds (object_id, chemical_type_id, min_balance)
    VALUES (?, ?, ?)
    ON CONFLICT(object_id, chemical_type_id) DO UPDATE SET min_balance = excluded.min_balance
  `).run(object_id, chemical_type_id, min_balance);
  res.json({ status: 'ok' });
});

module.exports = router;
