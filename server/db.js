'use strict';
const fs = require('fs');
const path = require('path');
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'objects.json');
fs.mkdirSync(DATA_DIR, { recursive: true });
function read() { try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { return []; } }
function write(objects) { fs.writeFileSync(DATA_FILE, JSON.stringify(objects, null, 2)); }
function normalize(object) { return { ...object, boxes: Number(object.boxes), robots: typeof object.robots === 'string' ? object.robots : JSON.stringify(object.robots || []), chemistry: typeof object.chemistry === 'string' ? object.chemistry : JSON.stringify(object.chemistry || []) }; }
function parseList(value) { if (Array.isArray(value)) return value; try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; } }
function present(object) { return { ...object, boxes: Number(object.boxes), robots: parseList(object.robots), chemistry: parseList(object.chemistry) }; }
module.exports = {
  listObjects() { return read().sort((a, b) => b.id - a.id).map(present); },
  getObject(id) { const object = read().find(item => Number(item.id) === Number(id)); return object ? present(object) : null; },
  insertObject(object) { const objects = read(); const id = objects.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1; const saved = normalize({ id, created_at: new Date().toISOString(), ...object }); objects.push(saved); write(objects); return present(saved); },
  updateObject(id, patch) { const objects = read(); const index = objects.findIndex(item => Number(item.id) === Number(id)); if (index === -1) return null; const current = objects[index]; const merged = normalize({ ...current, ...patch, id: current.id, created_at: current.created_at }); objects[index] = merged; write(objects); return present(merged); },
  deleteObject(id) { const objects = read(); const index = objects.findIndex(item => Number(item.id) === Number(id)); if (index === -1) return null; const [removed] = objects.splice(index, 1); write(objects); return present(removed); }
};
