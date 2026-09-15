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

test('objects expose complaint state and accept and delete dated events with attachments', async () => {
  const createdObject = await json('/api/objects', {
    method: 'POST', body: objectForm('Событийный адрес', [], 'Событийный объект')
  });
  assert.equal(createdObject.response.status, 201);
  assert.equal(createdObject.body.has_complaints, false);
  assert.deepEqual(createdObject.body.events, []);
  assert.equal(Object.hasOwn(createdObject.body, 'robots'), false);
  assert.equal(Object.hasOwn(createdObject.body, 'drainage'), false);

  const complaint = await json('/api/complaints', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ object_id: createdObject.body.id, subject: 'Замечание' })
  });
  assert.equal(complaint.response.status, 201);
  const withComplaint = await json(`/api/objects/${createdObject.body.id}`);
  assert.equal(withComplaint.body.has_complaints, true);

  const event = new FormData();
  event.set('date', '2026-09-15');
  event.set('comment', 'Проведено обслуживание');
  event.append('photos', new Blob(['event-photo'], { type: 'image/png' }), 'event.png');
  event.append('documents', new Blob(['event-doc'], { type: 'text/plain' }), 'report.txt');
  const added = await json(`/api/objects/${createdObject.body.id}/events`, { method: 'POST', body: event });
  assert.equal(added.response.status, 201);
  assert.equal(added.body.events.length, 1);
  assert.equal(added.body.events[0].date, '2026-09-15');
  assert.equal(added.body.events[0].photo_urls.length, 1);
  assert.equal(added.body.events[0].documents[0].name, 'report.txt');

  const eventPhotoPath = path.join(uploadDir, 'objects', path.basename(added.body.events[0].photo_urls[0]));
  const eventDocumentPath = path.join(uploadDir, 'objects', path.basename(added.body.events[0].documents[0].url));
  const removed = await json(`/api/objects/${createdObject.body.id}/events/${added.body.events[0].id}`, { method: 'DELETE' });
  assert.equal(removed.response.status, 200);
  assert.deepEqual(removed.body.events, []);
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(fs.existsSync(eventPhotoPath), false);
  assert.equal(fs.existsSync(eventDocumentPath), false);

  const missingEvent = await json(`/api/objects/${createdObject.body.id}/events/999`, { method: 'DELETE' });
  assert.equal(missingEvent.response.status, 404);
});

test('FAQ topics are validated and returned with a default for old-compatible payloads', async () => {
  const created = await json('/api/faq', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Как работает?', topic: 'Система работы', data: { answer: 'Так' } })
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.topic, 'Система работы');

  const invalid = await json('/api/faq', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Ошибка', topic: 'Неизвестная тема', data: {} })
  });
  assert.equal(invalid.response.status, 400);
});

test('chemical photos can be retained, reordered and other documentation is independent from important documents', async () => {
  const create = chemicalForm('Упорядоченная галерея', { has_docs: false });
  create.append('photos', new Blob(['one'], { type: 'image/png' }), 'one.png');
  create.append('photos', new Blob(['two'], { type: 'image/jpeg' }), 'two.jpg');
  create.set('photo_order', JSON.stringify(['new:0', 'new:1']));
  create.set('doc_other', new Blob(['%PDF-other'], { type: 'application/pdf' }), 'other.pdf');
  create.append('doc_other', new Blob(['%PDF-guide'], { type: 'application/pdf' }), 'guide.pdf');
  create.set('doc_other_order', JSON.stringify(['new:1', 'new:0']));
  const created = await json('/api/chemicals', { method: 'POST', body: create });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.photo_urls.length, 2);
  assert.equal(created.body.has_docs, false);
  assert.deepEqual(created.body.other_documents.map(file => file.name), ['guide.pdf', 'other.pdf']);

  const update = chemicalForm('Упорядоченная галерея', { has_docs: false });
  update.append('photos', new Blob(['three'], { type: 'image/png' }), 'three.png');
  update.set('photo_order', JSON.stringify([created.body.photo_urls[1], 'new:0']));
  update.set('doc_other_order', JSON.stringify([created.body.other_documents[1].url]));
  const updated = await json(`/api/chemicals/${created.body.id}`, { method: 'PUT', body: update });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.body.photo_urls[0], created.body.photo_urls[1]);
  assert.equal(updated.body.photo_urls.length, 2);
  assert.equal(updated.body.has_docs, false);
  assert.deepEqual(updated.body.other_documents, [created.body.other_documents[1]]);

  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(fs.existsSync(path.join(uploadDir, 'chemicals', path.basename(created.body.photo_urls[0]))), false);
  assert.equal(fs.existsSync(path.join(uploadDir, 'chemicals', path.basename(created.body.other_documents[0].url))), false);
});
