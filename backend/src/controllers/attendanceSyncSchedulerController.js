const {
  runFtmSync,
  runFingerspotSync,
  getSchedulerStatus,
} = require('../services/attendanceSyncSchedulerService');

const getAttendanceSyncSchedulerStatus = async (req, res) => {
  return res.json({
    success: true,
    data: getSchedulerStatus(),
  });
};

const triggerFtmSchedulerNow = async (req, res) => {
  const result = await runFtmSync();
  return res.status(400).json({
    success: false,
    message: result.reason,
    cli_command: result.cli_command,
  });
};

const triggerFingerspotSchedulerNow = async (req, res) => {
  const result = await runFingerspotSync();
  return res.status(400).json({
    success: false,
    message: result.reason,
    cli_command: result.cli_command,
  });
};

module.exports = {
  getAttendanceSyncSchedulerStatus,
  triggerFtmSchedulerNow,
  triggerFingerspotSchedulerNow,
};
