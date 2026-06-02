/**
 * LS HR ➜ Employee List controller (CRUD for `hr_employees`).
 *
 * Backs the `/api/employees` endpoints used by the LS HR (PIC LS) role
 * to maintain the BAST Check master data set. This module is intentionally
 * ISOLATED from the legacy `employees` table that is referenced by
 * `attendance.employee_id` — the established attendance workflow is preserved.
 */

const db = require('../config/database');

// ── Field whitelisting / validation helpers ────────────────────────────────
//
// LS HR (PIC LS) needs flexibility to capture personnel data that may still
// be incomplete at the time of initial registration, so every field below is
// OPTIONAL. The only validation we still apply is:
//   1. Max length per column (protects against accidental oversize payloads).
//   2. Enum value membership (when an enum field is provided as non-empty).
//
// PO Period 1 / PO Period 2 are intentionally treated as free-text strings
// (see migration_hr_employees_optional_fields.sql) so HR can enter wording
// like "Jan 2026 - Dec 2026" instead of being forced into a calendar picker.
const TEXT_FIELDS = [
  'vendor_number',
  'user_department',
  'department_title',
  'vendor_name',
  'po_number',
  'po_period_1',
  'po_period_2',
  'dic_hro',
  'cost_center',
  'npk',
  'employee_name',
  'position',
  'position_group',
  'category',
  'site',
  'supervisor_nik',
  'supervisor_name',
];
const ENUM_FIELDS = {
  employment_status: ['Permanent', 'Contract'],
  user_status: ['Active', 'Deactive'],
};

const MAX_LENGTHS = {
  vendor_number: 64,
  user_department: 150,
  department_title: 150,
  vendor_name: 200,
  po_number: 64,
  po_period_1: 100,
  po_period_2: 100,
  dic_hro: 150,
  cost_center: 64,
  npk: 64,
  employee_name: 200,
  position: 150,
  position_group: 150,
  category: 100,
  site: 100,
  supervisor_nik: 64,
  supervisor_name: 200,
};

const SELECT_COLS = `
  id, vendor_number, user_department, department_title, vendor_name,
  employment_status, po_number, po_period_1, po_period_2, dic_hro, cost_center,
  npk, employee_name, position, position_group, category, site,
  supervisor_nik, supervisor_name, user_status,
  created_by, updated_by, created_at, updated_at
`;

const sanitizeText = (raw) => {
  if (raw === undefined || raw === null) return '';
  return String(raw).trim();
};

/**
 * Validate + normalize a request body into a column => value map.
 *
 * All fields are OPTIONAL. Empty / missing values are coerced to `null` so
 * that nullable columns receive NULL rather than an empty string. Enum fields
 * are only validated when a non-empty value is provided.
 *
 * @param {object} body
 * @param {{ partial?: boolean }} [opts] — when partial=true, fields that are
 *   completely absent from `body` are omitted from the result (PATCH-style).
 *   When partial=false (POST), every column is included so the INSERT covers
 *   the full row.
 * @returns {{ ok: boolean, fields?: Record<string, string|null>, error?: string }}
 */
const validateBody = (body, opts = {}) => {
  const partial = !!opts.partial;
  const fields = {};

  for (const f of TEXT_FIELDS) {
    if (partial && body[f] === undefined) continue;
    const v = sanitizeText(body[f]);
    if (v.length > MAX_LENGTHS[f]) {
      return { ok: false, error: `Field "${f}" is too long (max ${MAX_LENGTHS[f]} chars).` };
    }
    fields[f] = v === '' ? null : v;
  }

  for (const [f, allowed] of Object.entries(ENUM_FIELDS)) {
    if (partial && body[f] === undefined) continue;
    const v = sanitizeText(body[f]);
    if (v === '') {
      // `user_status` is NOT NULL (DEFAULT 'Active') in the schema, so an
      // empty value is coerced to the default instead of stored as NULL.
      fields[f] = f === 'user_status' ? 'Active' : null;
      continue;
    }
    if (!allowed.includes(v)) {
      return {
        ok: false,
        error: `Field "${f}" must be one of: ${allowed.join(', ')}.`,
      };
    }
    fields[f] = v;
  }

  return { ok: true, fields };
};

// ── Controller actions ─────────────────────────────────────────────────────

/**
 * GET /api/employees
 * Query params: page, limit, search, supervisor, site, vendor, status.
 * `search` matches employee_name OR npk.
 * `supervisor` matches supervisor_name.
 * `vendor` matches vendor_name (exact when option, contains when free text).
 */
const listEmployees = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 200);
    const offset = (page - 1) * limit;

    const search = sanitizeText(req.query.search);
    const supervisor = sanitizeText(req.query.supervisor);
    const site = sanitizeText(req.query.site);
    const vendor = sanitizeText(req.query.vendor);
    const status = sanitizeText(req.query.status);

    let where = 'WHERE 1=1';
    const params = [];
    if (search) {
      where += ' AND (employee_name LIKE ? OR npk LIKE ?)';
      const t = `%${search}%`;
      params.push(t, t);
    }
    if (supervisor) {
      where += ' AND supervisor_name LIKE ?';
      params.push(`%${supervisor}%`);
    }
    if (site) {
      where += ' AND site = ?';
      params.push(site);
    }
    if (vendor) {
      where += ' AND vendor_name = ?';
      params.push(vendor);
    }
    if (status) {
      if (!ENUM_FIELDS.user_status.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status. Must be one of: ${ENUM_FIELDS.user_status.join(', ')}.`,
        });
      }
      where += ' AND user_status = ?';
      params.push(status);
    }

    const [rows] = await db.query(
      `SELECT ${SELECT_COLS}
         FROM hr_employees
         ${where}
         ORDER BY employee_name ASC, id ASC
         LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM hr_employees ${where}`,
      params
    );

    // Reference lists for client-side filter dropdowns (small sets).
    const [siteRows] = await db.query(
      `SELECT DISTINCT site FROM hr_employees WHERE site IS NOT NULL AND site <> '' ORDER BY site ASC`
    );
    const [vendorRows] = await db.query(
      `SELECT DISTINCT vendor_name FROM hr_employees WHERE vendor_name IS NOT NULL AND vendor_name <> '' ORDER BY vendor_name ASC`
    );

    const [[counts]] = await db.query(
      `SELECT
         COUNT(*) AS total_all,
         SUM(CASE WHEN user_status = 'Active'   THEN 1 ELSE 0 END) AS active_count,
         SUM(CASE WHEN user_status = 'Deactive' THEN 1 ELSE 0 END) AS deactive_count,
         COUNT(DISTINCT vendor_name) AS vendor_count
       FROM hr_employees`
    );

    res.json({
      success: true,
      data: rows,
      pagination: { total: Number(total) || 0, page, limit },
      meta: {
        sites: siteRows.map((r) => r.site),
        vendors: vendorRows.map((r) => r.vendor_name),
        summary: {
          total: Number(counts.total_all) || 0,
          active: Number(counts.active_count) || 0,
          deactive: Number(counts.deactive_count) || 0,
          vendors: Number(counts.vendor_count) || 0,
        },
      },
    });
  } catch (err) {
    console.error('List hr_employees error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/employees/:id
 */
const getEmployeeById = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid employee id.' });
    }

    const [rows] = await db.query(
      `SELECT ${SELECT_COLS} FROM hr_employees WHERE id = ? LIMIT 1`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Employee not found.' });
    }
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('Get hr_employee error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * POST /api/employees
 */
const createEmployee = async (req, res) => {
  try {
    const v = validateBody(req.body, { partial: false });
    if (!v.ok) {
      return res.status(400).json({ success: false, message: v.error });
    }

    const f = v.fields;
    const createdBy = req.user?.id || null;

    const [ins] = await db.query(
      `INSERT INTO hr_employees (
         vendor_number, user_department, department_title, vendor_name,
         employment_status, po_number, po_period_1, po_period_2, dic_hro, cost_center,
         npk, employee_name, position, position_group, category, site,
         supervisor_nik, supervisor_name, user_status, created_by, updated_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        f.vendor_number, f.user_department, f.department_title, f.vendor_name,
        f.employment_status, f.po_number, f.po_period_1, f.po_period_2, f.dic_hro, f.cost_center,
        f.npk, f.employee_name, f.position, f.position_group, f.category, f.site,
        f.supervisor_nik, f.supervisor_name, f.user_status, createdBy, createdBy,
      ]
    );

    const [rows] = await db.query(
      `SELECT ${SELECT_COLS} FROM hr_employees WHERE id = ? LIMIT 1`,
      [ins.insertId]
    );

    res.status(201).json({
      success: true,
      message: 'Employee created successfully.',
      data: rows[0],
    });
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: 'NPK already exists. Please use a unique Employee ID.',
      });
    }
    console.error('Create hr_employee error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * PUT /api/employees/:id
 * Accepts a full payload or a partial subset of fields.
 */
const updateEmployee = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid employee id.' });
    }

    const [existingRows] = await db.query(
      `SELECT id FROM hr_employees WHERE id = ? LIMIT 1`,
      [id]
    );
    if (existingRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

    const v = validateBody(req.body, { partial: true });
    if (!v.ok) {
      return res.status(400).json({ success: false, message: v.error });
    }

    const fields = { ...v.fields };

    const keys = Object.keys(fields);
    if (keys.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields to update.',
      });
    }

    const setClause = keys.map((k) => `${k} = ?`).join(', ');
    const values = keys.map((k) => fields[k]);
    const updatedBy = req.user?.id || null;

    await db.query(
      `UPDATE hr_employees SET ${setClause}, updated_by = ? WHERE id = ?`,
      [...values, updatedBy, id]
    );

    const [rows] = await db.query(
      `SELECT ${SELECT_COLS} FROM hr_employees WHERE id = ? LIMIT 1`,
      [id]
    );

    res.json({
      success: true,
      message: 'Employee updated successfully.',
      data: rows[0],
    });
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: 'NPK already exists. Please use a unique Employee ID.',
      });
    }
    console.error('Update hr_employee error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = {
  listEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
};
