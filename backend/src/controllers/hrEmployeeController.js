/**
 * LS HR ➜ Employee List controller (CRUD for `hr_employees`).
 *
 * Backs the `/api/employees` endpoints used by the LS HR (PIC LS) role
 * to maintain the BAST Check master data set.
 *
 * `hr_employees` is now the consolidated employee master table:
 *  • LS HR (PIC LS) maintains the BAST fields here (vendor, PO, NPK, etc.).
 *  • Attendance / Leave / Overtime reference the same row via the
 *    `user_id` and `nik` columns added by the consolidation migration
 *    (`migration_employees_to_hr_employees.sql`). The legacy `employees`
 *    table has been retired.
 *
 * Vendor reference:
 *  • `vendor_id` is the authoritative FK → vendors(id) (added by
 *    `migration_hr_employees_vendor_fk.sql`).
 *  • `vendor_number` / `vendor_name` are kept as denormalized display
 *    copies. When a vendor is selected via the searchable lookup on
 *    the Create / Edit forms, the backend resolves the vendor record
 *    and overwrites those two columns with vendors.code / vendors.name
 *    so legacy analytics that still read the free-text columns keep
 *    working unchanged. Rows with no vendor link keep whatever
 *    free-text values HR typed in.
 *
 * Supervisor reference:
 *  • `supervisor_id` is the authoritative FK → users(id) (added by
 *    `migration_hr_employees_supervisor_fk.sql`). The selected user
 *    must have role='ls_supervisor'.
 *  • There are NO denormalized supervisor name / NIK columns — the
 *    supervisor name is resolved at read time via JOIN against
 *    `users` so it can never drift from the master record. This
 *    gives the Managerial Review stage a robust audit trail: the
 *    same `users.id` chosen by PIC LS here is the user that approves
 *    attendance / leave / overtime downstream.
 *
 * The end-to-end approval workflow (LS → Supervisor → Vendor → PIC LS →
 * SSU) is unchanged — only the vendor and supervisor references are
 * unified into FK lookups.
 */

const db = require('../config/database');

// ── Field whitelisting / validation helpers ────────────────────────────────
//
// LS HR (PIC LS) needs flexibility to capture personnel data that may still
// be incomplete at the time of initial registration, so every field below is
// OPTIONAL. The only validation we still apply is:
//   1. Max length per column (protects against accidental oversize payloads).
//   2. Enum value membership (when an enum field is provided as non-empty).
//   3. Vendor reference: vendor_id must resolve to an existing row in
//      `vendors` when supplied. On a valid match the controller also
//      overwrites vendor_number / vendor_name with the master values.
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
  'email',
  'position',
  'position_group',
  'category',
  'site',
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
  email: 190,
  position: 150,
  position_group: 150,
  category: 100,
  site: 100,
};

// Columns selected for every read (list + getById). We JOIN `vendors`
// so the response always returns the master vendor's current code /
// name — even when the denormalized `vendor_number` / `vendor_name`
// snapshots have drifted (e.g. vendor was renamed in the master table).
//
// We also JOIN `users` (aliased `s`) on the supervisor reference so the
// list / detail payloads expose `supervisor_id` (FK) and the resolved
// `supervisor_name` from the users master, even though only the ID is
// stored on hr_employees. This keeps the audit trail tied to the LS
// Supervisor's user identity that powers the Managerial Review stage.
const SELECT_COLS = `
  h.id, h.vendor_id,
  COALESCE(v.code, h.vendor_number) AS vendor_number,
  h.user_department, h.department_title,
  COALESCE(v.name, h.vendor_name) AS vendor_name,
  h.employment_status, h.po_number, h.po_period_1, h.po_period_2,
  h.dic_hro, h.cost_center,
  h.npk, h.employee_name, h.email, h.position, h.position_group,
  h.category, h.site,
  h.supervisor_id, s.name AS supervisor_name, s.employee_id AS supervisor_employee_id,
  h.user_status,
  h.created_by, h.updated_by, h.created_at, h.updated_at
`;

const FROM_JOIN = `FROM hr_employees h
  LEFT JOIN vendors v ON v.id = h.vendor_id
  LEFT JOIN users   s ON s.id = h.supervisor_id`;

const sanitizeText = (raw) => {
  if (raw === undefined || raw === null) return '';
  return String(raw).trim();
};

/**
 * Parse a vendor_id submitted from the client. Returns:
 *   { provided: false }                — field absent from payload
 *   { provided: true, value: null }    — explicit "clear vendor" (null / '' / 0)
 *   { provided: true, value: <int> }   — numeric vendor id
 *   { provided: true, error: '…' }     — non-numeric / negative input
 */
const parseVendorId = (raw) => {
  if (raw === undefined) return { provided: false };
  if (raw === null || raw === '') return { provided: true, value: null };
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    return { provided: true, error: 'Field "vendor_id" must be a positive integer or null.' };
  }
  return { provided: true, value: n };
};

/**
 * Parse a supervisor_id submitted from the client. Same semantics as
 * parseVendorId — supervisor selection is OPTIONAL so an explicit
 * null / empty string clears the relationship and a missing field
 * leaves the existing value untouched on PATCH-style updates.
 */
const parseSupervisorId = (raw) => {
  if (raw === undefined) return { provided: false };
  if (raw === null || raw === '') return { provided: true, value: null };
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    return {
      provided: true,
      error: 'Field "supervisor_id" must be a positive integer or null.',
    };
  }
  return { provided: true, value: n };
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
 * @returns {{ ok: boolean, fields?: Record<string, string|null>, vendorId?: {provided:boolean,value?:number|null}, error?: string }}
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

  const vendorId = parseVendorId(body.vendor_id);
  if (vendorId.error) {
    return { ok: false, error: vendorId.error };
  }

  const supervisorId = parseSupervisorId(body.supervisor_id);
  if (supervisorId.error) {
    return { ok: false, error: supervisorId.error };
  }

  return { ok: true, fields, vendorId, supervisorId };
};

/**
 * Resolve a vendor_id to its master record. Returns:
 *   { ok: true,  vendor: { id, code, name } | null }   — null = vendor cleared
 *   { ok: false, status, message }                      — 404 / 500
 */
const resolveVendor = async (vendorId) => {
  if (vendorId == null) return { ok: true, vendor: null };
  try {
    const [rows] = await db.query(
      'SELECT id, code, name FROM vendors WHERE id = ? LIMIT 1',
      [vendorId]
    );
    if (rows.length === 0) {
      return { ok: false, status: 400, message: 'Selected vendor does not exist.' };
    }
    return { ok: true, vendor: rows[0] };
  } catch (err) {
    console.error('Resolve vendor error:', err);
    return { ok: false, status: 500, message: 'Server error.' };
  }
};

/**
 * Resolve a supervisor_id to its master `users` record. The selected
 * user MUST have role='ls_supervisor' — picking any other role is
 * rejected so the Managerial Review stage always points at a valid
 * Leader Employee identity. Returns:
 *   { ok: true,  user: { id, name, employee_id } | null }   — null = cleared
 *   { ok: false, status, message }                            — 400 / 500
 */
const resolveSupervisor = async (userId) => {
  if (userId == null) return { ok: true, user: null };
  try {
    const [rows] = await db.query(
      `SELECT id, name, employee_id, role
         FROM users
        WHERE id = ?
        LIMIT 1`,
      [userId]
    );
    if (rows.length === 0) {
      return { ok: false, status: 400, message: 'Selected supervisor does not exist.' };
    }
    if (rows[0].role !== 'ls_supervisor') {
      return {
        ok: false,
        status: 400,
        message: 'Selected user is not an LS Supervisor.',
      };
    }
    return { ok: true, user: rows[0] };
  } catch (err) {
    console.error('Resolve supervisor error:', err);
    return { ok: false, status: 500, message: 'Server error.' };
  }
};

// ── Controller actions ─────────────────────────────────────────────────────

/**
 * GET /api/employees
 * Query params: page, limit, search, supervisor, supervisor_id, site,
 *               vendor_id, vendor, status.
 *   • `search`        matches employee_name OR npk.
 *   • `supervisor`    matches the joined users.name (LS Supervisor).
 *   • `supervisor_id` exact match on the FK (preferred).
 *   • `vendor_id`     exact match on the FK (preferred).
 *   • `vendor`        legacy: matches `vendor_name` (kept for any old query strings).
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
    const vendorIdRaw = req.query.vendor_id;
    const vendorId =
      vendorIdRaw !== undefined && vendorIdRaw !== '' && Number.isFinite(Number(vendorIdRaw))
        ? Number(vendorIdRaw)
        : null;
    const supervisorIdRaw = req.query.supervisor_id;
    const supervisorId =
      supervisorIdRaw !== undefined &&
      supervisorIdRaw !== '' &&
      Number.isFinite(Number(supervisorIdRaw))
        ? Number(supervisorIdRaw)
        : null;

    let where = 'WHERE 1=1';
    const params = [];
    if (search) {
      where += ' AND (h.employee_name LIKE ? OR h.npk LIKE ?)';
      const t = `%${search}%`;
      params.push(t, t);
    }
    if (supervisorId) {
      where += ' AND h.supervisor_id = ?';
      params.push(supervisorId);
    } else if (supervisor) {
      where += ' AND s.name LIKE ?';
      params.push(`%${supervisor}%`);
    }
    if (site) {
      where += ' AND h.site = ?';
      params.push(site);
    }
    if (vendorId) {
      where += ' AND h.vendor_id = ?';
      params.push(vendorId);
    } else if (vendor) {
      where += ' AND COALESCE(v.name, h.vendor_name) = ?';
      params.push(vendor);
    }
    if (status) {
      if (!ENUM_FIELDS.user_status.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status. Must be one of: ${ENUM_FIELDS.user_status.join(', ')}.`,
        });
      }
      where += ' AND h.user_status = ?';
      params.push(status);
    }

    const [rows] = await db.query(
      `SELECT ${SELECT_COLS}
         ${FROM_JOIN}
         ${where}
         ORDER BY h.employee_name ASC, h.id ASC
         LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total ${FROM_JOIN} ${where}`,
      params
    );

    // Reference lists for client-side filter dropdowns.
    const [siteRows] = await db.query(
      `SELECT DISTINCT site FROM hr_employees WHERE site IS NOT NULL AND site <> '' ORDER BY site ASC`
    );
    // Active vendors from the master so the filter dropdown stays in
    // sync with the same source of truth as the Create / Edit lookup.
    const [vendorRows] = await db.query(
      `SELECT id, code, name FROM vendors WHERE is_active = 1 ORDER BY name ASC`
    );

    const [[counts]] = await db.query(
      `SELECT
         COUNT(*) AS total_all,
         SUM(CASE WHEN user_status = 'Active'   THEN 1 ELSE 0 END) AS active_count,
         SUM(CASE WHEN user_status = 'Deactive' THEN 1 ELSE 0 END) AS deactive_count,
         COUNT(DISTINCT COALESCE(vendor_id, CONCAT('legacy:', vendor_name))) AS vendor_count
       FROM hr_employees`
    );

    res.json({
      success: true,
      data: rows,
      pagination: { total: Number(total) || 0, page, limit },
      meta: {
        sites: siteRows.map((r) => r.site),
        vendors: vendorRows,
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
 * GET /api/employees/vendors
 * Returns the active vendor master list used by the searchable lookup
 * on the Create / Edit Employee forms.
 *
 * Query params:
 *   • `search` — case-insensitive partial match on either `code` or
 *     `name`. Returned regardless of value so the client can implement
 *     either client-side or server-side search; an empty search returns
 *     all active vendors ordered by name.
 *   • `limit`  — soft cap (default 100, max 500) to keep payloads small.
 */
const listVendors = async (req, res) => {
  try {
    const search = sanitizeText(req.query.search);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);

    let where = 'WHERE is_active = 1';
    const params = [];
    if (search) {
      where += ' AND (name LIKE ? OR code LIKE ?)';
      const t = `%${search}%`;
      params.push(t, t);
    }

    const [rows] = await db.query(
      `SELECT id, code, name, address, phone, email
         FROM vendors
         ${where}
         ORDER BY name ASC
         LIMIT ?`,
      [...params, limit]
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('List vendors lookup error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/**
 * GET /api/employees/supervisors
 * Returns the list of LS Supervisors (users.role = 'ls_supervisor')
 * used by the searchable Supervisor lookup on the Create / Edit
 * Employee forms.
 *
 * Linking the employee to a real user record (rather than free-text
 * NIK / Name) gives the Managerial Review stage a robust audit trail:
 * when the Leader Employee approves attendance, leave or overtime,
 * the Approval is recorded against the same `users.id` that PIC LS
 * picked here.
 *
 * Query params:
 *   • `search` — case-insensitive partial match on either `name` or
 *     `employee_id` (NIK). An empty search returns all active
 *     supervisors ordered by name. The primary search axis is name,
 *     per the product spec.
 *   • `limit`  — soft cap (default 100, max 500) to keep payloads small.
 */
const listSupervisors = async (req, res) => {
  try {
    const search = sanitizeText(req.query.search);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);

    let where = `WHERE role = 'ls_supervisor' AND is_active = 1`;
    const params = [];
    if (search) {
      where += ' AND (name LIKE ? OR employee_id LIKE ?)';
      const t = `%${search}%`;
      params.push(t, t);
    }

    const [rows] = await db.query(
      `SELECT id, name, employee_id, email
         FROM users
         ${where}
         ORDER BY name ASC
         LIMIT ?`,
      [...params, limit]
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('List supervisors lookup error:', err);
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
      `SELECT ${SELECT_COLS} ${FROM_JOIN} WHERE h.id = ? LIMIT 1`,
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

    // Vendor lookup: when a vendor_id is supplied we resolve the master
    // record and authoritatively overwrite the denormalized display
    // copies so vendor_number / vendor_name can never drift from the
    // master. When vendor_id is null/absent we trust whatever free-text
    // HR typed (legacy behaviour for partial / draft records).
    let vendorId = null;
    if (v.vendorId && v.vendorId.provided) {
      const rv = await resolveVendor(v.vendorId.value);
      if (!rv.ok) return res.status(rv.status).json({ success: false, message: rv.message });
      if (rv.vendor) {
        vendorId = rv.vendor.id;
        f.vendor_number = rv.vendor.code;
        f.vendor_name = rv.vendor.name;
      }
    }

    // Supervisor lookup: resolve the LS Supervisor user (role check
    // enforced inside resolveSupervisor) and store ONLY the FK. The
    // name is rendered at read time by the JOIN in SELECT_COLS, so no
    // denormalized copy is kept on hr_employees.
    let supervisorId = null;
    if (v.supervisorId && v.supervisorId.provided) {
      const rs = await resolveSupervisor(v.supervisorId.value);
      if (!rs.ok) return res.status(rs.status).json({ success: false, message: rs.message });
      supervisorId = rs.user ? rs.user.id : null;
    }

    const [ins] = await db.query(
      `INSERT INTO hr_employees (
         vendor_id, vendor_number, user_department, department_title, vendor_name,
         employment_status, po_number, po_period_1, po_period_2, dic_hro, cost_center,
         npk, employee_name, email, position, position_group, category, site,
         supervisor_id, user_status, created_by, updated_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        vendorId,
        f.vendor_number, f.user_department, f.department_title, f.vendor_name,
        f.employment_status, f.po_number, f.po_period_1, f.po_period_2, f.dic_hro, f.cost_center,
        f.npk, f.employee_name, f.email, f.position, f.position_group, f.category, f.site,
        supervisorId, f.user_status, createdBy, createdBy,
      ]
    );

    const [rows] = await db.query(
      `SELECT ${SELECT_COLS} ${FROM_JOIN} WHERE h.id = ? LIMIT 1`,
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

    // Vendor lookup: same authoritative overwrite as in createEmployee.
    // An explicit `vendor_id: null` clears the FK and leaves the
    // denormalized display copies untouched (HR can still edit them
    // manually for legacy / draft records).
    if (v.vendorId && v.vendorId.provided) {
      const rv = await resolveVendor(v.vendorId.value);
      if (!rv.ok) return res.status(rv.status).json({ success: false, message: rv.message });
      fields.vendor_id = rv.vendor ? rv.vendor.id : null;
      if (rv.vendor) {
        fields.vendor_number = rv.vendor.code;
        fields.vendor_name = rv.vendor.name;
      }
    }

    // Supervisor lookup: explicit `supervisor_id: null` clears the FK,
    // a numeric value is validated against the users master (role must
    // be `ls_supervisor`). Only the FK is stored — the name is
    // resolved at read time via JOIN.
    if (v.supervisorId && v.supervisorId.provided) {
      const rs = await resolveSupervisor(v.supervisorId.value);
      if (!rs.ok) return res.status(rs.status).json({ success: false, message: rs.message });
      fields.supervisor_id = rs.user ? rs.user.id : null;
    }

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
      `SELECT ${SELECT_COLS} ${FROM_JOIN} WHERE h.id = ? LIMIT 1`,
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
  listVendors,
  listSupervisors,
  getEmployeeById,
  createEmployee,
  updateEmployee,
};
