// Генерация Excel-отчётов (ExcelJS)
const ExcelJS = require('exceljs');

async function buildObjectExcelReport(object, history) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(object.name.substring(0, 31));

  sheet.addRow(['Объект', object.name]);
  sheet.addRow(['Адрес', object.address || '']);
  sheet.addRow(['Ответственный ТУ', object.responsible_tu || '']);
  sheet.addRow(['Телефон', object.phone || '']);
  sheet.addRow([]);

  const headerRow = sheet.addRow([
    'Неделя', 'Вид химии', 'Списание', 'Остаток', 'Заказ ТУ', 'Доставка факт', 'Стоимость', 'Перемещ/возврат'
  ]);
  headerRow.font = { bold: true };
  headerRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF7A1A' } };
    cell.font = { bold: true, color: { argb: 'FF000000' } };
  });

  history.forEach(row => {
    sheet.addRow([
      row.week_start_date, row.chemical_type, row.writeoff, row.balance,
      row.delivery_order, row.delivery_fact, row.cost, row.transfer_return
    ]);
  });

  sheet.columns.forEach(col => { col.width = 16; });

  return workbook;
}

module.exports = { buildObjectExcelReport };
