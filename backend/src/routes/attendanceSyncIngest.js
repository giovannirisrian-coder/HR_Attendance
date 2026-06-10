const express = require('express');
const router = express.Router();
const { authenticateSyncApi } = require('../middleware/syncApiAuth');
const { ingestAttendanceSync } = require('../controllers/attendanceSyncIngestController');

router.post('/ingest', authenticateSyncApi, ingestAttendanceSync);

module.exports = router;
