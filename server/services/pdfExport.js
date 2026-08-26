'use strict';
function getPdfKit() { try { return require('pdfkit'); } catch (error) { const missing = new Error('PDF-экспорт недоступен: установите пакет pdfkit командой npm install pdfkit'); missing.code = 'PDFKIT_MISSING'; missing.cause = error; throw missing; } }
function createPdf(...args) { const PDFDocument = getPdfKit(); return new PDFDocument(...args); }
module.exports = { getPdfKit, createPdf };
