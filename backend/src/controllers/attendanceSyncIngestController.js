const db = require('../config/database');
const {
  upsertAttendanceFromGlogDailyRow,
  tallyUpsertStats,
  emptyAttendanceSyncStats,
} = require('../services/glogAttendanceService');

const GLOG_UPSERT_OPTS = { createEmployeeIfUnmatched: false };

const ingestAttendanceSync = async (req, res) => {
  const { source, date_from, date_to, daily_rows } = req.body || {};

  if (!Array.isArray(daily_rows)) {
    return res.status(400).json({
      success: false,
      message: 'daily_rows wajib berupa array.',
    });
  }

  const stats = {
    ...emptyAttendanceSyncStats(),
    source: source || 'unknown',
    date_from: date_from || null,
    date_to: date_to || null,
    daily_row_count: daily_rows.length,
  };

  const conn = await db.getConnection();
  try {
    for (const row of daily_rows) {
      const result = await upsertAttendanceFromGlogDailyRow(conn, row, GLOG_UPSERT_OPTS);
      tallyUpsertStats(stats, result);
    }

    return res.json({
      success: true,
      data: stats,
    });
  } catch (err) {
    console.error('attendance sync ingest error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Gagal memproses ingest attendance sync.',
    });
  } finally {
    conn.release();
  }
};

module.exports = {
  ingestAttendanceSync,
};
