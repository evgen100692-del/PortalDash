'use strict';
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'chemicals.json');
fs.mkdirSync(DATA_DIR, { recursive: true });

function read() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return []; }
}

function write(items) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(items, null, 2));
}

module.exports = {
  listChemicals() {
    return read().sort((a, b) => b.id - a.id);
  },
  getChemical(id) {
    return read().find(item => Number(item.id) === Number(id)) || null;
  },
  insertChemical(chemical) {
    const items = read();
    const id = items.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
    const saved = { id, created_at: new Date().toISOString(), ...chemical };
    items.push(saved);
    write(items);
    return saved;
  }
};
