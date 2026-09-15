'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { migrateData } = require('../server/migrateData');

test('migration replaces chemical names and object addresses with immutable IDs', () => {
  const objects = [{ id: 7, address: 'Адрес', robots: '["RCW"]', chemistry: '["Шампунь"]' }];
  const chemicals = [{
    id: 11,
    name: 'Шампунь',
    photo_url: '/uploads/chemicals/old.jpg',
    other_documents: [],
    doc_other_url: '/uploads/chemicals/manual.pdf',
    stages: [{ stage: 'Полевой', date: '2026-09-14', object: 'Адрес' }]
  }];

  const result = migrateData(objects, chemicals, [{ id: 1, title: 'Вопрос', data: {} }]);

  assert.deepEqual(result.objects[0].chemical_ids, [11]);
  assert.equal(result.objects[0].name, 'Адрес');
  assert.equal(Object.hasOwn(result.objects[0], 'robots'), false);
  assert.equal(Object.hasOwn(result.objects[0], 'drainage'), false);
  assert.deepEqual(result.objects[0].events, []);
  assert.equal('chemistry' in result.objects[0], false);
  assert.equal(result.chemicals[0].stages[0].object_id, 7);
  assert.equal('object' in result.chemicals[0].stages[0], false);
  assert.deepEqual(result.chemicals[0].photo_urls, ['/uploads/chemicals/old.jpg']);
  assert.equal('photo_url' in result.chemicals[0], false);
  assert.deepEqual(result.chemicals[0].other_documents, [{ url: '/uploads/chemicals/manual.pdf', name: 'Документ' }]);
  assert.equal('doc_other_url' in result.chemicals[0], false);
  assert.equal(result.faq[0].topic, 'Система работы');
});

test('migration stops before writing when a display-name relationship is ambiguous', () => {
  const objects = [{ id: 1, address: 'A', chemistry: '[]' }];
  const chemicals = [{ id: 1, name: 'Одинаково' }, { id: 2, name: 'одинаково' }];

  assert.throws(() => migrateData(objects, chemicals), /неоднозначное значение/);
});

test('migration stops when a legacy relationship cannot be resolved', () => {
  const objects = [{ id: 1, address: 'A', chemistry: '["Нет такой химии"]' }];
  const chemicals = [{ id: 1, name: 'Другая' }];

  assert.throws(() => migrateData(objects, chemicals), /связь .* не найдена/);
});
