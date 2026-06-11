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
          <button
            type="button"
            class="btn btn-outline"
            :disabled="downloading"
            title="Unduh template Excel untuk bulk upload data karyawan"
            @click="downloadTemplate"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {{ downloading ? 'Menyiapkan...' : 'Download Excel Template' }}
          </button>
        </div>
        <p v-if="uploadMessage" class="alert-inline" :class="uploadOk ? 'ok' : 'err'">{{ uploadMessage }}</p>

        <div v-if="summary" class="batch-summary">
          <div><strong>Total diproses:</strong> {{ summary.total_rows }}</div>
          <div><strong>Data baru:</strong> {{ summary.inserted }}</div>
          <div><strong>Data update:</strong> {{ summary.updated }}</div>
          <div><strong>Data dilewati:</strong> {{ summary.skipped }}</div>
          <div><strong>Skip - NIK/NPK kosong:</strong> {{ skippedNpkEmptyRows.length || summary.skipped_nik_npk_empty ?? summary.skipped_npk_empty ?? 0 }}</div>
          <div><strong>Skip - Error proses:</strong> {{ processErrors.length || summary.skipped_error ?? 0 }}</div>
          <div><strong>Kendala:</strong> {{ kendalaErrors.length || summary.error_count ?? 0 }}</div>
        </div>
      </div>
    </div>

    <p v-if="summary" class="text-sm text-muted" style="margin-top:8px;">
      Hanya baris dengan NPK terisi yang diproses. Kolom Vendor harus cocok dengan master vendor.
    </p>

    <div v-if="skippedNpkEmptyRows.length" class="card result-card">
      <div class="card-header">
        <span class="card-title">Skip — NIK/NPK Kosong ({{ skippedNpkEmptyRows.length }})</span>
      </div>
      <div class="table-wrapper" style="border:none;">
        <table>
          <thead>
            <tr>
              <th>Baris</th>
              <th>SID</th>
              <th>NPK</th>
              <th>Nama Karyawan</th>
              <th>Jabatan</th>
              <th>Departemen</th>
              <th>Site</th>
              <th>Vendor</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, idx) in skippedNpkEmptyRows" :key="`npk-empty-${row.line_no}-${idx}`">
              <td>{{ row.line_no }}</td>
              <td class="font-mono text-sm">{{ row.sid || '—' }}</td>
              <td class="font-mono text-sm">{{ row.npk || '—' }}</td>
              <td>{{ row.employee_name || '—' }}</td>
              <td>{{ row.position || '—' }}</td>
              <td>{{ row.user_department || '—' }}</td>
              <td>{{ row.site || '—' }}</td>
              <td>{{ row.company_name || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="processErrors.length" class="card result-card">
      <div class="card-header">
        <span class="card-title">Skip — Error Proses ({{ processErrors.length }})</span>
      </div>
      <div class="table-wrapper" style="border:none;">
        <table>
          <thead>
            <tr>
              <th>Baris</th>
              <th>NPK</th>
              <th>SID</th>
              <th>Nama Karyawan</th>
              <th>Vendor</th>
              <th>Keterangan</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, idx) in processErrors" :key="`process-${row.line_no}-${idx}`">
              <td>{{ row.line_no }}</td>
              <td class="font-mono text-sm">{{ row.npk || '—' }}</td>
              <td class="font-mono text-sm">{{ row.sid || '—' }}</td>
              <td>{{ row.employee_name || '—' }}</td>
              <td>{{ row.company_name || '—' }}</td>
              <td class="text-sm issue-cell">{{ row.error }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="kendalaErrors.length" class="card result-card">
      <div class="card-header">
        <span class="card-title">Kendala ({{ kendalaErrors.length }})</span>
      </div>
      <div class="table-wrapper" style="border:none;">
        <table>
          <thead>
            <tr>
              <th>Baris</th>
              <th>NPK</th>
              <th>SID</th>
              <th>Nama Karyawan</th>
              <th>Vendor</th>
              <th>Keterangan</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, idx) in kendalaErrors" :key="`kendala-${row.line_no}-${idx}`">
              <td>{{ row.line_no }}</td>
              <td class="font-mono text-sm">{{ row.npk || '—' }}</td>
              <td class="font-mono text-sm">{{ row.sid || '—' }}</td>
              <td>{{ row.employee_name || '—' }}</td>
              <td>{{ row.company_name || '—' }}</td>
              <td class="text-sm issue-cell">{{ row.error }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import api from '../../utils/api';

const fileInput = ref(null);
const selectedFile = ref(null);
const uploading = ref(false);
const downloading = ref(false);
const uploadMessage = ref('');
const uploadOk = ref(false);
const summary = ref(null);

const skippedNpkEmptyRows = computed(() => summary.value?.skipped_npk_empty_rows || []);
const processErrors = computed(() => {
  if (Array.isArray(summary.value?.process_errors)) return summary.value.process_errors;
  const legacy = summary.value?.errors || [];
  return legacy.filter((row) => String(row.error || '').includes('Vendor tidak ditemukan'));
});
const kendalaErrors = computed(() => {
  if (Array.isArray(summary.value?.kendala_errors)) return summary.value.kendala_errors;
  const legacy = summary.value?.errors || [];
  return legacy.filter((row) => !String(row.error || '').includes('Vendor tidak ditemukan'));
});

function onFile(e) {
  const f = e.target.files && e.target.files[0];
  selectedFile.value = f || null;
  uploadMessage.value = '';
}

async function downloadTemplate() {
  if (downloading.value) return;
  downloading.value = true;
  try {
    const { data } = await api.get('/employees/template', { responseType: 'blob' });
    const url = window.URL.createObjectURL(data);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Template_Data_Karyawan.xlsx';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    uploadOk.value = false;
    uploadMessage.value =
      err.response?.data?.message || err.message || 'Gagal mengunduh template.';
  } finally {
    downloading.value = false;
  }
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
.result-card {
  margin-bottom: 20px;
}
.issue-cell {
  color: #b45309;
}
</style>
