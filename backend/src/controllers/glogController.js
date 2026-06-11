const crypto = require('crypto');
const multer = require('multer');
const db = require('../config/database');
const {
  upsertAttendanceFromGlogDailyRow,
  tallyUpsertStats,
} = require('../services/glogAttendanceService');
/** Hanya sinkron ke attendance jika NIK/NPK sudah ada di hr_employees (tanpa auto-create). */
const GLOG_UPSERT_OPTS = { createEmployeeIfUnmatched: false };

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

// Delimiters we try when auto-detecting the field separator. Excel saves
// CSV/TXT with different separators depending on the OS regional "list
// separator" (comma on en-US, semicolon on id-ID / European locales) or
// when the user picks "Text (Tab delimited)" — so we accept all of them
// and let `detectDelimiter` pick whichever one makes the header row valid.
const DELIMITER_CANDIDATES = [',', ';', '\t', '|'];

function parseCsvLine(line, delimiter = ',') {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (c === delimiter && !inQuotes) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += c;
  }
  out.push(cur.trim());
  return out;
}

/**
 * Inspect a header line and return the delimiter that makes it parse into
 * the expected 5 columns, or null when none match. Comma is tried first
 * so existing (correct) comma files keep their original behaviour.
 */
function detectDelimiter(headerLine) {
  for (const delimiter of DELIMITER_CANDIDATES) {
    if (headersMatch(parseCsvLine(headerLine, delimiter))) {
      return delimiter;
    }
  }
  return null;
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
  // Delimiter is detected from the header row so every data row is split
  // with the same separator Excel actually wrote (comma / semicolon / tab
  // / pipe). Defaults to comma until the header is found.
  let delimiter = ',';
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    const detected = detectDelimiter(trimmed);
    if (detected) {
      delimiter = detected;
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
    const cells = parseCsvLine(rawLine, delimiter);
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
    parseError = 'NIK/NPK kosong.';
  } else if (nik.length > 32) {
    parseError = 'NIK/NPK melebihi 32 karakter.';
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

function mysqlLockErrorMessage(err) {
  if (!err || !err.code) return null;
  if (err.code === 'ER_LOCK_WAIT_TIMEOUT') {
    return 'Database sibuk (timeout kunci). Tutup proses glog/absensi lain yang berjalan bersamaan, tunggu sebentar, lalu coba lagi.';
  }
  if (err.code === 'ER_LOCK_DEADLOCK') {
    return 'Terjadi deadlock database. Silakan coba lagi.';
  }
  return null;
}

const PROCESS_JOB_TTL_MS = 30 * 60 * 1000;
const PROCESS_JOB_CHUNK_SIZE = 1000;
const processJobs = new Map();

function createProcessJob({ batchId, uploaderId, type }) {
  const id = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const job = {
    id,
    type: type || 'glog_process_batch',
    batch_id: batchId,
    uploader_id: uploaderId,
    status: 'queued',
    progress: { processed: 0, total: 0, percent: 0 },
    data: null,
    error: null,
    created_at: nowIso,
    started_at: null,
    finished_at: null,
  };
  processJobs.set(id, job);
  return job;
}

function touchJobProgress(job, processed, total) {
  const safeTotal = Math.max(0, Number(total || 0));
  const safeProcessed = Math.max(0, Number(processed || 0));
  const percent = safeTotal > 0 ? Math.min(100, Math.round((safeProcessed / safeTotal) * 100)) : 0;
  job.progress = { processed: safeProcessed, total: safeTotal, percent };
}

function cleanupProcessJobs() {
  const now = Date.now();
  for (const [id, job] of processJobs.entries()) {
    if (!job.finished_at) continue;
    const finishedAt = Date.parse(job.finished_at);
    if (Number.isNaN(finishedAt)) continue;
    if (now - finishedAt > PROCESS_JOB_TTL_MS) processJobs.delete(id);
  }
}

async function getDailyRowsChunk(conn, batchId, lastId, limit) {
  const [rows] = await conn.query(
    `SELECT id, nik, employee_name, attendance_date, time_in, time_out
     FROM glog_import_daily
     WHERE batch_id = ? AND id > ?
     ORDER BY id ASC
     LIMIT ?`,
    [batchId, lastId, limit]
  );
  return rows;
}

/**
 * Sinkronkan baris glog_import_daily batch ini ke attendance.
 * - INSERT jika belum ada baris aktif (user_id + attendance_date).
 * - UPDATE clock_in_time / clock_out_time + employee_id + nik (NPK) hanya jika status = approved.
 * - Lewati jika ada koreksi pending (status pending) agar alur persetujuan tidak tertimpa.
 * - Lewati update jika jam sudah sama dengan glog (nik+tanggal+jam sama).
 * - Lewati jika NIK/NPK tidak ada di hr_employees (tidak dibuat placeholder).
 * Geo & lembur (OT) tidak diubah pada UPDATE (tetap seperti data aplikasi).
 */
async function syncGlogDailyToAttendance(conn, batchId) {
  const stats = {
    attendance_inserted: 0,
    attendance_updated_pending: 0,
    attendance_skipped_non_pending: 0,
    attendance_skipped_unmatched_nik: 0,
    attendance_skipped_invalid_time: 0,
    attendance_skipped_duplicate_noop: 0,
  };

  let lastId = 0;
  for (;;) {
    const rows = await getDailyRowsChunk(conn, batchId, lastId, PROCESS_JOB_CHUNK_SIZE);
    if (rows.length === 0) break;
    for (const row of rows) {
      const r = await upsertAttendanceFromGlogDailyRow(conn, row, GLOG_UPSERT_OPTS);
      tallyUpsertStats(stats, r);
      lastId = row.id;
    }
  }

  return stats;
}

/**
 * Patch / update attendance dari glog_import_daily: sama seperti sinkron, tetapi
 * NIK/NPK yang tidak ada di hr_employees diabaikan (tidak disinkronkan).
 */
async function patchGlogDailyToAttendance(conn, batchId) {
  const stats = {
    attendance_inserted: 0,
    attendance_updated_pending: 0,
    attendance_skipped_non_pending: 0,
    attendance_skipped_unmatched_nik: 0,
    attendance_skipped_invalid_time: 0,
    attendance_skipped_duplicate_noop: 0,
  };

  let lastId = 0;
  for (;;) {
    const rows = await getDailyRowsChunk(conn, batchId, lastId, PROCESS_JOB_CHUNK_SIZE);
    if (rows.length === 0) break;
    for (const row of rows) {
      const r = await upsertAttendanceFromGlogDailyRow(conn, row, GLOG_UPSERT_OPTS);
      tallyUpsertStats(stats, r);
      lastId = row.id;
    }
  }

  return stats;
}

async function runPatchAttendanceInternal(conn, batchId, onProgress) {
  const stats = {
    attendance_inserted: 0,
    attendance_updated_pending: 0,
    attendance_skipped_non_pending: 0,
    attendance_skipped_unmatched_nik: 0,
    attendance_skipped_invalid_time: 0,
    attendance_skipped_duplicate_noop: 0,
  };

  const [[{ total }]] = await conn.query(
    'SELECT COUNT(*) AS total FROM glog_import_daily WHERE batch_id = ?',
    [batchId]
  );
  const totalRows = Number(total || 0);
  if (typeof onProgress === 'function') onProgress(0, totalRows);

  let processed = 0;
  let lastId = 0;
  for (;;) {
    const rows = await getDailyRowsChunk(conn, batchId, lastId, PROCESS_JOB_CHUNK_SIZE);
    if (rows.length === 0) break;
    for (const row of rows) {
      const r = await upsertAttendanceFromGlogDailyRow(conn, row, GLOG_UPSERT_OPTS);
      tallyUpsertStats(stats, r);
      processed += 1;
      lastId = row.id;
    }
    if (typeof onProgress === 'function') onProgress(processed, totalRows);
  }

  return {
    batch_id: batchId,
    ...stats,
  };
}

async function runProcessBatchInternal(conn, batchId, onProgress) {
  const [[stagingDup]] = await conn.query(
    `SELECT
       SUM(CASE WHEN parse_error IS NULL AND attendance_date IS NOT NULL AND event_time IS NOT NULL THEN 1 ELSE 0 END) AS staging_ok_rows
     FROM glog_import_staging WHERE batch_id = ?`,
    [batchId]
  );
  const [[stagingDistinct]] = await conn.query(
    `SELECT COUNT(*) AS c FROM (
       SELECT DISTINCT nik, attendance_date, event_time
       FROM glog_import_staging
       WHERE batch_id = ?
         AND parse_error IS NULL
         AND attendance_date IS NOT NULL
         AND event_time IS NOT NULL
     ) t`,
    [batchId]
  );
  const stagingOkRows = Number(stagingDup.staging_ok_rows || 0);
  const distinctEvents = Number(stagingDistinct.c || 0);
  const staging_duplicate_event_rows = Math.max(0, stagingOkRows - distinctEvents);

  let aggResult;
  await conn.beginTransaction();
  try {
    await conn.query('DELETE FROM glog_import_daily WHERE batch_id = ?', [batchId]);
    const [insertResult] = await conn.query(
      `INSERT INTO glog_import_daily (batch_id, nik, employee_name, attendance_date, time_in, time_out, tap_count)
       SELECT
         batch_id,
         nik,
         MAX(employee_name) AS employee_name,
         attendance_date,
         MIN(event_time) AS time_in,
         MAX(event_time) AS time_out,
         COUNT(*) AS tap_count
       FROM (
         SELECT
           batch_id,
           nik,
           attendance_date,
           event_time,
           MAX(employee_name) AS employee_name
         FROM glog_import_staging
         WHERE batch_id = ?
           AND parse_error IS NULL
           AND attendance_date IS NOT NULL
           AND event_time IS NOT NULL
         GROUP BY batch_id, nik, attendance_date, event_time
       ) AS dedup
       GROUP BY batch_id, nik, attendance_date`,
      [batchId]
    );
    aggResult = insertResult;
    await conn.commit();
  } catch (aggErr) {
    try {
      await conn.rollback();
    } catch (_) {
      /* no-op */
    }
    throw aggErr;
  }

  const stats = {
    attendance_inserted: 0,
    attendance_updated_pending: 0,
    attendance_skipped_non_pending: 0,
    attendance_skipped_unmatched_nik: 0,
    attendance_skipped_invalid_time: 0,
    attendance_skipped_duplicate_noop: 0,
  };
  const [[{ total }]] = await conn.query(
    'SELECT COUNT(*) AS total FROM glog_import_daily WHERE batch_id = ?',
    [batchId]
  );
  const totalRows = Number(total || 0);
  if (typeof onProgress === 'function') onProgress(0, totalRows);

  let processed = 0;
  let lastId = 0;
  for (;;) {
    const rows = await getDailyRowsChunk(conn, batchId, lastId, PROCESS_JOB_CHUNK_SIZE);
    if (rows.length === 0) break;
    for (const row of rows) {
      const r = await upsertAttendanceFromGlogDailyRow(conn, row, GLOG_UPSERT_OPTS);
      tallyUpsertStats(stats, r);
      processed += 1;
      lastId = row.id;
    }
    if (typeof onProgress === 'function') onProgress(processed, totalRows);
  }

  await conn.beginTransaction();
  try {
    await conn.query(
      `UPDATE glog_import_batches SET status = 'processed', processed_at = NOW() WHERE id = ?`,
      [batchId]
    );
    await conn.commit();
  } catch (statusErr) {
    try {
      await conn.rollback();
    } catch (_) {
      /* no-op */
    }
    throw statusErr;
  }

  const dailyCount = aggResult.affectedRows != null ? aggResult.affectedRows : 0;
  return {
    batch_id: batchId,
    daily_row_count: dailyCount,
    staging_ok_rows: stagingOkRows,
    staging_distinct_nik_date_time_rows: distinctEvents,
    staging_duplicate_event_rows,
    ...stats,
  };
}

function startProcessBatchJob(job) {
  setImmediate(async () => {
    const conn = await db.getConnection();
    try {
      job.status = 'running';
      job.started_at = new Date().toISOString();
      const result = await runProcessBatchInternal(conn, job.batch_id, (processed, total) =>
        touchJobProgress(job, processed, total)
      );
      job.status = 'done';
      job.data = result;
      job.finished_at = new Date().toISOString();
      touchJobProgress(job, job.progress.total, job.progress.total);
    } catch (err) {
      job.status = 'error';
      job.error = mysqlLockErrorMessage(err) || err.message || 'Server error.';
      job.finished_at = new Date().toISOString();
      console.error('Glog process background job error:', err);
    } finally {
      conn.release();
      cleanupProcessJobs();
    }
  });
}

function startPatchAttendanceJob(job) {
  setImmediate(async () => {
    const conn = await db.getConnection();
    try {
      job.status = 'running';
      job.started_at = new Date().toISOString();
      const result = await runPatchAttendanceInternal(conn, job.batch_id, (processed, total) =>
        touchJobProgress(job, processed, total)
      );
      job.status = 'done';
      job.data = result;
      job.finished_at = new Date().toISOString();
      touchJobProgress(job, job.progress.total, job.progress.total);
    } catch (err) {
      job.status = 'error';
      job.error = mysqlLockErrorMessage(err) || err.message || 'Server error.';
      job.finished_at = new Date().toISOString();
      console.error('Glog patch background job error:', err);
    } finally {
      conn.release();
      cleanupProcessJobs();
    }
  });
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
      message: 'Data dimasukkan ke tabel log import. Jalankan proses agregasi.',
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
    const existingRunning = Array.from(processJobs.values()).find(
      (j) =>
        j.type === 'glog_process_batch' &&
        j.batch_id === batchId &&
        Number(j.uploader_id) === Number(uploaderId) &&
        (j.status === 'queued' || j.status === 'running')
    );
    if (existingRunning) {
      return res.status(202).json({
        success: true,
        message: 'Proses batch sedang berjalan di background.',
        data: { job_id: existingRunning.id, status: existingRunning.status },
      });
    }

    const job = createProcessJob({ batchId, uploaderId, type: 'glog_process_batch' });
    startProcessBatchJob(job);
    return res.status(202).json({
      success: true,
      message: 'Proses batch dimulai di background. Gunakan endpoint status job untuk memantau progres.',
      data: { job_id: job.id, status: job.status },
    });
  } catch (err) {
    try {
      await conn.rollback();
    } catch (_) {
      /* no-op */
    }
    console.error('Glog process error:', err);
    const lockMsg = mysqlLockErrorMessage(err);
    return res.status(500).json({
      success: false,
      message: lockMsg || err.message || 'Server error.',
    });
  } finally {
    conn.release();
  }
};

const getProcessJobStatus = async (req, res) => {
  try {
    const jobId = String(req.params.jobId || '').trim();
    if (!jobId) {
      return res.status(400).json({ success: false, message: 'Job ID tidak valid.' });
    }
    const job = processJobs.get(jobId);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job tidak ditemukan atau sudah kedaluwarsa.' });
    }
    if (Number(job.uploader_id) !== Number(req.user.id)) {
      return res.status(403).json({ success: false, message: 'Forbidden.' });
    }
    return res.json({
      success: true,
      data: {
        job_id: job.id,
        status: job.status,
        progress: job.progress,
        batch_id: job.batch_id,
        result: job.data,
        error: job.error,
        created_at: job.created_at,
        started_at: job.started_at,
        finished_at: job.finished_at,
      },
    });
  } catch (err) {
    console.error('Get glog process job status error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

/** Patch attendance dari glog_import_daily (NIK/NPK + tanggal): insert/update approved; lewati pending; abaikan NIK tanpa hr_employees. */
const patchAttendanceFromBatch = async (req, res) => {
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
    if (String(batches[0].status) !== 'processed') {
      return res.status(400).json({
        success: false,
        message: 'Batch belum diproses. Jalankan Proses & Sinkronisasi terlebih dahulu.',
      });
    }

    const existingRunning = Array.from(processJobs.values()).find(
      (j) =>
        j.type === 'glog_patch_attendance' &&
        j.batch_id === batchId &&
        Number(j.uploader_id) === Number(uploaderId) &&
        (j.status === 'queued' || j.status === 'running')
    );
    if (existingRunning) {
      return res.status(202).json({
        success: true,
        message: 'Submit attendance sedang berjalan di background.',
        data: { job_id: existingRunning.id, status: existingRunning.status },
      });
    }

    const job = createProcessJob({ batchId, uploaderId, type: 'glog_patch_attendance' });
    startPatchAttendanceJob(job);
    return res.status(202).json({
      success: true,
      message:
        'Submit attendance dimulai di background. Gunakan endpoint status job untuk memantau progres.',
      data: {
        job_id: job.id,
        status: job.status,
      },
    });
  } catch (err) {
    console.error('Glog patch attendance error:', err);
    const lockMsg = mysqlLockErrorMessage(err);
    return res.status(500).json({
      success: false,
      message: lockMsg || err.message || 'Server error.',
    });
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

/**
 * GET /api/glog/template
 * Download the attendance-log import template.
 *
 * The glog uploader only accepts `.csv` / `.txt` (see `uploadGlogMiddleware`
 * fileFilter) and the parser requires the first non-empty line to be the
 * exact header `NIK,Nama Karyawan,Tanggal,Jam,Nama Mesin`. We therefore
 * generate a `.csv` so the downloaded template can be filled in and
 * re-uploaded directly without any format conversion. A UTF-8 BOM is
 * prepended so Excel opens the file with correct encoding while the
 * parser (which strips the BOM) stays unaffected.
 */
const downloadGlogTemplate = (req, res) => {
  try {
    const headerLine = 'NIK,Nama Karyawan,Tanggal,Jam,Nama Mesin';
    const exampleLine = '10000056,H GATOT BUDI K,15/10/2019,07:22,HO 1';
    const csv = `\ufeff${headerLine}\r\n${exampleLine}\r\n`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="Template_Attendance_Log.csv"'
    );
    return res.send(csv);
  } catch (err) {
    console.error('Download glog template error:', err);
    return res.status(500).json({ success: false, message: 'Gagal membuat template.' });
  }
};

module.exports = {
  uploadGlog,
  uploadGlogMiddleware,
  processBatch,
  getProcessJobStatus,
  patchAttendanceFromBatch,
  getBatchDetail,
  listMyBatches,
  downloadGlogTemplate,
};

