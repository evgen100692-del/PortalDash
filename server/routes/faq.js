const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
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

// Сохраняем произвольные файлы вопроса с расширением — иначе браузер не понимает формат (PDF и т.п.).
const EXT_BY_MIME = { 'image/png': '.png', 'image/jpeg': '.jpg', 'application/pdf': '.pdf' };
const fileStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const fromName = (path.extname(file.originalname || '').toLowerCase().match(/^\.[a-z0-9]{1,8}$/) || [''])[0];
    cb(null, crypto.randomBytes(16).toString('hex') + (fromName || EXT_BY_MIME[file.mimetype] || ''));
  }
});
const fileUpload = multer({ storage: fileStorage, limits: { fileSize: 30 * 1024 * 1024 } });

router.get('/', (req, res) => res.json(db.list()));

// Загрузка фотографии для позиции стандарта химии — возвращает URL.
router.post('/upload', upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Нужна фотография PNG, JPG или JPEG' });
  res.status(201).json({ url: '/uploads/faq/' + req.file.filename });
});

// Загрузка произвольного файла к вопросу — возвращает URL и имя.
router.post('/upload-file', fileUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не получен' });
  // multer отдаёт originalname в latin1 — возвращаем корректный UTF-8.
  const name = Buffer.from(req.file.originalname || req.file.filename, 'latin1').toString('utf8');
  res.status(201).json({ url: '/uploads/faq/' + req.file.filename, name });
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
