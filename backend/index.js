const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/auth',       require('./src/routes/auth'));
app.use('/api/attendance', require('./src/routes/attendance'));
app.use('/api/leaves',     require('./src/routes/leaves'));
app.use('/api/reports',    require('./src/routes/reports'));
app.use('/api/users',      require('./src/routes/users'));

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
app.listen(PORT, () => {
  console.log(`Berau Coal Attendance API running on http://localhost:${PORT}`);
});

module.exports = app;
