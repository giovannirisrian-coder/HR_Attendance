const {
  runFtmSync,
  runFingerspotSync,
  getSchedulerStatus,
} = require('../services/attendanceSyncSchedulerService');

const parseBool = (raw, fallback = false) => {
  if (raw === undefined || raw === null) return fallback;
  if (typeof raw === 'boolean') return raw;
  const v = String(raw).trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'y';
};

const getAttendanceSyncSchedulerStatus = async (req, res) => {
  return res.json({
    success: true,
    data: getSchedulerStatus(),
  });
};

const triggerFtmSchedulerNow = async (req, res) => {
  try {
    const payload = {
      reason: 'manual_api',
      dateFrom: req.body?.date_from || undefined,
      dateTo: req.body?.date_to || undefined,
      createEmployeeIfUnmatched: parseBool(req.body?.create_employees, false),
    };
    const result = await runFtmSync(payload);
    if (result.skipped) {
      return res.status(202).json({
        success: true,
        message: result.reason || 'FTM sync skipped.',
      });
    }
    return res.status(200).json({
      success: true,
      message: 'FTM sync executed.',
      data: result.result || null,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'FTM sync failed.' });
  }
};

const triggerFingerspotSchedulerNow = async (req, res) => {
  try {
    const payload = {
      reason: 'manual_api',
      dateFrom: req.body?.date_from || undefined,
      dateTo: req.body?.date_to || undefined,
      createEmployeeIfUnmatched: parseBool(req.body?.create_employees, false),
    };
    const result = await runFingerspotSync(payload);
    if (result.skipped) {
      return res.status(202).json({
        success: true,
        message: result.reason || 'Fingerspot sync skipped.',
      });
    }
    return res.status(200).json({
      success: true,
      message: 'Fingerspot sync executed.',
      data: result.result || null,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Fingerspot sync failed.' });
  }
};

module.exports = {
  getAttendanceSyncSchedulerStatus,
  triggerFtmSchedulerNow,
  triggerFingerspotSchedulerNow,
};
