require('dotenv').config();

const authenticateSyncApi = (req, res, next) => {
  const configuredKey = String(process.env.ATTENDANCE_SYNC_API_KEY || '').trim();
  if (!configuredKey) {
    return res.status(503).json({
      success: false,
      message: 'Attendance sync API key belum dikonfigurasi di server.',
    });
  }

  const headerKey = String(req.headers['x-attendance-sync-key'] || '').trim();
  if (!headerKey || headerKey !== configuredKey) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or missing sync API key.',
    });
  }

  next();
};

module.exports = { authenticateSyncApi };
