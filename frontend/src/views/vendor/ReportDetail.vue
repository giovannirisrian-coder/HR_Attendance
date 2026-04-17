<template>
  <div>
    <div class="page-header">
      <div style="display:flex;align-items:center;gap:12px;">
        <button class="btn btn-ghost btn-sm" @click="$router.back()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          Back
        </button>
        <div>
          <h1 class="page-title">{{ employee?.employee_name || '…' }}</h1>
          <p class="page-subtitle">{{ monthName }} {{ year }} · {{ employee?.employee_id }}</p>
        </div>
      </div>
      <span v-if="report" class="badge" :class="`badge-${report.status}`" style="font-size:14px;padding:6px 14px;">
        {{ report.status }}
      </span>
    </div>

    <div v-if="loading" class="loading-overlay card" style="padding:48px;border-radius:var(--radius-lg);">
      <span class="spinner"></span> Loading report…
    </div>

    <template v-else>
      <!-- Stats summary -->
      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-card-label">Total Days</div>
          <div class="stat-card-value">{{ attendance.length }}</div>
          <div class="stat-card-sub">Attendance records</div>
        </div>
        <div class="stat-card" style="border-left:4px solid var(--bc-approved);">
          <div class="stat-card-label">Approved</div>
          <div class="stat-card-value" style="color:var(--bc-approved)">{{ approvedCount }}</div>
          <div class="stat-card-sub">Records</div>
        </div>
        <div class="stat-card" style="border-left:4px solid var(--bc-pending);">
          <div class="stat-card-label">Pending</div>
          <div class="stat-card-value" style="color:var(--bc-pending)">{{ pendingCount }}</div>
          <div class="stat-card-sub">Records</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-label">Total Hours</div>
          <div class="stat-card-value">{{ totalHours }}h</div>
          <div class="stat-card-sub">{{ approvedCount }} approved days</div>
        </div>
      </div>

      <div class="detail-layout">
        <!-- ── LEFT: Attendance List ── -->
        <div class="card">
          <div class="card-header">
            <span class="card-title">Attendance Records – {{ monthName }} {{ year }}</span>
          </div>
          <div class="table-wrapper" style="border:none;">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Clock In</th>
                  <th>Clock Out</th>
                  <th>Duration</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="attendance.length === 0">
                  <td colspan="5">
                    <div class="empty-state" style="padding:32px;">
                      <div class="empty-state-icon">📅</div>
                      <h3>No attendance this month</h3>
                    </div>
                  </td>
                </tr>
                <tr v-for="r in attendance" :key="r.id">
                  <td>
                    <div class="font-bold">{{ formatDate(r.attendance_date) }}</div>
                    <div class="text-sm text-muted">{{ getDayName(r.attendance_date) }}</div>
                  </td>
                  <td><span class="time-cell clock-in">{{ r.clock_in_time || '—' }}</span></td>
                  <td><span class="time-cell clock-out">{{ r.clock_out_time || '—' }}</span></td>
                  <td>
                    <span v-if="r.clock_in_time && r.clock_out_time" class="font-bold">
                      {{ calcDuration(r.clock_in_time, r.clock_out_time) }}
                    </span>
                    <span v-else class="text-muted">—</span>
                  </td>
                  <td><span class="badge" :class="`badge-${r.status}`">{{ r.status }}</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- ── RIGHT: Recap Reporting Form ── -->
        <div class="card">
          <div class="card-header">
            <span class="card-title">Recap Reporting</span>
            <span v-if="report?.status === 'submitted'" class="badge badge-submitted">Submitted</span>
          </div>
          <div class="card-body">
            <div v-if="submitSuccess" class="alert alert-success"><span>✅</span> Report submitted successfully!</div>
            <div v-if="submitError"   class="alert alert-error">  <span>⚠️</span> {{ submitError }}</div>

            <form @submit.prevent="submitReport">
              <div class="form-group">
                <label class="form-label">Invoice Value (IDR)</label>
                <div style="position:relative;">
                  <span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--bc-gray-400);font-weight:600;">Rp</span>
                  <input
                    v-model="reportForm.invoice_value"
                    type="number"
                    class="form-control"
                    style="padding-left:36px;"
                    placeholder="0"
                    min="0"
                  />
                </div>
                <div v-if="reportForm.invoice_value" class="text-sm text-muted" style="margin-top:4px;">
                  {{ formatCurrency(reportForm.invoice_value) }}
                </div>
              </div>

              <div class="upload-grid">
                <div v-for="doc in docFields" :key="doc.key" class="form-group">
                  <label class="form-label">
                    {{ doc.label }}
                    <span v-if="getExistingFile(doc.key)" class="file-status-badge">✓ Uploaded</span>
                  </label>
                  <div
                    class="file-upload-area"
                    :class="{ 'has-file': reportForm.files[doc.key] || getExistingFile(doc.key) }"
                    @click="triggerUpload(doc.key)"
                    @dragover.prevent
                    @drop.prevent="onDrop($event, doc.key)"
                  >
                    <template v-if="reportForm.files[doc.key]">
                      <div class="upload-icon">📄</div>
                      <div class="file-name">{{ reportForm.files[doc.key].name }}</div>
                      <div class="text-sm text-muted">{{ formatSize(reportForm.files[doc.key].size) }}</div>
                    </template>
                    <template v-else-if="getExistingFile(doc.key)">
                      <div class="upload-icon">✅</div>
                      <div class="file-name">{{ getExistingFile(doc.key) }}</div>
                      <div class="text-sm text-muted">Click to replace</div>
                    </template>
                    <template v-else>
                      <div class="upload-icon">📎</div>
                      <div style="font-size:13px;font-weight:600;color:var(--bc-gray-500);">Click or drag to upload</div>
                      <div class="text-sm text-muted">PDF, Image, or Office doc (max 10MB)</div>
                    </template>
                    <input
                      type="file"
                      :ref="el => fileInputs[doc.key] = el"
                      @change="onFileChange($event, doc.key)"
                      accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.doc,.docx"
                      style="display:none;"
                    />
                  </div>
                </div>
              </div>

              <button type="submit" class="btn btn-primary w-full" :disabled="submitting" style="margin-top:8px;">
                <span v-if="submitting" class="spinner" style="width:16px;height:16px;border-width:2px;"></span>
                {{ submitting ? 'Submitting…' : report?.status === 'submitted' ? 'Update Report' : 'Submit Report' }}
              </button>
            </form>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../utils/api';

const route = useRoute();
const { userId, month, year } = route.params;

const loading   = ref(false);
const submitting = ref(false);
const submitSuccess = ref(false);
const submitError   = ref('');

const employee   = ref(null);
const attendance = ref([]);
const report     = ref(null);

const reportForm = reactive({
  invoice_value: '',
  files: { bast_file: null, invoice_file: null, recap_salary_file: null, tax_file: null },
});
const fileInputs = reactive({});

const docFields = [
  { key: 'bast_file',         label: 'BAST Document' },
  { key: 'invoice_file',      label: 'Invoice' },
  { key: 'recap_salary_file', label: 'Recap Salary' },
  { key: 'tax_file',          label: 'Tax Document' },
];

const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const monthName  = monthNames[parseInt(month) - 1];

const approvedCount = computed(() => attendance.value.filter(r => r.status === 'approved').length);
const pendingCount  = computed(() => attendance.value.filter(r => r.status === 'pending').length);
const totalHours    = computed(() => {
  let mins = 0;
  for (const r of attendance.value) {
    if (r.clock_in_time && r.clock_out_time && r.status === 'approved') {
      const [ih,im] = r.clock_in_time.split(':').map(Number);
      const [oh,om] = r.clock_out_time.split(':').map(Number);
      mins += (oh*60+om) - (ih*60+im);
    }
  }
  return Math.round(mins / 60);
});

const loadData = async () => {
  loading.value = true;
  try {
    const { data } = await api.get(`/reports/${userId}/${month}/${year}`);
    employee.value   = data.employee;
    attendance.value = data.attendance;
    report.value     = data.report;
    if (data.report?.invoice_value) reportForm.invoice_value = data.report.invoice_value;
  } catch { /* silent */ } finally { loading.value = false; }
};

const getExistingFile = (key) => report.value?.[key] || null;
const triggerUpload   = (key) => fileInputs[key]?.click();
const onFileChange    = (e, key) => { reportForm.files[key] = e.target.files[0] || null; };
const onDrop          = (e, key) => { reportForm.files[key] = e.dataTransfer.files[0] || null; };

const submitReport = async () => {
  submitting.value = true;
  submitSuccess.value = false;
  submitError.value   = '';
  try {
    const fd = new FormData();
    if (reportForm.invoice_value) fd.append('invoice_value', reportForm.invoice_value);
    for (const [key, file] of Object.entries(reportForm.files)) {
      if (file) fd.append(key, file);
    }
    await api.post(`/reports/${userId}/${month}/${year}`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    submitSuccess.value = true;
    await loadData();
  } catch (err) {
    submitError.value = err.response?.data?.message || 'Submission failed.';
  } finally { submitting.value = false; }
};

const formatDate    = (d) => new Date(d).toLocaleDateString('en-ID', { day:'2-digit', month:'short', year:'numeric' });
const getDayName    = (d) => new Date(d).toLocaleDateString('en-ID', { weekday:'long' });
const calcDuration  = (inT, outT) => {
  const [ih,im] = inT.split(':').map(Number);
  const [oh,om] = outT.split(':').map(Number);
  const mins = (oh*60+om)-(ih*60+im);
  return mins<0?'—':`${Math.floor(mins/60)}h ${mins%60}m`;
};
const formatCurrency = (v) => new Intl.NumberFormat('id-ID', { style:'currency', currency:'IDR', maximumFractionDigits:0 }).format(v);
const formatSize     = (b) => b > 1048576 ? `${(b/1048576).toFixed(1)} MB` : `${(b/1024).toFixed(0)} KB`;

onMounted(loadData);
</script>

<style scoped>
.detail-layout {
  display: grid;
  grid-template-columns: 1fr 420px;
  gap: 24px;
  align-items: flex-start;
}
.time-cell { font-size: 14px; font-weight: 700; }
.clock-in  { color: var(--bc-green-600); }
.clock-out { color: var(--bc-rejected); }

.upload-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.upload-icon { font-size: 24px; margin-bottom: 4px; }
.file-status-badge {
  display: inline-block; margin-left: 8px;
  font-size: 10px; font-weight: 700; background: var(--bc-green-100); color: var(--bc-green-700);
  padding: 1px 7px; border-radius: 99px;
}

@media (max-width: 1100px) {
  .detail-layout { grid-template-columns: 1fr; }
}
@media (max-width: 600px) {
  .upload-grid { grid-template-columns: 1fr; }
}
</style>
