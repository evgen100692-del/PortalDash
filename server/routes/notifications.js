const express = require('express');
const router = express.Router();
const db = require('../notificationsDb');

router.get('/', (req, res) => {
  const { entity, id } = req.query;
  if (entity && id != null) return res.json(db.list({ entity, id }));
  res.json(db.list());
});

module.exports = router;
