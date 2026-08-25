// Модуль 6: Финансовый блок — динамика стоимости закупок
const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/summary', (req, res) => {
  const { from, to, granularity = 'week' } = req.query;
  const dateGroup = granularity === 'month'
    ? "strftime('%Y-%m', wr.week_start_date)"
    : 'wr.week_start_date';

  let sql = `
    SELECT ${dateGroup} AS period, SUM(wr.cost) AS total_cost
    FROM weekly_records wr
    WHERE 1=1
  `;
  const params = [];
  if (from) { sql += ' AND wr.week_start_date >= ?'; params.push(from); }
  if (to) { sql += ' AND wr.week_start_date <= ?'; params.push(to); }
  sql += ' GROUP BY period ORDER BY period';

  res.json(db.prepare(sql).all(...params));
});

router.get('/by-supplier', (req, res) => {
  const { from, to } = req.query;
  let sql = `
    SELECT s.name AS supplier_name, SUM(wr.cost) AS total_cost, COUNT(*) AS deliveries_count
    FROM weekly_records wr
    LEFT JOIN suppliers s ON s.id = wr.supplier_id
    WHERE 1=1
  `;
  const params = [];
  if (from) { sql += ' AND wr.week_start_date >= ?'; params.push(from); }
  if (to) { sql += ' AND wr.week_start_date <= ?'; params.push(to); }
  sql += ' GROUP BY s.id ORDER BY total_cost DESC';

  res.json(db.prepare(sql).all(...params));
});

module.exports = router;
