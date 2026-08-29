const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const router = express.Router();
const db = require('../chemicalsDb');

const uploadDir = path.join(__dirname, '../../public/uploads/chemicals');
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\/(png|jpe?g)$/.test(file.mimetype))
});

const TEST_STAGES = [
  'Этап №1 - Лабораторный',
  'Этап №2 - Полевой 1 день',
  'Этап №3 - Полевой долгосрочный',
  'Завершено'
];
const RESULTS = [
  'Одобрено',
  'Пройден 1 этап тестирования',
  'Пройден 2 этап тестирования',
  'Отправлено на доработку',
  'Отказ'
];
const STAGE_LABELS = [
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
  const test_stage = String(body.test_stage || '');
  const result = String(body.result || '');
  const has_docs = body.has_docs === 'true' || body.has_docs === 'on' || body.has_docs === true;

  if (!name || !supplier || !chem_type) return { error: 'Заполните наименование, поставщика и тип химии' };
  if (!Number.isFinite(price) || price < 0) return { error: 'Некорректная цена' };
  if (!TEST_STAGES.includes(test_stage)) return { error: 'Некорректный этап тестирования' };
  if (!RESULTS.includes(result)) return { error: 'Некорректный результат тестирования' };

  const stages = [];
  for (let i = 1; i <= 3; i++) {
    const mode = String(body[`stage${i}_mode`] || 'none');
    if (mode !== 'none' && mode !== 'date') return { error: 'Некорректные данные этапа тестирования' };

    if (mode === 'none') {
      stages.push({ stage: STAGE_LABELS[i - 1], date: null, comment: null });
      continue;
    }

    const date = String(body[`stage${i}_date`] || '');
    const comment = String(body[`stage${i}_comment`] || '').trim();
    if (!DATE_RE.test(date)) return { error: `Укажите дату тестирования: ${STAGE_LABELS[i - 1]}` };
    if (!comment) return { error: `Добавьте комментарий к тестированию: ${STAGE_LABELS[i - 1]}` };
    stages.push({ stage: STAGE_LABELS[i - 1], date, comment });
  }

  return { data: { name, price, supplier, chem_type, has_docs, test_stage, result, stages } };
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
  res.status(201).json(saved);
});

module.exports = router;
