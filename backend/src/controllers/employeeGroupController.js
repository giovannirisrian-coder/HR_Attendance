/**
 * LS HR ➜ Employee Group master data controller.
 * Backs `/api/employee-groups` for the Master Data module.
 */

const db = require('../config/database');

const GROUP_NAME_MAX = 150;

const sanitizeText = (raw) => {
  if (raw === undefined || raw === null) return '';
  return String(raw).trim();
};

const resolveActorName = async (executor, userId) => {
  if (!userId) return null;
  try {
    const [rows] = await executor.query(
      'SELECT name FROM users WHERE id = ? LIMIT 1',
      [userId]
    );
    return rows.length ? rows[0].name : null;
  } catch (err) {
    console.error('Resolve actor name error:', err);
    return null;
  }
};

/**
 * GET /api/employee-groups
 */
const listEmployeeGroups = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, employee_group, created_by, created_at, updated_at
         FROM employee_group
        ORDER BY employee_group ASC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('List employee groups error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/employee-groups/:id
 */
const getEmployeeGroupById = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid employee group id.' });
    }

    const [rows] = await db.query(
      `SELECT id, employee_group, created_by, created_at, updated_at
         FROM employee_group
        WHERE id = ?
        LIMIT 1`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Employee group not found.' });
    }
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('Get employee group error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * POST /api/employee-groups
 */
const createEmployeeGroup = async (req, res) => {
  const name = sanitizeText(req.body?.employee_group);
  if (!name) {
    return res.status(400).json({ success: false, message: 'Field "Employee Group" is required.' });
  }
  if (name.length > GROUP_NAME_MAX) {
    return res.status(400).json({
      success: false,
      message: `Field "Employee Group" is too long (max ${GROUP_NAME_MAX} chars).`,
    });
  }

  try {
    const actorName = await resolveActorName(db, req.user?.id || null);
    const [ins] = await db.query(
      `INSERT INTO employee_group (employee_group, created_by) VALUES (?, ?)`,
      [name, actorName]
    );

    const [rows] = await db.query(
      `SELECT id, employee_group, created_by, created_at, updated_at
         FROM employee_group
        WHERE id = ?
        LIMIT 1`,
      [ins.insertId]
    );

    res.status(201).json({
      success: true,
      message: 'Employee group created.',
      data: rows[0],
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: 'An employee group with this name already exists.',
      });
    }
    console.error('Create employee group error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * PUT /api/employee-groups/:id
 */
const updateEmployeeGroup = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ success: false, message: 'Invalid employee group id.' });
  }

  const name = sanitizeText(req.body?.employee_group);
  if (!name) {
    return res.status(400).json({ success: false, message: 'Field "Employee Group" is required.' });
  }
  if (name.length > GROUP_NAME_MAX) {
    return res.status(400).json({
      success: false,
      message: `Field "Employee Group" is too long (max ${GROUP_NAME_MAX} chars).`,
    });
  }

  try {
    const [existing] = await db.query(
      'SELECT id FROM employee_group WHERE id = ? LIMIT 1',
      [id]
    );
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Employee group not found.' });
    }

    await db.query(
      'UPDATE employee_group SET employee_group = ? WHERE id = ?',
      [name, id]
    );

    const [rows] = await db.query(
      `SELECT id, employee_group, created_by, created_at, updated_at
         FROM employee_group
        WHERE id = ?
        LIMIT 1`,
      [id]
    );

    res.json({
      success: true,
      message: 'Employee group updated.',
      data: rows[0],
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: 'An employee group with this name already exists.',
      });
    }
    console.error('Update employee group error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = {
  listEmployeeGroups,
  getEmployeeGroupById,
  createEmployeeGroup,
  updateEmployeeGroup,
};
