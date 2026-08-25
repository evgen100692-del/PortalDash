// Модуль 2: Сводная аналитика — закуплено vs списано vs остаток
const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/summary', (req, res) => {
  const { from, to, object_id, chemical_type_id, tu, city, granularity = 'week' } = req.query;

  const dateGroup = granularity === 'month'
    ? "strftime('%Y-%m', wr.week_start_date)"
    : 'wr.week_start_date';

  let sql = `
    SELECT ${dateGroup} AS period,
           SUM(wr.delivery_fact) AS purchased,
           SUM(wr.writeoff) AS written_off,
           SUM(wr.balance) AS balance,
           SUM(wr.cost) AS cost
    FROM weekly_records wr
    JOIN objects o ON o.id = wr.object_id
    WHERE 1=1
  `;
  const params = [];
  if (from) { sql += ' AND wr.week_start_date >= ?'; params.push(from); }
  if (to) { sql += ' AND wr.week_start_date <= ?'; params.push(to); }
  if (object_id) { sql += ' AND wr.object_id = ?'; params.push(object_id); }
  if (chemical_type_id) { sql += ' AND wr.chemical_type_id = ?'; params.push(chemical_type_id); }
  if (tu) { sql += ' AND o.responsible_tu = ?'; params.push(tu); }
  if (city) { sql += ' AND o.city = ?'; params.push(city); }
  sql += ` GROUP BY period ORDER BY period`;

  res.json(db.prepare(sql).all(...params));
});

router.get('/filters', (req, res) => {
  res.json({
    chemical_types: db.prepare('SELECT id, name FROM chemical_types ORDER BY name').all(),
    cities: db.prepare('SELECT DISTINCT city FROM objects ORDER BY city').all(),
    responsibles: db.prepare('SELECT DISTINCT responsible_tu FROM objects WHERE responsible_tu IS NOT NULL ORDER BY responsible_tu').all()
  });
});

module.exports = router;
