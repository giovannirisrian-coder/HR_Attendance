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
 * User account auto-provisioning ("Seamless Integration"):
 *  • Every hr_employees row that has both `email` and `npk` is paired
 *    with a row in `users` (role='ls') so the employee can log in and
 *    participate in the digital workflow (Biometric Capture, Overtime,
 *    Correction, …). Create/update both rows in a single DB
 *    transaction — if the users-side write fails the hr_employees
 *    write rolls back, preventing orphan records.
 *  • The link is materialised as `hr_employees.user_id → users.id`.
 *    `npk` mirrors `users.employee_id` (the same value used for login)
 *    so the join is unambiguous and stable. The default password
 *    ("password") is bcrypt-hashed using the same cost factor as the
 *    seed users so first-login UX is identical.
 *  • If a draft employee is created without email/npk (legacy
 *    permissive UX), the account is auto-provisioned the next time
 *    those fields are filled in via an update — no manual step needed.
 *
 * The end-to-end approval workflow (LS → Supervisor → Vendor → PIC LS →
 * SSU) is unchanged — only the vendor and supervisor references are
 * unified into FK lookups, and the LS user is now created/synced
 * automatically by this controller.
 */

const bcrypt = require('bcryptjs');
const db = require('../config/database');
const multer = require('multer');
const XLSX = require('xlsx');
const { normalizeCalendarYmdFromBody, compareYmd } = require('../utils/calendarDate');

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
  // Coarse classification used by the Automated Analytics step to
  // bucket recap rows for audit / payroll reporting. Optional — an
  // empty submission is stored as NULL so legacy / draft records
  // remain valid. The SQL column is `employee_group` (the literal
  // `group` keyword is reserved in MySQL); the UI labels it "Group".
  employee_group: ['BC', 'MTL'],
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
  h.id, h.user_id, h.vendor_id,
  COALESCE(v.code, h.vendor_number) AS vendor_number,
  h.user_department, h.department_title,
  COALESCE(v.name, h.vendor_name) AS vendor_name,
  h.employment_status, h.po_number, h.po_period_1, h.po_period_2,
  h.dic_hro, h.cost_center,
  h.npk, h.employee_name, h.email, h.position, h.position_group,
  h.category, h.employee_group, h.site,
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

const bulkUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const name = String(file?.originalname || '').toLowerCase();
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) return cb(null, true);
    return cb(new Error('Hanya file Excel (.xlsx/.xls) yang diperbolehkan.'));
  },
});

const uploadHrEmployeesMiddleware = bulkUpload.single('file');

const uploadHrEmployeesMiddlewareSafe = (req, res, next) => {
  uploadHrEmployeesMiddleware(req, res, (err) => {
    if (!err) return next();
    console.error('HR employee upload middleware error:', {
      message: err.message,
      code: err.code,
      field: err.field,
      originalname: req.file?.originalname || req.body?.originalname || null,
      user_id: req.user?.id || null,
      content_type: req.headers?.['content-type'] || null,
    });
    return res.status(400).json({
      success: false,
      message: err.message || 'File upload gagal.',
    });
  });
};

const TEMPLATE_HEADER_TO_FIELD = {
  'no/vdr': 'vendor_number',
  'user/ department': 'user_department',
  'title/ department': 'department_title',
  vendor: 'vendor_name',
  status: 'employment_status',
  'nomor po': 'po_number',
  'jangka waktu po ke-1': 'po_period_1',
  'jangka waktu po ke-2': 'po_period_2',
  'dic (hro)': 'dic_hro',
  'cost center': 'cost_center',
  npk: 'npk',
  'nama karyawan': 'employee_name',
  jabatan: 'position',
  'kelompok jabatan': 'position_group',
  kategori: 'category',
  site: 'site',
  'nik atasan': 'supervisor_nik',
  'nama atasan': 'supervisor_name',
};

const REQUIRED_FIELDS_FOR_UPLOAD = [
  'vendor_number',
  'user_department',
  'department_title',
  'vendor_name',
  'employment_status',
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

const normalizeUploadHeader = (value) =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/\u00a0/g, ' ')
    .trim()
    .toLowerCase();

const monthMap = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const pad2 = (n) => String(n).padStart(2, '0');

const ymd = (year, month, day) => `${year}-${pad2(month)}-${pad2(day)}`;

const lastDayOfMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

const parseMonthYear = (raw) => {
  const s = sanitizeText(raw).replace(/[^A-Za-z0-9]/g, '');
  const m = /^([A-Za-z]{3})(\d{4})$/.exec(s);
  if (!m) return null;
  const mo = monthMap[m[1].slice(0, 3).toLowerCase()];
  const y = parseInt(m[2], 10);
  if (!mo || y < 1900 || y > 2200) return null;
  return { year: y, month: mo };
};

const parseExcelDateValue = (raw) => {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const year = raw.getUTCFullYear();
    const month = raw.getUTCMonth() + 1;
    const day = raw.getUTCDate();
    return { start: ymd(year, month, day), end: ymd(year, month, day) };
  }

  const s = sanitizeText(raw);
  if (!s) return null;

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (iso) {
    const year = parseInt(iso[1], 10);
    const month = parseInt(iso[2], 10);
    const day = parseInt(iso[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { start: ymd(year, month, day), end: ymd(year, month, day) };
    }
  }

  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (dmy) {
    const day = parseInt(dmy[1], 10);
    const month = parseInt(dmy[2], 10);
    const year = parseInt(dmy[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { start: ymd(year, month, day), end: ymd(year, month, day) };
    }
  }

  const monthRange = /^([A-Za-z]{3})\s*-\s*([A-Za-z]{3})\s*(\d{4})$/.exec(s);
  if (monthRange) {
    const m1 = monthMap[monthRange[1].slice(0, 3).toLowerCase()];
    const m2 = monthMap[monthRange[2].slice(0, 3).toLowerCase()];
    const year = parseInt(monthRange[3], 10);
    if (m1 && m2 && m1 <= m2) {
      return {
        start: ymd(year, m1, 1),
        end: ymd(year, m2, lastDayOfMonth(year, m2)),
      };
    }
  }

  const monthYear = parseMonthYear(s);
  if (monthYear) {
    return {
      start: ymd(monthYear.year, monthYear.month, 1),
      end: ymd(monthYear.year, monthYear.month, lastDayOfMonth(monthYear.year, monthYear.month)),
    };
  }

  return null;
};

const normalizeEmploymentStatus = (value) => {
  const s = sanitizeText(value).toLowerCase();
  if (!s) return '';
  if (s.includes('perman')) return 'Permanent';
  if (s.includes('contract') || s.includes('kontrak')) return 'Contract';
  return '';
};

const findHeaderRow = (rows) => {
  for (let i = 0; i < Math.min(rows.length, 30); i += 1) {
    const headers = rows[i].map(normalizeUploadHeader);
    if (headers.includes('nama karyawan') && headers.includes('nomor po') && headers.includes('npk')) {
      return { headerRowIndex: i, headers };
    }
  }
  return null;
};

const mapSheetRowToEmployeeBody = (cells, headerMap) => {
  const body = {};
  for (const [field, colIndex] of Object.entries(headerMap)) {
    const raw = colIndex >= 0 ? cells[colIndex] : '';
    body[field] = sanitizeText(raw);
  }

  body.employment_status = normalizeEmploymentStatus(body.employment_status);

  const po1 = parseExcelDateValue(cells[headerMap.po_period_1]);
  const po2 = parseExcelDateValue(cells[headerMap.po_period_2]);
  body.po_period_1 = po1?.start || '';
  body.po_period_2 = po2?.end || po1?.end || po1?.start || '';
  body.user_status = 'Active';

  return body;
};

const summarizeLineError = (line, msg) => ({ line_no: line, error: msg });

const nonEmptyOrDash = (value) => sanitizeText(value) || '-';

const normalizeUploadRowForUpsert = (body) => {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  const todayYmd = `${y}-${m}-${d}`;

  const po1 = sanitizeText(body.po_period_1);
  const po2 = sanitizeText(body.po_period_2);
  const finalPo1 = po1 || po2 || todayYmd;
  const finalPo2 = po2 || po1 || todayYmd;

  return {
    vendor_number: nonEmptyOrDash(body.vendor_number),
    user_department: nonEmptyOrDash(body.user_department),
    department_title: nonEmptyOrDash(body.department_title),
    vendor_name: nonEmptyOrDash(body.vendor_name),
    employment_status: ['Permanent', 'Contract'].includes(body.employment_status)
      ? body.employment_status
      : 'Contract',
    po_number: nonEmptyOrDash(body.po_number),
    po_period_1: finalPo1,
    po_period_2: finalPo2,
    dic_hro: nonEmptyOrDash(body.dic_hro),
    cost_center: nonEmptyOrDash(body.cost_center),
    npk: sanitizeText(body.npk),
    employee_name: nonEmptyOrDash(body.employee_name),
    position: nonEmptyOrDash(body.position),
    position_group: nonEmptyOrDash(body.position_group),
    category: nonEmptyOrDash(body.category),
    site: nonEmptyOrDash(body.site),
    supervisor_nik: nonEmptyOrDash(body.supervisor_nik),
    supervisor_name: nonEmptyOrDash(body.supervisor_name),
    user_status: 'Active',
  };
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

// ── User-account sync helpers (LS role provisioning) ──────────────────────
//
// These helpers implement the "Seamless Integration" objective: every
// hr_employees row that has enough identifying data is paired with a
// row in `users` (role='ls') so the registered employee can log in
// immediately. The default password matches the seed credentials so
// QA / UAT can sign in with "password" right after PIC LS finishes the
// registration form.
//
// All callers run inside a transaction held on `conn` so a failure
// here rolls the surrounding hr_employees write back, preventing
// orphaned records (per the spec's Error Handling & Integrity rule).
const DEFAULT_LS_PASSWORD = 'password';
const DEFAULT_LS_ROLE = 'ls';
const BCRYPT_COST = 10;

/**
 * Pre-check whether the LS user row has the minimum fields required
 * to create / sync a login account. We need the employee_name (used
 * as users.name), the NPK (users.employee_id — UNIQUE) and the email
 * (users.email — NOT NULL UNIQUE). Anything less and we skip the
 * account step so legacy "draft" hr_employees rows keep working.
 */
const hasUserAccountFields = (employeeName, npk, email) =>
  Boolean(employeeName && npk && email);

/**
 * Map `hr_employees.user_status` (Active / Deactive) onto the
 * `users.is_active` TINYINT(1) column.
 *
 *   'Active'   → 1   (user can log in and submit requests)
 *   'Deactive' → 0   (login is blocked by authController's
 *                     `WHERE u.is_active = 1` clause, so any
 *                     existing session remains valid only until
 *                     the JWT expires — re-issuance is impossible)
 *
 * Defaults to 1 when the status is missing/unknown so a partial
 * payload never accidentally locks an employee out. The hr_employees
 * schema also defaults `user_status` to 'Active', so this mirrors
 * the same fail-open semantics.
 */
const userStatusToIsActive = (userStatus) => (userStatus === 'Deactive' ? 0 : 1);

/**
 * Detect an existing `users` row that would collide with the email
 * or NPK we are about to write. Returns:
 *   { conflict: 'email' | 'employee_id' | null, user?: row }
 *
 * On the update path pass `excludeUserId` to ignore the row we are
 * synchronising into — otherwise it would always conflict with itself.
 *
 * The `employee_id IS NOT NULL` guard prevents legacy users created
 * without an employee_id from matching a fresh NPK.
 */
const findUserConflict = async (conn, { email, npk, excludeUserId = null }) => {
  const params = [email, npk];
  let where = 'WHERE (email = ? OR (employee_id IS NOT NULL AND employee_id = ?))';
  if (excludeUserId) {
    where += ' AND id <> ?';
    params.push(excludeUserId);
  }
  const [rows] = await conn.query(
    `SELECT id, email, employee_id FROM users ${where} LIMIT 1`,
    params
  );
  if (rows.length === 0) return { conflict: null };
  const u = rows[0];
  if (u.email === email) return { conflict: 'email', user: u };
  return { conflict: 'employee_id', user: u };
};

/**
 * Insert a fresh `users` row to back a newly registered hr_employees
 * record. The role is hardcoded to 'ls' (PIC LS only manages LS-role
 * employees from the Employee List, per the stakeholder hierarchy),
 * vendor_id / supervisor_id are mirrored so the new user shows up in
 * the correct Managerial Review dashboards, and the default password
 * is bcrypt-hashed so the user can log in immediately.
 *
 * `isActive` is the mapped value of hr_employees.user_status (see
 * `userStatusToIsActive`). Passing 0 here registers a deactivated
 * user — `authController.login` will block them at sign-in via its
 * `is_active = 1` clause, so PIC LS can pre-create accounts that
 * stay dormant until they are flipped to Active.
 *
 * Returns the new users.id which the caller writes back to
 * `hr_employees.user_id` to establish the link.
 */
const provisionLsUserAccount = async (
  conn,
  { name, npk, email, vendorId, supervisorId, isActive }
) => {
  const passwordHash = await bcrypt.hash(DEFAULT_LS_PASSWORD, BCRYPT_COST);
  const [ins] = await conn.query(
    `INSERT INTO users (name, employee_id, email, password, role, vendor_id, supervisor_id, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [name, npk, email, passwordHash, DEFAULT_LS_ROLE, vendorId, supervisorId, isActive]
  );
  return ins.insertId;
};

/**
 * Propagate the LS HR-edited fields onto the linked `users` row.
 *
 * Per spec we sync: name, employee_id (NPK), email, vendor_id,
 * supervisor_id, and is_active. is_active is derived from
 * hr_employees.user_status via `userStatusToIsActive`, so toggling
 * a row to "Deactive" on the Employee List immediately locks the
 * paired login out via authController's `WHERE u.is_active = 1`
 * gate. Login credentials (password) and role are intentionally
 * left untouched — those are managed elsewhere (auth / admin UIs)
 * and overwriting them here would defeat the segregation between
 * personnel data and account lifecycle.
 */
const syncLsUserAccount = async (
  conn,
  userId,
  { name, npk, email, vendorId, supervisorId, isActive }
) => {
  await conn.query(
    `UPDATE users
        SET name = ?, employee_id = ?, email = ?,
            vendor_id = ?, supervisor_id = ?, is_active = ?
      WHERE id = ?`,
    [name, npk, email, vendorId, supervisorId, isActive, userId]
  );
};

/**
 * Translate a MySQL ER_DUP_ENTRY error into a friendly 409 response.
 * Both the users table (email / employee_id) and the hr_employees
 * table (npk) can raise this, so we sniff the error message to pick
 * the right wording.
 */
const dupEntryResponse = (err) => {
  const message = String(err && err.message ? err.message : '').toLowerCase();
  if (message.includes('email')) {
    return {
      status: 409,
      body: {
        success: false,
        message: 'Email already exists. Please use a unique email.',
      },
    };
  }
  if (message.includes('employee_id')) {
    return {
      status: 409,
      body: {
        success: false,
        message: 'Employee ID (NPK) already exists. Please use a unique NPK.',
      },
    };
  }
  return {
    status: 409,
    body: {
      success: false,
      message: 'NPK already exists. Please use a unique Employee ID.',
    },
  };
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
 *
 * Creates a new hr_employees row and — when the form supplies enough
 * identifying data (employee_name + NPK + email) — also provisions a
 * matching `users` row (role='ls') in the same DB transaction.
 *
 * If the user-side insert fails the entire write rolls back, so the
 * caller never sees a half-finished personnel record.
 */
const createEmployee = async (req, res) => {
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

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Auto-provision an LS user account when the registration form
    // supplies the minimum credentials. Drafts that omit email or NPK
    // skip this step — the account is auto-created later when an
    // update fills in the missing fields (see updateEmployee).
    let provisionedUserId = null;
    if (hasUserAccountFields(f.employee_name, f.npk, f.email)) {
      const conflict = await findUserConflict(conn, { email: f.email, npk: f.npk });
      if (conflict.conflict) {
        await conn.rollback();
        const message =
          conflict.conflict === 'email'
            ? 'A user account with this email already exists. Please use a different email.'
            : 'A user account with this Employee ID (NPK) already exists. Please use a unique NPK.';
        return res.status(409).json({ success: false, message });
      }
      provisionedUserId = await provisionLsUserAccount(conn, {
        name: f.employee_name,
        npk: f.npk,
        email: f.email,
        vendorId,
        supervisorId,
        isActive: userStatusToIsActive(f.user_status),
      });
    }

    const [ins] = await conn.query(
      `INSERT INTO hr_employees (
         user_id, vendor_id, vendor_number, user_department, department_title, vendor_name,
         employment_status, po_number, po_period_1, po_period_2, dic_hro, cost_center,
         npk, employee_name, email, position, position_group, category, employee_group, site,
         supervisor_id, user_status, created_by, updated_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        provisionedUserId,
        vendorId,
        f.vendor_number, f.user_department, f.department_title, f.vendor_name,
        f.employment_status, f.po_number, f.po_period_1, f.po_period_2, f.dic_hro, f.cost_center,
        f.npk, f.employee_name, f.email, f.position, f.position_group, f.category, f.employee_group, f.site,
        supervisorId, f.user_status, createdBy, createdBy,
      ]
    );

    await conn.commit();

    const [rows] = await db.query(
      `SELECT ${SELECT_COLS} ${FROM_JOIN} WHERE h.id = ? LIMIT 1`,
      [ins.insertId]
    );

    res.status(201).json({
      success: true,
      message: provisionedUserId
        ? 'Employee created successfully and LS login account provisioned.'
        : 'Employee saved as draft. Add an email and NPK to enable LS login.',
      data: rows[0],
    });
  } catch (err) {
    try { await conn.rollback(); } catch (_) { /* no-op */ }
    if (err && err.code === 'ER_DUP_ENTRY') {
      const dup = dupEntryResponse(err);
      return res.status(dup.status).json(dup.body);
    }
    console.error('Create hr_employee error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  } finally {
    conn.release();
  }
};

/**
 * PUT /api/employees/:id
 * Accepts a full payload or a partial subset of fields.
 *
 * In addition to writing the hr_employees row, this handler also keeps
 * the linked `users` row in sync (name, employee_id, email, vendor_id,
 * supervisor_id). Both writes share a transaction — if the users-side
 * sync fails the hr_employees update rolls back too.
 *
 * Self-healing: if the existing hr_employees row was created in legacy
 * "draft" mode (user_id IS NULL) and this update finally supplies the
 * required email + NPK, an LS user account is provisioned on the
 * spot. The new users.id is written back to hr_employees.user_id so
 * subsequent edits flow through the normal sync path.
 */
const updateEmployee = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ success: false, message: 'Invalid employee id.' });
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

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Lock the row for the duration of the transaction so the
    // user-account sync sees a consistent snapshot even when two PIC
    // LS officers race on the same record. user_status is loaded so
    // we can mirror it onto users.is_active even when the current
    // PATCH leaves it untouched.
    const [existingRows] = await conn.query(
      `SELECT id, user_id, employee_name, npk, email,
              vendor_id, supervisor_id, user_status
         FROM hr_employees
        WHERE id = ?
        FOR UPDATE`,
      [id]
    );
    if (existingRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: 'Employee not found.' });
    }
    const existing = existingRows[0];

    const setClause = keys.map((k) => `${k} = ?`).join(', ');
    const values = keys.map((k) => fields[k]);
    const updatedBy = req.user?.id || null;

    await conn.query(
      `UPDATE hr_employees SET ${setClause}, updated_by = ? WHERE id = ?`,
      [...values, updatedBy, id]
    );

    // Build the post-update view of just the fields synced to `users`.
    // Partial updates may leave any of these untouched, so we fall
    // back to the pre-update value loaded above.
    const merged = {
      employee_name:
        fields.employee_name !== undefined ? fields.employee_name : existing.employee_name,
      npk: fields.npk !== undefined ? fields.npk : existing.npk,
      email: fields.email !== undefined ? fields.email : existing.email,
      vendor_id:
        fields.vendor_id !== undefined ? fields.vendor_id : existing.vendor_id,
      supervisor_id:
        fields.supervisor_id !== undefined ? fields.supervisor_id : existing.supervisor_id,
      user_status:
        fields.user_status !== undefined ? fields.user_status : existing.user_status,
    };

    const mergedIsActive = userStatusToIsActive(merged.user_status);

    if (existing.user_id) {
      // Existing LS account — mirror the synced fields. Only enforced
      // when the row still has the required identification; if HR
      // deliberately cleared email or NPK we leave the linked users
      // row untouched (next edit that restores them will resync).
      if (hasUserAccountFields(merged.employee_name, merged.npk, merged.email)) {
        const conflict = await findUserConflict(conn, {
          email: merged.email,
          npk: merged.npk,
          excludeUserId: existing.user_id,
        });
        if (conflict.conflict) {
          await conn.rollback();
          const message =
            conflict.conflict === 'email'
              ? 'A different user account already uses this email. Please choose another.'
              : 'A different user account already uses this Employee ID (NPK). Please choose another.';
          return res.status(409).json({ success: false, message });
        }
        await syncLsUserAccount(conn, existing.user_id, {
          name: merged.employee_name,
          npk: merged.npk,
          email: merged.email,
          vendorId: merged.vendor_id,
          supervisorId: merged.supervisor_id,
          isActive: mergedIsActive,
        });
      } else if (fields.user_status !== undefined) {
        // The personnel record lost its email/NPK so we can't refresh
        // the full user profile, but a status flip still has to land
        // immediately — otherwise PIC LS toggling an employee to
        // "Deactive" would leave them able to log in with stale data.
        await conn.query(
          `UPDATE users SET is_active = ? WHERE id = ?`,
          [mergedIsActive, existing.user_id]
        );
      }
    } else if (hasUserAccountFields(merged.employee_name, merged.npk, merged.email)) {
      // Self-healing: a legacy draft row now has enough data to be
      // promoted into a real LS account.
      const conflict = await findUserConflict(conn, {
        email: merged.email,
        npk: merged.npk,
      });
      if (conflict.conflict) {
        await conn.rollback();
        const message =
          conflict.conflict === 'email'
            ? 'A user account with this email already exists. Please use a different email.'
            : 'A user account with this Employee ID (NPK) already exists. Please use a unique NPK.';
        return res.status(409).json({ success: false, message });
      }
      const newUserId = await provisionLsUserAccount(conn, {
        name: merged.employee_name,
        npk: merged.npk,
        email: merged.email,
        vendorId: merged.vendor_id,
        supervisorId: merged.supervisor_id,
        isActive: mergedIsActive,
      });
      await conn.query(
        `UPDATE hr_employees SET user_id = ? WHERE id = ?`,
        [newUserId, id]
      );
    }

    await conn.commit();

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
    try { await conn.rollback(); } catch (_) { /* no-op */ }
    if (err && err.code === 'ER_DUP_ENTRY') {
      const dup = dupEntryResponse(err);
      return res.status(dup.status).json(dup.body);
    }
    console.error('Update hr_employee error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  } finally {
    conn.release();
  }
};

/**
 * POST /api/employees/upload
 * Bulk upload HR employees from Excel template.
 */
const uploadEmployeesBulk = async (req, res) => {
  const uploaderId = req.user?.id || null;
  const uploadRequestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    const sourceSystem = sanitizeText(req.body?.source_system).toUpperCase();
    if (!['MTL', 'BC'].includes(sourceSystem)) {
      return res.status(400).json({
        success: false,
        message: 'Field "source_system" wajib dipilih: MTL atau BC.',
      });
    }

    console.info('HR employee bulk upload started:', {
      request_id: uploadRequestId,
      user_id: uploaderId,
      source_system: sourceSystem,
      filename: req.file?.originalname || null,
      size: req.file?.size || null,
    });

    if (!req.file?.buffer) {
      return res.status(400).json({ success: false, message: 'File wajib diunggah (field: file).' });
    }

    const workbook = XLSX.read(req.file.buffer, {
      type: 'buffer',
      cellDates: true,
      raw: false,
      defval: '',
    });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      return res.status(400).json({ success: false, message: 'Sheet tidak ditemukan pada file Excel.' });
    }

    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], {
      header: 1,
      defval: '',
      raw: false,
      blankrows: false,
    });
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, message: 'File tidak berisi data.' });
    }

    const headerInfo = findHeaderRow(rows);
    if (!headerInfo) {
      return res.status(400).json({
        success: false,
        message: 'Header template tidak ditemukan. Pastikan memakai file Data LS_for sistem.xlsx.',
      });
    }

    const { headerRowIndex, headers } = headerInfo;
    const headerMap = {};
    for (const [templateHeader, field] of Object.entries(TEMPLATE_HEADER_TO_FIELD)) {
      const index = headers.findIndex((h) => h === normalizeUploadHeader(templateHeader));
      if (index < 0) {
        return res.status(400).json({
          success: false,
          message: `Kolom wajib "${templateHeader}" tidak ditemukan pada header file.`,
        });
      }
      headerMap[field] = index;
    }

    let totalRows = 0;
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let skippedNpkEmpty = 0;
    let skippedError = 0;
    const errors = [];

    for (let i = headerRowIndex + 1; i < rows.length; i += 1) {
      const cells = Array.isArray(rows[i]) ? rows[i] : [];
      const lineNo = i + 1;
      const joined = cells.map((c) => sanitizeText(c)).join('');
      if (!joined) continue;

      totalRows += 1;
      const body = mapSheetRowToEmployeeBody(cells, headerMap);
      const rowNpk = sanitizeText(body.npk);

      // Sesuai kebutuhan: baris tanpa NPK diabaikan (tidak diproses submit).
      if (!rowNpk) {
        skipped += 1;
        skippedNpkEmpty += 1;
        continue;
      }
      const f = normalizeUploadRowForUpsert(body);
      try {
        const [upsert] = await db.query(
          `INSERT INTO hr_employees (
             vendor_number, user_department, department_title, vendor_name,
             employment_status, po_number, po_period_1, po_period_2, dic_hro, cost_center,
             npk, employee_name, position, position_group, category, site,
             supervisor_nik, supervisor_name, user_status, created_by, updated_by
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             vendor_number = VALUES(vendor_number),
             user_department = VALUES(user_department),
             department_title = VALUES(department_title),
             vendor_name = VALUES(vendor_name),
             employment_status = VALUES(employment_status),
             po_number = VALUES(po_number),
             po_period_1 = VALUES(po_period_1),
             po_period_2 = VALUES(po_period_2),
             dic_hro = VALUES(dic_hro),
             cost_center = VALUES(cost_center),
             employee_name = VALUES(employee_name),
             position = VALUES(position),
             position_group = VALUES(position_group),
             category = VALUES(category),
             site = VALUES(site),
             supervisor_nik = VALUES(supervisor_nik),
             supervisor_name = VALUES(supervisor_name),
             user_status = VALUES(user_status),
             updated_by = VALUES(updated_by)`,
          [
            f.vendor_number, f.user_department, f.department_title, f.vendor_name,
            f.employment_status, f.po_number, f.po_period_1, f.po_period_2, f.dic_hro, f.cost_center,
            f.npk, f.employee_name, f.position, f.position_group, f.category, f.site,
            f.supervisor_nik, f.supervisor_name, f.user_status, uploaderId, uploaderId,
          ]
        );

        if (upsert.affectedRows === 1) inserted += 1;
        else if (upsert.affectedRows >= 2) updated += 1;
      } catch (err) {
        console.error('HR employee bulk upload row upsert error:', {
          request_id: uploadRequestId,
          line_no: lineNo,
          npk: f?.npk || null,
          employee_name: f?.employee_name || null,
          code: err?.code || null,
          message: err?.message || null,
        });
        skipped += 1;
        skippedError += 1;
        errors.push(summarizeLineError(lineNo, err?.message || 'Gagal menyimpan baris.'));
      }
    }

    console.info('HR employee bulk upload finished:', {
      request_id: uploadRequestId,
      user_id: uploaderId,
      source_system: sourceSystem,
      total_rows: totalRows,
      inserted,
      updated,
      skipped,
      skipped_npk_empty: skippedNpkEmpty,
      skipped_error: skippedError,
      error_count: errors.length,
    });

    return res.status(200).json({
      success: true,
      message: 'Upload data karyawan selesai diproses.',
      data: {
        source_system: sourceSystem,
        total_rows: totalRows,
        inserted,
        updated,
        skipped,
        skipped_npk_empty: skippedNpkEmpty,
        skipped_error: skippedError,
        error_count: errors.length,
        errors: errors.slice(0, 500),
      },
    });
  } catch (err) {
    console.error('Bulk upload hr_employees error:', {
      request_id: uploadRequestId,
      user_id: uploaderId,
      source_system: sanitizeText(req.body?.source_system).toUpperCase() || null,
      filename: req.file?.originalname || null,
      size: req.file?.size || null,
      code: err?.code || null,
      message: err?.message || null,
      stack: err?.stack || null,
    });
    if (err?.message?.includes('diperbolehkan')) {
      return res.status(400).json({ success: false, message: err.message });
    }
    return res.status(500).json({ success: false, message: err.message || 'Server error.' });
  }
};

module.exports = {
  listEmployees,
  listVendors,
  listSupervisors,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  uploadHrEmployeesMiddleware: uploadHrEmployeesMiddlewareSafe,
  uploadEmployeesBulk,
};
