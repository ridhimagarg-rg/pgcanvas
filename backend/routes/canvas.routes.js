const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth.middleware');
const canvasController = require('../controllers/canvas.controller');

router.use(auth);

router.get('/:connectionId/schema', canvasController.getSchema);
router.get('/:connectionId/table/:tableName', canvasController.getTableData);
router.post('/:connectionId/table/:tableName', canvasController.createRecord);
router.put('/:connectionId/table/:tableName/:primaryKey', canvasController.updateRecord);
router.delete('/:connectionId/table/:tableName/:primaryKey', canvasController.deleteRecord);

module.exports = router;
