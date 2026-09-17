'use strict';

const express = require('express');
const db = require('../analyticsDb');
const sync = require('../analyticsSync');
const { normalized } = require('../analyticsParser');

const router = express.Router();

function dateOnly(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : '';
}

function headerMap(sheet) {
  return new Map((sheet.headers || []).map(header => [header.key, header.label]));
}

function isIssue(value) {
  const text = normalized(value);
  return text.includes('не исправ') || text.includes('неисправ');
}

function buildSummary(state, query) {
  const from = /^\d{4}-\d{2}-\d{2}$/.test(query.from || '') ? query.from : '';
  const to = /^\d{4}-\d{2}-\d{2}$/.test(query.to || '') ? query.to : '';
  const selectedObject = String(query.object || '');
  const sheets = state.sheets.filter(sheet => !selectedObject || sheet.name === selectedObject);
  const observations = [];
  const allIssues = [];

  for (const sheet of sheets) {
    const labels = headerMap(sheet);
    for (const row of sheet.rows || []) {
      if (!row.timestamp) continue;
      const day = dateOnly(row.timestamp);
      if (from && day < from) continue;
      if (to && day > to) continue;
      const issueKeys = Array.isArray(row.issue_keys)
        ? row.issue_keys
        : Object.entries(row.values || {}).filter(([, value]) => isIssue(value)).map(([key]) => key);
      const issues = issueKeys.map(key => ({ label: labels.get(key) || key, value: row.values[key] }));
      observations.push({ sheet, row, day, labels, issues });
      issues.forEach(issue => allIssues.push({ object: sheet.name, timestamp: row.timestamp, administrator: row.administrator, ...issue }));
    }
  }

  const inspectionsByDay = new Map();
  const issuesByObject = new Map();
  const checksByObject = new Map();
  for (const item of observations) {
    inspectionsByDay.set(item.day, (inspectionsByDay.get(item.day) || 0) + 1);
    if (item.issues.length) issuesByObject.set(item.sheet.name, (issuesByObject.get(item.sheet.name) || 0) + item.issues.length);
    const current = checksByObject.get(item.sheet.name) || { object: item.sheet.name, inspections: 0, issues: 0, last_inspection: null };
    current.inspections += 1;
    current.issues += item.issues.length;
    if (!current.last_inspection || item.row.timestamp > current.last_inspection) current.last_inspection = item.row.timestamp;
    checksByObject.set(item.sheet.name, current);
  }

  const latestBySheetAndKey = new Map();
  for (const item of observations) {
    const groups = item.sheet.groups || { chemistry: [], technical: [] };
    for (const group of ['chemistry', 'technical']) {
      for (const key of groups[group] || []) {
        const value = item.row.values && item.row.values[key];
        if (value == null || value === '') continue;
        const identity = `${group}\u0000${item.sheet.name}\u0000${key}`;
        const previous = latestBySheetAndKey.get(identity);
        if (!previous || item.row.timestamp > previous.timestamp) {
          latestBySheetAndKey.set(identity, { group, object: item.sheet.name, label: item.labels.get(key) || key, value, timestamp: item.row.timestamp });
        }
      }
    }
  }

  return {
    sync: state.sync,
    synced_at: state.synced_at,
    filters: { objects: state.sheets.map(sheet => sheet.name).sort((a, b) => a.localeCompare(b, 'ru')) },
    cards: {
      objects: sheets.length,
      inspections: observations.length,
      issues: allIssues.length,
      problem_objects: new Set(allIssues.map(item => item.object)).size,
      last_inspection: observations.reduce((latest, item) => !latest || item.row.timestamp > latest ? item.row.timestamp : latest, null)
    },
    inspections_by_day: [...inspectionsByDay].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count })),
    issues_by_object: [...issuesByObject].sort((a, b) => b[1] - a[1]).map(([object, count]) => ({ object, count })),
    chemistry: [...latestBySheetAndKey.values()].filter(item => item.group === 'chemistry'),
    technical: [...latestBySheetAndKey.values()].filter(item => item.group === 'technical'),
    recent_issues: allIssues.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 50),
    checks: [...checksByObject.values()].sort((a, b) => (b.last_inspection || '').localeCompare(a.last_inspection || ''))
  };
}

const summaryCache = new Map();
router.get('/summary', (req, res) => {
  const state = db.get();
  const cacheKey = `${state.synced_at || 'empty'}|${req.query.object || ''}|${req.query.from || ''}|${req.query.to || ''}`;
  if (!summaryCache.has(cacheKey)) {
    if (summaryCache.size >= 50) summaryCache.delete(summaryCache.keys().next().value);
    summaryCache.set(cacheKey, buildSummary(state, req.query));
  }
  res.json(summaryCache.get(cacheKey));
});

router.post('/sync', async (req, res, next) => {
  try {
    res.json(await sync.syncNow());
  } catch (error) {
    error.status = 502;
    next(error);
  }
});

module.exports = router;
module.exports.buildSummary = buildSummary;
