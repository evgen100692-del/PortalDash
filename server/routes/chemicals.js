const express = require('express');
const path = require('path');
const fs = require('fs');
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
  { key: 'test_stage', label: 'Этап тестирования' },
  { key: 'result', label: 'Результат тестирования' }
];

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

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\/(png|jpe?g)$/.test(file.mimetype))
});

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

// Разбирает и проверяет тело формы химии. Возвращает { data } либо { error }.
function parseChemicalBody(body) {
  const name = String(body.name || '').trim();
  const supplier = String(body.supplier || '').trim();
  const chem_type = String(body.chem_type || '').trim();
  const price = Number(body.price);
  const volume = Number(body.volume);
  const test_stage = String(body.test_stage || '');
  const result = String(body.result || '');
  const has_docs = body.has_docs === 'true' || body.has_docs === 'on' || body.has_docs === true;

  if (!name || !supplier || !chem_type) return { error: 'Заполните наименование, поставщика и тип химии' };
  if (!Number.isFinite(price) || price < 0) return { error: 'Некорректная цена' };
  if (!Number.isFinite(volume) || volume < 0) return { error: 'Некорректный объём' };
  if (!TEST_STAGES.includes(test_stage)) return { error: 'Некорректный этап тестирования' };
  if (!RESULTS.includes(result)) return { error: 'Некорректный результат тестирования' };

  const stages = [];
  for (let i = 1; i <= 3; i++) {
    const mode = String(body[`stage${i}_mode`] || 'none');
    if (mode !== 'none' && mode !== 'date') return { error: 'Некорректные данные этапа тестирования' };

    if (mode === 'none') {
      stages.push({ stage: STAGE_LABELS[i], date: null, comment: null, object: null });
      continue;
    }

    const date = String(body[`stage${i}_date`] || '');
    const comment = String(body[`stage${i}_comment`] || '').trim();
    const object = String(body[`stage${i}_object`] || '').trim();
    if (!DATE_RE.test(date)) return { error: `Укажите дату тестирования: ${STAGE_LABELS[i]}` };
    if (!comment) return { error: `Добавьте комментарий к тестированию: ${STAGE_LABELS[i]}` };
    // На этапах 2 и 3 при выбранной дате обязателен объект тестирования.
    if ((i === 2 || i === 3) && !object) {
      return { error: `Выберите объект тестирования: ${STAGE_LABELS[i]}` };
    }
    stages.push({ stage: STAGE_LABELS[i], date, comment, object: object || null });
  }

  return { data: { name, price, volume, supplier, chem_type, has_docs, test_stage, result, stages } };
}

router.get('/', (req, res) => res.json(db.listChemicals()));

router.get('/:id', (req, res) => {
  const chemical = db.getChemical(req.params.id);
  if (!chemical) return res.status(404).json({ error: 'Химия не найдена' });
  res.json(chemical);
});

router.post('/', upload.single('photo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Фотография обязательна и должна быть PNG, JPG или JPEG' });
  }
  const parsed = parseChemicalBody(req.body);
  if (parsed.error) {
    removeUpload(req.file.filename);
    return res.status(400).json({ error: parsed.error });
  }
  const saved = db.insertChemical({ photo_url: '/uploads/chemicals/' + req.file.filename, ...parsed.data });
  notifications.record({ entity: 'chemical', entity_id: saved.id, entity_name: saved.name, action: 'create', changes: [] });
  res.status(201).json(saved);
});

router.put('/:id', upload.single('photo'), (req, res) => {
  const existing = db.getChemical(req.params.id);
  if (!existing) {
    if (req.file) removeUpload(req.file.filename);
    return res.status(404).json({ error: 'Химия не найдена' });
  }

  const parsed = parseChemicalBody(req.body);
  if (parsed.error) {
    if (req.file) removeUpload(req.file.filename);
    return res.status(400).json({ error: parsed.error });
  }

  const patch = { ...parsed.data };
  if (req.file) patch.photo_url = '/uploads/chemicals/' + req.file.filename;

  const updated = db.updateChemical(req.params.id, patch);
  if (req.file && existing.photo_url) removeUpload(existing.photo_url);

  const changes = notifications.buildChanges(existing, updated, CHEMICAL_FIELDS).concat(stageChanges(existing, updated));
  if (req.file) changes.push({ field: 'photo', label: 'Фото', from: '—', to: 'обновлено' });
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
