'use strict';
const { JsonStore, DataStoreError } = require('./jsonStore');
const store = new JsonStore('objects.json');
function read() {
  const items = store.read();
  if (items.some(item => Object.hasOwn(item, 'chemistry') || typeof item.robots === 'string' || !String(item.name || '').trim())) {
    throw new DataStoreError('Требуется миграция objects.json: выполните npm run migrate:data -- --apply', {
      code: 'DATA_MIGRATION_REQUIRED', file: store.file
    });
  }
  return items;
}
function parseList(value) { if (Array.isArray(value)) return value; try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; } }
function parseIds(value) { return [...new Set(parseList(value).map(Number).filter(Number.isInteger))]; }
function normalize(object) {
  const normalized = {
    ...object,
    name: String(object.name || object.address || '').trim(),
    boxes: Number(object.boxes),
    robots: parseList(object.robots).filter(value => typeof value === 'string'),
    chemical_ids: parseIds(object.chemical_ids)
  };
  delete normalized.chemistry;
  return normalized;
}
function present(object) { return normalize(object); }
module.exports = {
  health() { try { const items = read(); return { ok: true, file: store.file, entries: items.length }; } catch (error) { return { ok: false, file: store.file, code: error.code, message: error.message }; } },
  listObjects() { return read().sort((a, b) => b.id - a.id).map(present); },
  getObject(id) { const object = read().find(item => Number(item.id) === Number(id)); return object ? present(object) : null; },
  findByAddress(address, exceptId) { return read().find(item => Number(item.id) !== Number(exceptId) && String(item.address || '').localeCompare(String(address || ''), 'ru', { sensitivity: 'accent' }) === 0) || null; },
  usesChemical(id) { return read().some(item => parseIds(item.chemical_ids).includes(Number(id))); },
  insertObject(object) { const objects = read(); const id = objects.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1; const saved = normalize({ id, created_at: new Date().toISOString(), ...object }); objects.push(saved); store.write(objects); return present(saved); },
  updateObject(id, patch) { const objects = read(); const index = objects.findIndex(item => Number(item.id) === Number(id)); if (index === -1) return null; const current = objects[index]; const merged = normalize({ ...current, ...patch, id: current.id, created_at: current.created_at }); objects[index] = merged; store.write(objects); return present(merged); },
  deleteObject(id) { const objects = read(); const index = objects.findIndex(item => Number(item.id) === Number(id)); if (index === -1) return null; const [removed] = objects.splice(index, 1); store.write(objects); return present(removed); }
};
