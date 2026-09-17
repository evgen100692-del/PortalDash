'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');

const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile) && typeof process.loadEnvFile === 'function') process.loadEnvFile(envFile);

const objectsDb = require('./db');
const chemicalsDb = require('./chemicalsDb');
const faqDb = require('./faqDb');
const complaintsDb = require('./complaintsDb');
const notificationsDb = require('./notificationsDb');
const analyticsDb = require('./analyticsDb');

const objectsRoutes = require('./routes/objects');
const chemicalsRoutes = require('./routes/chemicals');
const faqRoutes = require('./routes/faq');
const notificationsRoutes = require('./routes/notifications');
const complaintsRoutes = require('./routes/complaints');
const analyticsRoutes = require('./routes/analytics');

const stores = [objectsDb, chemicalsDb, faqDb, complaintsDb, notificationsDb, analyticsDb];

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.use('/api/objects', objectsRoutes);
  app.use('/api/chemicals', chemicalsRoutes);
  app.use('/api/faq', faqRoutes);
  app.use('/api/notifications', notificationsRoutes);
  app.use('/api/complaints', complaintsRoutes);
  app.use('/api/analytics', analyticsRoutes);

  app.get('/api/health', (req, res) => {
    const storage = stores.map(module => module.health());
    const ok = storage.every(item => item.ok);
    res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'error', time: new Date().toISOString(), storage });
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'API-метод не найден' }));

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.status || (error.code === 'LIMIT_FILE_SIZE'
      ? 413
      : (error.code === 'LIMIT_UNEXPECTED_FILE' ? 400 : (error.code === 'DATA_MIGRATION_REQUIRED' ? 503 : 500)));
    console.error(error);
    return res.status(status).json({
      error: status === 413
        ? 'Файл превышает допустимый размер'
        : (error.code === 'LIMIT_UNEXPECTED_FILE'
          ? 'Можно загрузить не более 10 фотографий'
          : (status === 503 ? error.message : 'Внутренняя ошибка сервера'))
    });
  });

  return app;
}

function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter(iface => iface && iface.family === 'IPv4' && !iface.internal)
    .map(iface => iface.address);
}

function start(options = {}) {
  const port = options.port || process.env.PORT || 3000;
  const host = options.host || process.env.HOST || '0.0.0.0';
  const server = createApp().listen(port, host, () => {
    const actualPort = server.address().port;
    console.log(`PortalDash запущен на ${host}:${actualPort}`);
    console.log(`  локально:      http://localhost:${actualPort}`);
    if (host === '0.0.0.0') {
      for (const address of lanAddresses()) console.log(`  в этой сети:   http://${address}:${actualPort}`);
      console.log('Если с другого устройства не открывается — разрешите порт во входящих правилах брандмауэра Windows.');
    }
    const nextSync = require('./analyticsSync').startScheduler();
    console.log(`Аналитика: следующая синхронизация ${nextSync.toLocaleString('ru-RU')}`);
  });
  return server;
}

if (require.main === module) start();

module.exports = { createApp, start };
