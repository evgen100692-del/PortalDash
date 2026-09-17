'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const DEFAULT_URL = 'https://docs.google.com/spreadsheets/d/12YE7bu9dTLxtlS-IsNu-V7KxCjX3O6BFWez0nUBTj4M/edit';

function spreadsheetId(url) {
  const match = String(url || '').match(/\/spreadsheets\/d\/([^/]+)/);
  if (!match) throw new Error('Некорректный адрес Google Таблицы');
  return match[1];
}

function browserPath() {
  const candidates = [
    process.env.PORTALDASH_BROWSER_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ].filter(Boolean);
  return candidates.find(candidate => fs.existsSync(candidate));
}

async function completeLogin(page) {
  if (!/accounts\.google\.com/.test(page.url())) return;
  const email = process.env.GOOGLE_SHEETS_EMAIL;
  const password = process.env.GOOGLE_SHEETS_PASSWORD;
  if (!email || !password) {
    throw new Error('Для первого входа задайте GOOGLE_SHEETS_EMAIL и GOOGLE_SHEETS_PASSWORD');
  }

  const emailInput = page.locator('input[name="identifier"], input[type="email"]').first();
  if (/\/signin\/identifier/.test(page.url())) {
    await emailInput.waitFor({ state: 'attached', timeout: 30000 });
    await emailInput.fill(email, { force: true });
    const next = page.locator('#identifierNext').first();
    if (await next.count()) await next.click({ force: true });
    else await page.getByRole('button', { name: /далее|next/i }).click({ force: true });
  }
  const passwordInput = page.locator('input[name="Passwd"]').first();
  try {
    await passwordInput.waitFor({ state: 'attached', timeout: 30000 });
  } catch {
    const message = cleanPageMessage(await page.locator('body').innerText().catch(() => ''));
    throw new Error(`Google не показал поле пароля${message ? `: ${message}` : ''}`);
  }
  await passwordInput.fill(password, { force: true });
  const passwordNext = page.locator('#passwordNext').first();
  if (await passwordNext.count()) await passwordNext.click({ force: true });
  else await page.getByRole('button', { name: /далее|next/i }).click({ force: true });
  await page.waitForURL(/docs\.google\.com\/spreadsheets/, { timeout: 60000 });
}

function cleanPageMessage(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/[\w.+-]+@[\w.-]+/g, '[аккаунт]')
    .trim()
    .slice(0, 500);
}

async function downloadWorkbook() {
  const url = process.env.GOOGLE_SHEETS_URL || DEFAULT_URL;
  const id = spreadsheetId(url);
  const executablePath = browserPath();
  if (!executablePath) throw new Error('Не найден Chrome или Edge; задайте PORTALDASH_BROWSER_PATH');

  const dataDir = process.env.PORTALDASH_DATA_DIR || path.join(__dirname, 'data');
  const profileDir = path.join(dataDir, 'google-browser-profile');
  fs.mkdirSync(profileDir, { recursive: true });
  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath,
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
    viewport: { width: 1280, height: 800 }
  });

  try {
    const page = context.pages()[0] || await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await completeLogin(page);
    const response = await context.request.get(`https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`, {
      timeout: 120000
    });
    if (!response.ok()) throw new Error(`Google вернул HTTP ${response.status()} при выгрузке таблицы`);
    const buffer = await response.body();
    if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
      throw new Error('Вместо XLSX получен ответ авторизации Google');
    }
    return { id, buffer };
  } finally {
    await context.close();
  }
}

module.exports = { downloadWorkbook, spreadsheetId, browserPath };
