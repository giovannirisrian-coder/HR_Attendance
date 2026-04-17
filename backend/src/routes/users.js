const express = require('express');
const router = express.Router();
const db = require('../config/database');
const bcrypt = require('bcryptjs');
const { authenticate, authorize } = require('../middleware/auth');

// List all users (admin utility)
router.get('/', authenticate, authorize('ls_supervisor', 'vendor'), async (req, res) => {
  try {
    const { role, vendor_id } = req.query;
    let where = 'WHERE 1=1';
    const params = [];
    if (role)      { where += ' AND u.role = ?';      params.push(role); }
    if (vendor_id) { where += ' AND u.vendor_id = ?'; params.push(vendor_id); }

    const [rows] = await db.query(
      `SELECT u.id, u.name, u.employee_id, u.email, u.role, u.vendor_id, u.supervisor_id,
              u.is_active, u.created_at, v.name AS vendor_name, s.name AS supervisor_name
       FROM users u
       LEFT JOIN vendors v ON u.vendor_id = v.id
       LEFT JOIN users s  ON u.supervisor_id = s.id
       ${where} ORDER BY u.name`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// Create user
router.post('/', authenticate, authorize('ls_supervisor', 'vendor'), async (req, res) => {
  try {
    const { name, employee_id, email, password, role, vendor_id, supervisor_id } = req.body;
    const hash = await bcrypt.hash(password, 10);
    await db.query(
      'INSERT INTO users (name, employee_id, email, password, role, vendor_id, supervisor_id) VALUES (?,?,?,?,?,?,?)',
      [name, employee_id || null, email, hash, role, vendor_id || null, supervisor_id || null]
    );
    res.json({ success: true, message: 'User created.' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'Email or employee ID already exists.' });
    }
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// List vendors
router.get('/vendors', authenticate, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM vendors WHERE is_active = 1 ORDER BY name');
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
