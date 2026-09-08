'use strict';
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'faq.json');
fs.mkdirSync(DATA_DIR, { recursive: true });

function read() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function write(items) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(items, null, 2));
}

// Убираем устаревший неудаляемый пункт «Стандарты химии», если он есть в файле.
function load() {
  const items = read();
  const cleaned = items.filter(item => item && item.kind !== 'standards');
  if (cleaned.length !== items.length) write(cleaned);
  return cleaned;
}

function normalizeFiles(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map(file => ({
      url: String((file && file.url) || '').trim(),
      name: String((file && file.name) || '').trim(),
      comment: String((file && file.comment) || '').trim()
    }))
    .filter(file => file.url);
}

module.exports = {
  list() { return load().sort((a, b) => a.id - b.id); },
  get(id) { return load().find(item => Number(item.id) === Number(id)) || null; },
  add(payload) {
    const items = load();
    const id = items.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
    const src = (payload && payload.data) || {};
    const saved = {
      id,
      kind: 'text',
      title: String((payload && payload.title) || 'Новый вопрос').trim() || 'Новый вопрос',
      data: { answer: String(src.answer || ''), files: normalizeFiles(src.files) }
    };
    items.push(saved);
    write(items);
    return saved;
  },
  update(id, patch) {
    const items = load();
    const index = items.findIndex(item => Number(item.id) === Number(id));
    if (index === -1) return null;
    const current = items[index];
    const title = patch && patch.title != null ? String(patch.title).trim() || current.title : current.title;
    let data = current.data;
    if (patch && patch.data != null) {
      data = { answer: String(patch.data.answer || ''), files: normalizeFiles(patch.data.files) };
    }
    items[index] = { ...current, title, data };
    write(items);
    return items[index];
  },
  remove(id) {
    const items = load();
    const index = items.findIndex(item => Number(item.id) === Number(id));
    if (index === -1) return null;
    const [removed] = items.splice(index, 1);
    write(items);
    return removed;
  }
};
