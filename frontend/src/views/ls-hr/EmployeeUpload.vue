<template>
  <div>
    <div class="page-header">
      <div>
        <h1 class="page-title">Upload Data Karyawan</h1>
        <p class="page-subtitle">
          Bulk upload master karyawan LS HR dari file Excel template Data LS_for sistem
        </p>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px;">
      <div class="card-header">
        <span class="card-title">Format File</span>
      </div>
      <div class="card-body">
        <p class="text-sm text-muted" style="margin:0 0 8px;">
          Header wajib sesuai template:
        </p>
        <pre class="format-sample">No, SID No, NPK, Nama Karyawan, Jabatan, Kelompok Jabatan, Departemen, Site, NIK Atasan, Nama Atasan, Vendor, BU</pre>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px;">
      <div class="card-header">
        <span class="card-title">Unggah File</span>
      </div>
      <div class="card-body">
        <div class="upload-row">
          <input
            ref="fileInput"
            type="file"
            accept=".xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            class="form-control"
            style="max-width:360px;"
            @change="onFile"
          />
          <button class="btn btn-primary" :disabled="!selectedFile || uploading" @click="doUpload">
            {{ uploading ? 'On Progress...' : 'Preview & Upload' }}
          </button>
        </div>
        <p v-if="uploadMessage" class="alert-inline" :class="uploadOk ? 'ok' : 'err'">{{ uploadMessage }}</p>

        <div v-if="summary" class="batch-summary">
          <div><strong>Total diproses:</strong> {{ summary.total_rows }}</div>
          <div><strong>Data baru:</strong> {{ summary.inserted }}</div>
          <div><strong>Data update:</strong> {{ summary.updated }}</div>
          <div><strong>Data dilewati:</strong> {{ summary.skipped }}</div>
          <div><strong>Skip - NIK/NPK kosong:</strong> {{ summary.skipped_nik_npk_empty ?? summary.skipped_npk_empty ?? 0 }}</div>
          <div><strong>Skip - Error proses:</strong> {{ summary.skipped_error ?? 0 }}</div>
          <div><strong>Kendala:</strong> {{ summary.error_count }}</div>
        </div>
      </div>
    </div>

    <p v-if="summary" class="text-sm text-muted" style="margin-top:8px;">
      Hanya baris dengan NPK terisi yang diproses. Kolom Vendor harus cocok dengan master vendor.
    </p>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import api from '../../utils/api';

const fileInput = ref(null);
const selectedFile = ref(null);
const uploading = ref(false);
const uploadMessage = ref('');
const uploadOk = ref(false);
const summary = ref(null);

function onFile(e) {
  const f = e.target.files && e.target.files[0];
  selectedFile.value = f || null;
  uploadMessage.value = '';
}

async function doUpload() {
  if (!selectedFile.value) return;
  uploading.value = true;
  uploadMessage.value = '';
  summary.value = null;
  try {
    const fd = new FormData();
    fd.append('file', selectedFile.value);
    const { data } = await api.post('/employees/upload', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
    });
    if (!data.success) {
      uploadOk.value = false;
      uploadMessage.value = data.message || 'Upload gagal.';
      return;
    }

    uploadOk.value = true;
    uploadMessage.value = data.message || 'Upload berhasil.';
    summary.value = data.data || null;
  } catch (err) {
    uploadOk.value = false;
    uploadMessage.value = err.response?.data?.message || err.message || 'Upload gagal.';
  } finally {
    uploading.value = false;
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
