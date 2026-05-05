<template>
  <div>
    <div class="page-header">
      <div>
        <h1 class="page-title">Upload Attendance Log</h1>
        <p class="page-subtitle">
          Unggah file mesin (.csv atau .txt)
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
        <span class="card-title">Unggah & Preview</span>
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
            {{ uploading ? 'Mengunggah…' : 'Preview & Upload' }}
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
              {{ processing ? 'Memproses…' : 'Proses & Sinkronisasi' }}
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
            · Duplikat Data: <strong>{{ lastProcessStats.staging_duplicate_event_rows }}</strong>
          </div>
          <div>Data Baru: <strong>{{ lastProcessStats.attendance_inserted }}</strong></div>
          <div>Data Diupdate (hanya status pending): <strong>{{ lastProcessStats.attendance_updated_pending }}</strong></div>
          <div>Lewati — Data Sudah Sama: <strong>{{ lastProcessStats.attendance_skipped_duplicate_noop }}</strong></div>
          <div>Lewati — Data Sudah Disetujui/Ditolak: <strong>{{ lastProcessStats.attendance_skipped_non_pending }}</strong></div>
          <div>Lewati — NIK Tidak Cocok dengan Data Karyawan: <strong>{{ lastProcessStats.attendance_skipped_unmatched_nik }}</strong></div>
          <div>Lewati — NIK ambigu (&gt;1 karyawan): <strong>{{ lastProcessStats.attendance_skipped_ambiguous_nik }}</strong></div>
          <div>Lewati — Tanggal/Jam Tidak Valid: <strong>{{ lastProcessStats.attendance_skipped_invalid_time }}</strong></div>
        </div>
        <div v-if="lastPatchStats" class="batch-summary" style="margin-top:12px;">
          <div class="text-sm" style="font-weight:700;margin-bottom:6px;">Hasil Submit ke <code>attendance</code></div>
          <div>Karyawan placeholder dibuat (user LS + <code>employees</code>): <strong>{{ lastPatchStats.employee_placeholder_created }}</strong></div>
          <div>Data Baru: <strong>{{ lastPatchStats.attendance_inserted }}</strong></div>
          <div>Data Diupdate (hanya status pending): <strong>{{ lastPatchStats.attendance_updated_pending }}</strong></div>
          <div>Lewati — Data Sudah Sama: <strong>{{ lastPatchStats.attendance_skipped_duplicate_noop }}</strong></div>
          <div>Lewati — Data Sudah Disetujui/Ditolak: <strong>{{ lastPatchStats.attendance_skipped_non_pending }}</strong></div>
          <div>Lewati — NIK Tidak Cocok dengan Data Karyawan: <strong>{{ lastPatchStats.attendance_skipped_unmatched_nik }}</strong></div>
          <div>Lewati — NIK ambigu: <strong>{{ lastPatchStats.attendance_skipped_ambiguous_nik }}</strong></div>
          <div>Lewati — Tanggal/Jam Tidak Valid: <strong>{{ lastPatchStats.attendance_skipped_invalid_time }}</strong></div>
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
              <th>Tanggal raw</th>
              <th>Jam raw</th>
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
let processPollTimer = null;

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
    uploadMessage.value = data.message || 'Proses dimulai di background.';
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

async function pollProcessJob(jobId, batchId, kind = 'process') {
  clearProcessPollTimer();
  const maxWaitMs = 20 * 60 * 1000;
  const startedAt = Date.now();

  const tick = async () => {
    const { data } = await api.get(`/glog/jobs/${jobId}`, { timeout: 10000 });
    if (!data.success) throw new Error(data.message || 'Gagal membaca status job.');
    const job = data.data || {};
    const p = job.progress || {};
    const processed = Number(p.processed || 0);
    const total = Number(p.total || 0);
    const percent = Number(p.percent || 0);

    if (job.status === 'done') {
      uploadOk.value = true;
      if (kind === 'patch') {
        uploadMessage.value = 'Submit attendance selesai di background.';
        lastPatchStats.value = job.result || null;
      } else {
        uploadMessage.value = 'Proses selesai di background.';
        lastProcessStats.value = job.result || null;
        lastPatchStats.value = null;
      }
      await loadBatchDetail(batchId);
      clearProcessPollTimer();
      return;
    }

    if (job.status === 'error') {
      uploadOk.value = false;
      uploadMessage.value =
        job.error || (kind === 'patch' ? 'Submit attendance background gagal.' : 'Proses background gagal.');
      clearProcessPollTimer();
      return;
    }

    uploadOk.value = true;
    uploadMessage.value =
      total > 0
        ? `${kind === 'patch' ? 'Submit attendance' : 'Proses'} background berjalan: ${processed}/${total} (${percent}%).`
        : `${kind === 'patch' ? 'Submit attendance' : 'Proses'} background berjalan (${job.status}).`;

    if (Date.now() - startedAt >= maxWaitMs) {
      uploadOk.value = false;
      uploadMessage.value = 'Waktu tunggu status proses habis. Cek kembali beberapa saat lagi.';
      clearProcessPollTimer();
      return;
    }
    processPollTimer = setTimeout(async () => {
      try {
        await tick();
      } catch (err) {
        uploadOk.value = false;
        uploadMessage.value = err.response?.data?.message || err.message || 'Gagal memantau proses background.';
        clearProcessPollTimer();
      }
    }, 1500);
  };

  await tick();
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
      uploadMessage.value = data.message || 'Patch gagal.';
      return;
    }
    const jobId = data.data?.job_id;
    if (!jobId) {
      uploadOk.value = false;
      uploadMessage.value = 'Job submit attendance tidak ditemukan.';
      return;
    }
    uploadOk.value = true;
    uploadMessage.value = data.message || 'Submit attendance dimulai di background.';
    await pollProcessJob(jobId, batchId, 'patch');
  } catch (err) {
    uploadOk.value = false;
    uploadMessage.value = err.response?.data?.message || err.message || 'Patch gagal.';
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
