<template>
  <div>
    <div class="page-header">
      <div>
        <h1 class="page-title">Upload Attendance Log</h1>
        <p class="page-subtitle">
          Unggah file mesin (.csv / .txt) atau sinkron dari database FTM / Fingerspot
        </p>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px;">
      <div class="card-header">
        <span class="card-title">Format File</span>
      </div>
      <div class="card-body">
        <p class="text-sm text-muted" style="margin:0 0 8px;">
          Baris pertama wajib header (pisah koma), contoh:
        </p>
        <pre class="format-sample">NIK,Nama Karyawan,Tanggal,Jam,Nama Mesin
10000056,H GATOT BUDI K,15/10/2019,07:22,HO 1</pre>
        <p class="text-sm text-muted" style="margin:8px 0 0;">Tanggal: DD/MM/YYYY · Jam: HH:MM</p>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px;">
      <div class="card-header">
        <span class="card-title">Sinkron Database FTM</span>
      </div>
      <div class="card-body">
        <p class="text-sm text-muted" style="margin:0 0 12px;">
          Ambil tap dari <code>data_access</code> (SQL Server FTM) yang sudah di-join ke <code>employee</code>,
          agregasi per NIK per hari, lalu sinkron ke <code>attendance</code>. Maks. 31 hari.
        </p>
        <div class="ftm-sync-row">
          <div class="ftm-date-field">
            <label class="text-sm text-muted" for="ftm-date-from">Dari tanggal</label>
            <input
              id="ftm-date-from"
              v-model="ftmDateFrom"
              type="date"
              class="form-control"
              :disabled="ftmSyncing"
            />
          </div>
          <div class="ftm-date-field">
            <label class="text-sm text-muted" for="ftm-date-to">Sampai tanggal</label>
            <input
              id="ftm-date-to"
              v-model="ftmDateTo"
              type="date"
              class="form-control"
              :disabled="ftmSyncing"
            />
          </div>
          <label class="ftm-checkbox text-sm">
            <input v-model="ftmCreateEmployees" type="checkbox" :disabled="ftmSyncing" />
            Buat karyawan LS baru jika NIK belum ada
          </label>
          <button
            class="btn btn-primary"
            :disabled="ftmSyncing || !ftmDateFrom || !ftmDateTo"
            @click="doSyncFtm"
          >
            {{ ftmSyncing ? 'On Progress...' : 'Sync FTM' }}
          </button>
        </div>
        <p v-if="ftmMessage" class="alert-inline" :class="ftmOk ? 'ok' : 'err'">{{ ftmMessage }}</p>
        <div v-if="lastFtmStats" class="batch-summary" style="margin-top:12px;">
          <div class="text-sm" style="font-weight:700;margin-bottom:6px;">
            Hasil sinkron FTM ({{ lastFtmStats.date_from }} — {{ lastFtmStats.date_to }})
          </div>
          <div>Tap dibaca dari FTM: <strong>{{ lastFtmStats.ftm_tap_rows_read }}</strong></div>
          <div>Baris agregasi harian: <strong>{{ lastFtmStats.daily_row_count }}</strong></div>
          <div v-if="lastFtmStats.employee_placeholder_created != null">
            Karyawan baru dibuat: <strong>{{ lastFtmStats.employee_placeholder_created }}</strong>
          </div>
          <div>Data Baru: <strong>{{ lastFtmStats.attendance_inserted }}</strong></div>
          <div>Data Diupdate: <strong>{{ lastFtmStats.attendance_updated_pending }}</strong></div>
          <div>Skip — Data Sudah Sama: <strong>{{ lastFtmStats.attendance_skipped_duplicate_noop }}</strong></div>
          <div>Skip — Data Sudah Disetujui/Ditolak: <strong>{{ lastFtmStats.attendance_skipped_non_pending }}</strong></div>
          <div>Skip — NIK Tidak Cocok: <strong>{{ lastFtmStats.attendance_skipped_unmatched_nik }}</strong></div>
          <div>Skip — Tanggal/Jam Tidak Valid: <strong>{{ lastFtmStats.attendance_skipped_invalid_time }}</strong></div>
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px;">
      <div class="card-header">
        <span class="card-title">Sinkron Database Fingerspot</span>
      </div>
      <div class="card-body">
        <p class="text-sm text-muted" style="margin:0 0 12px;">
          Ambil tap dari tabel <code>att_log</code> (kolom <code>date_scan</code>), agregasi per PIN/NIK per hari,
          validasi durasi minimal 6 jam, lalu sinkron ke <code>attendance</code>. Mapping PIN → NIK lewat
          <code>employees.pin</code> / <code>employees.nik</code>.
        </p>
        <div class="ftm-sync-row">
          <div class="ftm-date-field">
            <label class="text-sm text-muted" for="fs-date-from">Dari tanggal</label>
            <input
              id="fs-date-from"
              v-model="fsDateFrom"
              type="date"
              class="form-control"
              :disabled="fsSyncing"
            />
          </div>
          <div class="ftm-date-field">
            <label class="text-sm text-muted" for="fs-date-to">Sampai tanggal</label>
            <input
              id="fs-date-to"
              v-model="fsDateTo"
              type="date"
              class="form-control"
              :disabled="fsSyncing"
            />
          </div>
          <label class="ftm-checkbox text-sm">
            <input v-model="fsCreateEmployees" type="checkbox" :disabled="fsSyncing" />
            Buat karyawan LS baru jika NIK belum ada
          </label>
          <button
            class="btn btn-primary"
            :disabled="fsSyncing || !fsDateFrom || !fsDateTo"
            @click="doSyncFingerspot"
          >
            {{ fsSyncing ? 'On Progress...' : 'Sync Fingerspot' }}
          </button>
        </div>
        <p v-if="fsMessage" class="alert-inline" :class="fsOk ? 'ok' : 'err'">{{ fsMessage }}</p>
        <div v-if="lastFsStats" class="batch-summary" style="margin-top:12px;">
          <div class="text-sm" style="font-weight:700;margin-bottom:6px;">
            Hasil sinkron Fingerspot ({{ lastFsStats.date_from }} — {{ lastFsStats.date_to }})
          </div>
          <div>Tap dibaca: <strong>{{ lastFsStats.fingerspot_tap_rows_read }}</strong></div>
          <div>Baris agregasi harian: <strong>{{ lastFsStats.daily_row_count }}</strong></div>
          <div>Skip — durasi &lt; 6 jam: <strong>{{ lastFsStats.attendance_skipped_short_shift }}</strong></div>
          <div v-if="lastFsStats.employee_placeholder_created != null">
            Karyawan baru dibuat: <strong>{{ lastFsStats.employee_placeholder_created }}</strong>
          </div>
          <div>Data Baru: <strong>{{ lastFsStats.attendance_inserted }}</strong></div>
          <div>Data Diupdate: <strong>{{ lastFsStats.attendance_updated_pending }}</strong></div>
          <div>Skip — Data Sudah Sama: <strong>{{ lastFsStats.attendance_skipped_duplicate_noop }}</strong></div>
          <div>Skip — NIK Tidak Cocok: <strong>{{ lastFsStats.attendance_skipped_unmatched_nik }}</strong></div>
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px;">
      <div class="card-header">
        <span class="card-title">Unggah File & Preview</span>
      </div>
      <div class="card-body">
        <div class="upload-row">
          <input
            ref="fileInput"
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            class="form-control"
            style="max-width:320px;"
            @change="onFile"
          />
          <button class="btn btn-primary" :disabled="!selectedFile || uploading" @click="doUpload">
            {{ uploading ? 'On Progress...' : 'Preview & Upload' }}
          </button>
        </div>
        <p v-if="uploadMessage" class="alert-inline" :class="uploadOk ? 'ok' : 'err'">{{ uploadMessage }}</p>
        <div v-if="lastBatch" class="batch-summary">
          <div><strong>Batch ID:</strong> {{ lastBatch.batch_id }}</div>
          <div><strong>Data Preview:</strong> {{ lastBatch.staging_row_count }}</div>
          <div><strong>Data Kendala:</strong> {{ lastBatch.staging_error_count }}</div>
          <div class="glog-actions" style="margin-top:10px;">
            <button
              class="btn btn-outline btn-sm"
              :disabled="processing || !lastBatch.batch_id"
              @click="doProcess(lastBatch.batch_id)"
            >
              {{ processing ? 'On Progress...' : 'Proses & Sinkronisasi' }}
            </button>
            <button
              class="btn btn-primary btn-sm"
              :disabled="patching || !lastBatch.batch_id || !lastProcessStats"
              :title="!lastProcessStats ? 'Proses Agregasi Harian' : 'Submit/update attendance dari agregasi harian'"
              @click="doPatchAttendance(lastBatch.batch_id)"
            >
              {{ patching ? 'On Progress...' : 'Submit ke Attendance' }}
            </button>
          </div>
        </div>
        <div v-if="lastProcessStats" class="batch-summary" style="margin-top:12px;">
          <div class="text-sm" style="font-weight:700;margin-bottom:6px;">Sinkron ke <code>attendance</code> (batch terakhir diproses)</div>
          <div>Data agregasi harian: <strong>{{ lastProcessStats.daily_row_count }}</strong></div>
          <div v-if="lastProcessStats.staging_duplicate_event_rows != null">
            Data Sesuai : <strong>{{ lastProcessStats.staging_ok_rows }}</strong> /
            <strong>{{ lastProcessStats.staging_distinct_nik_date_time_rows }}</strong>
            · Duplikasi Data: <strong>{{ lastProcessStats.staging_duplicate_event_rows }}</strong>
          </div>
          <div>Data Baru: <strong>{{ lastProcessStats.attendance_inserted }}</strong></div>
          <div>Data Diupdate (hanya status pending): <strong>{{ lastProcessStats.attendance_updated_pending }}</strong></div>
          <div>Skip — Data Sudah Sama: <strong>{{ lastProcessStats.attendance_skipped_duplicate_noop }}</strong></div>
          <div>Skip — Data Sudah Disetujui/Ditolak: <strong>{{ lastProcessStats.attendance_skipped_non_pending }}</strong></div>
          <div>Skip — NIK Tidak Cocok dengan Data Karyawan: <strong>{{ lastProcessStats.attendance_skipped_unmatched_nik }}</strong></div>
          <div>Skip — Tanggal/Jam Tidak Valid: <strong>{{ lastProcessStats.attendance_skipped_invalid_time }}</strong></div>
        </div>
        <div v-if="lastPatchStats" class="batch-summary" style="margin-top:12px;">
          <div class="text-sm" style="font-weight:700;margin-bottom:6px;">Hasil Submit ke <code>attendance</code></div>
          <div>Karyawan : <strong>{{ lastPatchStats.employee_placeholder_created }}</strong></div>
          <div>Data Baru: <strong>{{ lastPatchStats.attendance_inserted }}</strong></div>
          <div>Data Diupdate (hanya status pending): <strong>{{ lastPatchStats.attendance_updated_pending }}</strong></div>
          <div>Skip — Data Sudah Sama: <strong>{{ lastPatchStats.attendance_skipped_duplicate_noop }}</strong></div>
          <div>Skip — Data Sudah Disetujui/Ditolak: <strong>{{ lastPatchStats.attendance_skipped_non_pending }}</strong></div>
          <div>Skip — NIK Tidak Cocok dengan Data Karyawan: <strong>{{ lastPatchStats.attendance_skipped_unmatched_nik }}</strong></div>
          <div>Skip — Tanggal/Jam Tidak Valid: <strong>{{ lastPatchStats.attendance_skipped_invalid_time }}</strong></div>
        </div>
      </div>
    </div>

    <div v-if="dailyRows.length" class="card" style="margin-bottom:20px;">
      <div class="card-header">
        <span class="card-title">Hasil Sinkronisasi (per NIK per tanggal)</span>
        <span class="text-sm text-muted">{{ dailyRows.length }} baris</span>
      </div>
      <div class="table-wrapper" style="border:none;">
        <table>
          <thead>
            <tr>
              <th>NIK</th>
              <th>Nama</th>
              <th>Tanggal</th>
              <th>Jam Masuk</th>
              <th>Jam Keluar</th>
              <th>Jumlah Tap</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in dailyRows" :key="row.id">
              <td class="font-mono text-sm">{{ row.nik }}</td>
              <td>{{ row.employee_name }}</td>
              <td>{{ row.attendance_date }}</td>
              <td><span class="time-cell clock-in">{{ formatTime(row.time_in) }}</span></td>
              <td><span class="time-cell clock-out">{{ formatTime(row.time_out) }}</span></td>
              <td>{{ row.tap_count }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="stagingErrors.length" class="card">
      <div class="card-header">
        <span class="card-title">Data Preview Bermasalah ({{ stagingErrors.length }})</span>
      </div>
      <div class="table-wrapper" style="border:none;">
        <table>
          <thead>
            <tr>
              <th>Line</th>
              <th>NIK</th>
              <th>Nama</th>
              <th>Tanggal</th>
              <th>Jam</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(e, idx) in stagingErrors" :key="idx">
              <td>{{ e.line_no }}</td>
              <td class="font-mono text-sm">{{ e.nik }}</td>
              <td>{{ e.employee_name }}</td>
              <td>{{ e.tanggal_raw }}</td>
              <td>{{ e.jam_raw }}</td>
              <td class="text-sm" style="color:#b45309;">{{ e.parse_error }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onUnmounted, ref } from 'vue';
import api from '../../utils/api';

const fileInput = ref(null);
const selectedFile = ref(null);
const uploading = ref(false);
const processing = ref(false);
const patching = ref(false);
const uploadMessage = ref('');
const uploadOk = ref(false);
const lastBatch = ref(null);
const lastProcessStats = ref(null);
const lastPatchStats = ref(null);
const dailyRows = ref([]);
const stagingErrors = ref([]);
const ftmSyncing = ref(false);
const ftmDateFrom = ref(todayIso());
const ftmDateTo = ref(todayIso());
const ftmCreateEmployees = ref(false);
const lastFtmStats = ref(null);
const ftmMessage = ref('');
const ftmOk = ref(false);
const fsSyncing = ref(false);
const fsDateFrom = ref(todayIso());
const fsDateTo = ref(todayIso());
const fsCreateEmployees = ref(false);
const lastFsStats = ref(null);
const fsMessage = ref('');
const fsOk = ref(false);
let processPollTimer = null;

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function onFile(e) {
  const f = e.target.files && e.target.files[0];
  selectedFile.value = f || null;
  uploadMessage.value = '';
}

function formatTime(t) {
  if (t == null || t === '') return '—';
  const s = String(t);
  return s.length >= 8 ? s.slice(0, 8) : s;
}

async function doUpload() {
  if (!selectedFile.value) return;
  uploading.value = true;
  clearProcessPollTimer();
  uploadMessage.value = '';
  dailyRows.value = [];
  stagingErrors.value = [];
  lastProcessStats.value = null;
  lastPatchStats.value = null;
  try {
    const fd = new FormData();
    fd.append('file', selectedFile.value);
    const { data } = await api.post('/glog/upload', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
    });
    if (!data.success) {
      uploadOk.value = false;
      uploadMessage.value = data.message || 'Upload gagal.';
      return;
    }
    uploadOk.value = true;
    uploadMessage.value = data.message || 'Berhasil.';
    lastBatch.value = data.data;
  } catch (err) {
    uploadOk.value = false;
    uploadMessage.value = err.response?.data?.message || err.message || 'Upload gagal.';
  } finally {
    uploading.value = false;
  }
}

async function doProcess(batchId) {
  if (!batchId) return;
  processing.value = true;
  patching.value = false;
  uploadMessage.value = '';
  try {
    const { data } = await api.post(`/glog/batches/${batchId}/process`, {}, { timeout: 15000 });
    if (!data.success) {
      uploadOk.value = false;
      uploadMessage.value = data.message || 'Proses gagal.';
      return;
    }
    const jobId = data.data?.job_id;
    if (!jobId) {
      uploadOk.value = false;
      uploadMessage.value = 'Job proses tidak ditemukan.';
      return;
    }
    uploadOk.value = true;
    uploadMessage.value = data.message || 'Proses dimulai.';
    await pollProcessJob(jobId, batchId);
  } catch (err) {
    uploadOk.value = false;
    uploadMessage.value = err.response?.data?.message || err.message || 'Proses gagal.';
  } finally {
    processing.value = false;
  }
}

function clearProcessPollTimer() {
  if (processPollTimer) {
    clearTimeout(processPollTimer);
    processPollTimer = null;
  }
}

function jobKindLabel(kind) {
  if (kind === 'patch') return 'Submit attendance';
  if (kind === 'ftm') return 'Sync FTM';
  if (kind === 'fingerspot') return 'Sync Fingerspot';
  return 'Proses';
}

function setJobFeedback(kind, ok, message) {
  if (kind === 'ftm') {
    ftmOk.value = ok;
    ftmMessage.value = message;
    return;
  }
  if (kind === 'fingerspot') {
    fsOk.value = ok;
    fsMessage.value = message;
    return;
  }
  uploadOk.value = ok;
  uploadMessage.value = message;
}

async function pollProcessJob(jobId, batchId, kind = 'process') {
  clearProcessPollTimer();
  const maxWaitMs = 20 * 60 * 1000;
  const startedAt = Date.now();
  const label = jobKindLabel(kind);

  const tick = async () => {
    const { data } = await api.get(`/glog/jobs/${jobId}`, { timeout: 10000 });
    if (!data.success) throw new Error(data.message || 'Gagal membaca status job.');
    const job = data.data || {};
    const p = job.progress || {};
    const processed = Number(p.processed || 0);
    const total = Number(p.total || 0);
    const percent = Number(p.percent || 0);

    if (job.status === 'done') {
      if (kind === 'patch') {
        setJobFeedback(kind, true, 'Submit attendance selesai.');
        lastPatchStats.value = job.result || null;
      } else if (kind === 'ftm') {
        setJobFeedback(kind, true, 'Sync FTM selesai.');
        lastFtmStats.value = job.result || null;
      } else if (kind === 'fingerspot') {
        setJobFeedback(kind, true, 'Sync Fingerspot selesai.');
        lastFsStats.value = job.result || null;
      } else {
        setJobFeedback(kind, true, 'Proses selesai.');
        lastProcessStats.value = job.result || null;
        lastPatchStats.value = null;
      }
      if (batchId) await loadBatchDetail(batchId);
      clearProcessPollTimer();
      return;
    }

    if (job.status === 'error') {
      setJobFeedback(kind, false, job.error || `${label} gagal.`);
      clearProcessPollTimer();
      return;
    }

    const progressMsg =
      total > 0
        ? `${label} berjalan: ${processed}/${total} (${percent}%).`
        : `${label} berjalan (${job.status}).`;
    setJobFeedback(kind, true, progressMsg);

    if (Date.now() - startedAt >= maxWaitMs) {
      setJobFeedback(
        kind,
        false,
        'Waktu tunggu status proses habis. Silakan cek kembali beberapa saat lagi.'
      );
      clearProcessPollTimer();
      return;
    }
    processPollTimer = setTimeout(async () => {
      try {
        await tick();
      } catch (err) {
        setJobFeedback(
          kind,
          false,
          err.response?.data?.message || err.message || 'Gagal memantau proses.'
        );
        clearProcessPollTimer();
      }
    }, 1500);
  };

  await tick();
}

async function doSyncFingerspot() {
  if (!fsDateFrom.value || !fsDateTo.value) return;
  fsSyncing.value = true;
  clearProcessPollTimer();
  fsMessage.value = '';
  lastFsStats.value = null;
  try {
    const { data } = await api.post(
      '/glog/sync-fingerspot',
      {
        date_from: fsDateFrom.value,
        date_to: fsDateTo.value,
        create_employees: fsCreateEmployees.value,
      },
      { timeout: 15000 }
    );
    if (!data.success) {
      fsOk.value = false;
      fsMessage.value = data.message || 'Sync Fingerspot gagal.';
      return;
    }
    const jobId = data.data?.job_id;
    if (!jobId) {
      fsOk.value = false;
      fsMessage.value = 'Job sync Fingerspot tidak ditemukan.';
      return;
    }
    fsOk.value = true;
    fsMessage.value = data.message || 'Sync Fingerspot dimulai.';
    await pollProcessJob(jobId, null, 'fingerspot');
  } catch (err) {
    fsOk.value = false;
    fsMessage.value = err.response?.data?.message || err.message || 'Sync Fingerspot gagal.';
  } finally {
    fsSyncing.value = false;
  }
}

async function doSyncFtm() {
  if (!ftmDateFrom.value || !ftmDateTo.value) return;
  ftmSyncing.value = true;
  clearProcessPollTimer();
  ftmMessage.value = '';
  lastFtmStats.value = null;
  try {
    const { data } = await api.post(
      '/glog/sync-ftm',
      {
        date_from: ftmDateFrom.value,
        date_to: ftmDateTo.value,
        create_employees: ftmCreateEmployees.value,
      },
      { timeout: 15000 }
    );
    if (!data.success) {
      ftmOk.value = false;
      ftmMessage.value = data.message || 'Sync FTM gagal.';
      return;
    }
    const jobId = data.data?.job_id;
    if (!jobId) {
      ftmOk.value = false;
      ftmMessage.value = 'Job sync FTM tidak ditemukan.';
      return;
    }
    ftmOk.value = true;
    ftmMessage.value = data.message || 'Sync FTM dimulai.';
    await pollProcessJob(jobId, null, 'ftm');
  } catch (err) {
    ftmOk.value = false;
    ftmMessage.value = err.response?.data?.message || err.message || 'Sync FTM gagal.';
  } finally {
    ftmSyncing.value = false;
  }
}

async function doPatchAttendance(batchId) {
  if (!batchId || !lastProcessStats.value) return;
  patching.value = true;
  clearProcessPollTimer();
  uploadMessage.value = '';
  try {
    const { data } = await api.post(`/glog/batches/${batchId}/patch-attendance`, {}, { timeout: 15000 });
    if (!data.success) {
      uploadOk.value = false;
      uploadMessage.value = data.message || 'Submit attendance gagal.';
      return;
    }
    const jobId = data.data?.job_id;
    if (!jobId) {
      uploadOk.value = false;
      uploadMessage.value = 'Job submit attendance tidak ditemukan. Silakan cek kembali beberapa saat lagi.';
      return;
    }
    uploadOk.value = true;
    uploadMessage.value = data.message || 'Submit attendance dimulai.';
    await pollProcessJob(jobId, batchId, 'patch');
  } catch (err) {
    uploadOk.value = false;
    uploadMessage.value = err.response?.data?.message || err.message || 'Submit attendance gagal.';
  } finally {
    patching.value = false;
  }
}

async function loadBatchDetail(batchId) {
  const { data } = await api.get(`/glog/batches/${batchId}`, { params: { include: 'all' } });
  if (data.success && data.data) {
    dailyRows.value = data.data.daily || [];
    stagingErrors.value = data.data.staging_errors || [];
  }
}

onUnmounted(() => {
  clearProcessPollTimer();
});
</script>

<style scoped>
.upload-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}
.glog-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.ftm-sync-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px 16px;
}
.ftm-date-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 160px;
}
.ftm-date-field .form-control {
  max-width: 200px;
}
.ftm-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  cursor: pointer;
}
.format-sample {
  margin: 0;
  padding: 12px 14px;
  background: var(--bc-gray-100);
  border-radius: var(--radius);
  font-size: 12px;
  overflow-x: auto;
}
.batch-summary {
  margin-top: 14px;
  padding: 12px 14px;
  background: var(--bc-gray-50);
  border-radius: var(--radius);
  font-size: 14px;
}
.alert-inline {
  margin-top: 10px;
  font-size: 14px;
}
.alert-inline.ok {
  color: var(--bc-green-700);
}
.alert-inline.err {
  color: #b91c1c;
}
</style>
