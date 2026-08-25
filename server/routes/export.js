// Модуль 7: Экспорт отчётов PDF/Excel
const express = require('express');
const router = express.Router();
const db = require('../db');
const { buildObjectPdfReport, buildPeriodPdfReport } = require('../services/pdfExport');
const { buildObjectExcelReport } = require('../services/excelExport');

router.get('/pdf/object/:id', async (req, res) => {
  const object = db.prepare('SELECT * FROM objects WHERE id = ?').get(req.params.id);
  if (!object) return res.status(404).json({ error: 'Объект не найден' });

  const history = db.prepare(`
    SELECT wr.week_start_date, ct.name AS chemical_type, wr.writeoff, wr.balance, wr.cost
    FROM weekly_records wr
    JOIN chemical_types ct ON ct.id = wr.chemical_type_id
    WHERE wr.object_id = ?
    ORDER BY wr.week_start_date DESC
    LIMIT 200
  `).all(req.params.id);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=object_${req.params.id}_report.pdf`);
  buildObjectPdfReport(object, history).pipe(res);
});

router.get('/pdf/period', async (req, res) => {
  const { from, to } = req.query;
  let sql = `
    SELECT o.name AS object_name, ct.name AS chemical_type, SUM(wr.writeoff) AS writeoff, SUM(wr.cost) AS cost
    FROM weekly_records wr
    JOIN objects o ON o.id = wr.object_id
    JOIN chemical_types ct ON ct.id = wr.chemical_type_id
    WHERE 1=1
  `;
  const params = [];
  if (from) { sql += ' AND wr.week_start_date >= ?'; params.push(from); }
  if (to) { sql += ' AND wr.week_start_date <= ?'; params.push(to); }
  sql += ' GROUP BY o.id, ct.id ORDER BY o.name';
  const rows = db.prepare(sql).all(...params);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename=period_report.pdf');
  buildPeriodPdfReport({ from, to }, rows).pipe(res);
});

router.get('/excel/object/:id', async (req, res) => {
  const object = db.prepare('SELECT * FROM objects WHERE id = ?').get(req.params.id);
  if (!object) return res.status(404).json({ error: 'Объект не найден' });

  const history = db.prepare(`
    SELECT wr.week_start_date, ct.name AS chemical_type, wr.writeoff, wr.balance,
           wr.delivery_order, wr.delivery_fact, wr.cost, wr.transfer_return
    FROM weekly_records wr
    JOIN chemical_types ct ON ct.id = wr.chemical_type_id
    WHERE wr.object_id = ?
    ORDER BY wr.week_start_date DESC
  `).all(req.params.id);

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=object_${req.params.id}_report.xlsx`);
  const workbook = await buildObjectExcelReport(object, history);
  await workbook.xlsx.write(res);
  res.end();
});

module.exports = router;
