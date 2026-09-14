'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'portaldash-api-'));
const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'portaldash-uploads-'));
for (const name of ['objects.json', 'chemicals.json', 'faq.json', 'complaints.json', 'notifications.json']) {
  fs.writeFileSync(path.join(dataDir, name), '[]', 'utf8');
}
process.env.PORTALDASH_DATA_DIR = dataDir;
process.env.PORTALDASH_UPLOAD_DIR = uploadDir;

const { createApp } = require('../server/app');

let server;
let baseUrl;

test.before(async () => {
  server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise(resolve => server.close(resolve));
});

async function json(pathname, options) {
  const response = await fetch(baseUrl + pathname, options);
  const body = await response.json();
  return { response, body };
}

function chemicalForm(name, extra = {}) {
  const form = new FormData();
  form.set('name', name);
  Object.entries(extra).forEach(([key, value]) => form.set(key, String(value)));
  return form;
}

function objectForm(address, chemicalIds = [], name = address) {
  const form = new FormData();
  form.set('name', name);
  form.set('address', address);
  form.set('robots', '[]');
  form.set('chemical_ids', JSON.stringify(chemicalIds));
  return form;
}

test('health checks storage and retired APIs return JSON 404', async () => {
  const health = await json('/api/health');
  assert.equal(health.response.status, 200);
  assert.equal(health.body.status, 'ok');
  assert.equal(health.body.storage.length, 5);

  for (const pathname of ['/api/analytics/summary', '/api/heatmap', '/api/finance/summary', '/api/export/pdf']) {
    const result = await json(pathname);
    assert.equal(result.response.status, 404, pathname);
    assert.equal(result.body.error, 'API-метод не найден');
  }
});

test('object-to-chemical relationship survives a chemical rename and restricts deletion', async () => {
  const createdChemical = await json('/api/chemicals', { method: 'POST', body: chemicalForm('Шампунь') });
  assert.equal(createdChemical.response.status, 201);

  const createdObject = await json('/api/objects', {
    method: 'POST', body: objectForm('Тестовый адрес', [createdChemical.body.id])
  });
  assert.equal(createdObject.response.status, 201);
  assert.deepEqual(createdObject.body.chemical_ids, [createdChemical.body.id]);
  assert.deepEqual(createdObject.body.chemistry, ['Шампунь']);

  const renamed = await json(`/api/chemicals/${createdChemical.body.id}`, {
    method: 'PUT', body: chemicalForm('Новый шампунь')
  });
  assert.equal(renamed.response.status, 200);

  const objectAfterRename = await json(`/api/objects/${createdObject.body.id}`);
  assert.deepEqual(objectAfterRename.body.chemistry, ['Новый шампунь']);

  const blocked = await json(`/api/chemicals/${createdChemical.body.id}`, { method: 'DELETE' });
  assert.equal(blocked.response.status, 409);

  assert.equal((await json(`/api/objects/${createdObject.body.id}`, { method: 'DELETE' })).response.status, 200);
  assert.equal((await json(`/api/chemicals/${createdChemical.body.id}`, { method: 'DELETE' })).response.status, 200);
});

test('required unique domain keys and referenced IDs are validated', async () => {
  assert.equal((await json('/api/chemicals', { method: 'POST', body: chemicalForm('') })).response.status, 400);
  assert.equal((await json('/api/objects', { method: 'POST', body: objectForm('', [], '') })).response.status, 400);
  assert.equal((await json('/api/objects', { method: 'POST', body: objectForm('Есть адрес', [], '') })).response.status, 400);
  assert.equal((await json('/api/objects', { method: 'POST', body: objectForm('A', [999]) })).response.status, 400);

  assert.equal((await json('/api/chemicals', { method: 'POST', body: chemicalForm('Воск') })).response.status, 201);
  assert.equal((await json('/api/chemicals', { method: 'POST', body: chemicalForm('воск') })).response.status, 409);
  assert.equal((await json('/api/objects', { method: 'POST', body: objectForm('Адрес') })).response.status, 201);
  assert.equal((await json('/api/objects', { method: 'POST', body: objectForm('адрес') })).response.status, 409);
});

test('chemical list is ordered by the test date closest to today', async () => {
  const today = new Date();
  const far = new Date(today);
  far.setUTCDate(far.getUTCDate() + 30);
  const asDay = date => date.toISOString().slice(0, 10);

  const distant = await json('/api/chemicals', {
    method: 'POST', body: chemicalForm('Дальняя дата', { stage1_mode: 'date', stage1_date: asDay(far) })
  });
  const closest = await json('/api/chemicals', {
    method: 'POST', body: chemicalForm('Ближайшая дата', { stage1_mode: 'date', stage1_date: asDay(today) })
  });
  assert.equal(distant.response.status, 201);
  assert.equal(closest.response.status, 201);

  const list = await json('/api/chemicals');
  assert.equal(list.body[0].id, closest.body.id);
  assert.ok(list.body.findIndex(item => item.id === closest.body.id) < list.body.findIndex(item => item.id === distant.body.id));
});

test('chemical accepts several photos and removes replaced files', async () => {
  const create = chemicalForm('Химия с галереей');
  create.append('photos', new Blob(['photo-one'], { type: 'image/png' }), 'one.png');
  create.append('photos', new Blob(['photo-two'], { type: 'image/jpeg' }), 'two.jpg');
  const created = await json('/api/chemicals', { method: 'POST', body: create });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.photo_urls.length, 2);
  const oldPaths = created.body.photo_urls.map(url => path.join(uploadDir, 'chemicals', path.basename(url)));
  oldPaths.forEach(file => assert.equal(fs.existsSync(file), true));

  const update = chemicalForm('Химия с галереей');
  update.append('photos', new Blob(['replacement'], { type: 'image/png' }), 'replacement.png');
  const updated = await json(`/api/chemicals/${created.body.id}`, { method: 'PUT', body: update });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.body.photo_urls.length, 1);
  await new Promise(resolve => setTimeout(resolve, 25));
  oldPaths.forEach(file => assert.equal(fs.existsSync(file), false));

  const replacementPath = path.join(uploadDir, 'chemicals', path.basename(updated.body.photo_urls[0]));
  assert.equal((await json(`/api/chemicals/${created.body.id}`, { method: 'DELETE' })).response.status, 200);
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(fs.existsSync(replacementPath), false);
});

test('FAQ and chemical attachments are removed with their owning records', async () => {
  const faqUpload = new FormData();
  faqUpload.set('file', new Blob(['faq-content'], { type: 'text/plain' }), 'note.txt');
  const uploadedFaq = await json('/api/faq/upload-file', { method: 'POST', body: faqUpload });
  assert.equal(uploadedFaq.response.status, 201);
  const faqPath = path.join(uploadDir, 'faq', path.basename(uploadedFaq.body.url));
  assert.equal(fs.existsSync(faqPath), true);

  const createdFaq = await json('/api/faq', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Файл', data: { files: [uploadedFaq.body] } })
  });
  assert.equal(createdFaq.response.status, 201);
  assert.equal((await json(`/api/faq/${createdFaq.body.id}`, { method: 'DELETE' })).response.status, 200);
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(fs.existsSync(faqPath), false);

  const chemicalUpload = chemicalForm('С документом', { has_docs: true });
  chemicalUpload.set('doc_safety', new Blob(['%PDF-test'], { type: 'application/pdf' }), 'safety.pdf');
  const createdChemical = await json('/api/chemicals', { method: 'POST', body: chemicalUpload });
  assert.equal(createdChemical.response.status, 201);
  const documentPath = path.join(uploadDir, 'chemicals', path.basename(createdChemical.body.doc_safety_url));
  assert.equal(fs.existsSync(documentPath), true);
  assert.equal((await json(`/api/chemicals/${createdChemical.body.id}`, { method: 'DELETE' })).response.status, 200);
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(fs.existsSync(documentPath), false);
});
