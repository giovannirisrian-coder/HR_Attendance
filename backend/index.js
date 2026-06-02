const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
const { startAttendanceSyncSchedulers } = require('./src/services/attendanceSyncSchedulerService');

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const { authenticate, authorize } = require('./src/middleware/auth');
const attendanceController = require('./src/controllers/attendanceController');
const leaveController = require('./src/controllers/leaveController');

app.get(
  '/api/leaves/team/month-stats',
  authenticate,
  authorize('ls_supervisor'),
  leaveController.getTeamLeavesMonthStats
);
app.get(
  '/api/leaves/team/employees-overview',
  authenticate,
  authorize('ls_supervisor'),
  leaveController.getTeamLeavesEmployeesOverview
);

app.use('/api/auth',       require('./src/routes/auth'));
app.use('/api/attendance', require('./src/routes/attendance'));
app.use('/api/leaves',     require('./src/routes/leaves'));
app.use('/api/overtimes',  require('./src/routes/overtimes'));
app.use('/api/reports',    require('./src/routes/reports'));
app.use('/api/users',      require('./src/routes/users'));
app.use('/api/glog',       require('./src/routes/glog'));
app.use('/api/employees',  require('./src/routes/hrEmployees'));
app.use('/api/attendance-sync', require('./src/routes/attendanceSyncScheduler'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString(), service: 'Berau Coal Attendance API' });
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Endpoint not found.' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: err.message || 'Internal server error.' });
});

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';
app.listen(PORT, HOST, () => {
  startAttendanceSyncSchedulers();
  console.log(`Berau Coal Attendance API running on http://${HOST}:${PORT}`);
});

module.exports = app;
