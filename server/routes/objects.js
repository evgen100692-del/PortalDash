const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const router = express.Router();
const db = require('../db');
const chemicalsDb = require('../chemicalsDb');
const complaintsDb = require('../complaintsDb');
const notifications = require('../notificationsDb');

const asJoined = value => (Array.isArray(value) ? value : []).join(', ');
const OBJECT_FIELDS = [
  { key: 'name', label: 'Наименование объекта' },
  { key: 'address', label: 'Адрес объекта' },
  { key: 'boxes', label: 'Количество боксов' },
  { key: 'chemistry', label: 'Установленная химия', format: asJoined },
  { key: 'manager', label: 'Управляющий' },
  { key: 'manager_phone', label: 'Телефон управляющего' }
];

const uploadDir = path.join(process.env.PORTALDASH_UPLOAD_DIR || path.join(__dirname, '../../public/uploads'), 'objects');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname || '').toLowerCase().match(/^\.[a-z0-9]{1,8}$/) || [''])[0];
    cb(null, crypto.randomBytes(16).toString('hex') + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'photo' || file.fieldname === 'photos') return cb(null, /^image\/(png|jpe?g)$/.test(file.mimetype));
    return cb(null, true);
  }
});
const eventUpload = upload.fields([{ name: 'photos', maxCount: 10 }, { name: 'documents', maxCount: 10 }]);

// Разбирает поля формы объекта и проверяет ссылки на существующую химию.
function parseObjectBody(body) {
  let chemical_ids;
  try {
    chemical_ids = JSON.parse(body.chemical_ids || '[]');
  } catch {
    return { error: 'Некорректный список химии' };
  }
  chemical_ids = [...new Set((Array.isArray(chemical_ids) ? chemical_ids : []).map(Number).filter(Number.isInteger))];

  const knownChemistry = new Set(chemicalsDb.listChemicals().map(item => Number(item.id)));
  if (chemical_ids.some(value => !knownChemistry.has(value))) {
    return { error: 'Выбранная химия отсутствует в разделе «Химия»' };
  }

  const boxesRaw = String(body.boxes || '').trim();
  let boxes = 0;
  if (boxesRaw) {
    boxes = Number(boxesRaw);
    if (!Number.isInteger(boxes) || boxes < 0) return { error: 'Некорректное количество боксов' };
  }

  return {
    data: {
      name: String(body.name || '').trim(),
      address: String(body.address || '').trim(),
      boxes,
      chemical_ids,
      manager: String(body.manager || '').trim(),
      manager_phone: String(body.manager_phone || '').trim()
    }
  };
}

function presentObject(object, complaintIds) {
  if (!object) return null;
  const names = new Map(chemicalsDb.listChemicals().map(item => [Number(item.id), item.name]));
  return {
    ...object,
    chemistry: object.chemical_ids.map(id => names.get(Number(id))).filter(Boolean),
    has_complaints: complaintIds
      ? complaintIds.has(Number(object.id))
      : complaintsDb.hasForObject(object.id)
  };
}

function removeUpload(fileName) {
  if (!fileName) return;
  fs.unlink(path.join(uploadDir, path.basename(fileName)), () => {});
}

router.get('/', (req, res) => {
  const complaintIds = new Set(complaintsDb.list().map(item => Number(item.object_id)));
  res.json(db.listObjects().map(object => presentObject(object, complaintIds)));
});

router.get('/:id', (req, res) => {
  const object = db.getObject(req.params.id);
  if (!object) return res.status(404).json({ error: 'Объект не найден' });
  res.json(presentObject(object));
});

router.post('/:id/events', eventUpload, (req, res) => {
  const existing = db.getObject(req.params.id);
  const files = Object.values(req.files || {}).flat();
  if (!existing) {
    files.forEach(file => removeUpload(file.filename));
    return res.status(404).json({ error: 'Объект не найден' });
  }
  const date = String(req.body.date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    files.forEach(file => removeUpload(file.filename));
    return res.status(400).json({ error: 'Укажите дату события' });
  }
  const photos = (req.files && req.files.photos) || [];
  const documents = (req.files && req.files.documents) || [];
  const updated = db.addEvent(existing.id, {
    date,
    comment: String(req.body.comment || '').trim(),
    photo_urls: photos.map(file => '/uploads/objects/' + file.filename),
    documents: documents.map(file => ({
      url: '/uploads/objects/' + file.filename,
      name: Buffer.from(file.originalname || file.filename, 'latin1').toString('utf8')
    }))
  });
  notifications.record({
    entity: 'object', entity_id: updated.id, entity_name: updated.name,
    action: 'update', changes: [{ field: 'events', label: 'События', from: '—', to: `добавлено событие от ${date}` }]
  });
  res.status(201).json(presentObject(updated));
});

router.delete('/:id/events/:eventId', (req, res) => {
  const existing = db.getObject(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Объект не найден' });
  const result = db.deleteEvent(existing.id, req.params.eventId);
  if (!result) return res.status(404).json({ error: 'Событие не найдено' });
  (result.event.photo_urls || []).forEach(removeUpload);
  (result.event.documents || []).forEach(file => removeUpload(file.url));
  notifications.record({
    entity: 'object', entity_id: result.object.id, entity_name: result.object.name,
    action: 'update', changes: [{ field: 'events', label: 'События', from: `событие от ${result.event.date}`, to: 'удалено' }]
  });
  res.json(presentObject(result.object));
});

router.post('/', upload.single('photo'), (req, res) => {
  const parsed = parseObjectBody(req.body);
  if (parsed.error) {
    if (req.file) removeUpload(req.file.filename);
    return res.status(400).json({ error: parsed.error });
  }
  if (!parsed.data.address) {
    if (req.file) removeUpload(req.file.filename);
    return res.status(400).json({ error: 'Адрес объекта обязателен' });
  }
  if (!parsed.data.name) {
    if (req.file) removeUpload(req.file.filename);
    return res.status(400).json({ error: 'Наименование объекта обязательно' });
  }
  if (db.findByAddress(parsed.data.address)) {
    if (req.file) removeUpload(req.file.filename);
    return res.status(409).json({ error: 'Объект с таким адресом уже существует' });
  }
  const data = { ...parsed.data };
  if (req.file) data.photo_url = '/uploads/objects/' + req.file.filename;
  const saved = db.insertObject(data);
  notifications.record({ entity: 'object', entity_id: saved.id, entity_name: saved.name || `#${saved.id}`, action: 'create', changes: [] });
  res.status(201).json(presentObject(saved));
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
  if (!parsed.data.address) {
    if (req.file) removeUpload(req.file.filename);
    return res.status(400).json({ error: 'Адрес объекта обязателен' });
  }
  if (!parsed.data.name) {
    if (req.file) removeUpload(req.file.filename);
    return res.status(400).json({ error: 'Наименование объекта обязательно' });
  }
  if (db.findByAddress(parsed.data.address, req.params.id)) {
    if (req.file) removeUpload(req.file.filename);
    return res.status(409).json({ error: 'Объект с таким адресом уже существует' });
  }

  const patch = { ...parsed.data };
  if (req.file) {
    patch.photo_url = '/uploads/objects/' + req.file.filename;
  }

  const updated = db.updateObject(req.params.id, patch);
  if (req.file && existing.photo_url) removeUpload(existing.photo_url);

  const existingPresented = presentObject(existing);
  const updatedPresented = presentObject(updated);
  const changes = notifications.buildChanges(existingPresented, updatedPresented, OBJECT_FIELDS);
  if (req.file) changes.push({ field: 'photo', label: 'Фотография', from: '—', to: 'обновлена' });
  if (changes.length) {
    // Химия, добавленная/убранная с объекта — уведомление появится и на её странице.
    const before = new Set(existing.chemical_ids || []);
    const after = new Set(updated.chemical_ids || []);
    const touched = [...new Set([...before, ...after])].filter(id => before.has(id) !== after.has(id));
    const related = touched
      .map(id => { const c = chemicalsDb.getChemical(id); return c ? { entity: 'chemical', id: c.id, name: c.name } : null; })
      .filter(Boolean);
    notifications.record({ entity: 'object', entity_id: updated.id, entity_name: updated.name, action: 'update', changes, related });
  }
  res.json(updatedPresented);
});

router.delete('/:id', (req, res) => {
  const existing = db.getObject(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Объект не найден' });
  if (chemicalsDb.usesObject(existing.id) || complaintsDb.hasForObject(existing.id)) {
    return res.status(409).json({ error: 'Нельзя удалить объект: с ним связаны тестирования или жалобы' });
  }
  db.deleteObject(req.params.id);
  if (existing.photo_url) removeUpload(existing.photo_url);
  (existing.events || []).forEach(event => {
    (event.photo_urls || []).forEach(removeUpload);
    (event.documents || []).forEach(file => removeUpload(file.url));
  });
  notifications.record({ entity: 'object', entity_id: Number(req.params.id), entity_name: existing.name || existing.address, action: 'delete', changes: [] });
  res.json({ ok: true });
});

module.exports = router;
