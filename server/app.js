// Точка входа Express-приложения
const express = require('express');
const path = require('path');

const db = require('./db'); // инициализирует БД и схему при старте

const objectsRoutes = require('./routes/objects');
const analyticsRoutes = require('./routes/analytics');
const heatmapRoutes = require('./routes/heatmap');
const suppliersRoutes = require('./routes/suppliers');
const alertsRoutes = require('./routes/alerts');
const financeRoutes = require('./routes/finance');
const exportRoutes = require('./routes/export');

const app = express();
const PORT = process.env.PORT || 3000;

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

app.listen(PORT, () => {
  console.log(`PortalDash запущен: http://localhost:${PORT}`);
});
