'use strict';
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'notifications.json');
fs.mkdirSync(DATA_DIR, { recursive: true });

const MAX_ENTRIES = 500;

function read() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function write(items) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(items, null, 2));
}

// Сравнивает before/after по описанию полей и возвращает список изменений.
// fields: [{ key, label, format? }]
function buildChanges(before, after, fields) {
  const changes = [];
  const show = (spec, value) => {
    const formatted = spec.format ? spec.format(value) : value;
    return formatted == null || formatted === '' ? '—' : String(formatted);
  };
  fields.forEach(spec => {
    const from = show(spec, before ? before[spec.key] : undefined);
    const to = show(spec, after ? after[spec.key] : undefined);
    if (from !== to) changes.push({ field: spec.key, label: spec.label, from, to });
  });
  return changes;
}

// Совпадает ли уведомление со страницей entity/id (по субъекту или связанным сущностям).
function matchesEntity(note, entity, id) {
  const numId = Number(id);
  if (note.entity === entity && Number(note.entity_id) === numId) return true;
  return (note.related || []).some(ref => ref.entity === entity && Number(ref.id) === numId);
}

module.exports = {
  buildChanges,
  list(filter) {
    let items = read().sort((a, b) => b.id - a.id);
    if (filter && filter.entity && filter.id != null) {
      items = items.filter(note => matchesEntity(note, filter.entity, filter.id));
    }
    return items;
  },
  record(entry) {
    const items = read();
    const id = items.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
    const saved = {
      id,
      created_at: new Date().toISOString(),
      entity: entry.entity,                 // 'object' | 'chemical'
      entity_id: entry.entity_id != null ? Number(entry.entity_id) : null,
      entity_name: entry.entity_name || '',
      action: entry.action,                 // 'create' | 'update' | 'delete'
      changes: Array.isArray(entry.changes) ? entry.changes : [],
      // Доп. страницы, на которых это уведомление тоже должно показываться.
      related: Array.isArray(entry.related)
        ? entry.related.map(ref => ({ entity: ref.entity, id: Number(ref.id), name: ref.name || '' }))
        : []
    };
    items.push(saved);
    if (items.length > MAX_ENTRIES) items.splice(0, items.length - MAX_ENTRIES);
    write(items);
    return saved;
  },
  clear() {
    write([]);
    return { ok: true };
  }
};
