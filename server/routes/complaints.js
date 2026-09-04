const express = require('express');
const router = express.Router();
const db = require('../complaintsDb');
const objectsDb = require('../db');

router.get('/', (req, res) => {
  res.json(db.list(req.query.object_id));
});

router.post('/', (req, res) => {
  const body = req.body || {};
  if (!objectsDb.getObject(body.object_id)) {
    return res.status(400).json({ error: 'Объект не найден' });
  }
  res.status(201).json(db.insert(body));
});

router.delete('/:id', (req, res) => {
  const removed = db.remove(req.params.id);
  if (!removed) return res.status(404).json({ error: 'Жалоба не найдена' });
  res.json({ ok: true });
});

module.exports = router;
