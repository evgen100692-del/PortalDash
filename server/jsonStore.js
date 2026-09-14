'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class DataStoreError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'DataStoreError';
    this.code = options.code || 'DATA_STORE_ERROR';
    this.file = options.file;
  }
}

class JsonStore {
  constructor(fileName, options = {}) {
    this.dataDir = options.dataDir || process.env.PORTALDASH_DATA_DIR || path.join(__dirname, 'data');
    this.file = path.join(this.dataDir, fileName);
    this.backupFile = `${this.file}.bak`;
    this.validate = options.validate || (value => Array.isArray(value));
    fs.mkdirSync(this.dataDir, { recursive: true });
  }

  read() {
    let text;
    try {
      text = fs.readFileSync(this.file, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw this.wrap(error, 'Не удалось прочитать хранилище', 'DATA_STORE_READ_FAILED');
    }

    try {
      const value = JSON.parse(text);
      if (!this.validate(value)) throw new TypeError('Некорректная структура JSON');
      return value;
    } catch (error) {
      throw this.wrap(error, 'Хранилище повреждено или имеет неверный формат', 'DATA_STORE_CORRUPT');
    }
  }

  write(value) {
    if (!this.validate(value)) {
      throw new DataStoreError('Отказ записи: некорректная структура данных', {
        code: 'DATA_STORE_INVALID_VALUE', file: this.file
      });
    }

    fs.mkdirSync(this.dataDir, { recursive: true });
    const tempFile = path.join(this.dataDir, `.${path.basename(this.file)}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`);
    let fd;
    try {
      fd = fs.openSync(tempFile, 'wx');
      fs.writeFileSync(fd, JSON.stringify(value, null, 2), 'utf8');
      fs.fsyncSync(fd);
      fs.closeSync(fd);
      fd = undefined;

      if (fs.existsSync(this.file)) fs.copyFileSync(this.file, this.backupFile);
      fs.renameSync(tempFile, this.file);
    } catch (error) {
      if (fd !== undefined) {
        try { fs.closeSync(fd); } catch { /* исходная ошибка важнее */ }
      }
      try { fs.unlinkSync(tempFile); } catch { /* временный файл мог не создаться */ }
      if (error instanceof DataStoreError) throw error;
      throw this.wrap(error, 'Не удалось атомарно записать хранилище', 'DATA_STORE_WRITE_FAILED');
    }
  }

  health() {
    try {
      const value = this.read();
      return { ok: true, file: this.file, entries: value.length };
    } catch (error) {
      return { ok: false, file: this.file, code: error.code, message: error.message };
    }
  }

  wrap(error, message, code) {
    return new DataStoreError(`${message}: ${path.basename(this.file)}`, {
      cause: error, code, file: this.file
    });
  }
}

module.exports = { JsonStore, DataStoreError };
