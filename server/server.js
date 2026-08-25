'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 3000);
const ROOT = path.resolve(__dirname, '..');
const STATIC_DIRS = [
  path.join(ROOT, 'build'),
  path.join(ROOT, 'public'),
  ROOT,
];

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

function send(res, status, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function sendJson(res, status, data) {
  send(res, status, JSON.stringify(data), 'application/json; charset=utf-8');
}

function safePath(base, urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const relative = decoded.replace(/^[/\\]+/, '');
  const filePath = path.resolve(base, relative);

  if (!filePath.startsWith(base)) return null;
  return filePath;
}

function trySendFile(res, filePath) {
  if (!filePath || !fs.existsSync(filePath)) return false;

  const stat = fs.statSync(filePath);
  if (!stat.isFile()) return false;

  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
  });

  fs.createReadStream(filePath).pipe(res);
  return true;
}

function getStaticFile(urlPath) {
  const requestPath = urlPath === '/' ? '/index.html' : urlPath;

  for (const dir of STATIC_DIRS) {
    const filePath = safePath(dir, requestPath);
    if (filePath && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return filePath;
    }
  }

  return null;
}

const demoData = {
  products: [
    { id: 'portal-365', name: 'Эмульсия 365', unit: '22 кг', status: 'Используется' },
    { id: 'jd-1', name: 'Эмульсия Джей-Ди 1%', unit: '22 кг', status: 'Используется' },
    { id: 'veil', name: 'Эмульсион Вуаль', unit: '20 кг', status: 'Используется' },
    { id: 'pink', name: 'Розовая пена', unit: '20 кг', status: 'Используется' },
    { id: 'yellow', name: 'Желтая пена', unit: '20 кг', status: 'Используется' },
    { id: 'blue', name: 'Синяя пена', unit: '20 кг', status: 'Используется' },
    { id: 'hydrophob', name: 'Гидрофоб', unit: '20 кг', status: 'Используется' },
  ],
  locations: [
    { id: 'dmitrovka', name: 'Дмитровка', manager: 'Денис К' },
    { id: 'psh-27', name: 'Пятницкое ш. 27', manager: 'Денис К' },
    { id: 'psh-20', name: 'Пятницкое ш. 20', manager: 'Денис К' },
    { id: 'michurinsky', name: 'Мичуринский', manager: 'Кирилл' },
    { id: 'vdnh', name: 'ВДНХ', manager: 'Роман' },
    { id: 'khimki', name: 'Химки', manager: 'Денис К' },
    { id: 'mytishchi', name: 'Мытищи', manager: 'Прогонов А' },
  ],
};

function handleApi(res, pathname) {
  if (pathname === '/api/health') {
    return sendJson(res, 200, {
      ok: true,
      service: 'PortalDash local server',
      node: process.version,
      time: new Date().toISOString(),
    });
  }

  if (pathname === '/api/products') {
    return sendJson(res, 200, demoData.products);
  }

  if (pathname === '/api/locations') {
    return sendJson(res, 200, demoData.locations);
  }

  if (pathname === '/api/dashboard') {
    return sendJson(res, 200, {
      products: demoData.products,
      locations: demoData.locations,
      message: 'Сервер запущен. Для реальных данных нужен отдельный импорт Excel.',
    });
  }

  return sendJson(res, 404, {
    error: 'API endpoint not found',
    path: pathname,
  });
}

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = requestUrl.pathname;

  if (pathname.startsWith('/api/')) {
    return handleApi(res, pathname);
  }

  const directFile = getStaticFile(pathname);
  if (directFile && trySendFile(res, directFile)) {
    return;
  }

  const spaIndex = [
    path.join(ROOT, 'build', 'index.html'),
    path.join(ROOT, 'public', 'index.html'),
    path.join(ROOT, 'index.html'),
  ].find(fs.existsSync);

  if (spaIndex && trySendFile(res, spaIndex)) {
    return;
  }

  send(
    res,
    200,
    `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>PortalDash</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #0f172a;
      color: #e2e8f0;
      font-family: Arial, sans-serif;
    }
    main {
      width: min(700px, calc(100% - 48px));
      padding: 32px;
      background: #1e293b;
      border-radius: 16px;
      box-shadow: 0 20px 50px rgba(0,0,0,.35);
    }
    code {
      padding: 4px 8px;
      border-radius: 6px;
      background: #0f172a;
      color: #7dd3fc;
    }
  </style>
</head>
<body>
  <main>
    <h1>PortalDash запущен</h1>
    <p>Сервер работает на <code>http://localhost:${PORT}</code>.</p>
    <p>Фронтенд не найден: создай папку <code>build</code> с <code>index.html</code> или положи <code>index.html</code> в корень проекта.</p>
    <p>Проверка сервера: <a href="/api/health" style="color:#7dd3fc">/api/health</a></p>
  </main>
</body>
</html>`,
    'text/html; charset=utf-8',
  );
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`PortalDash started: http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});

server.on('error', (error) => {
  console.error('Server error:', error.message);

  if (error.code === 'EADDRINUSE') {
    console.error(`Порт ${PORT} уже занят. Запусти: $env:PORT=3001; node server.js`);
  }

  process.exit(1);
});