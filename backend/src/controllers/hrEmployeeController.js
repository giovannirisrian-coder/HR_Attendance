/**
 * LS HR ➜ Employee List controller (CRUD for `hr_employees`).
 *
 * Backs the `/api/employees` endpoints used by the LS HR (PIC LS) role
 * to maintain the BAST Check master data set. This module is intentionally
 * ISOLATED from the legacy `employees` table that is referenced by
 * `attendance.employee_id` — the established attendance workflow is preserved.
 */

const db = require('../config/database');
const multer = require('multer');
const XLSX = require('xlsx');
const { normalizeCalendarYmdFromBody, compareYmd } = require('../utils/calendarDate');

// ── Field whitelisting / validation helpers ────────────────────────────────
const TEXT_FIELDS = [
  'vendor_number',
  'user_department',
  'department_title',
  'vendor_name',
  'po_number',
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
const DATE_FIELDS = ['po_period_1', 'po_period_2'];
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
 * Validate + normalize a request body into a column => value map.
 *
 * @param {object} body
 * @param {{ partial?: boolean }} [opts] — when partial=true, missing fields are
 *   simply omitted from the output (used on PUT / partial update).
 * @returns {{ ok: boolean, fields?: Record<string, string|number>, error?: string }}
 */
const validateBody = (body, opts = {}) => {
  const partial = !!opts.partial;
  const fields = {};

  for (const f of TEXT_FIELDS) {
    if (body[f] === undefined && partial) continue;
    const v = sanitizeText(body[f]);
    if (!v) return { ok: false, error: `Field "${f}" is required.` };
    if (v.length > MAX_LENGTHS[f]) {
      return { ok: false, error: `Field "${f}" is too long (max ${MAX_LENGTHS[f]} chars).` };
    }
    fields[f] = v;
  }

  for (const f of DATE_FIELDS) {
    if (body[f] === undefined && partial) continue;
    const norm = normalizeCalendarYmdFromBody(body[f]);
    if (!norm.ok) return { ok: false, error: `Field "${f}": ${norm.error}` };
    fields[f] = norm.ymd;
  }

  if (fields.po_period_1 && fields.po_period_2) {
    if (compareYmd(fields.po_period_1, fields.po_period_2) > 0) {
      return { ok: false, error: 'PO Period 2 must be on or after PO Period 1.' };
    }
  }

  for (const [f, allowed] of Object.entries(ENUM_FIELDS)) {
    if (body[f] === undefined && partial) continue;
    const v = sanitizeText(body[f]);
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
      `SELECT id, po_period_1, po_period_2 FROM hr_employees WHERE id = ? LIMIT 1`,
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

    // Cross-field validation when only one date side is supplied.
    const existing = existingRows[0];
    const finalP1 = fields.po_period_1 ?? existing.po_period_1;
    const finalP2 = fields.po_period_2 ?? existing.po_period_2;
    if (finalP1 && finalP2 && compareYmd(finalP1, finalP2) > 0) {
      return res.status(400).json({
        success: false,
        message: 'PO Period 2 must be on or after PO Period 1.',
      });
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
  getEmployeeById,
  createEmployee,
  updateEmployee,
  uploadHrEmployeesMiddleware: uploadHrEmployeesMiddlewareSafe,
  uploadEmployeesBulk,
};
