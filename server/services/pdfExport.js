// Генерация PDF-отчётов (PDFKit)
const PDFDocument = require('pdfkit');

const COLOR_ORANGE = '#ff7a1a';

function buildObjectPdfReport(object, history) {
  const doc = new PDFDocument({ margin: 40 });

  doc.fontSize(18).fillColor(COLOR_ORANGE).text(`Отчёт по объекту: ${object.name}`);
  doc.moveDown(0.5);
  doc.fontSize(10).fillColor('#333')
    .text(`Адрес: ${object.address || '—'}`)
    .text(`Ответственный ТУ: ${object.responsible_tu || '—'}`)
    .text(`Телефон: ${object.phone || '—'}`)
    .text(`Город: ${object.city || '—'}`);
  doc.moveDown(1);

  doc.fontSize(13).fillColor(COLOR_ORANGE).text('История поставок / списаний');
  doc.moveDown(0.3);

  doc.fontSize(9).fillColor('#000');
  history.forEach(row => {
    doc.text(
      `${row.week_start_date}  |  ${row.chemical_type}  |  списание: ${row.writeoff}  |  остаток: ${row.balance}  |  стоимость: ${row.cost} руб.`
    );
  });

  doc.end();
  return doc;
}

function buildPeriodPdfReport({ from, to }, rows) {
  const doc = new PDFDocument({ margin: 40 });

  doc.fontSize(18).fillColor(COLOR_ORANGE).text('Сводный отчёт за период');
  doc.fontSize(10).fillColor('#333').text(`Период: ${from || 'начало'} — ${to || 'сейчас'}`);
  doc.moveDown(1);

  doc.fontSize(9).fillColor('#000');
  rows.forEach(row => {
    doc.text(
      `${row.object_name}  |  ${row.chemical_type}  |  списание: ${row.writeoff}  |  стоимость: ${row.cost} руб.`
    );
  });

  doc.end();
  return doc;
}

module.exports = { buildObjectPdfReport, buildPeriodPdfReport };
