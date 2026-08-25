// Модуль 1: Карточка объекта
const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
  const { city, tu } = req.query;
  let sql = 'SELECT * FROM objects WHERE is_active = 1';
  const params = [];
  if (city) { sql += ' AND city = ?'; params.push(city); }
  if (tu) { sql += ' AND responsible_tu = ?'; params.push(tu); }
  sql += ' ORDER BY name';
  res.json(db.prepare(sql).all(...params));
});

router.get('/:id', (req, res) => {
  const object = db.prepare('SELECT * FROM objects WHERE id = ?').get(req.params.id);
  if (!object) return res.status(404).json({ error: 'Объект не найден' });

  const balances = db.prepare(`
    SELECT ct.name AS chemical_type, wr.balance, wr.week_start_date
    FROM weekly_records wr
    JOIN chemical_types ct ON ct.id = wr.chemical_type_id
    WHERE wr.object_id = ?
    AND wr.week_start_date = (
      SELECT MAX(week_start_date) FROM weekly_records wr2
      WHERE wr2.object_id = wr.object_id AND wr2.chemical_type_id = wr.chemical_type_id
    )
    ORDER BY ct.name
  `).all(req.params.id);

  res.json({ ...object, current_balances: balances });
});

router.get('/:id/history', (req, res) => {
  const { from, to, chemical_type_id } = req.query;
  let sql = `
    SELECT wr.week_start_date, ct.name AS chemical_type, wr.writeoff, wr.balance,
           wr.delivery_order, wr.delivery_fact, wr.cost, wr.transfer_return
    FROM weekly_records wr
    JOIN chemical_types ct ON ct.id = wr.chemical_type_id
    WHERE wr.object_id = ?
  `;
  const params = [req.params.id];
  if (from) { sql += ' AND wr.week_start_date >= ?'; params.push(from); }
  if (to) { sql += ' AND wr.week_start_date <= ?'; params.push(to); }
  if (chemical_type_id) { sql += ' AND wr.chemical_type_id = ?'; params.push(chemical_type_id); }
  sql += ' ORDER BY wr.week_start_date DESC';

  res.json(db.prepare(sql).all(...params));
});

module.exports = router;
