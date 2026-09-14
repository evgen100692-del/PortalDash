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

function migrateData(objects, chemicals) {
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
      robots: typeof item.robots === 'string' ? JSON.parse(item.robots) : (item.robots || []),
      chemical_ids: [...new Set(chemicalIds)]
    };
    delete migrated.chemistry;
    return migrated;
  });

  const migratedChemicals = chemicals.map(item => {
    const photoUrls = Array.isArray(item.photo_urls)
      ? item.photo_urls
      : (item.photo_url ? [item.photo_url] : []);
    const migratedChemical = {
      ...item,
      photo_urls: [...new Set(photoUrls.filter(value => typeof value === 'string' && value.trim()))],
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
    return migratedChemical;
  });

  return { objects: migratedObjects, chemicals: migratedChemicals };
}

function run(options = {}) {
  const dataDir = options.dataDir || process.env.PORTALDASH_DATA_DIR;
  const objectsStore = new JsonStore('objects.json', { dataDir });
  const chemicalsStore = new JsonStore('chemicals.json', { dataDir });
  const currentObjects = objectsStore.read();
  const currentChemicals = chemicalsStore.read();
  const migrated = migrateData(currentObjects, currentChemicals);
  const changed = JSON.stringify(currentObjects) !== JSON.stringify(migrated.objects)
    || JSON.stringify(currentChemicals) !== JSON.stringify(migrated.chemicals);

  if (options.apply && changed) {
    objectsStore.write(migrated.objects);
    try {
      chemicalsStore.write(migrated.chemicals);
    } catch (error) {
      if (fs.existsSync(objectsStore.backupFile)) {
        fs.copyFileSync(objectsStore.backupFile, objectsStore.file);
      }
      throw error;
    }
  }
  return { changed, applied: Boolean(options.apply && changed), objects: migrated.objects.length, chemicals: migrated.chemicals.length };
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
