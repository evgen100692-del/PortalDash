const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const router = express.Router();
const db = require('../faqDb');

const uploadDir = path.join(__dirname, '../../public/uploads/faq');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\/(png|jpe?g)$/.test(file.mimetype))
});

router.get('/', (req, res) => res.json(db.list()));

// Загрузка фотографии для позиции стандарта химии — возвращает URL.
router.post('/upload', upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Нужна фотография PNG, JPG или JPEG' });
  res.status(201).json({ url: '/uploads/faq/' + req.file.filename });
});

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
