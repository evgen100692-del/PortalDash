'use strict';
const { JsonStore } = require('./jsonStore');
const store = new JsonStore('notifications.json');

const MAX_ENTRIES = 500;

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
  health: () => store.health(),
  list(filter) {
    let items = store.read().sort((a, b) => b.id - a.id);
    if (filter && filter.entity && filter.id != null) {
      items = items.filter(note => matchesEntity(note, filter.entity, filter.id));
    }
    return items;
  },
  record(entry) {
    const items = store.read();
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
    store.write(items);
    return saved;
  },
  clear() {
    store.write([]);
    return { ok: true };
  }
};
