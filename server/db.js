'use strict';
const fs = require('fs');
const path = require('path');
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'objects.json');
fs.mkdirSync(DATA_DIR, { recursive: true });
function read() { try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { return []; } }
function write(objects) { fs.writeFileSync(DATA_FILE, JSON.stringify(objects, null, 2)); }
function normalize(object) { return { ...object, boxes: Number(object.boxes), robots: typeof object.robots === 'string' ? object.robots : JSON.stringify(object.robots || []), chemistry: typeof object.chemistry === 'string' ? object.chemistry : JSON.stringify(object.chemistry || []) }; }
module.exports = {
  listObjects() { return read().sort((a, b) => b.id - a.id); },
  insertObject(object) { const objects = read(); const id = objects.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1; const saved = normalize({ id, created_at: new Date().toISOString(), ...object }); objects.push(saved); write(objects); return saved; }
};
