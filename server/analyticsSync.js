'use strict';

const db = require('./analyticsDb');
const { parseWorkbook } = require('./analyticsParser');
const { downloadWorkbook } = require('./googleSheetsClient');

let runningPromise = null;
let timer = null;

function nextRunDate(now = new Date()) {
  const next = new Date(now);
  next.setHours(23, 59, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next;
}

async function syncNow() {
  if (runningPromise) return runningPromise;
  runningPromise = (async () => {
    const startedAt = new Date().toISOString();
    db.markStarted(startedAt);
    try {
      const { id, buffer } = await downloadWorkbook();
      const snapshot = await parseWorkbook(buffer, id);
      const saved = db.replaceSnapshot(snapshot);
      return {
        ok: true,
        synced_at: saved.synced_at,
        sheets: saved.sheets.length,
        rows: saved.sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0)
      };
    } catch (error) {
      db.markFailed(error.message);
      throw error;
    } finally {
      runningPromise = null;
    }
  })();
  return runningPromise;
}

function scheduleNext() {
  if (timer) clearTimeout(timer);
  const next = nextRunDate();
  db.setNextRun(next.toISOString());
  timer = setTimeout(async () => {
    try {
      await syncNow();
    } catch (error) {
      console.error('Не удалось обновить аналитику:', error.message);
    } finally {
      scheduleNext();
    }
  }, Math.max(1000, next.getTime() - Date.now()));
  timer.unref?.();
  return next;
}

function startScheduler() {
  const next = scheduleNext();
  const state = db.get();
  if (!state.sync.last_success_at && (process.env.GOOGLE_SHEETS_EMAIL || fsSessionMayExist())) {
    setImmediate(() => syncNow().catch(error => console.error('Первичная синхронизация аналитики не выполнена:', error.message)));
  }
  return next;
}

function fsSessionMayExist() {
  const fs = require('fs');
  const path = require('path');
  const dataDir = process.env.PORTALDASH_DATA_DIR || path.join(__dirname, 'data');
  return fs.existsSync(path.join(dataDir, 'google-browser-profile'));
}

module.exports = { syncNow, startScheduler, nextRunDate };
