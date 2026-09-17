'use strict';

const ExcelJS = require('exceljs');
const crypto = require('crypto');

const clean = value => String(value == null ? '' : value).replace(/_x000a_/gi, ' ').replace(/\s+/g, ' ').trim();
const normalized = value => clean(value).toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');

function cellValue(cell) {
  const value = cell && cell.value;
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map(part => part.text || '').join('');
    if (Object.hasOwn(value, 'result')) return value.result == null ? '' : value.result;
    if (value.text) return value.text;
    if (value.hyperlink) return value.text || value.hyperlink;
  }
  return value;
}

function asText(cell) {
  const value = cellValue(cell);
  return value instanceof Date ? value.toISOString() : clean(value);
}

function parseRussianDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  const text = clean(value);
  if (!text) return null;
  const iso = new Date(text);
  if (!Number.isNaN(iso.getTime()) && /^\d{4}-\d{2}-\d{2}/.test(text)) return iso.toISOString();
  const match = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) return null;
  const [, day, month, year, hour = '0', minute = '0', second = '0'] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function buildHeaders(worksheet) {
  const headers = [];
  let lastTop = '';
  let lastMiddle = '';
  for (let column = 1; column <= worksheet.columnCount; column += 1) {
    const top = asText(worksheet.getCell(1, column));
    const middle = asText(worksheet.getCell(2, column));
    const bottom = asText(worksheet.getCell(3, column));
    if (top) lastTop = top;
    if (middle) lastMiddle = middle;
    const parts = [top || lastTop, middle || lastMiddle, bottom].filter(Boolean);
    const uniqueParts = parts.filter((part, index) => parts.findIndex(other => normalized(other) === normalized(part)) === index);
    const label = uniqueParts.join(' — ') || `Столбец ${column}`;
    headers.push({ column, key: `c${column}`, label });
  }
  return headers;
}

function serializeValue(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return clean(value);
}

function parseWorksheet(worksheet) {
  const headers = buildHeaders(worksheet);
  const groups = { chemistry: [], technical: [] };
  headers.forEach(header => {
    const text = normalized(header.label);
    if (text.includes('остаток')) groups.chemistry.push(header.key);
    if (/(давлен|осмос|качество воды|производительность|компрессор)/.test(text)) groups.technical.push(header.key);
  });
  const timestampHeader = headers.find(header => normalized(header.label).includes('отметка времени'));
  const administratorHeader = headers.find(header => normalized(header.label).includes('администратор'));
  const rows = [];

  for (let rowNumber = 4; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const values = {};
    for (const header of headers) {
      const raw = cellValue(worksheet.getCell(rowNumber, header.column));
      const value = serializeValue(raw);
      if (value !== null) values[header.key] = value;
    }
    if (!Object.keys(values).length) continue;
    const timestampValue = timestampHeader ? cellValue(worksheet.getCell(rowNumber, timestampHeader.column)) : null;
    const timestamp = parseRussianDate(timestampValue);
    const administrator = administratorHeader ? clean(cellValue(worksheet.getCell(rowNumber, administratorHeader.column))) : '';
    const issueKeys = Object.entries(values)
      .filter(([, value]) => normalized(value).includes('не исправ') || normalized(value).includes('неисправ'))
      .map(([key]) => key);
    const identity = `${worksheet.name}\u0000${rowNumber}\u0000${timestamp || ''}`;
    rows.push({
      key: crypto.createHash('sha256').update(identity).digest('hex').slice(0, 24),
      row: rowNumber,
      timestamp,
      administrator,
      issue_keys: issueKeys,
      values
    });
  }

  return { name: worksheet.name, headers, groups, rows };
}

async function parseWorkbook(buffer, spreadsheetId = '') {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return {
    version: 1,
    spreadsheet_id: spreadsheetId,
    synced_at: new Date().toISOString(),
    sheets: workbook.worksheets.map(parseWorksheet)
  };
}

module.exports = { parseWorkbook, parseWorksheet, parseRussianDate, normalized };
