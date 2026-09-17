'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');

const { parseWorkbook, parseRussianDate } = require('../server/analyticsParser');
const { nextRunDate } = require('../server/analyticsSync');
const { buildSummary } = require('../server/routes/analytics');

test('Russian timestamps and the next daily run are calculated deterministically', () => {
  const parsed = parseRussianDate('15.09.2025 11:09:52');
  assert.equal(new Date(parsed).getFullYear(), 2025);
  assert.equal(new Date(parsed).getMonth(), 8);
  assert.equal(new Date(parsed).getDate(), 15);

  const before = new Date(2026, 8, 17, 10, 0, 0);
  const sameDay = nextRunDate(before);
  assert.equal(sameDay.getDate(), 17);
  assert.equal(sameDay.getHours(), 23);
  assert.equal(sameDay.getMinutes(), 59);

  const after = new Date(2026, 8, 17, 23, 59, 1);
  assert.equal(nextRunDate(after).getDate(), 18);
});

test('workbook parser reads every sheet and normalizes three header rows', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Чертаново');
  sheet.getCell('A1').value = 'Общие показатели';
  sheet.getCell('A3').value = 'Отметка времени';
  sheet.getCell('B3').value = 'Администратор';
  sheet.getCell('C1').value = 'Остаток химии';
  sheet.getCell('C2').value = 'Эмульсия';
  sheet.getCell('C3').value = 'Остаток_x000a_основной химии';
  sheet.getCell('D1').value = 'Состояние';
  sheet.getCell('D2').value = 'Осмос 1';
  sheet.getCell('D3').value = 'Состояние';
  sheet.getCell('A4').value = '15.09.2025 11:09:52';
  sheet.getCell('B4').value = 'Иванков А М';
  sheet.getCell('C4').value = 91.8;
  sheet.getCell('D4').value = 'Не исправно';
  workbook.addWorksheet('ВДНХ').getCell('A3').value = 'Отметка времени';

  const buffer = await workbook.xlsx.writeBuffer();
  const snapshot = await parseWorkbook(buffer, 'sheet-id');
  assert.equal(snapshot.sheets.length, 2);
  assert.equal(snapshot.sheets[0].rows.length, 1);
  assert.equal(snapshot.sheets[0].rows[0].administrator, 'Иванков А М');
  assert.ok(snapshot.sheets[0].headers.some(header => header.label.includes('Остаток основной химии')));
  assert.ok(snapshot.sheets[0].headers.every(header => !header.label.includes('_x000a_')));
});

test('analytics summary builds cards, charts and latest values without duplicate snapshots', () => {
  const state = {
    version: 1,
    synced_at: '2026-09-17T20:00:00.000Z',
    sync: { running: false, last_success_at: '2026-09-17T20:00:00.000Z', next_run_at: null, last_error: null },
    sheets: [{
      name: 'Чертаново',
      headers: [
        { key: 'remaining', label: 'Остаток основной химии' },
        { key: 'osmosis', label: 'Осмос 1 — Состояние' },
        { key: 'pressure', label: 'Давление воды до фильтра' }
      ],
      groups: { chemistry: ['remaining'], technical: ['osmosis', 'pressure'] },
      rows: [{
        key: 'one', row: 4, timestamp: '2026-09-17T10:00:00.000Z', administrator: 'Иванков А М',
        values: { remaining: 42, osmosis: 'Не исправно', pressure: 1.2 }
      }]
    }]
  };
  const summary = buildSummary(state, {});
  assert.equal(summary.cards.objects, 1);
  assert.equal(summary.cards.inspections, 1);
  assert.equal(summary.cards.issues, 1);
  assert.equal(summary.chemistry[0].value, 42);
  assert.equal(summary.technical[0].value, 'Не исправно');
  assert.equal(summary.checks[0].issues, 1);
});
