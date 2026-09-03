const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const router = express.Router();
const db = require('../db');
const chemicalsDb = require('../chemicalsDb');
const notifications = require('../notificationsDb');

const asJoined = value => (Array.isArray(value) ? value : []).join(', ');
const OBJECT_FIELDS = [
  { key: 'address', label: 'Адрес объекта' },
  { key: 'boxes', label: 'Количество боксов/роботов' },
  { key: 'robots', label: 'Установленные роботы', format: asJoined },
  { key: 'chemistry', label: 'Установленная химия', format: asJoined },
  { key: 'manager', label: 'Управляющий' },
  { key: 'drainage', label: 'Водоотведение' }
];

const uploadDir = path.join(__dirname, '../../public/uploads/objects');
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\/(png|jpe?g)$/.test(file.mimetype))
});

const VALID_ROBOTS = ['Рязань', 'RCV'];
const VALID_DRAINAGE = ['Нет', 'Есть', 'УКО'];

// Разбирает поля формы объекта. Все поля необязательны; проверяется только
// допустимость заполненных значений. Возвращает { data } либо { error }.
function parseObjectBody(body) {
  let robots;
  let chemistry;
  try {
    robots = JSON.parse(body.robots || '[]');
    chemistry = JSON.parse(body.chemistry || '[]');
  } catch {
    return { error: 'Некорректные списки роботов или химии' };
  }
  robots = (Array.isArray(robots) ? robots : []).filter(value => typeof value === 'string' && value.trim());
  chemistry = (Array.isArray(chemistry) ? chemistry : []).filter(value => typeof value === 'string' && value.trim());

  if (robots.some(value => !VALID_ROBOTS.includes(value))) {
    return { error: 'Недопустимое значение робота' };
  }

  const knownChemistry = new Set(chemicalsDb.listChemicals().map(item => item.name));
  if (chemistry.some(value => !knownChemistry.has(value))) {
    return { error: 'Выбранная химия отсутствует в разделе «Химия»' };
  }

  const drainage = String(body.drainage || '').trim();
  if (drainage && !VALID_DRAINAGE.includes(drainage)) {
    return { error: 'Недопустимое значение водоотведения' };
  }

  const boxesRaw = String(body.boxes || '').trim();
  let boxes = 0;
  if (boxesRaw) {
    boxes = Number(boxesRaw);
    if (!Number.isFinite(boxes) || boxes < 0) return { error: 'Некорректное количество боксов/роботов' };
  }

  return {
    data: {
      address: String(body.address || '').trim(),
      boxes,
      robots,
      chemistry,
      manager: String(body.manager || '').trim(),
      drainage
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
  const parsed = parseObjectBody(req.body);
  if (parsed.error) {
    if (req.file) removeUpload(req.file.filename);
    return res.status(400).json({ error: parsed.error });
  }
  const data = { ...parsed.data };
  if (req.file) data.photo_url = '/uploads/objects/' + req.file.filename;
  const saved = db.insertObject(data);
  notifications.record({ entity: 'object', entity_id: saved.id, entity_name: saved.address || `#${saved.id}`, action: 'create', changes: [] });
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

  const changes = notifications.buildChanges(existing, updated, OBJECT_FIELDS);
  if (req.file) changes.push({ field: 'photo', label: 'Фотография', from: '—', to: 'обновлена' });
  if (changes.length) {
    // Химия, добавленная/убранная с объекта — уведомление появится и на её странице.
    const before = new Set(Array.isArray(existing.chemistry) ? existing.chemistry : []);
    const after = new Set(Array.isArray(updated.chemistry) ? updated.chemistry : []);
    const touched = [...new Set([...before, ...after])].filter(name => before.has(name) !== after.has(name));
    const known = chemicalsDb.listChemicals();
    const related = touched
      .map(name => { const c = known.find(item => item.name === name); return c ? { entity: 'chemical', id: c.id, name: c.name } : null; })
      .filter(Boolean);
    notifications.record({ entity: 'object', entity_id: updated.id, entity_name: updated.address, action: 'update', changes, related });
  }
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const existing = db.getObject(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Объект не найден' });
  db.deleteObject(req.params.id);
  if (existing.photo_url) removeUpload(existing.photo_url);
  notifications.record({ entity: 'object', entity_id: Number(req.params.id), entity_name: existing.address, action: 'delete', changes: [] });
  res.json({ ok: true });
});

module.exports = router;
