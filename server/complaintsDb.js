'use strict';
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'complaints.json');
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

module.exports = {
  list(objectId) {
    let items = read().sort((a, b) => b.id - a.id);
    if (objectId != null && objectId !== '') {
      items = items.filter(item => Number(item.object_id) === Number(objectId));
    }
    return items;
  },
  insert(entry) {
    const items = read();
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
    write(items);
    return saved;
  },
  remove(id) {
    const items = read();
    const index = items.findIndex(item => Number(item.id) === Number(id));
    if (index === -1) return null;
    const [removed] = items.splice(index, 1);
    write(items);
    return removed;
  }
};
