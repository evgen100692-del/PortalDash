const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const router = express.Router();
const db = require('../chemicalsDb');
const objectsDb = require('../db');
const notifications = require('../notificationsDb');

const CHEMICAL_FIELDS = [
  { key: 'name', label: 'Наименование' },
  { key: 'price', label: 'Цена' },
  { key: 'volume', label: 'Объём' },
  { key: 'supplier', label: 'Поставщик' },
  { key: 'chem_type', label: 'Тип химии' },
  { key: 'has_docs', label: 'Наличие документации', format: v => (v ? 'Есть' : 'Нет') },
  { key: 'has_honest_sign', label: 'Честный знак', format: v => (v ? 'Есть' : 'Нет') },
  { key: 'test_stage', label: 'Этап тестирования' },
  { key: 'result', label: 'Результат тестирования' }
];

const truthy = v => v === 'true' || v === 'on' || v === true;

// Дополняет список изменений различиями по этапам тестирования.
function stageChanges(before, after) {
  const changes = [];
  const beforeStages = Array.isArray(before && before.stages) ? before.stages : [];
  const afterStages = Array.isArray(after && after.stages) ? after.stages : [];
  const dash = v => (v == null || v === '' ? '—' : String(v));
  for (let i = 0; i < 3; i++) {
    const a = beforeStages[i] || {};
    const b = afterStages[i] || {};
    const name = b.stage || a.stage || `Этап ${i + 1}`;
    [['date', 'дата'], ['comment', 'комментарий'], ['object', 'объект']].forEach(([key, word]) => {
      if (dash(a[key]) !== dash(b[key])) {
        changes.push({ field: `stage${i + 1}_${key}`, label: `${name} — ${word}`, from: dash(a[key]), to: dash(b[key]) });
      }
    });
  }
  return changes;
}

const uploadDir = path.join(__dirname, '../../public/uploads/chemicals');
fs.mkdirSync(uploadDir, { recursive: true });

// Сохраняем с расширением по типу файла — иначе браузер не понимает, что это PDF.
const EXT_BY_MIME = { 'image/png': '.png', 'image/jpeg': '.jpg', 'application/pdf': '.pdf' };
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const fromName = (path.extname(file.originalname || '').toLowerCase().match(/^\.[a-z0-9]{1,8}$/) || [''])[0];
    const ext = fromName || EXT_BY_MIME[file.mimetype] || '';
    cb(null, crypto.randomBytes(16).toString('hex') + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'photo') return cb(null, /^image\/(png|jpe?g)$/.test(file.mimetype));
    // Документы: PDF или изображение.
    return cb(null, /^(image\/(png|jpe?g)|application\/pdf)$/.test(file.mimetype));
  }
});
const chemUpload = upload.fields([
  { name: 'photo', maxCount: 1 },
  { name: 'doc_safety', maxCount: 1 },
  { name: 'doc_registration', maxCount: 1 }
]);
const pickFile = (req, name) => (req.files && req.files[name] && req.files[name][0]) || null;
const cleanupFiles = req => {
  ['photo', 'doc_safety', 'doc_registration'].forEach(name => {
    const f = pickFile(req, name);
    if (f) removeUpload(f.filename);
  });
};

const TEST_STAGES = [
  'Тестирование не проводилось',
  'Этап №1 - Лабораторный',
  'Этап №2 - Полевой 1 день',
  'Этап №3 - Полевой долгосрочный',
  'Завершено'
];
const RESULTS = [
  'Одобрено',
  'Тестирование не проводилось',
  'Пройден 1 этап тестирования',
  'Пройден 2 этап тестирования',
  'Отправлено на доработку',
  'Отказ'
];
const STAGE_LABELS = [
  'Тестирование не проводилось',
  'Этап №1 - Лабораторный',
  'Этап №2 - Полевой 1 день',
  'Этап №3 - Полевой долгосрочный'
];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function removeUpload(fileName) {
  if (!fileName) return;
  fs.unlink(path.join(uploadDir, path.basename(fileName)), () => {});
}

// Разбирает тело формы химии. Все поля необязательны; проверяется только
// допустимость заполненных значений. Возвращает { data } либо { error }.
function parseChemicalBody(body) {
  const name = String(body.name || '').trim();
  const supplier = String(body.supplier || '').trim();
  const chem_type = String(body.chem_type || '').trim();
  const test_stage = String(body.test_stage || '');
  const result = String(body.result || '');
  const has_docs = truthy(body.has_docs);
  const has_honest_sign = has_docs && truthy(body.has_honest_sign);

  let price = 0;
  if (String(body.price || '').trim()) {
    price = Number(body.price);
    if (!Number.isFinite(price) || price < 0) return { error: 'Некорректная цена' };
  }
  let volume = 0;
  if (String(body.volume || '').trim()) {
    volume = Number(body.volume);
    if (!Number.isFinite(volume) || volume < 0) return { error: 'Некорректный объём' };
  }
  if (test_stage && !TEST_STAGES.includes(test_stage)) return { error: 'Некорректный этап тестирования' };
  if (result && !RESULTS.includes(result)) return { error: 'Некорректный результат тестирования' };

  const stages = [];
  for (let i = 1; i <= 3; i++) {
    const mode = String(body[`stage${i}_mode`] || 'none');
    if (mode !== 'date') {
      stages.push({ stage: STAGE_LABELS[i], date: null, comment: null, object: null });
      continue;
    }
    const date = String(body[`stage${i}_date`] || '').trim();
    if (date && !DATE_RE.test(date)) return { error: `Некорректная дата тестирования: ${STAGE_LABELS[i]}` };
    const comment = String(body[`stage${i}_comment`] || '').trim();
    const object = String(body[`stage${i}_object`] || '').trim();
    stages.push({ stage: STAGE_LABELS[i], date: date || null, comment: comment || null, object: object || null });
  }

  return { data: { name, price, volume, supplier, chem_type, has_docs, has_honest_sign, test_stage, result, stages } };
}

router.get('/', (req, res) => res.json(db.listChemicals()));

router.get('/:id', (req, res) => {
  const chemical = db.getChemical(req.params.id);
  if (!chemical) return res.status(404).json({ error: 'Химия не найдена' });
  res.json(chemical);
});

const CHEM_URL = f => '/uploads/chemicals/' + f.filename;

router.post('/', chemUpload, (req, res) => {
  const parsed = parseChemicalBody(req.body);
  if (parsed.error) {
    cleanupFiles(req);
    return res.status(400).json({ error: parsed.error });
  }
  const data = { ...parsed.data, doc_safety_url: '', doc_registration_url: '' };
  const photo = pickFile(req, 'photo');
  if (photo) data.photo_url = CHEM_URL(photo);
  if (data.has_docs) {
    const safety = pickFile(req, 'doc_safety');
    const reg = pickFile(req, 'doc_registration');
    if (safety) data.doc_safety_url = CHEM_URL(safety);
    if (reg) data.doc_registration_url = CHEM_URL(reg);
  }
  const saved = db.insertChemical(data);
  notifications.record({ entity: 'chemical', entity_id: saved.id, entity_name: saved.name || `#${saved.id}`, action: 'create', changes: [] });
  res.status(201).json(saved);
});

router.put('/:id', chemUpload, (req, res) => {
  const existing = db.getChemical(req.params.id);
  if (!existing) {
    cleanupFiles(req);
    return res.status(404).json({ error: 'Химия не найдена' });
  }

  const parsed = parseChemicalBody(req.body);
  if (parsed.error) {
    cleanupFiles(req);
    return res.status(400).json({ error: parsed.error });
  }

  const patch = { ...parsed.data };
  const photo = pickFile(req, 'photo');
  if (photo) patch.photo_url = CHEM_URL(photo);

  const safety = pickFile(req, 'doc_safety');
  const reg = pickFile(req, 'doc_registration');
  const removeSafety = truthy(req.body.doc_safety_remove);
  const removeReg = truthy(req.body.doc_registration_remove);

  if (!patch.has_docs) {
    patch.doc_safety_url = '';
    patch.doc_registration_url = '';
  } else {
    if (safety) patch.doc_safety_url = CHEM_URL(safety);
    else if (removeSafety) patch.doc_safety_url = '';
    if (reg) patch.doc_registration_url = CHEM_URL(reg);
    else if (removeReg) patch.doc_registration_url = '';
  }

  const updated = db.updateChemical(req.params.id, patch);
  if (photo && existing.photo_url) removeUpload(existing.photo_url);
  if ((safety || removeSafety || !patch.has_docs) && existing.doc_safety_url) removeUpload(existing.doc_safety_url);
  if ((reg || removeReg || !patch.has_docs) && existing.doc_registration_url) removeUpload(existing.doc_registration_url);

  const changes = notifications.buildChanges(existing, updated, CHEMICAL_FIELDS).concat(stageChanges(existing, updated));
  if (photo) changes.push({ field: 'photo', label: 'Фото', from: '—', to: 'обновлено' });
  if (safety) changes.push({ field: 'doc_safety', label: 'Паспорт безопасности', from: '—', to: 'загружен' });
  if (reg) changes.push({ field: 'doc_registration', label: 'Свидетельство о гос. регистрации', from: '—', to: 'загружено' });
  if (removeSafety && !safety && existing.doc_safety_url) changes.push({ field: 'doc_safety', label: 'Паспорт безопасности', from: 'загружен', to: 'удалён' });
  if (removeReg && !reg && existing.doc_registration_url) changes.push({ field: 'doc_registration', label: 'Свидетельство о гос. регистрации', from: 'загружено', to: 'удалено' });
  if (changes.length) {
    // Объекты тестирования, добавленные/убранные в этапах — уведомление появится и на их страницах.
    const stageObjects = stages => new Set((Array.isArray(stages) ? stages : []).map(s => s && s.object).filter(Boolean));
    const before = stageObjects(existing.stages);
    const after = stageObjects(updated.stages);
    const touched = [...new Set([...before, ...after])].filter(addr => before.has(addr) !== after.has(addr));
    const known = objectsDb.listObjects();
    const related = touched
      .map(addr => { const o = known.find(item => item.address === addr); return o ? { entity: 'object', id: o.id, name: o.address } : null; })
      .filter(Boolean);
    notifications.record({ entity: 'chemical', entity_id: updated.id, entity_name: updated.name, action: 'update', changes, related });
  }
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const existing = db.getChemical(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Химия не найдена' });
  db.deleteChemical(req.params.id);
  if (existing.photo_url) removeUpload(existing.photo_url);
  notifications.record({ entity: 'chemical', entity_id: Number(req.params.id), entity_name: existing.name, action: 'delete', changes: [] });
  res.json({ ok: true });
});

module.exports = router;
