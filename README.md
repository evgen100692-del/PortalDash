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

## Доступ из локальной сети

По умолчанию сервер слушает на всех интерфейсах (`0.0.0.0`), поэтому к нему можно
подключаться с других устройств в той же сети.

1. Запустите `npm start`. В консоли появятся строки вида:

   ```
     локально:      http://localhost:3000
     в этой сети:   http://192.168.1.42:3000
   ```

2. Один раз разрешите порт во входящих правилах брандмауэра Windows
   (PowerShell **от имени администратора**):

   ```powershell
   New-NetFirewallRule -DisplayName "PortalDash 3000" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3000
   ```

   Удалить правило позже: `Remove-NetFirewallRule -DisplayName "PortalDash 3000"`.

3. На другом устройстве (в той же сети/Wi-Fi) откройте адрес из строки
   «в этой сети», например `http://192.168.1.42:3000`.

Примечания:

- Другой порт: `$env:PORT = "8080"; npm start` (правило брандмауэра — на тот же порт).
- Только локальный доступ: `$env:HOST = "127.0.0.1"; npm start`.
- Если сеть отмечена как «Общедоступная», Windows жёстче режет входящие: переключите
  сеть в «Частная» или добавьте в правило `-Profile Any`.

Приложение не использует нативные Node.js-модули для хранения карточек объектов: данные сохраняются в `server/data/objects.json`, поэтому для запуска не нужны Visual Studio Build Tools. Для PDF-экспорта устанавливается пакет `pdfkit` вместе с остальными зависимостями.
