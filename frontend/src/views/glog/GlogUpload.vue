<template>
  <div>
    <div class="page-header">
      <div>
        <h1 class="page-title">Upload Glog</h1>
        <p class="page-subtitle">
          Unggah file mesin (.csv atau .txt) → preview → proses & sinkronisasi (<code>glog_import_daily</code>).
          Setelah proses, baris yang NIK-nya cocok dengan karyawan LS aktif disinkronkan ke <code>attendance</code> (jam masuk/keluar; baris sudah disetujui/ditolak tidak akan ditimpa).
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
        <span class="card-title">Unggah &amp; Preview</span>
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
          <div><strong>Baris Preview:</strong> {{ lastBatch.staging_row_count }}</div>
          <div><strong>Baris Bermasalah:</strong> {{ lastBatch.staging_error_count }}</div>
          <button
            class="btn btn-outline btn-sm"
            style="margin-top:10px;"
            :disabled="processing || !lastBatch.batch_id"
            @click="doProcess(lastBatch.batch_id)"
          >
            {{ processing ? 'Memproses…' : 'Proses & Sinkronisasi' }}
          </button>
        </div>
        <div v-if="lastProcessStats" class="batch-summary" style="margin-top:12px;">
          <div class="text-sm" style="font-weight:700;margin-bottom:6px;">Sinkron ke <code>attendance</code> (batch terakhir diproses)</div>
          <div>Baris Sinkronisasi: <strong>{{ lastProcessStats.daily_row_count }}</strong></div>
          <div>Insert baru: <strong>{{ lastProcessStats.attendance_inserted }}</strong></div>
          <div>Update (hanya status pending): <strong>{{ lastProcessStats.attendance_updated_pending }}</strong></div>
          <div>Lewati — sudah approved/rejected: <strong>{{ lastProcessStats.attendance_skipped_non_pending }}</strong></div>
          <div>Lewati — NIK tidak cocok master LS: <strong>{{ lastProcessStats.attendance_skipped_unmatched_nik }}</strong></div>
          <div>Lewati — NIK ambigu (&gt;1 karyawan): <strong>{{ lastProcessStats.attendance_skipped_ambiguous_nik }}</strong></div>
          <div>Lewati — tanggal/jam tidak valid: <strong>{{ lastProcessStats.attendance_skipped_invalid_time }}</strong></div>
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
import { ref } from 'vue';
import api from '../../utils/api';

const fileInput = ref(null);
const selectedFile = ref(null);
const uploading = ref(false);
const processing = ref(false);
const uploadMessage = ref('');
const uploadOk = ref(false);
const lastBatch = ref(null);
const lastProcessStats = ref(null);
const dailyRows = ref([]);
const stagingErrors = ref([]);

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
  uploadMessage.value = '';
  dailyRows.value = [];
  stagingErrors.value = [];
  lastProcessStats.value = null;
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
  uploadMessage.value = '';
  try {
    const { data } = await api.post(`/glog/batches/${batchId}/process`);
    if (!data.success) {
      uploadOk.value = false;
      uploadMessage.value = data.message || 'Proses gagal.';
      return;
    }
    uploadOk.value = true;
    uploadMessage.value = data.message || 'Proses selesai.';
    lastProcessStats.value = data.data || null;
    await loadBatchDetail(batchId);
  } catch (err) {
    uploadOk.value = false;
    uploadMessage.value = err.response?.data?.message || err.message || 'Proses gagal.';
  } finally {
    processing.value = false;
  }
}

async function loadBatchDetail(batchId) {
  const { data } = await api.get(`/glog/batches/${batchId}`, { params: { include: 'all' } });
  if (data.success && data.data) {
    dailyRows.value = data.data.daily || [];
    stagingErrors.value = data.data.staging_errors || [];
  }
}
</script>

<style scoped>
.upload-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
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
