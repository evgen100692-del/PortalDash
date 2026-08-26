# PortalDash

## Запуск на Node.js 24

Требуется Node.js 24.15.0 или новее.

```powershell
cd E:\projects\PortalDash\PortalDash
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item package-lock.json -ErrorAction SilentlyContinue
npm install
npm start
```

Откройте http://localhost:3000.

Приложение не использует нативные Node.js-модули для хранения карточек объектов: данные сохраняются в `server/data/objects.json`, поэтому для запуска не нужны Visual Studio Build Tools. Для PDF-экспорта устанавливается пакет `pdfkit` вместе с остальными зависимостями.
