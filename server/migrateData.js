'use strict';

const fs = require('fs');
const { JsonStore } = require('./jsonStore');

function uniqueIndex(items, key, label) {
  const index = new Map();
  for (const item of items) {
    const value = String(item[key] || '').trim();
    if (!value) throw new Error(`${label}: пустое значение у записи #${item.id}`);
    const normalized = value.toLocaleLowerCase('ru');
    if (index.has(normalized)) throw new Error(`${label}: неоднозначное значение «${value}»`);
    index.set(normalized, Number(item.id));
  }
  return index;
}

function resolve(index, value, label) {
  const normalized = String(value || '').trim().toLocaleLowerCase('ru');
  const id = index.get(normalized);
  if (!id) throw new Error(`${label}: связь «${value}» не найдена`);
  return id;
}

const FAQ_TOPICS = ['Система работы', 'Ситуации', 'Документы'];

function migrateData(objects, chemicals, faq = []) {
  const objectIds = new Set(objects.map(item => Number(item.id)));
  const chemicalIdSet = new Set(chemicals.map(item => Number(item.id)));
  if (objectIds.size !== objects.length || [...objectIds].some(id => !Number.isInteger(id) || id <= 0)) {
    throw new Error('Объекты: ID должны быть уникальными положительными числами');
  }
  if (chemicalIdSet.size !== chemicals.length || [...chemicalIdSet].some(id => !Number.isInteger(id) || id <= 0)) {
    throw new Error('Химия: ID должны быть уникальными положительными числами');
  }
  const chemicalByName = uniqueIndex(chemicals, 'name', 'Химия');
  const objectByAddress = uniqueIndex(objects, 'address', 'Объект');

  const migratedObjects = objects.map(item => {
    let chemicalIds = item.chemical_ids;
    if (!Array.isArray(chemicalIds)) {
      let names = item.chemistry;
      if (typeof names === 'string') names = JSON.parse(names);
      chemicalIds = (Array.isArray(names) ? names : []).map(name => resolve(chemicalByName, name, `Объект #${item.id}`));
    }
    chemicalIds = chemicalIds.map(Number);
    if (chemicalIds.some(id => !chemicalIdSet.has(id))) throw new Error(`Объект #${item.id}: химия #${chemicalIds.find(id => !chemicalIdSet.has(id))} не найдена`);
    const migrated = {
      ...item,
      name: String(item.name || item.address || '').trim(),
      chemical_ids: [...new Set(chemicalIds)],
      events: Array.isArray(item.events) ? item.events : []
    };
    delete migrated.chemistry;
    delete migrated.robots;
    delete migrated.drainage;
    return migrated;
  });

  const migratedChemicals = chemicals.map(item => {
    const photoUrls = Array.isArray(item.photo_urls)
      ? item.photo_urls
      : (item.photo_url ? [item.photo_url] : []);
    const otherDocuments = Array.isArray(item.other_documents) ? [...item.other_documents] : [];
    if (item.doc_other_url && !otherDocuments.some(file => file && file.url === item.doc_other_url)) {
      otherDocuments.push({ url: item.doc_other_url, name: 'Документ' });
    }
    const migratedChemical = {
      ...item,
      photo_urls: [...new Set(photoUrls.filter(value => typeof value === 'string' && value.trim()))],
      other_documents: otherDocuments
        .map(file => ({ url: String((file && file.url) || '').trim(), name: String((file && file.name) || '').trim() || 'Документ' }))
        .filter(file => file.url),
      stages: (Array.isArray(item.stages) ? item.stages : []).map(stage => {
      const objectId = stage.object_id != null
        ? Number(stage.object_id)
        : (stage.object ? resolve(objectByAddress, stage.object, `Химия #${item.id}`) : null);
      if (objectId != null && !objectIds.has(objectId)) throw new Error(`Химия #${item.id}: объект #${objectId} не найден`);
      const migrated = { ...stage, object_id: objectId };
      delete migrated.object;
      return migrated;
    })
    };
    delete migratedChemical.photo_url;
    delete migratedChemical.doc_other_url;
    return migratedChemical;
  });

  const migratedFaq = faq.map(item => ({
    ...item,
    topic: FAQ_TOPICS.includes(item.topic) ? item.topic : FAQ_TOPICS[0]
  }));

  return { objects: migratedObjects, chemicals: migratedChemicals, faq: migratedFaq };
}

function run(options = {}) {
  const dataDir = options.dataDir || process.env.PORTALDASH_DATA_DIR;
  const objectsStore = new JsonStore('objects.json', { dataDir });
  const chemicalsStore = new JsonStore('chemicals.json', { dataDir });
  const faqStore = new JsonStore('faq.json', { dataDir });
  const currentObjects = objectsStore.read();
  const currentChemicals = chemicalsStore.read();
  const currentFaq = faqStore.read();
  const migrated = migrateData(currentObjects, currentChemicals, currentFaq);
  const changed = JSON.stringify(currentObjects) !== JSON.stringify(migrated.objects)
    || JSON.stringify(currentChemicals) !== JSON.stringify(migrated.chemicals)
    || JSON.stringify(currentFaq) !== JSON.stringify(migrated.faq);

  if (options.apply && changed) {
    objectsStore.write(migrated.objects);
    try {
      chemicalsStore.write(migrated.chemicals);
      faqStore.write(migrated.faq);
    } catch (error) {
      if (fs.existsSync(objectsStore.backupFile)) {
        fs.copyFileSync(objectsStore.backupFile, objectsStore.file);
      }
      if (fs.existsSync(chemicalsStore.backupFile)) {
        fs.copyFileSync(chemicalsStore.backupFile, chemicalsStore.file);
      }
      throw error;
    }
  }
  return { changed, applied: Boolean(options.apply && changed), objects: migrated.objects.length, chemicals: migrated.chemicals.length, faq: migrated.faq.length };
}

if (require.main === module) {
  try {
    const result = run({ apply: process.argv.includes('--apply') });
    console.log(JSON.stringify(result, null, 2));
    if (result.changed && !result.applied) console.log('Dry-run завершён. Для применения используйте npm run migrate:data -- --apply');
  } catch (error) {
    console.error(`Миграция остановлена: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { migrateData, run };
