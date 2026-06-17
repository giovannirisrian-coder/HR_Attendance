/**
 * LS HR ➜ Employee List controller (CRUD for `hr_employees`).
 *
 * Backs the `/api/employees` endpoints used by the LS HR (PIC LS) role
 * to maintain the BAST Check master data set.
 *
 * `hr_employees` is now the consolidated employee master table:
 *  • LS HR (PIC LS) maintains the BAST fields here (vendor, NPK, etc.).
 *  • Attendance / Leave / Overtime reference the same row via the
 *    `user_id` column and the unified `npk` identifier (the legacy
 *    `nik` column has been retired by
 *    `migration_hr_employees_drop_nik.sql`; NPK is now the single
 *    standard identitas karyawan across Biometric Capture,
 *    Cloud Synchronization, BAST and Salary Recap analytics).
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
 *  • There are NO denormalized supervisor name / NPK columns — the
 *    supervisor name is resolved at read time via JOIN against
 *    `users` so it can never drift from the master record. This
 *    gives the Managerial Review stage a robust audit trail: the
 *    same `users.id` chosen by PIC LS here is the user that approves
 *    attendance / leave / overtime downstream.
 *
 * User account auto-provisioning ("Seamless Integration"):
 *  • Authentication is SID-based. Every hr_employees row that has both
 *    an `employee_name` and a `sid` is paired with a row in `users`
 *    (role='ls') so the employee can log in (SID + password) and
 *    participate in the digital workflow (Biometric Capture, Overtime,
 *    Correction, …). Create/update both rows in a single DB
 *    transaction — if the users-side write fails the hr_employees
 *    write rolls back, preventing orphan records.
 *  • The link is materialised as `hr_employees.user_id → users.id`.
 *    `sid` mirrors `users.sid` (the login credential) and `npk` mirrors
 *    `users.employee_id`. Email is OPTIONAL (stored NULL by default)
 *    and is no longer a credential, so a missing email never blocks the
 *    insert. The default password ("password") is bcrypt-hashed using
 *    the same cost factor as the seed users so first-login UX is
 *    identical.
 *  • If a draft employee is created without name/SID (legacy permissive
 *    UX), the account is auto-provisioned the next time those fields are
 *    filled in via an update — no manual step needed.
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
const TEXT_FIELDS = [
  'vendor_number',
  'user_department',
  'vendor_name',
  'npk',
  'employee_name',
  'email',
  'position',
  'position_group',
  'site',
];
const ENUM_FIELDS = {
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
  vendor_name: 200,
  npk: 64,
  employee_name: 200,
  email: 190,
  position: 150,
  position_group: 150,
  site: 100,
};

// `sid` (System ID) is the one MANDATORY free-text field on the
// Create / Edit Employee forms. Unlike the optional fields above it is
// validated as required so the Automated Analytics step always has a
// unique identifier for BAST / Salary Recap reporting. Handled
// separately from TEXT_FIELDS so the "must not be empty" rule is
// applied even though the underlying column is nullable.
const SID_MAX_LENGTH = 64;

// `email` is an OPTIONAL free-text field restored on the Create / Edit
// Employee forms. When supplied it must look like a valid email address
// so the value mirrored onto `users.email` stays clean; an empty value
// is stored as NULL and never blocks the write (email is not a
// credential — authentication is SID-based).
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  h.user_department,
  COALESCE(v.name, h.vendor_name) AS vendor_name,
  h.npk, h.sid, h.employee_name, h.email, h.position, h.position_group,
  h.employee_group, h.site,
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

// Excel template: No, SID No, NPK, Nama Karyawan, Jabatan, Kelompok Jabatan,
// Departemen, Site, NIK Atasan, Nama Atasan, Vendor, BU
const UPLOAD_HEADER_SPECS = [
  { field: 'sid', labels: ['sid no', 'sid'] },
  { field: 'npk', labels: ['npk'] },
  { field: 'employee_name', labels: ['nama karyawan'] },
  { field: 'position', labels: ['jabatan'] },
  { field: 'position_group', labels: ['kelompok jabatan'] },
  { field: 'user_department', labels: ['departemen', 'departement'] },
  { field: 'site', labels: ['site'] },
  { field: 'supervisor_ref', labels: ['nik atasan'] },
  { field: 'company_name', labels: ['vendor'] },
  { field: 'employee_group', labels: ['bu'] },
];

const normalizeUploadHeader = (value) =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/\u00a0/g, ' ')
    .trim()
    .toLowerCase();

const resolveUploadHeaderIndex = (headers, labels) => {
  for (const label of labels) {
    const index = headers.findIndex((h) => h === normalizeUploadHeader(label));
    if (index >= 0) return index;
  }
  return -1;
};

const findHeaderRow = (rows) => {
  for (let i = 0; i < Math.min(rows.length, 30); i += 1) {
    const headers = rows[i].map(normalizeUploadHeader);
    const hasRequired = UPLOAD_HEADER_SPECS.every(
      (spec) => resolveUploadHeaderIndex(headers, spec.labels) >= 0
    );
    if (hasRequired) {
      return { headerRowIndex: i, headers };
    }
  }
  return null;
};

const buildUploadHeaderMap = (headers) => {
  const headerMap = {};
  for (const spec of UPLOAD_HEADER_SPECS) {
    const index = resolveUploadHeaderIndex(headers, spec.labels);
    if (index < 0) {
      return {
        ok: false,
        message: `Kolom wajib "${spec.labels[0]}" tidak ditemukan pada header file.`,
      };
    }
    headerMap[spec.field] = index;
  }
  return { ok: true, headerMap };
};

const mapSheetRowToEmployeeBody = (cells, headerMap) => {
  const body = {};
  for (const [field, colIndex] of Object.entries(headerMap)) {
    const raw = colIndex >= 0 ? cells[colIndex] : '';
    body[field] = sanitizeText(raw);
  }
  return body;
};

const summarizeLineError = (line, msg) => ({ line_no: line, error: msg });

const nullableUploadText = (value) => {
  const v = sanitizeText(value);
  return v === '' ? null : v;
};

const normalizeEmployeeGroupForUpload = (raw) => {
  const value = sanitizeText(raw).toUpperCase();
  if (!value) return null;
  return ENUM_FIELDS.employee_group.includes(value) ? value : null;
};

const normalizeUploadRowForUpsert = (body) => ({
  npk: sanitizeText(body.npk),
  sid: nullableUploadText(body.sid),
  vendor_id: null,
  vendor_number: null,
  user_department: nullableUploadText(body.user_department),
  vendor_name: null,
  employee_name: nullableUploadText(body.employee_name),
  email: null,
  position: nullableUploadText(body.position),
  position_group: nullableUploadText(body.position_group),
  employee_group: normalizeEmployeeGroupForUpload(body.employee_group),
  site: nullableUploadText(body.site),
  supervisor_id: null,
  supervisor_ref: nullableUploadText(body.supervisor_ref),
  user_status: 'Active',
});

/**
 * Resolve NIK Atasan from the upload sheet to an LS Supervisor users.id.
 * The reference may match users.employee_id (NPK) or users.sid.
 */
const resolveSupervisorForUpload = async (executor, supervisorRef) => {
  const ref = sanitizeText(supervisorRef);
  if (!ref) return null;
  const [rows] = await executor.query(
    `SELECT id
       FROM users
      WHERE role = 'ls_supervisor'
        AND (employee_id = ? OR sid = ?)
      LIMIT 1`,
    [ref, ref]
  );
  return rows.length ? rows[0].id : null;
};

const uploadUserConflictMessage = (conflict) =>
  conflict === 'sid'
    ? 'Akun login dengan SID ini sudah ada. Gunakan SID yang berbeda.'
    : 'Akun login dengan NPK ini sudah ada. Gunakan NPK yang unik.';

/**
 * Insert or update one hr_employees row from bulk upload and keep the
 * paired users row in sync (mirrors createEmployee / updateEmployee).
 */
const upsertUploadEmployeeRow = async (conn, row, uploaderName) => {
  const isActive = userStatusToIsActive(row.user_status);

  const [existingRows] = await conn.query(
    `SELECT id, user_id, employee_name, npk, sid, email,
            vendor_id, supervisor_id, user_status
       FROM hr_employees
      WHERE npk = ?
      LIMIT 1
      FOR UPDATE`,
    [row.npk]
  );

  if (existingRows.length > 0) {
    const existing = existingRows[0];
    let userId = existing.user_id;

    if (userId && hasUserAccountFields(row.employee_name, row.sid)) {
      const conflict = await findUserConflict(conn, {
        sid: row.sid,
        npk: row.npk,
        excludeUserId: userId,
      });
      if (conflict.conflict) {
        throw new Error(uploadUserConflictMessage(conflict.conflict));
      }
      await syncLsUserAccount(conn, userId, {
        name: row.employee_name,
        npk: row.npk,
        email: row.email,
        sid: row.sid,
        vendorId: row.vendor_id,
        supervisorId: row.supervisor_id,
        isActive,
      });
    } else if (!userId && hasUserAccountFields(row.employee_name, row.sid)) {
      const conflict = await findUserConflict(conn, { sid: row.sid, npk: row.npk });
      if (conflict.conflict) {
        throw new Error(uploadUserConflictMessage(conflict.conflict));
      }
      userId = await provisionLsUserAccount(conn, {
        name: row.employee_name,
        npk: row.npk,
        email: row.email,
        sid: row.sid,
        vendorId: row.vendor_id,
        supervisorId: row.supervisor_id,
        isActive,
      });
    }

    await conn.query(
      `UPDATE hr_employees
          SET user_id = ?,
              vendor_id = ?,
              vendor_number = ?,
              user_department = ?,
              vendor_name = ?,
              sid = ?,
              employee_name = ?,
              position = ?,
              position_group = ?,
              employee_group = ?,
              site = ?,
              supervisor_id = ?,
              user_status = ?,
              updated_by = ?
        WHERE id = ?`,
      [
        userId,
        row.vendor_id,
        row.vendor_number,
        row.user_department,
        row.vendor_name,
        row.sid,
        row.employee_name,
        row.position,
        row.position_group,
        row.employee_group,
        row.site,
        row.supervisor_id,
        row.user_status,
        uploaderName,
        existing.id,
      ]
    );
    return 'updated';
  }

  let userId = null;
  if (hasUserAccountFields(row.employee_name, row.sid)) {
    const conflict = await findUserConflict(conn, { sid: row.sid, npk: row.npk });
    if (conflict.conflict) {
      throw new Error(uploadUserConflictMessage(conflict.conflict));
    }
    userId = await provisionLsUserAccount(conn, {
      name: row.employee_name,
      npk: row.npk,
      email: row.email,
      sid: row.sid,
      vendorId: row.vendor_id,
      supervisorId: row.supervisor_id,
      isActive,
    });
  }

  await conn.query(
    `INSERT INTO hr_employees (
       user_id, vendor_id, vendor_number, user_department, vendor_name,
       npk, sid, employee_name, email, position, position_group, employee_group, site,
       supervisor_id, user_status, created_by, updated_by
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      row.vendor_id,
      row.vendor_number,
      row.user_department,
      row.vendor_name,
      row.npk,
      row.sid,
      row.employee_name,
      row.email,
      row.position,
      row.position_group,
      row.employee_group,
      row.site,
      row.supervisor_id,
      row.user_status,
      uploaderName,
      uploaderName,
    ]
  );
  return 'inserted';
};

const buildVendorLookupMap = (vendorRows) => {
  const lookup = new Map();
  for (const row of vendorRows) {
    const keys = [sanitizeText(row.name), sanitizeText(row.code)]
      .map((v) => v.toLowerCase())
      .filter(Boolean);
    for (const key of keys) {
      if (!lookup.has(key)) lookup.set(key, row);
    }
  }
  return lookup;
};

const resolveVendorForUpload = (companyName, vendorLookup) => {
  const key = sanitizeText(companyName).toLowerCase();
  if (!key) return null;
  return vendorLookup.get(key) || null;
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

  // Email format check — OPTIONAL. Only validated when the field is
  // present and non-empty; an empty submission stays NULL (set above)
  // so the user can clear the value on either the Create or Edit form.
  if (!(partial && body.email === undefined)) {
    const email = sanitizeText(body.email);
    if (email !== '' && !EMAIL_REGEX.test(email)) {
      return { ok: false, error: 'Field "Email" must be a valid email address.' };
    }
  }

  // SID — MANDATORY. On POST it is always validated; on a partial PUT
  // we only validate when the key is present (the Edit form always
  // sends it), but if it IS present it must be a non-empty value.
  if (!(partial && body.sid === undefined)) {
    const sid = sanitizeText(body.sid);
    if (sid === '') {
      return { ok: false, error: 'Field "SID" is required.' };
    }
    if (sid.length > SID_MAX_LENGTH) {
      return { ok: false, error: `Field "SID" is too long (max ${SID_MAX_LENGTH} chars).` };
    }
    fields.sid = sid;
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

/**
 * Resolve the authenticated requester's display name from the `users`
 * master so the audit columns (`created_by` / `updated_by`) can store a
 * human-readable NAME instead of an opaque numeric user id. This makes
 * the BAST Check / Document Check transparency reporting legible without
 * an extra JOIN.
 *
 * Falls back to `null` when the id is missing or the user row cannot be
 * found, so a failed lookup never blocks the personnel write — the audit
 * column is simply left empty.
 *
 * @param {object} executor — a db pool or an active transaction connection.
 * @param {number|null} userId
 * @returns {Promise<string|null>}
 */
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
 * to create / sync a login account. Authentication is now SID-based,
 * so the credentials we need are the employee_name (used as
 * users.name, which is NOT NULL) and the SID (users.sid — the login
 * identifier). NPK (users.employee_id) and email are OPTIONAL: NPK is
 * synced when present and email is no longer a credential. Anything
 * less than name + SID and we skip the account step so legacy / draft
 * hr_employees rows keep working.
 */
const hasUserAccountFields = (employeeName, sid) =>
  Boolean(employeeName && sid);

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
 * Detect an existing `users` row that would collide with the SID
 * or NPK we are about to write. Authentication is SID-based, so the
 * SID (the login identifier) is the primary uniqueness axis; NPK
 * (users.employee_id) is still UNIQUE and checked when present.
 * Returns:
 *   { conflict: 'sid' | 'employee_id' | null, user?: row }
 *
 * On the update path pass `excludeUserId` to ignore the row we are
 * synchronising into — otherwise it would always conflict with itself.
 *
 * The `IS NOT NULL` guards prevent legacy users created without a SID
 * or employee_id from matching a fresh value.
 */
const findUserConflict = async (conn, { sid, npk, excludeUserId = null }) => {
  const conditions = [];
  const params = [];
  if (sid) {
    conditions.push('(sid IS NOT NULL AND sid = ?)');
    params.push(sid);
  }
  if (npk) {
    conditions.push('(employee_id IS NOT NULL AND employee_id = ?)');
    params.push(npk);
  }
  if (conditions.length === 0) return { conflict: null };

  let where = `WHERE (${conditions.join(' OR ')})`;
  if (excludeUserId) {
    where += ' AND id <> ?';
    params.push(excludeUserId);
  }
  const [rows] = await conn.query(
    `SELECT id, sid, employee_id FROM users ${where} LIMIT 1`,
    params
  );
  if (rows.length === 0) return { conflict: null };
  const u = rows[0];
  if (sid && u.sid === sid) return { conflict: 'sid', user: u };
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
  { name, npk, email, sid, vendorId, supervisorId, isActive }
) => {
  const passwordHash = await bcrypt.hash(DEFAULT_LS_PASSWORD, BCRYPT_COST);
  // `sid` is the login credential. NPK (employee_id) and email are
  // optional — both are UNIQUE+NULLable so an empty value is stored as
  // NULL rather than blocking the insert.
  //
  // `is_first_login` is forced to 1 (TRUE): the account is created with
  // the shared default password, so the user must change it on first
  // sign-in (POST /api/auth/change-password clears the flag). The column
  // also DEFAULTs to 1, but we set it explicitly so the intent is clear
  // and never depends on the schema default.
  const [ins] = await conn.query(
    `INSERT INTO users (name, employee_id, sid, email, password, role, vendor_id, supervisor_id, is_active, is_first_login)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [name, npk || null, sid, email || null, passwordHash, DEFAULT_LS_ROLE, vendorId, supervisorId, isActive]
  );
  return ins.insertId;
};

/**
 * Propagate the LS HR-edited fields onto the linked `users` row.
 *
 * Per spec we sync: name, employee_id (NPK), sid, email, vendor_id,
 * supervisor_id, and is_active. `sid` is the login credential, kept in
 * lock-step with hr_employees.sid. is_active is derived from
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
  { name, npk, email, sid, vendorId, supervisorId, isActive }
) => {
  await conn.query(
    `UPDATE users
        SET name = ?, employee_id = ?, sid = ?, email = ?,
            vendor_id = ?, supervisor_id = ?, is_active = ?
      WHERE id = ?`,
    [name, npk || null, sid, email || null, vendorId, supervisorId, isActive, userId]
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
  if (message.includes('sid')) {
    return {
      status: 409,
      body: {
        success: false,
        message: 'SID already exists. Please use a unique SID.',
      },
    };
  }
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

// ── Administrative password reset (PIC LS) ────────────────────────────────
//
// Lets an LS HR Officer reset a user's login password by SID so they can
// quickly unblock Employee / Leader / Vendor accounts and keep the digital
// workflow (Biometric Capture → … → Automated Analytics) moving. The route
// is already gated to role='ls_hr' (see routes/hrEmployees.js), so this
// handler only enforces input validation + the SID-exists check.
//
// The new password is bcrypt-hashed with the same cost factor as the rest
// of the system, and `is_first_login` is cleared so the reset password is
// usable immediately on the next sign-in (no forced change loop).
const MIN_RESET_PASSWORD_LENGTH = 8;

/**
 * POST /api/employees/reset-password
 * Body: { sid, newPassword, confirmPassword }
 */
const resetUserPassword = async (req, res) => {
  try {
    const sid = sanitizeText(req.body?.sid);
    const newPassword = req.body?.newPassword;
    const confirmPassword = req.body?.confirmPassword;

    if (!sid) {
      return res.status(400).json({ success: false, message: 'Field "SID" is required.' });
    }

    if (!newPassword || String(newPassword).length < MIN_RESET_PASSWORD_LENGTH) {
      return res.status(400).json({
        success: false,
        message: `New password must be at least ${MIN_RESET_PASSWORD_LENGTH} characters.`,
      });
    }

    if (String(newPassword) !== String(confirmPassword)) {
      return res.status(400).json({
        success: false,
        message: 'New password and confirmation do not match.',
      });
    }

    // SID must exist in `users` (the login credential column).
    const [rows] = await db.query(
      'SELECT id, name FROM users WHERE sid = ? LIMIT 1',
      [sid]
    );
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'SID not found in the system.',
      });
    }

    const target = rows[0];
    const passwordHash = await bcrypt.hash(String(newPassword), BCRYPT_COST);
    await db.query(
      'UPDATE users SET password = ?, is_first_login = 0 WHERE id = ?',
      [passwordHash, target.id]
    );

    return res.json({
      success: true,
      message: 'Password has been successfully reset.',
      data: { sid, name: target.name },
    });
  } catch (err) {
    console.error('Reset user password error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
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
 * NPK / Name) gives the Managerial Review stage a robust audit trail:
 * when the Leader Employee approves attendance, leave or overtime,
 * the Approval is recorded against the same `users.id` that PIC LS
 * picked here.
 *
 * Query params:
 *   • `search` — case-insensitive partial match on either `name` or
 *     `employee_id` (NPK). An empty search returns all active
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
 * identifying data (employee_name + SID) — also provisions a matching
 * `users` row (role='ls') in the same DB transaction. The optional
 * email is mirrored onto users.email when present.
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

  // Field policy: Email is exposed on the Create / Edit forms again and
  // is OPTIONAL — the validated value from validateBody flows through
  // untouched (NULL when blank) and is mirrored onto users.email during
  // account provisioning. User Status is still owned by the backend, so
  // we force the agreed default:
  //   • user_status    → 'Active'
  // `employee_group` (BC / MTL) is also exposed on the form — the
  // validated value flows through so the Automated Analytics step can
  // bucket recap rows by group.
  f.user_status = 'Active';

  // Audit trail stores the requester's NAME (not the numeric id) so the
  // BAST / Document Check reporting is human-readable.
  const actorName = await resolveActorName(db, req.user?.id || null);

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
    // supplies the minimum credentials (employee_name + SID). Since
    // authentication is SID-based, email is no longer required — this
    // is what previously blocked account creation when email was sent
    // as NULL. Drafts that omit the name or SID skip this step; the
    // account is auto-created later when an update fills them in (see
    // updateEmployee).
    let provisionedUserId = null;
    if (hasUserAccountFields(f.employee_name, f.sid)) {
      const conflict = await findUserConflict(conn, { sid: f.sid, npk: f.npk });
      if (conflict.conflict) {
        await conn.rollback();
        const message =
          conflict.conflict === 'sid'
            ? 'A user account with this SID already exists. Please use a different SID.'
            : 'A user account with this Employee ID (NPK) already exists. Please use a unique NPK.';
        return res.status(409).json({ success: false, message });
      }
      provisionedUserId = await provisionLsUserAccount(conn, {
        name: f.employee_name,
        npk: f.npk,
        email: f.email,
        sid: f.sid,
        vendorId,
        supervisorId,
        isActive: userStatusToIsActive(f.user_status),
      });
    }

    const [ins] = await conn.query(
      `INSERT INTO hr_employees (
         user_id, vendor_id, vendor_number, user_department, vendor_name,
         npk, sid, employee_name, email, position, position_group, employee_group, site,
         supervisor_id, user_status, created_by, updated_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        provisionedUserId,
        vendorId,
        f.vendor_number, f.user_department, f.vendor_name,
        f.npk, f.sid, f.employee_name, f.email, f.position, f.position_group, f.employee_group, f.site,
        supervisorId, f.user_status, actorName, actorName,
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
        : 'Employee saved as draft. Add an Employee Name and SID to enable LS login.',
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

  // Field policy (mirrors createEmployee): Email is editable on the form
  // again and OPTIONAL — when the form sends it, the validated value
  // (NULL when blank) is persisted and synced to users.email; when the
  // field is absent (partial PATCH) the existing value is left
  // untouched. `user_status` and `employee_group` are editable — when
  // the form sends them, the validated value is persisted; when absent
  // the existing value is left untouched.

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
      `SELECT id, user_id, employee_name, npk, sid, email,
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
    // Audit trail stores the requester's NAME (resolved from `users`)
    // rather than the numeric id, for human-readable BAST / Document
    // Check reporting.
    const updatedBy = await resolveActorName(conn, req.user?.id || null);

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
      sid: fields.sid !== undefined ? fields.sid : existing.sid,
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
      if (hasUserAccountFields(merged.employee_name, merged.sid)) {
        const conflict = await findUserConflict(conn, {
          sid: merged.sid,
          npk: merged.npk,
          excludeUserId: existing.user_id,
        });
        if (conflict.conflict) {
          await conn.rollback();
          const message =
            conflict.conflict === 'sid'
              ? 'A different user account already uses this SID. Please choose another.'
              : 'A different user account already uses this Employee ID (NPK). Please choose another.';
          return res.status(409).json({ success: false, message });
        }
        await syncLsUserAccount(conn, existing.user_id, {
          name: merged.employee_name,
          npk: merged.npk,
          email: merged.email,
          sid: merged.sid,
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
    } else if (hasUserAccountFields(merged.employee_name, merged.sid)) {
      // Self-healing: a legacy draft row now has enough data (name +
      // SID) to be promoted into a real LS account.
      const conflict = await findUserConflict(conn, {
        sid: merged.sid,
        npk: merged.npk,
      });
      if (conflict.conflict) {
        await conn.rollback();
        const message =
          conflict.conflict === 'sid'
            ? 'A user account with this SID already exists. Please use a different SID.'
            : 'A user account with this Employee ID (NPK) already exists. Please use a unique NPK.';
        return res.status(409).json({ success: false, message });
      }
      const newUserId = await provisionLsUserAccount(conn, {
        name: merged.employee_name,
        npk: merged.npk,
        email: merged.email,
        sid: merged.sid,
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

// Column order for the downloadable bulk-upload template. Mirrors the
// header row recognised by `findHeaderRow` / `UPLOAD_HEADER_SPECS` so a
// file generated here can be filled in and re-uploaded without any
// header tweaks. "No" and "Nama Atasan" are presentation-only columns
// (ignored by the parser) but kept so the template matches the layout
// PIC LS already works with.
const EMPLOYEE_TEMPLATE_HEADERS = [
  'No',
  'SID No',
  'NPK',
  'Nama Karyawan',
  'Jabatan',
  'Kelompok Jabatan',
  'Departemen',
  'Site',
  'NIK Atasan',
  'Nama Atasan',
  'Vendor',
  'BU',
];

// A single illustrative row so the user can see the expected shape of
// each column. It is sample data only and is meant to be overwritten.
const EMPLOYEE_TEMPLATE_EXAMPLE_ROW = [
  1,
  'SID001',
  '10000056',
  'Nama Contoh Karyawan',
  'Operator',
  'Staff',
  'Operations',
  'HO',
  '10000001',
  'Nama Atasan',
  'PT Vendor Contoh',
  'BC',
];

/**
 * GET /api/employees/template
 * Download the .xlsx bulk-upload template for master employee data.
 *
 * Generated on the fly with the same `xlsx` library used to parse the
 * upload, so the header row is guaranteed to match the parser
 * (`UPLOAD_HEADER_SPECS`). This keeps the BAST Check master-data import
 * accurate and free of header-mismatch errors.
 */
const downloadEmployeeTemplate = (req, res) => {
  try {
    const worksheet = XLSX.utils.aoa_to_sheet([
      EMPLOYEE_TEMPLATE_HEADERS,
      EMPLOYEE_TEMPLATE_EXAMPLE_ROW,
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Data Karyawan');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="Template_Data_Karyawan.xlsx"'
    );
    return res.send(buffer);
  } catch (err) {
    console.error('Download employee template error:', err);
    return res.status(500).json({ success: false, message: 'Gagal membuat template.' });
  }
};

/**
 * POST /api/employees/upload
 * Bulk upload HR employees from Excel template.
 */
const uploadEmployeesBulk = async (req, res) => {
  const uploaderId = req.user?.id || null;
  // Audit columns now store the actor's NAME (see resolveActorName), so
  // resolve the uploader's display name once and reuse it for every row.
  const uploaderName = await resolveActorName(db, uploaderId);
  const uploadRequestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    console.info('HR employee bulk upload started:', {
      request_id: uploadRequestId,
      user_id: uploaderId,
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
        message: 'Header template tidak ditemukan. Pastikan memakai file template yang disediakan.',
      });
    }

    const { headerRowIndex, headers } = headerInfo;
    const headerMapResult = buildUploadHeaderMap(headers);
    if (!headerMapResult.ok) {
      return res.status(400).json({
        success: false,
        message: headerMapResult.message,
      });
    }
    const { headerMap } = headerMapResult;

    const [vendorRows] = await db.query(`SELECT id, code, name FROM vendors`);
    const vendorLookup = buildVendorLookupMap(vendorRows);

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

      // Validasi utama berbasis NPK.
      if (!rowNpk) {
        skipped += 1;
        skippedNpkEmpty += 1;
        continue;
      }
      const f = normalizeUploadRowForUpsert(body);
      const vendor = resolveVendorForUpload(body.company_name, vendorLookup);
      if (!vendor) {
        skipped += 1;
        skippedError += 1;
        errors.push(
          summarizeLineError(lineNo, 'Vendor tidak ditemukan di master vendor (kolom vendors.name/code).')
        );
        continue;
      }
      f.vendor_id = vendor.id;
      f.vendor_number = sanitizeText(vendor.code) || null;
      f.vendor_name = sanitizeText(vendor.name) || nullableUploadText(body.company_name);
      f.supervisor_id = await resolveSupervisorForUpload(db, f.supervisor_ref);

      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();
        const result = await upsertUploadEmployeeRow(conn, f, uploaderName);
        await conn.commit();
        if (result === 'inserted') inserted += 1;
        else if (result === 'updated') updated += 1;
      } catch (err) {
        try { await conn.rollback(); } catch (_) { /* no-op */ }
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
      } finally {
        conn.release();
      }
    }

    console.info('HR employee bulk upload finished:', {
      request_id: uploadRequestId,
      user_id: uploaderId,
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
        total_rows: totalRows,
        inserted,
        updated,
        skipped,
        skipped_npk_empty: skippedNpkEmpty,
        skipped_nik_npk_empty: skippedNpkEmpty,
        skipped_error: skippedError,
        error_count: errors.length,
        errors: errors.slice(0, 500),
      },
    });
  } catch (err) {
    console.error('Bulk upload hr_employees error:', {
      request_id: uploadRequestId,
      user_id: uploaderId,
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
  downloadEmployeeTemplate,
  resetUserPassword,
};
