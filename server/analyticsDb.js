'use strict';

const fs = require('fs');
const { JsonStore } = require('./jsonStore');

const emptyState = () => ({
  version: 1,
  spreadsheet_id: '',
  synced_at: null,
  sheets: [],
  sync: {
    running: false,
    last_started_at: null,
    last_success_at: null,
    last_error: null,
    next_run_at: null
  }
});

const store = new JsonStore('analytics.json', {
  validate(value) {
    return Boolean(value && value.version === 1 && Array.isArray(value.sheets) && value.sync && typeof value.sync === 'object');
  }
});
let cachedState = null;
let cachedStamp = '';

function fileStamp() {
  try {
    const stat = fs.statSync(store.file);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch (error) {
    if (error.code === 'ENOENT') return 'missing';
    throw error;
  }
}

function readOrEmpty() {
  const stamp = fileStamp();
  if (cachedState && stamp === cachedStamp) return cachedState;
  const value = store.read();
  cachedState = Array.isArray(value) ? emptyState() : value;
  cachedStamp = stamp;
  return cachedState;
}

function write(value) {
  store.write(value);
  cachedState = value;
  cachedStamp = fileStamp();
}

function mutateSync(patch) {
  const state = readOrEmpty();
  state.sync = { ...emptyState().sync, ...state.sync, ...patch };
  write(state);
  return state.sync;
}

module.exports = {
  health() {
    try {
      const state = readOrEmpty();
      return {
        ok: true,
        file: store.file,
        entries: state.sheets.reduce((sum, sheet) => sum + (sheet.rows || []).length, 0),
        last_success_at: state.sync.last_success_at
      };
    } catch (error) {
      return { ok: false, file: store.file, code: error.code, message: error.message };
    }
  },
  get: readOrEmpty,
  markStarted(startedAt) {
    return mutateSync({ running: true, last_started_at: startedAt, last_error: null });
  },
  markFailed(message) {
    return mutateSync({ running: false, last_error: String(message || 'Неизвестная ошибка') });
  },
  setNextRun(nextRunAt) {
    return mutateSync({ next_run_at: nextRunAt });
  },
  replaceSnapshot(snapshot) {
    const previous = readOrEmpty();
    const syncedAt = snapshot.synced_at || new Date().toISOString();
    const state = {
      version: 1,
      spreadsheet_id: String(snapshot.spreadsheet_id || ''),
      synced_at: syncedAt,
      sheets: Array.isArray(snapshot.sheets) ? snapshot.sheets : [],
      sync: {
        ...emptyState().sync,
        ...previous.sync,
        running: false,
        last_success_at: syncedAt,
        last_error: null
      }
    };
    write(state);
    return state;
  }
};
