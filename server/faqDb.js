'use strict';
const { JsonStore } = require('./jsonStore');
const store = new JsonStore('faq.json');

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
  health: () => store.health(),
  list() { return store.read().sort((a, b) => a.id - b.id); },
  get(id) { return store.read().find(item => Number(item.id) === Number(id)) || null; },
  add(payload) {
    const items = store.read();
    const id = items.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
    const src = (payload && payload.data) || {};
    const saved = {
      id,
      kind: 'text',
      title: String((payload && payload.title) || 'Новый вопрос').trim() || 'Новый вопрос',
      data: { answer: String(src.answer || ''), files: normalizeFiles(src.files) }
    };
    items.push(saved);
    store.write(items);
    return saved;
  },
  update(id, patch) {
    const items = store.read();
    const index = items.findIndex(item => Number(item.id) === Number(id));
    if (index === -1) return null;
    const current = items[index];
    const title = patch && patch.title != null ? String(patch.title).trim() || current.title : current.title;
    let data = current.data;
    if (patch && patch.data != null) {
      data = { answer: String(patch.data.answer || ''), files: normalizeFiles(patch.data.files) };
    }
    items[index] = { ...current, title, data };
    store.write(items);
    return items[index];
  },
  remove(id) {
    const items = store.read();
    const index = items.findIndex(item => Number(item.id) === Number(id));
    if (index === -1) return null;
    const [removed] = items.splice(index, 1);
    store.write(items);
    return removed;
  }
};
