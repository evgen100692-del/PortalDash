'use strict';
const { JsonStore } = require('./jsonStore');
const store = new JsonStore('faq.json');
const FAQ_TOPICS = ['Система работы', 'Ситуации', 'Документы'];

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

function normalizeItem(item) {
  const topic = FAQ_TOPICS.includes(item && item.topic) ? item.topic : FAQ_TOPICS[0];
  const data = (item && item.data) || {};
  return { ...item, topic, data: { answer: String(data.answer || ''), files: normalizeFiles(data.files) } };
}

module.exports = {
  FAQ_TOPICS,
  health: () => store.health(),
  list() { return store.read().map(normalizeItem).sort((a, b) => a.id - b.id); },
  get(id) { const item = store.read().find(item => Number(item.id) === Number(id)); return item ? normalizeItem(item) : null; },
  add(payload) {
    const items = store.read();
    const id = items.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
    const src = (payload && payload.data) || {};
    const saved = {
      id,
      kind: 'text',
      topic: FAQ_TOPICS.includes(payload && payload.topic) ? payload.topic : FAQ_TOPICS[0],
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
    const current = normalizeItem(items[index]);
    const title = patch && patch.title != null ? String(patch.title).trim() || current.title : current.title;
    let data = current.data;
    if (patch && patch.data != null) {
      data = { answer: String(patch.data.answer || ''), files: normalizeFiles(patch.data.files) };
    }
    const topic = patch && patch.topic != null && FAQ_TOPICS.includes(patch.topic) ? patch.topic : current.topic;
    items[index] = { ...current, title, topic, data };
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
