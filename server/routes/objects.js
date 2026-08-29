const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const router = express.Router();
const db = require('../db');

const uploadDir = path.join(__dirname, '../../public/uploads/objects');
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\/(png|jpe?g)$/.test(file.mimetype))
});

const VALID_BOXES = ['1', '2', '3', '4', '5'];
const VALID_ROBOTS = ['Рязань', 'RCV'];
const VALID_CHEMISTRY = ['Эмульсия «365»', 'JD', 'Эмульсион «Вуаль»'];
const VALID_DRAINAGE = ['Нет', 'Есть', 'УКО'];

// Разбирает и проверяет поля формы объекта. Возвращает { data } либо { error }.
function parseObjectBody(body) {
  let robots;
  let chemistry;
  try {
    robots = JSON.parse(body.robots || '[]');
    chemistry = JSON.parse(body.chemistry || '[]');
  } catch {
    return { error: 'Некорректные списки роботов или химии' };
  }

  const required = ['address', 'boxes', 'manager', 'drainage'];
  const invalid =
    required.some(key => !String(body[key] || '').trim()) ||
    !VALID_BOXES.includes(String(body.boxes)) ||
    !Array.isArray(robots) || !robots.length || robots.some(value => !VALID_ROBOTS.includes(value)) ||
    !Array.isArray(chemistry) || !chemistry.length || chemistry.some(value => !VALID_CHEMISTRY.includes(value)) ||
    !VALID_DRAINAGE.includes(body.drainage);

  if (invalid) return { error: 'Все поля обязательны и должны содержать допустимые значения' };

  return {
    data: {
      address: body.address.trim(),
      boxes: Number(body.boxes),
      robots,
      chemistry,
      manager: body.manager.trim(),
      drainage: body.drainage
    }
  };
}

function removeUpload(fileName) {
  if (!fileName) return;
  fs.unlink(path.join(uploadDir, path.basename(fileName)), () => {});
}

router.get('/', (req, res) => res.json(db.listObjects()));

router.get('/:id', (req, res) => {
  const object = db.getObject(req.params.id);
  if (!object) return res.status(404).json({ error: 'Объект не найден' });
  res.json(object);
});

router.post('/', upload.single('photo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Фотография обязательна и должна быть PNG, JPG или JPEG' });
  }
  const parsed = parseObjectBody(req.body);
  if (parsed.error) {
    removeUpload(req.file.filename);
    return res.status(400).json({ error: parsed.error });
  }
  const saved = db.insertObject({ photo_url: '/uploads/objects/' + req.file.filename, ...parsed.data });
  res.status(201).json(saved);
});

router.put('/:id', upload.single('photo'), (req, res) => {
  const existing = db.getObject(req.params.id);
  if (!existing) {
    if (req.file) removeUpload(req.file.filename);
    return res.status(404).json({ error: 'Объект не найден' });
  }

  const parsed = parseObjectBody(req.body);
  if (parsed.error) {
    if (req.file) removeUpload(req.file.filename);
    return res.status(400).json({ error: parsed.error });
  }

  const patch = { ...parsed.data };
  if (req.file) {
    patch.photo_url = '/uploads/objects/' + req.file.filename;
  }

  const updated = db.updateObject(req.params.id, patch);
  if (req.file && existing.photo_url) removeUpload(existing.photo_url);
  res.json(updated);
});

module.exports = router;
