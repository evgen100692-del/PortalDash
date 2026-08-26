const express = require('express');
const router = express.Router();
const exportService = require('../services/pdfExport');
router.get('/pdf', (req, res) => {
  try {
    const doc = exportService.createPdf();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="portaldash-export.pdf"');
    doc.pipe(res);
    doc.text('PortalDash export');
    doc.end();
  } catch (error) {
    if (error.code === 'PDFKIT_MISSING') return res.status(503).json({ error: error.message });
    return res.status(500).json({ error: 'Не удалось сформировать PDF' });
  }
});
module.exports = router;
