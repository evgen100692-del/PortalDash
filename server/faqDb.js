'use strict';
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'faq.json');
fs.mkdirSync(DATA_DIR, { recursive: true });

// Начальный набор ЧаВо. Пункт «Стандарты химии» — пустой шаблон полей,
// извлечённых из регламента сети; значения заполняет пользователь.
const SEED = [
  {
    id: 1,
    kind: 'standards',
    title: 'Стандарты химии',
    data: {
      doc: {
        title: '',
        supplier: '',
        complexType: '',
        author: '',
        status: '',
        revision: '',
        summary: '',
        qualityControl: ''
      },
      positions: []
    }
  }
];

const POSITION_KEYS = [
  'category', 'name', 'packaging', 'article', 'characteristics',
  'consumption', 'application', 'purpose', 'supplier', 'note'
];

function emptyPosition() {
  const position = {};
  POSITION_KEYS.forEach(key => { position[key] = ''; });
  return position;
}

function read() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch { /* файла ещё нет */ }
  return null;
}

function write(items) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(items, null, 2));
}

function ensure() {
  const existing = read();
  if (existing) return existing;
  write(SEED);
  return JSON.parse(JSON.stringify(SEED));
}

// Приводит data пункта «Стандарты химии» к полной схеме (не теряя введённого).
function normalizeStandards(data) {
  const source = data && typeof data === 'object' ? data : {};
  const doc = source.doc && typeof source.doc === 'object' ? source.doc : {};
  const normalizedDoc = {};
  Object.keys(SEED[0].data.doc).forEach(key => {
    normalizedDoc[key] = doc[key] != null ? String(doc[key]) : '';
  });
  const positions = Array.isArray(source.positions) ? source.positions : [];
  const normalizedPositions = positions.map(item => {
    const base = emptyPosition();
    if (item && typeof item === 'object') {
      POSITION_KEYS.forEach(key => { if (item[key] != null) base[key] = String(item[key]); });
    }
    return base;
  });
  return { doc: normalizedDoc, positions: normalizedPositions };
}

module.exports = {
  emptyPosition,
  list() { return ensure().sort((a, b) => a.id - b.id); },
  get(id) { return ensure().find(item => Number(item.id) === Number(id)) || null; },
  add(payload) {
    const items = ensure();
    const id = items.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
    const saved = {
      id,
      kind: 'text',
      title: String((payload && payload.title) || 'Новый вопрос').trim() || 'Новый вопрос',
      data: { answer: String((payload && payload.answer) || '') }
    };
    items.push(saved);
    write(items);
    return saved;
  },
  update(id, patch) {
    const items = ensure();
    const index = items.findIndex(item => Number(item.id) === Number(id));
    if (index === -1) return null;
    const current = items[index];
    const title = patch && patch.title != null ? String(patch.title).trim() || current.title : current.title;
    let data = current.data;
    if (patch && patch.data != null) {
      data = current.kind === 'standards'
        ? normalizeStandards(patch.data)
        : { answer: String(patch.data.answer || '') };
    }
    items[index] = { ...current, title, data };
    write(items);
    return items[index];
  },
  remove(id) {
    const items = ensure();
    const index = items.findIndex(item => Number(item.id) === Number(id));
    if (index === -1) return null;
    if (items[index].kind === 'standards') return { error: 'Этот пункт нельзя удалить' };
    const [removed] = items.splice(index, 1);
    write(items);
    return removed;
  }
};
