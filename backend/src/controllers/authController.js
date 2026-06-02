const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
require('dotenv').config();

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const [rows] = await db.query(
      `SELECT u.*, v.name AS vendor_name, v.code AS vendor_code, e.nik AS nik
       FROM users u
       LEFT JOIN vendors v  ON u.vendor_id = v.id
       LEFT JOIN hr_employees e ON e.user_id = u.id
       WHERE u.email = ? AND u.is_active = 1`,
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    const payload = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      vendor_id: user.vendor_id,
      supervisor_id: user.supervisor_id,
      employee_id: user.employee_id,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    });

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        employee_id: user.employee_id,
        nik: user.nik || null,
        vendor_id: user.vendor_id,
        vendor_name: user.vendor_name,
        supervisor_id: user.supervisor_id,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

const getProfile = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT u.id, u.name, u.email, u.role, u.employee_id, u.vendor_id, u.supervisor_id,
              v.name AS vendor_name,
              e.nik  AS nik
       FROM users u
       LEFT JOIN vendors  v ON u.vendor_id = v.id
       LEFT JOIN hr_employees e ON e.user_id = u.id
       WHERE u.id = ?`,
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    res.json({ success: true, user: rows[0] });
  } catch (err) {
    console.error('Profile error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = { login, getProfile };
