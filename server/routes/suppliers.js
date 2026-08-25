// Модуль 4: Реестр поставщиков и качества химии
const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
  const { status } = req.query;
  let sql = 'SELECT * FROM suppliers WHERE 1=1';
  const params = [];
  if (status) { sql += ' AND status = ?'; params.push(status); }
  sql += ' ORDER BY name';
  res.json(db.prepare(sql).all(...params));
});

router.get('/:id/products', (req, res) => {
  const products = db.prepare(`
    SELECT sp.*, ct.name AS chemical_type_name
    FROM supplier_products sp
    LEFT JOIN chemical_types ct ON ct.id = sp.chemical_type_id
    WHERE sp.supplier_id = ?
    ORDER BY sp.tested_at DESC
  `).all(req.params.id);
  res.json(products);
});

router.get('/products/all', (req, res) => {
  const { status } = req.query;
  let sql = `
    SELECT sp.*, s.name AS supplier_name, ct.name AS chemical_type_name
    FROM supplier_products sp
    JOIN suppliers s ON s.id = sp.supplier_id
    LEFT JOIN chemical_types ct ON ct.id = sp.chemical_type_id
    WHERE 1=1
  `;
  const params = [];
  if (status) { sql += ' AND sp.status = ?'; params.push(status); }
  sql += ' ORDER BY sp.tested_at DESC';
  res.json(db.prepare(sql).all(...params));
});

module.exports = router;
