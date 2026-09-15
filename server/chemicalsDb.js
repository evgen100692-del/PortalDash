'use strict';
const { JsonStore, DataStoreError } = require('./jsonStore');
const store = new JsonStore('chemicals.json');

function read() {
  const items = store.read();
  if (items.some(item => Object.hasOwn(item, 'photo_url') || (item.stages || []).some(stage => Object.hasOwn(stage, 'object')))) {
    throw new DataStoreError('Требуется миграция chemicals.json: выполните npm run migrate:data -- --apply', {
      code: 'DATA_MIGRATION_REQUIRED', file: store.file
    });
  }
  return items;
}

function normalize(item) {
  const otherDocuments = Array.isArray(item.other_documents) ? [...item.other_documents] : [];
  if (item.doc_other_url && !otherDocuments.some(file => file && file.url === item.doc_other_url)) {
    otherDocuments.push({ url: item.doc_other_url, name: 'Документ' });
  }
  const normalized = {
    ...item,
    photo_urls: Array.isArray(item.photo_urls) ? [...new Set(item.photo_urls.filter(value => typeof value === 'string' && value.trim()))] : [],
    other_documents: otherDocuments.map(file => ({
      url: String((file && file.url) || '').trim(),
      name: String((file && file.name) || '').trim() || 'Документ'
    })).filter(file => file.url),
    stages: (Array.isArray(item.stages) ? item.stages : []).map(stage => {
      const normalized = { ...stage, object_id: stage.object_id == null || stage.object_id === '' ? null : Number(stage.object_id) };
      delete normalized.object;
      return normalized;
    })
  };
  delete normalized.photo_url;
  delete normalized.doc_other_url;
  return normalized;
}

function closestTestDateDistance(item, now = Date.now()) {
  const distances = (item.stages || [])
    .map(stage => Date.parse(`${stage.date || ''}T00:00:00`))
    .filter(Number.isFinite)
    .map(timestamp => Math.abs(timestamp - now));
  return distances.length ? Math.min(...distances) : Number.POSITIVE_INFINITY;
}

module.exports = {
  listChemicals() {
    const now = Date.now();
    return read().map(normalize).sort((a, b) => {
      const byDate = closestTestDateDistance(a, now) - closestTestDateDistance(b, now);
      return Number.isNaN(byDate) || byDate === 0 ? b.id - a.id : byDate;
    });
  },
  getChemical(id) {
    const item = read().find(item => Number(item.id) === Number(id));
    return item ? normalize(item) : null;
  },
  health() { try { const items = read(); return { ok: true, file: store.file, entries: items.length }; } catch (error) { return { ok: false, file: store.file, code: error.code, message: error.message }; } },
  findByName(name, exceptId) { return read().find(item => Number(item.id) !== Number(exceptId) && String(item.name || '').localeCompare(String(name || ''), 'ru', { sensitivity: 'accent' }) === 0) || null; },
  usesObject(id) { return read().some(item => (item.stages || []).some(stage => Number(stage.object_id) === Number(id))); },
  insertChemical(chemical) {
    const items = read();
    const id = items.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
    const saved = normalize({ id, created_at: new Date().toISOString(), ...chemical });
    items.push(saved);
    store.write(items);
    return saved;
  },
  updateChemical(id, patch) {
    const items = read();
    const index = items.findIndex(item => Number(item.id) === Number(id));
    if (index === -1) return null;
    const current = items[index];
    const merged = normalize({ ...current, ...patch, id: current.id, created_at: current.created_at });
    items[index] = merged;
    store.write(items);
    return merged;
  },
  deleteChemical(id) {
    const items = read();
    const index = items.findIndex(item => Number(item.id) === Number(id));
    if (index === -1) return null;
    const [removed] = items.splice(index, 1);
    store.write(items);
    return removed;
  }
};
