/**
 * ETL: импорт исходных Excel-файлов закупок химии в нормализованную БД SQLite.
 *
 * Ожидаемая структура исходных файлов (см. README):
 *  - "заказ автохимия 20XX.xlsx" — по листу на вид химии ("Шампунь Портал", "Аминат",
 *    "Реагент", "Оч. Дисков", "ЦВ. ПЕНА", "HydroBlock", "бутылкитриггеры" и т.д.)
 *    Каждый лист: строки = объекты, столбцы сгруппированы по неделям
 *    (дата в заголовке блока -> Списание / Остаток / Доставка заказ ТУ / Доставка факт / Стоимость / Перемещ.-возврат)
 *  - "Khimiia-Portal.xlsx" — справочник номенклатуры химии и поставщиков (лист "Химия", лист "Поставщики")
 *
 * ВАЖНО: конкретные индексы столбцов/строк уникальны для каждого файла — перед запуском
 * сверьте разбор ниже с реальным файлом.
 */
const path = require('path');
const fs = require('fs');
const xlsx = require('xlsx');
const db = require('../db');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const ORDERS_FILE = process.env.ORDERS_FILE || 'заказ автохимия 2026.xlsx';
const PORTAL_FILE = process.env.PORTAL_FILE || 'Khimiia-Portal.xlsx';

const SKIP_SHEETS = ['текущий список ТУ с 01.10', 'Учет канистр'];

const insertObject = db.prepare(`
  INSERT INTO objects (name, address, responsible_tu, phone, city)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT DO NOTHING
`);

const getObjectId = db.prepare('SELECT id FROM objects WHERE name = ?');

const insertChemicalType = db.prepare(`
  INSERT INTO chemical_types (name, category)
  VALUES (?, ?)
  ON CONFLICT(name) DO NOTHING
`);

const getChemicalTypeId = db.prepare('SELECT id FROM chemical_types WHERE name = ?');

const insertWeeklyRecord = db.prepare(`
  INSERT INTO weekly_records
    (object_id, chemical_type_id, week_start_date, writeoff, balance, delivery_order, delivery_fact, cost, transfer_return, source_sheet)
  VALUES (@object_id, @chemical_type_id, @week_start_date, @writeoff, @balance, @delivery_order, @delivery_fact, @cost, @transfer_return, @source_sheet)
  ON CONFLICT(object_id, chemical_type_id, week_start_date) DO UPDATE SET
    writeoff = excluded.writeoff,
    balance = excluded.balance,
    delivery_order = excluded.delivery_order,
    delivery_fact = excluded.delivery_fact,
    cost = excluded.cost,
    transfer_return = excluded.transfer_return
`);

function ensureObject(name, address, responsibleTu, phone, city = 'Москва') {
  if (!name) return null;
  insertObject.run(name, address || null, responsibleTu || null, phone || null, city);
  return getObjectId.get(name)?.id || null;
}

function ensureChemicalType(name, category = null) {
  if (!name) return null;
  insertChemicalType.run(name, category);
  return getChemicalTypeId.get(name)?.id || null;
}

function importOrdersSheet(sheet, sheetName) {
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
  if (rows.length < 3) return 0;

  const chemTypeId = ensureChemicalType(sheetName);
  let imported = 0;
  let currentResponsible = null;

  for (let r = 2; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every(c => c === null)) continue;

    if (row[0]) currentResponsible = row[0];
    const objectName = row[1];
    if (!objectName || typeof objectName !== 'string') continue;
    if (/^(Списано|Доставлено|Заказ ТУ|Стоимость|Оплачено|Свободные)/i.test(objectName)) continue;

    const tu = row[2] || null;
    const address = row[3] || null;
    const phone = row[4] || null;

    const objectId = ensureObject(objectName, address, tu, phone);
    if (!objectId) continue;

    const BLOCK_SIZE = 6;
    for (let c = 5; c + 1 < row.length; c += BLOCK_SIZE) {
      const writeoff = Number(row[c]) || 0;
      const balance = Number(row[c + 1]) || 0;
      const deliveryOrder = Number(row[c + 2]) || 0;
      const deliveryFact = Number(row[c + 3]) || 0;
      const cost = Number(row[c + 4]) || 0;
      const transferReturn = Number(row[c + 5]) || 0;
      if (!writeoff && !balance && !deliveryFact && !cost) continue;

      const weekIndex = Math.floor((c - 5) / BLOCK_SIZE);
      const weekStartDate = weekIndexToDate(weekIndex);

      insertWeeklyRecord.run({
        object_id: objectId,
        chemical_type_id: chemTypeId,
        week_start_date: weekStartDate,
        writeoff, balance,
        delivery_order: deliveryOrder,
        delivery_fact: deliveryFact,
        cost,
        transfer_return: transferReturn,
        source_sheet: sheetName
      });
      imported++;
    }
  }
  return imported;
}

const BASE_WEEK_DATE = new Date('2024-12-02T00:00:00Z');
function weekIndexToDate(index) {
  const d = new Date(BASE_WEEK_DATE);
  d.setUTCDate(d.getUTCDate() + index * 7);
  return d.toISOString().slice(0, 10);
}

function importOrdersFile(filePath) {
  const workbook = xlsx.readFile(filePath, { cellDates: false });
  let totalImported = 0;

  for (const sheetName of workbook.SheetNames) {
    if (SKIP_SHEETS.includes(sheetName)) continue;
    const sheet = workbook.Sheets[sheetName];
    const count = importOrdersSheet(sheet, sheetName);
    console.log(`  Лист "${sheetName}": импортировано ${count} записей`);
    totalImported += count;
  }
  return totalImported;
}

function importPortalFile(filePath) {
  const workbook = xlsx.readFile(filePath);
  let suppliersCount = 0;

  const insertSupplier = db.prepare(`
    INSERT INTO suppliers (name, status, notes) VALUES (?, ?, ?)
    ON CONFLICT DO NOTHING
  `);
  const insertSupplierProduct = db.prepare(`
    INSERT INTO supplier_products
      (supplier_id, chemical_type_id, product_name, status, reject_reason, price_purchase, price_franchise, article)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const getSupplierId = db.prepare('SELECT id FROM suppliers WHERE name = ?');

  const chemSheet = workbook.Sheets['Химия'];
  if (chemSheet) {
    const rows = xlsx.utils.sheet_to_json(chemSheet, { header: 1, raw: true, defval: null });
    for (const row of rows) {
      const [status, name, manufacturer, , , priceRaw, priceFranchiseRaw, article] = row || [];
      if (!name || name === 'Название') continue;
      const normalizedStatus = /исполь/i.test(status || '') && !/не/i.test(status || '') ? 'used' : 'not_used';

      insertSupplier.run(manufacturer || 'Неизвестно', 'used', null);
      const supplierId = getSupplierId.get(manufacturer || 'Неизвестно')?.id;
      if (!supplierId) continue;

      const priceMatch = String(priceRaw || '').match(/[\d.,]+/);
      const priceFranchiseMatch = String(priceFranchiseRaw || '').match(/[\d.,]+/);

      insertSupplierProduct.run(
        supplierId, null, name, normalizedStatus, null,
        priceMatch ? parseFloat(priceMatch[0].replace(',', '.')) : null,
        priceFranchiseMatch ? parseFloat(priceFranchiseMatch[0].replace(',', '.')) : null,
        article || null
      );
      suppliersCount++;
    }
  }

  return suppliersCount;
}

function main() {
  const ordersPath = path.join(DATA_DIR, ORDERS_FILE);
  const portalPath = path.join(DATA_DIR, PORTAL_FILE);

  if (fs.existsSync(ordersPath)) {
    console.log(`Импорт файла заказов: ${ordersPath}`);
    const count = importOrdersFile(ordersPath);
    console.log(`Итого импортировано записей закупок: ${count}`);
  } else {
    console.warn(`Файл не найден: ${ordersPath} — положите его в data/ перед импортом`);
  }

  if (fs.existsSync(portalPath)) {
    console.log(`Импорт справочника поставщиков: ${portalPath}`);
    const count = importPortalFile(portalPath);
    console.log(`Итого импортировано продуктов поставщиков: ${count}`);
  } else {
    console.warn(`Файл не найден: ${portalPath} — положите его в data/ перед импортом`);
  }
}

if (require.main === module) {
  main();
}

module.exports = { importOrdersFile, importPortalFile };
