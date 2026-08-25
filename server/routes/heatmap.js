// Модуль 3: Рейтинг расхода химии расхода по объектам
const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
  const { from, to, chemical_type_id } = req.query;

  let sql = `
    SELECT o.id AS object_id, o.name AS object_name, o.city,
           SUM(wr.writeoff) AS total_writeoff,
           COUNT(DISTINCT wr.week_start_date) AS weeks_count,
           ROUND(SUM(wr.writeoff) * 1.0 / NULLIF(COUNT(DISTINCT wr.week_start_date), 0), 2) AS avg_weekly_writeoff
    FROM weekly_records wr
    JOIN objects o ON o.id = wr.object_id
    WHERE 1=1
  `;
  const params = [];
  if (from) { sql += ' AND wr.week_start_date >= ?'; params.push(from); }
  if (to) { sql += ' AND wr.week_start_date <= ?'; params.push(to); }
  if (chemical_type_id) { sql += ' AND wr.chemical_type_id = ?'; params.push(chemical_type_id); }
  sql += ' GROUP BY o.id ORDER BY total_writeoff DESC';

  res.json(db.prepare(sql).all(...params));
});

module.exports = router;
