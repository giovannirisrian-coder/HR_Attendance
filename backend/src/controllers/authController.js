const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
require('dotenv').config();

// Minimum length enforced server-side for any new password chosen during
// the first-time-login "Force Password Change" flow. Mirrors the
// client-side validation so the two can never drift.
const MIN_PASSWORD_LENGTH = 8;
const BCRYPT_COST = 10;

const login = async (req, res) => {
  try {
    // Authentication is SID-based: users sign in with their System ID
    // (sid) + password. `email` is no longer a credential. We still
    // accept it under the legacy `email` key for backward-compatible
    // clients, but `sid` is the canonical field.
    const { sid, password } = req.body;
    const loginSid = sid !== undefined && sid !== null ? sid : req.body.email;

    if (!loginSid || !password) {
      return res.status(400).json({ success: false, message: 'SID and password are required.' });
    }

    const [rows] = await db.query(
      `SELECT u.*, v.name AS vendor_name, v.code AS vendor_code, e.npk AS npk
       FROM users u
       LEFT JOIN vendors v  ON u.vendor_id = v.id
       LEFT JOIN hr_employees e ON e.user_id = u.id
       WHERE u.sid = ? AND u.is_active = 1`,
      [loginSid]
    );

    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    // First-time login gate ("Force Password Change"). The account was
    // provisioned with the shared default password, so we must NOT issue a
    // session token yet. We return a 200 with `mustChangePassword: true`
    // (and echo the SID) so the client can pop the change-password dialog.
    // The flag is cleared by changePassword(), after which a fresh login
    // with the new password proceeds normally below.
    if (user.is_first_login) {
      return res.json({
        success: true,
        mustChangePassword: true,
        sid: user.sid,
        message: 'You must change your password before continuing.',
      });
    }

    const payload = {
      id: user.id,
      name: user.name,
      sid: user.sid,
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
        sid: user.sid,
        email: user.email,
        role: user.role,
        employee_id: user.employee_id,
        npk: user.npk || null,
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

/**
 * POST /api/auth/change-password
 *
 * First-time login "Force Password Change". Public (no JWT) by design:
 * a first-login user has not been issued a token yet (login() withholds
 * it). Security is preserved by re-verifying the SID + current (default)
 * password before accepting the new one — exactly the same proof of
 * identity as a normal login.
 *
 * On success the new password is bcrypt-hashed (same cost as the seed
 * users) and `is_first_login` is flipped to 0 so the popup never appears
 * again. The user can then sign in normally with the new password.
 */
const changePassword = async (req, res) => {
  try {
    const { password, currentPassword, newPassword, confirmPassword } = req.body;
    const sid = req.body.sid !== undefined && req.body.sid !== null ? req.body.sid : req.body.email;
    // Accept either `currentPassword` or the legacy `password` key for the
    // existing/default credential.
    const current = currentPassword !== undefined ? currentPassword : password;

    if (!sid || !current || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'SID, current password and new password are required.',
      });
    }

    if (String(newPassword).length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        success: false,
        message: `New password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      });
    }

    // Confirm match server-side too — the client validates this, but we
    // never trust the client alone.
    if (confirmPassword !== undefined && String(newPassword) !== String(confirmPassword)) {
      return res.status(400).json({
        success: false,
        message: 'New password and confirmation do not match.',
      });
    }

    const [rows] = await db.query(
      `SELECT id, password, is_first_login FROM users WHERE sid = ? AND is_active = 1`,
      [sid]
    );

    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    const user = rows[0];
    const isMatch = await bcrypt.compare(current, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    const newHash = await bcrypt.hash(String(newPassword), BCRYPT_COST);
    await db.query(
      `UPDATE users SET password = ?, is_first_login = 0 WHERE id = ?`,
      [newHash, user.id]
    );

    res.json({
      success: true,
      message: 'Password changed successfully. Please sign in with your new password.',
    });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

const getProfile = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT u.id, u.name, u.sid, u.email, u.role, u.employee_id, u.vendor_id, u.supervisor_id,
              v.name AS vendor_name,
              e.npk  AS npk
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

module.exports = { login, changePassword, getProfile };
