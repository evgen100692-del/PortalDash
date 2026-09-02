const express = require('express');
const router = express.Router();
const db = require('../faqDb');

router.get('/', (req, res) => res.json(db.list()));

router.get('/:id', (req, res) => {
  const item = db.get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Вопрос не найден' });
  res.json(item);
});

router.post('/', (req, res) => {
  res.status(201).json(db.add(req.body || {}));
});

router.put('/:id', (req, res) => {
  const updated = db.update(req.params.id, req.body || {});
  if (!updated) return res.status(404).json({ error: 'Вопрос не найден' });
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const result = db.remove(req.params.id);
  if (!result) return res.status(404).json({ error: 'Вопрос не найден' });
  if (result.error) return res.status(400).json(result);
  res.json({ ok: true });
});

module.exports = router;
