const multer = require('multer');
const db = require('../config/database');

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const name = (file.originalname || '').toLowerCase();
    if (name.endsWith('.csv') || name.endsWith('.txt')) {
      return cb(null, true);
    }
    cb(new Error('Hanya file .csv atau .txt yang diperbolehkan.'));
  },
});

const uploadGlogMiddleware = upload.single('file');

const EXPECTED_HEADERS = ['nik', 'nama karyawan', 'tanggal', 'jam', 'nama mesin'];

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (c === ',' && !inQuotes) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += c;
  }
  out.push(cur.trim());
  return out;
}

function normalizeHeaderCell(s) {
  return String(s || '')
    .replace(/^\ufeff/, '')
    .trim()
    .toLowerCase();
}

function parseDateDMY(raw) {
  const s = String(raw || '').trim();
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (!m) return { error: 'Format tanggal harus DD/MM/YYYY.', date: null };
  const d = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const y = parseInt(m[3], 10);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return { error: 'Tanggal tidak valid.', date: null };
  const mm = String(mo).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return { error: null, date: `${y}-${mm}-${dd}` };
}

function parseTimeHHMM(raw) {
  const s = String(raw || '').trim();
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (!m) return { error: 'Format jam harus HH:MM.', time: null };
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const sec = m[3] != null ? parseInt(m[3], 10) : 0;
  if (h > 23 || min > 59 || sec > 59) return { error: 'Jam tidak valid.', time: null };
  const hh = String(h).padStart(2, '0');
  const mm = String(min).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return { error: null, time: `${hh}:${mm}:${ss}` };
}

function headersMatch(cells) {
  if (cells.length < 5) return false;
  const norm = cells.slice(0, 5).map(normalizeHeaderCell);
  return EXPECTED_HEADERS.every((h, i) => norm[i] === h);
}

function splitLines(buf) {
  const text = buf.toString('utf8');
  return text.split(/\r?\n/);
}

/**
 * Parse file buffer → { headerOk, rows: [{ line_no, cells, rawLine }] }
 */
function parseGlogFile(buffer) {
  const lines = splitLines(buffer).map((l) => l.replace(/^\ufeff/, ''));
  let dataStart = 0;
  let headerOk = false;
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    const cells = parseCsvLine(trimmed);
    if (headersMatch(cells)) {
      headerOk = true;
      dataStart = i + 1;
      break;
    }
    return {
      error: 'Baris pertama non-kosong harus header: NIK,Nama Karyawan,Tanggal,Jam,Nama Mesin',
      rows: [],
      headerOk: false,
    };
  }
  if (!headerOk) {
    return {
      error: 'Header tidak ditemukan. Gunakan baris pertama: NIK,Nama Karyawan,Tanggal,Jam,Nama Mesin',
      rows: [],
      headerOk: false,
    };
  }
  const rows = [];
  for (let i = dataStart; i < lines.length; i += 1) {
    const rawLine = lines[i];
    if (!String(rawLine).trim()) continue;
    const cells = parseCsvLine(rawLine);
    rows.push({ line_no: i + 1, cells, rawLine });
  }
  return { error: null, rows, headerOk };
}

function buildStagingRow(batchId, { line_no, cells }) {
  const nik = cells[0] != null ? String(cells[0]).trim() : '';
  const employeeName = cells[1] != null ? String(cells[1]).trim() : '';
  const tanggalRaw = cells[2] != null ? String(cells[2]).trim() : '';
  const jamRaw = cells[3] != null ? String(cells[3]).trim() : '';
  const machineName = cells[4] != null ? String(cells[4]).trim() : '';

  let parseError = null;
  if (cells.length < 5) {
    parseError = `Kolom tidak lengkap (perlu 5 kolom, dapat ${cells.length}).`;
  } else if (!nik) {
    parseError = 'NIK kosong.';
  } else if (!employeeName) {
    parseError = 'Nama Karyawan kosong.';
  }

  let attendanceDate = null;
  let eventTime = null;
  if (!parseError) {
    const d = parseDateDMY(tanggalRaw);
    if (d.error) parseError = d.error;
    else attendanceDate = d.date;
  }
  if (!parseError) {
    const t = parseTimeHHMM(jamRaw);
    if (t.error) parseError = t.error;
    else eventTime = t.time;
  }

  return [
    batchId,
    line_no,
    nik.slice(0, 32),
    employeeName.slice(0, 255),
    tanggalRaw.slice(0, 32) || null,
    jamRaw.slice(0, 32) || null,
    machineName ? machineName.slice(0, 255) : null,
    attendanceDate,
    eventTime,
    parseError,
  ];
}

/** YYYY-MM-DD for SQL binding (hindari drift timezone dari objek Date mysql2). */
function toSqlDate(value) {
  if (value == null) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(value).slice(0, 10);
}

/** TIME ke string HH:MM:SS untuk kolom MySQL TIME. */
function toSqlTime(value) {
  if (value == null) return null;
  const s = String(value).trim();
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (!m) return null;
  const h = String(parseInt(m[1], 10)).padStart(2, '0');
  const min = String(parseInt(m[2], 10)).padStart(2, '0');
  const sec = m[3] != null ? String(parseInt(m[3], 10)).padStart(2, '0') : '00';
  return `${h}:${min}:${sec}`;
}

/**
 * Cocokkan NIK file glog ke employees (hanya user LS aktif).
 * Aturan: TRIM sama, atau tanpa spasi sama, atau hanya digit sama (MySQL 8 REGEXP_REPLACE).
 */
async function resolveEmployeeForGlogNik(conn, rawNik) {
  const trimmed = String(rawNik || '').trim();
  if (!trimmed) return { employee: null, reason: 'empty_nik' };
  const compact = trimmed.replace(/\s+/g, '');
  const [rows] = await conn.query(
    `SELECT e.id AS employee_id, e.user_id, e.nik
     FROM employees e
     INNER JOIN users u ON u.id = e.user_id AND u.role = 'ls' AND u.is_active = 1
     WHERE TRIM(e.nik) <=> ?
        OR REPLACE(TRIM(e.nik), ' ', '') <=> ?
        OR (
          LENGTH(REGEXP_REPLACE(TRIM(e.nik), '[^0-9]', '')) >= 4
          AND LENGTH(REGEXP_REPLACE(TRIM(?), '[^0-9]', '')) >= 4
          AND REGEXP_REPLACE(TRIM(e.nik), '[^0-9]', '') = REGEXP_REPLACE(TRIM(?), '[^0-9]', '')
        )
     LIMIT 2`,
    [trimmed, compact, trimmed, trimmed]
  );
  if (rows.length === 0) return { employee: null, reason: 'unmatched_nik' };
  if (rows.length > 1) return { employee: null, reason: 'ambiguous_nik' };
  return { employee: rows[0], reason: null };
}

/**
 * Sinkronkan baris glog_import_daily batch ini ke attendance.
 * - INSERT jika belum ada (user_id + attendance_date).
 * - UPDATE clock_in_time / clock_out_time + employee_id + nik kanonik hanya jika status = pending.
 * - Lewati jika sudah approved/rejected (jaga alur persetujuan).
 * Geo & lembur (OT) tidak diubah pada UPDATE (tetap seperti data aplikasi).
 */
async function syncGlogDailyToAttendance(conn, batchId) {
  const stats = {
    attendance_inserted: 0,
    attendance_updated_pending: 0,
    attendance_skipped_non_pending: 0,
    attendance_skipped_unmatched_nik: 0,
    attendance_skipped_ambiguous_nik: 0,
    attendance_skipped_invalid_time: 0,
  };

  const [dailyRows] = await conn.query(
    `SELECT id, nik, employee_name, attendance_date, time_in, time_out
     FROM glog_import_daily
     WHERE batch_id = ?`,
    [batchId]
  );

  for (const row of dailyRows) {
    const { employee, reason } = await resolveEmployeeForGlogNik(conn, row.nik);
    if (!employee) {
      if (reason === 'ambiguous_nik') stats.attendance_skipped_ambiguous_nik += 1;
      else if (reason === 'empty_nik') stats.attendance_skipped_invalid_time += 1;
      else stats.attendance_skipped_unmatched_nik += 1;
      continue;
    }

    const attendanceDate = toSqlDate(row.attendance_date);
    const clockIn = toSqlTime(row.time_in);
    const clockOut = toSqlTime(row.time_out);
    if (!attendanceDate || !clockIn || !clockOut) {
      stats.attendance_skipped_invalid_time += 1;
      continue;
    }

    const canonicalNik = String(employee.nik || '').trim().slice(0, 16);

    const [existing] = await conn.query(
      'SELECT id, status FROM attendance WHERE user_id = ? AND attendance_date = ? LIMIT 1',
      [employee.user_id, attendanceDate]
    );

    if (existing.length === 0) {
      await conn.query(
        `INSERT INTO attendance (
           user_id, employee_id, nik, attendance_date,
           clock_in_time, clock_out_time,
           clock_in_lat, clock_in_lng, clock_in_address,
           clock_out_lat, clock_out_lng, clock_out_address,
           ot_start_time, ot_end_time, ot_summary,
           status
         ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'pending')`,
        [employee.user_id, employee.employee_id, canonicalNik, attendanceDate, clockIn, clockOut]
      );
      stats.attendance_inserted += 1;
      continue;
    }

    if (existing[0].status !== 'pending') {
      stats.attendance_skipped_non_pending += 1;
      continue;
    }

    await conn.query(
      `UPDATE attendance SET
         employee_id = ?,
         nik = ?,
         clock_in_time = ?,
         clock_out_time = ?,
         updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ? AND attendance_date = ? AND status = 'pending'`,
      [employee.employee_id, canonicalNik, clockIn, clockOut, employee.user_id, attendanceDate]
    );
    stats.attendance_updated_pending += 1;
  }

  return stats;
}

const uploadGlog = async (req, res) => {
  const conn = await db.getConnection();
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, message: 'File wajib diunggah (field: file).' });
    }

    const parsed = parseGlogFile(req.file.buffer);
    if (parsed.error) {
      return res.status(400).json({ success: false, message: parsed.error });
    }
    if (parsed.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'File tidak berisi baris data.' });
    }

    const ext = (req.file.originalname || '').toLowerCase().endsWith('.csv') ? 'csv' : 'txt';
    const uploaderId = req.user.id;

    await conn.beginTransaction();

    const [batchRes] = await conn.query(
      `INSERT INTO glog_import_batches (uploaded_by, original_filename, mime_ext, staging_row_count, staging_error_count, status)
       VALUES (?, ?, ?, 0, 0, 'staged')`,
      [uploaderId, (req.file.originalname || 'upload').slice(0, 255), ext]
    );
    const batchId = batchRes.insertId;

    const chunkSize = 400;
    let errorCount = 0;
    for (let i = 0; i < parsed.rows.length; i += chunkSize) {
      const slice = parsed.rows.slice(i, i + chunkSize);
      const values = slice.map((r) => buildStagingRow(batchId, r));
      for (const row of values) {
        if (row[9]) errorCount += 1;
      }
      await conn.query(
        `INSERT INTO glog_import_staging
          (batch_id, line_no, nik, employee_name, tanggal_raw, jam_raw, machine_name, attendance_date, event_time, parse_error)
         VALUES ?`,
        [values]
      );
    }

    await conn.query(
      `UPDATE glog_import_batches
       SET staging_row_count = ?, staging_error_count = ?
       WHERE id = ?`,
      [parsed.rows.length, errorCount, batchId]
    );

    await conn.commit();

    return res.status(201).json({
      success: true,
      message: 'Data dimasukkan ke tabel staging (sementara). Jalankan proses agregasi harian.',
      data: {
        batch_id: batchId,
        staging_row_count: parsed.rows.length,
        staging_error_count: errorCount,
      },
    });
  } catch (err) {
    try {
      await conn.rollback();
    } catch (_) {
      /* no-op */
    }
    console.error('Glog upload error:', err);
    if (err.message && err.message.includes('diperbolehkan')) {
      return res.status(400).json({ success: false, message: err.message });
    }
    return res.status(500).json({ success: false, message: 'Server error.' });
  } finally {
    conn.release();
  }
};

const processBatch = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const batchId = parseInt(req.params.id, 10);
    if (!Number.isInteger(batchId) || batchId < 1) {
      return res.status(400).json({ success: false, message: 'ID batch tidak valid.' });
    }

    const uploaderId = req.user.id;
    const [batches] = await conn.query(
      'SELECT id, uploaded_by, status FROM glog_import_batches WHERE id = ? LIMIT 1',
      [batchId]
    );
    if (batches.length === 0) {
      return res.status(404).json({ success: false, message: 'Batch tidak ditemukan.' });
    }
    if (Number(batches[0].uploaded_by) !== Number(uploaderId)) {
      return res.status(403).json({ success: false, message: 'Anda tidak memiliki akses ke batch ini.' });
    }

    await conn.beginTransaction();
    await conn.query('DELETE FROM glog_import_daily WHERE batch_id = ?', [batchId]);

    const [aggResult] = await conn.query(
      `INSERT INTO glog_import_daily (batch_id, nik, employee_name, attendance_date, time_in, time_out, tap_count)
       SELECT
         batch_id,
         nik,
         MAX(employee_name) AS employee_name,
         attendance_date,
         MIN(event_time) AS time_in,
         MAX(event_time) AS time_out,
         COUNT(*) AS tap_count
       FROM glog_import_staging
       WHERE batch_id = ?
         AND parse_error IS NULL
         AND attendance_date IS NOT NULL
         AND event_time IS NOT NULL
       GROUP BY batch_id, nik, attendance_date`,
      [batchId]
    );

    const attendanceStats = await syncGlogDailyToAttendance(conn, batchId);

    await conn.query(
      `UPDATE glog_import_batches SET status = 'processed', processed_at = NOW() WHERE id = ?`,
      [batchId]
    );
    await conn.commit();

    const dailyCount = aggResult.affectedRows != null ? aggResult.affectedRows : 0;

    return res.json({
      success: true,
      message:
        'Agregasi harian selesai (glog_import_daily). Data yang cocok dengan master karyawan (LS aktif) disinkronkan ke attendance (insert baru atau update hanya jika status pending).',
      data: {
        batch_id: batchId,
        daily_row_count: dailyCount,
        ...attendanceStats,
      },
    });
  } catch (err) {
    try {
      await conn.rollback();
    } catch (_) {
      /* no-op */
    }
    console.error('Glog process error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  } finally {
    conn.release();
  }
};

const getBatchDetail = async (req, res) => {
  try {
    const batchId = parseInt(req.params.id, 10);
    if (!Number.isInteger(batchId) || batchId < 1) {
      return res.status(400).json({ success: false, message: 'ID batch tidak valid.' });
    }

    const [batches] = await db.query(
      `SELECT b.*, u.name AS uploaded_by_name
       FROM glog_import_batches b
       JOIN users u ON u.id = b.uploaded_by
       WHERE b.id = ? LIMIT 1`,
      [batchId]
    );
    if (batches.length === 0) {
      return res.status(404).json({ success: false, message: 'Batch tidak ditemukan.' });
    }
    if (Number(batches[0].uploaded_by) !== Number(req.user.id)) {
      return res.status(403).json({ success: false, message: 'Forbidden.' });
    }

    const batch = batches[0];
    const include = String(req.query.include || '').toLowerCase();

    const payload = { success: true, data: { batch } };

    if (include === 'daily' || include === 'all') {
      const [daily] = await db.query(
        `SELECT id, nik, employee_name, attendance_date, time_in, time_out, tap_count
         FROM glog_import_daily WHERE batch_id = ? ORDER BY attendance_date ASC, nik ASC`,
        [batchId]
      );
      payload.data.daily = daily;
    }

    if (include === 'errors' || include === 'all') {
      const [errors] = await db.query(
        `SELECT line_no, nik, employee_name, tanggal_raw, jam_raw, machine_name, parse_error
         FROM glog_import_staging
         WHERE batch_id = ? AND parse_error IS NOT NULL
         ORDER BY line_no ASC
         LIMIT 500`,
        [batchId]
      );
      payload.data.staging_errors = errors;
    }

    return res.json(payload);
  } catch (err) {
    console.error('Glog batch detail error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

const listMyBatches = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const [rows] = await db.query(
      `SELECT id, original_filename, mime_ext, staging_row_count, staging_error_count, status, processed_at, created_at
       FROM glog_import_batches
       WHERE uploaded_by = ?
       ORDER BY id DESC
       LIMIT ? OFFSET ?`,
      [req.user.id, limit, offset]
    );

    const [[{ total }]] = await db.query(
      'SELECT COUNT(*) AS total FROM glog_import_batches WHERE uploaded_by = ?',
      [req.user.id]
    );

    return res.json({
      success: true,
      data: rows,
      pagination: { total, page, limit },
    });
  } catch (err) {
    console.error('Glog list error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = {
  uploadGlog,
  uploadGlogMiddleware,
  processBatch,
  getBatchDetail,
  listMyBatches,
};

