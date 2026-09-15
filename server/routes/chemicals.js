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

const uploadDir = path.join(process.env.PORTALDASH_UPLOAD_DIR || path.join(__dirname, '../../public/uploads'), 'chemicals');
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
    if (file.fieldname === 'photos') return cb(null, /^image\/(png|jpe?g)$/.test(file.mimetype));
    // Документы: PDF или изображение.
    return cb(null, /^(image\/(png|jpe?g)|application\/pdf)$/.test(file.mimetype));
  }
});
const chemUpload = upload.fields([
  { name: 'photos', maxCount: 10 },
  { name: 'doc_safety', maxCount: 1 },
  { name: 'doc_registration', maxCount: 1 },
  { name: 'doc_other', maxCount: 10 }
]);
const pickFile = (req, name) => (req.files && req.files[name] && req.files[name][0]) || null;
const pickFiles = (req, name) => (req.files && req.files[name]) || [];
const cleanupFiles = req => {
  Object.values(req.files || {}).flat().forEach(file => removeUpload(file.filename));
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

// Разбирает тело формы химии и проверяет ссылки на объекты тестирования.
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
      stages.push({ stage: STAGE_LABELS[i], date: null, comment: null, object_id: null });
      continue;
    }
    const date = String(body[`stage${i}_date`] || '').trim();
    if (date && !DATE_RE.test(date)) return { error: `Некорректная дата тестирования: ${STAGE_LABELS[i]}` };
    const comment = String(body[`stage${i}_comment`] || '').trim();
    const objectRaw = String(body[`stage${i}_object`] || '').trim();
    const object_id = objectRaw ? Number(objectRaw) : null;
    if (object_id != null && (!Number.isInteger(object_id) || !objectsDb.getObject(object_id))) {
      return { error: `Некорректный объект тестирования: ${STAGE_LABELS[i]}` };
    }
    stages.push({ stage: STAGE_LABELS[i], date: date || null, comment: comment || null, object_id });
  }

  return { data: { name, price, volume, supplier, chem_type, has_docs, has_honest_sign, test_stage, result, stages } };
}

function presentChemical(chemical) {
  if (!chemical) return null;
  return {
    ...chemical,
    stages: (chemical.stages || []).map(stage => {
      const object = stage.object_id == null ? null : objectsDb.getObject(stage.object_id);
      return { ...stage, object: object ? (object.name || object.address) : null };
    })
  };
}

router.get('/', (req, res) => res.json(db.listChemicals().map(presentChemical)));

router.get('/:id', (req, res) => {
  const chemical = db.getChemical(req.params.id);
  if (!chemical) return res.status(404).json({ error: 'Химия не найдена' });
  res.json(presentChemical(chemical));
});

const CHEM_URL = f => '/uploads/chemicals/' + f.filename;
const originalName = file => Buffer.from(file.originalname || file.filename, 'latin1').toString('utf8');

function resolveOtherDocuments(raw, files, existing = []) {
  let keep = existing;
  if (raw != null && raw !== '') {
    try { keep = JSON.parse(raw); } catch { return { error: 'Некорректный список прочей документации' }; }
    if (!Array.isArray(keep)) return { error: 'Некорректный список прочей документации' };
    const existingByUrl = new Map(existing.map(file => [file.url, file]));
    if (keep.some(url => !existingByUrl.has(String(url)))) return { error: 'В списке прочей документации указан неизвестный файл' };
    keep = [...new Set(keep.map(String))].map(url => existingByUrl.get(url));
  }
  const added = files.map(file => ({ url: CHEM_URL(file), name: originalName(file) }));
  const documents = [...keep, ...added];
  if (documents.length > 10) return { error: 'Можно загрузить не более 10 файлов прочей документации' };
  return { documents };
}

function resolveOtherDocumentOrder(raw, files, existing = [], legacyKeep) {
  if (raw == null || raw === '') return resolveOtherDocuments(legacyKeep, files, existing);
  let order;
  try { order = JSON.parse(raw); } catch { return { error: 'Некорректный порядок прочей документации' }; }
  if (!Array.isArray(order)) return { error: 'Некорректный порядок прочей документации' };
  const existingByUrl = new Map(existing.map(file => [file.url, file]));
  const used = new Set();
  const documents = [];
  for (const token of order) {
    const value = String(token || '');
    let document;
    if (value.startsWith('new:')) {
      const index = Number(value.slice(4));
      if (!Number.isInteger(index) || !files[index]) return { error: 'Некорректный порядок новых документов' };
      document = { url: CHEM_URL(files[index]), name: originalName(files[index]) };
    } else {
      document = existingByUrl.get(value);
      if (!document) return { error: 'В порядке прочей документации указан неизвестный файл' };
    }
    if (used.has(document.url)) return { error: 'Документ повторяется в порядке отображения' };
    used.add(document.url);
    documents.push(document);
  }
  if (files.some(file => !used.has(CHEM_URL(file)))) return { error: 'Не все новые документы добавлены в порядок' };
  if (documents.length > 10) return { error: 'Можно загрузить не более 10 файлов прочей документации' };
  return { documents };
}

function resolvePhotoOrder(raw, photos, existingUrls = []) {
  if (raw == null || raw === '') return null;
  let order;
  try { order = JSON.parse(raw); } catch { return { error: 'Некорректный порядок фотографий' }; }
  if (!Array.isArray(order)) return { error: 'Некорректный порядок фотографий' };
  const existing = new Set(existingUrls);
  const used = new Set();
  const urls = [];
  for (const token of order) {
    const value = String(token || '');
    let url = value;
    if (value.startsWith('new:')) {
      const index = Number(value.slice(4));
      if (!Number.isInteger(index) || !photos[index]) return { error: 'Некорректный порядок новых фотографий' };
      url = CHEM_URL(photos[index]);
    } else if (!existing.has(value)) {
      return { error: 'В порядке фотографий указан неизвестный файл' };
    }
    if (used.has(url)) return { error: 'Фотография повторяется в порядке отображения' };
    used.add(url);
    urls.push(url);
  }
  if (photos.some(file => !used.has(CHEM_URL(file)))) return { error: 'Не все новые фотографии добавлены в порядок' };
  if (urls.length > 10) return { error: 'Можно загрузить не более 10 фотографий' };
  return { urls };
}

router.post('/', chemUpload, (req, res) => {
  const parsed = parseChemicalBody(req.body);
  if (parsed.error) {
    cleanupFiles(req);
    return res.status(400).json({ error: parsed.error });
  }
  if (!parsed.data.name) {
    cleanupFiles(req);
    return res.status(400).json({ error: 'Наименование химии обязательно' });
  }
  if (db.findByName(parsed.data.name)) {
    cleanupFiles(req);
    return res.status(409).json({ error: 'Химия с таким наименованием уже существует' });
  }
  const data = { ...parsed.data, doc_safety_url: '', doc_registration_url: '', other_documents: [] };
  const photos = pickFiles(req, 'photos');
  const orderedPhotos = resolvePhotoOrder(req.body.photo_order, photos);
  if (orderedPhotos && orderedPhotos.error) {
    cleanupFiles(req);
    return res.status(400).json({ error: orderedPhotos.error });
  }
  data.photo_urls = orderedPhotos ? orderedPhotos.urls : photos.map(CHEM_URL);
  const otherFiles = pickFiles(req, 'doc_other');
  const otherDocuments = resolveOtherDocumentOrder(req.body.doc_other_order, otherFiles, [], req.body.doc_other_keep);
  if (otherDocuments.error) {
    cleanupFiles(req);
    return res.status(400).json({ error: otherDocuments.error });
  }
  data.other_documents = otherDocuments.documents;
  if (data.has_docs) {
    const safety = pickFile(req, 'doc_safety');
    const reg = pickFile(req, 'doc_registration');
    if (safety) data.doc_safety_url = CHEM_URL(safety);
    if (reg) data.doc_registration_url = CHEM_URL(reg);
  } else {
    ['doc_safety', 'doc_registration'].forEach(name => {
      const file = pickFile(req, name);
      if (file) removeUpload(file.filename);
    });
  }
  const saved = db.insertChemical(data);
  notifications.record({ entity: 'chemical', entity_id: saved.id, entity_name: saved.name || `#${saved.id}`, action: 'create', changes: [] });
  res.status(201).json(presentChemical(saved));
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
  if (!parsed.data.name) {
    cleanupFiles(req);
    return res.status(400).json({ error: 'Наименование химии обязательно' });
  }
  if (db.findByName(parsed.data.name, req.params.id)) {
    cleanupFiles(req);
    return res.status(409).json({ error: 'Химия с таким наименованием уже существует' });
  }

  const patch = { ...parsed.data };
  const photos = pickFiles(req, 'photos');
  const orderedPhotos = resolvePhotoOrder(req.body.photo_order, photos, existing.photo_urls || []);
  if (orderedPhotos && orderedPhotos.error) {
    cleanupFiles(req);
    return res.status(400).json({ error: orderedPhotos.error });
  }
  if (orderedPhotos) patch.photo_urls = orderedPhotos.urls;
  else if (photos.length) patch.photo_urls = photos.map(CHEM_URL);

  const safety = pickFile(req, 'doc_safety');
  const reg = pickFile(req, 'doc_registration');
  const otherFiles = pickFiles(req, 'doc_other');
  const removeSafety = truthy(req.body.doc_safety_remove);
  const removeReg = truthy(req.body.doc_registration_remove);
  const otherDocuments = resolveOtherDocumentOrder(req.body.doc_other_order, otherFiles, existing.other_documents || [], req.body.doc_other_keep);
  if (otherDocuments.error) {
    cleanupFiles(req);
    return res.status(400).json({ error: otherDocuments.error });
  }

  if (!patch.has_docs) {
    patch.doc_safety_url = '';
    patch.doc_registration_url = '';
  } else {
    if (safety) patch.doc_safety_url = CHEM_URL(safety);
    else if (removeSafety) patch.doc_safety_url = '';
    if (reg) patch.doc_registration_url = CHEM_URL(reg);
    else if (removeReg) patch.doc_registration_url = '';
  }
  if (otherFiles.length || req.body.doc_other_order != null || req.body.doc_other_keep != null) patch.other_documents = otherDocuments.documents;

  const updated = db.updateChemical(req.params.id, patch);
  if (patch.photo_urls) (existing.photo_urls || []).filter(url => !patch.photo_urls.includes(url)).forEach(removeUpload);
  if ((safety || removeSafety || !patch.has_docs) && existing.doc_safety_url) removeUpload(existing.doc_safety_url);
  if ((reg || removeReg || !patch.has_docs) && existing.doc_registration_url) removeUpload(existing.doc_registration_url);
  if (patch.other_documents) {
    const keptUrls = new Set(patch.other_documents.map(file => file.url));
    (existing.other_documents || []).filter(file => !keptUrls.has(file.url)).forEach(file => removeUpload(file.url));
  }

  const existingPresented = presentChemical(existing);
  const updatedPresented = presentChemical(updated);
  const changes = notifications.buildChanges(existingPresented, updatedPresented, CHEMICAL_FIELDS).concat(stageChanges(existingPresented, updatedPresented));
  if (patch.photo_urls && JSON.stringify(existing.photo_urls || []) !== JSON.stringify(patch.photo_urls)) changes.push({ field: 'photos', label: 'Фотографии', from: `${(existing.photo_urls || []).length}`, to: `${patch.photo_urls.length}` });
  if (safety) changes.push({ field: 'doc_safety', label: 'Паспорт безопасности', from: '—', to: 'загружен' });
  if (reg) changes.push({ field: 'doc_registration', label: 'Свидетельство о гос. регистрации', from: '—', to: 'загружено' });
  if (otherFiles.length) changes.push({ field: 'doc_other', label: 'Прочая документация', from: `${(existing.other_documents || []).length}`, to: `${updated.other_documents.length}` });
  if (removeSafety && !safety && existing.doc_safety_url) changes.push({ field: 'doc_safety', label: 'Паспорт безопасности', from: 'загружен', to: 'удалён' });
  if (removeReg && !reg && existing.doc_registration_url) changes.push({ field: 'doc_registration', label: 'Свидетельство о гос. регистрации', from: 'загружено', to: 'удалено' });
  if (patch.other_documents && !otherFiles.length && patch.other_documents.length !== (existing.other_documents || []).length) changes.push({ field: 'doc_other', label: 'Прочая документация', from: `${(existing.other_documents || []).length}`, to: `${patch.other_documents.length}` });
  if (changes.length) {
    // Объекты тестирования, добавленные/убранные в этапах — уведомление появится и на их страницах.
    const stageObjects = stages => new Set((Array.isArray(stages) ? stages : []).map(s => s && s.object_id).filter(id => id != null));
    const before = stageObjects(existing.stages);
    const after = stageObjects(updated.stages);
    const touched = [...new Set([...before, ...after])].filter(id => before.has(id) !== after.has(id));
    const related = touched
      .map(id => { const o = objectsDb.getObject(id); return o ? { entity: 'object', id: o.id, name: o.name || o.address } : null; })
      .filter(Boolean);
    notifications.record({ entity: 'chemical', entity_id: updated.id, entity_name: updated.name, action: 'update', changes, related });
  }
  res.json(updatedPresented);
});

router.delete('/:id', (req, res) => {
  const existing = db.getChemical(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Химия не найдена' });
  if (objectsDb.usesChemical(existing.id)) {
    return res.status(409).json({ error: 'Нельзя удалить химию: она используется на объектах' });
  }
  db.deleteChemical(req.params.id);
  (existing.photo_urls || []).forEach(removeUpload);
  if (existing.doc_safety_url) removeUpload(existing.doc_safety_url);
  if (existing.doc_registration_url) removeUpload(existing.doc_registration_url);
  (existing.other_documents || []).forEach(file => removeUpload(file.url));
  notifications.record({ entity: 'chemical', entity_id: Number(req.params.id), entity_name: existing.name, action: 'delete', changes: [] });
  res.json({ ok: true });
});

module.exports = router;
