'use strict';

const fs = require('fs');
const path = require('path');
const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile) && typeof process.loadEnvFile === 'function') process.loadEnvFile(envFile);

require('./analyticsSync').syncNow()
  .then(result => console.log(`Готово: ${result.sheets} вкладок, ${result.rows} строк, ${result.synced_at}`))
  .catch(error => {
    console.error(`Ошибка синхронизации: ${error.message}`);
    process.exitCode = 1;
  });
