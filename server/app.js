// Точка входа Express-приложения
const express = require('express');
const path = require('path');
const os = require('os');

const db = require('./db');

const objectsRoutes = require('./routes/objects');
const analyticsRoutes = require('./routes/analytics');
const heatmapRoutes = require('./routes/heatmap');
const suppliersRoutes = require('./routes/suppliers');
const alertsRoutes = require('./routes/alerts');
const financeRoutes = require('./routes/finance');
const exportRoutes = require('./routes/export');

const app = express();
const PORT = process.env.PORT || 3000;
// 0.0.0.0 — слушать на всех интерфейсах, чтобы можно было подключаться по IP из локальной сети.
// Переопределяется переменной окружения HOST (например HOST=127.0.0.1 — только локально).
const HOST = process.env.HOST || '0.0.0.0';

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/objects', objectsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/heatmap', heatmapRoutes);
app.use('/api/suppliers', suppliersRoutes);
app.use('/api/alerts', alertsRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/export', exportRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter(iface => iface && iface.family === 'IPv4' && !iface.internal)
    .map(iface => iface.address);
}

app.listen(PORT, HOST, () => {
  console.log(`PortalDash запущен на ${HOST}:${PORT}`);
  console.log(`  локально:      http://localhost:${PORT}`);
  for (const address of lanAddresses()) {
    console.log(`  в этой сети:   http://${address}:${PORT}`);
  }
  if (HOST === '0.0.0.0') {
    console.log('Если с другого устройства не открывается — разрешите порт во входящих правилах брандмауэра Windows.');
  }
});
