'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { JsonStore } = require('../server/jsonStore');

test('JsonStore writes atomically and keeps the previous version as backup', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'portaldash-store-'));
  const store = new JsonStore('items.json', { dataDir });

  store.write([{ id: 1 }]);
  store.write([{ id: 1 }, { id: 2 }]);

  assert.deepEqual(store.read(), [{ id: 1 }, { id: 2 }]);
  assert.deepEqual(JSON.parse(fs.readFileSync(store.backupFile, 'utf8')), [{ id: 1 }]);
  assert.equal(fs.readdirSync(dataDir).some(name => name.endsWith('.tmp')), false);
});
test('JsonStore fails closed when canonical JSON is corrupt', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'portaldash-corrupt-'));
  const store = new JsonStore('items.json', { dataDir });
  fs.writeFileSync(store.file, '{broken', 'utf8');

  assert.throws(() => store.read(), error => error.code === 'DATA_STORE_CORRUPT');
  assert.equal(store.health().ok, false);
  assert.equal(fs.readFileSync(store.file, 'utf8'), '{broken');
});
