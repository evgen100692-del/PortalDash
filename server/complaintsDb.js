'use strict';
const { JsonStore } = require('./jsonStore');
const store = new JsonStore('complaints.json');

module.exports = {
  list(objectId) {
    let items = store.read().sort((a, b) => b.id - a.id);
    if (objectId != null && objectId !== '') {
      items = items.filter(item => Number(item.object_id) === Number(objectId));
    }
    return items;
  },
  health: () => store.health(),
  hasForObject(objectId) { return store.read().some(item => Number(item.object_id) === Number(objectId)); },
  insert(entry) {
    const items = store.read();
    const id = items.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
    const saved = {
      id,
      created_at: new Date().toISOString(),
      object_id: Number(entry.object_id),
      subject: String(entry.subject || '').trim(),
      date: String(entry.date || '').trim(),
      about_chemistry: !!entry.about_chemistry,
      chemical_name: entry.about_chemistry ? String(entry.chemical_name || '').trim() : '',
      comment: String(entry.comment || '').trim()
    };
    items.push(saved);
    store.write(items);
    return saved;
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
