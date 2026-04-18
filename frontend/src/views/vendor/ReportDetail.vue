<template>
  <div>
    <div class="page-header">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <button type="button" class="btn btn-ghost btn-sm" @click="$router.push('/vendor/reports')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          Back
        </button>
        <div>
          <h1 class="page-title">Vendor monthly report</h1>
          <p class="page-subtitle">{{ vendor?.name }} · {{ monthName }} {{ year }}</p>
        </div>
      </div>
      <div class="flex items-center gap-2" style="flex-wrap:wrap;">
        <span v-if="submission" class="badge" :class="workflowBadge(submission.workflow_status)">{{ workflowLabel(submission.workflow_status) }}</span>
        <button type="button" class="btn btn-outline btn-sm" :disabled="loading" @click="downloadPdf">Download PDF</button>
      </div>
    </div>

    <div v-if="loading" class="loading-overlay card" style="padding:48px;border-radius:var(--radius-lg);">
      <span class="spinner"></span> Loading…
    </div>

    <template v-else>
      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-card-label">LS employees</div>
          <div class="stat-card-value">{{ employees.length }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-label">Attendance rows</div>
          <div class="stat-card-value">{{ totalRows }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-label">Approved rows</div>
          <div class="stat-card-value" style="color:var(--bc-approved)">{{ approvedRows }}</div>
        </div>
      </div>

      <div class="detail-layout">
        <div class="card">
          <div class="card-header">
            <span class="card-title">Monthly attendance (all LS)</span>
          </div>
          <div class="card-body" style="padding-top:0;">
            <div v-for="emp in employees" :key="emp.id" class="emp-block">
              <div class="emp-head">
                <span class="font-bold">{{ emp.name }}</span>
                <span class="text-sm text-muted">{{ emp.employee_id }}</span>
              </div>
              <div class="table-wrapper" style="border:1px solid var(--bc-gray-200);border-radius:var(--radius);margin-bottom:16px;">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Clock In</th>
                      <th>Clock Out</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-if="!emp.attendance?.length">
                      <td colspan="4" class="text-muted" style="padding:12px;">No records</td>
                    </tr>
                    <tr v-for="r in emp.attendance" :key="r.id">
                      <td>{{ formatDate(r.attendance_date) }}</td>
                      <td><span class="time-in">{{ r.clock_in_time || '—' }}</span></td>
                      <td><span class="time-out">{{ r.clock_out_time || '—' }}</span></td>
                      <td><span class="badge" :class="`badge-${r.status}`">{{ r.status }}</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <span class="card-title">Recap &amp; documents</span>
          </div>
          <div class="card-body">
            <div v-if="submitSuccess" class="alert alert-success"><span>✅</span> Submitted to LS HR for review.</div>
            <div v-if="submitError" class="alert alert-error"><span>⚠️</span> {{ submitError }}</div>
            <div v-if="!canEdit" class="alert alert-info" style="margin-bottom:16px;">
              <span>ℹ️</span> This period is locked while it is with LS HR or SSU (or completed).
            </div>

            <form @submit.prevent="submitReport">
              <div class="form-group">
                <label class="form-label">Invoice value (IDR)</label>
                <div style="position:relative;">
                  <span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--bc-gray-400);font-weight:600;">Rp</span>
                  <input v-model="reportForm.invoice_value" type="number" class="form-control" style="padding-left:36px;" min="0" :disabled="!canEdit" />
                </div>
              </div>

              <div class="upload-grid">
                <div v-for="doc in docFields" :key="doc.key" class="form-group">
                  <label class="form-label">{{ doc.label }} <span v-if="getExisting(doc.key)" class="file-ok">Uploaded</span></label>
                  <div
                    class="file-upload-area"
                    :class="{ 'has-file': reportForm.files[doc.key] || getExisting(doc.key) }"
                    @click="canEdit && triggerUpload(doc.key)"
                    @dragover.prevent
                    @drop.prevent="canEdit && onDrop($event, doc.key)"
                  >
                    <template v-if="reportForm.files[doc.key]">
                      <div class="file-name">{{ reportForm.files[doc.key].name }}</div>
                    </template>
                    <template v-else-if="getExisting(doc.key)">
                      <div class="file-name">{{ getExisting(doc.key) }}</div>
                      <div class="text-sm text-muted">Replace?</div>
                    </template>
                    <template v-else>
                      <div class="text-sm text-muted">Click or drop file</div>
                    </template>
                    <input
                      type="file"
                      :ref="el => (fileInputs[doc.key] = el)"
                      style="display:none;"
                      accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.doc,.docx"
                      @change="onFile($event, doc.key)"
                    />
                  </div>
                </div>
              </div>

              <button type="submit" class="btn btn-primary w-full" :disabled="submitting || !canEdit">
                {{ submitting ? 'Submitting…' : 'Submit to LS HR' }}
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
import { downloadBlob } from '../../utils/download';

const route = useRoute();
const month = computed(() => parseInt(route.params.month, 10));
const year = computed(() => parseInt(route.params.year, 10));

const loading = ref(false);
const submitting = ref(false);
const submitSuccess = ref(false);
const submitError = ref('');
const vendor = ref(null);
const employees = ref([]);
const submission = ref(null);

const reportForm = reactive({ invoice_value: '', files: { bast_file: null, invoice_file: null, recap_salary_file: null, tax_file: null } });
const fileInputs = {};

const docFields = [
  { key: 'bast_file', label: 'BAST' },
  { key: 'invoice_file', label: 'Invoice' },
  { key: 'recap_salary_file', label: 'Recap salary' },
  { key: 'tax_file', label: 'Tax' },
];

const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const monthName = computed(() => monthNames[month.value - 1] || '');

const totalRows = computed(() => employees.value.reduce((s, e) => s + (e.attendance?.length || 0), 0));
const approvedRows = computed(() => {
  let n = 0;
  for (const e of employees.value) {
    for (const r of e.attendance || []) if (r.status === 'approved') n++;
  }
  return n;
});

const editableStatuses = ['draft', 'hr_rejected', null, undefined];
const canEdit = computed(() => {
  const st = submission.value?.workflow_status;
  if (!submission.value) return true;
  return editableStatuses.includes(st);
});

const workflowLabel = (s) => {
  const map = {
    draft: 'Draft',
    pending_ls_hr: 'With LS HR',
    hr_rejected: 'Rejected (LS HR)',
    pending_ssu: 'With SSU',
    invoice_on_process: 'Invoice On Process',
  };
  return map[s] || s || '—';
};

const workflowBadge = (s) => {
  if (s === 'pending_ls_hr') return 'badge-pending';
  if (s === 'hr_rejected') return 'badge-rejected';
  if (s === 'pending_ssu') return 'badge-submitted';
  if (s === 'invoice_on_process') return 'badge-invoice-process';
  return 'badge-draft';
};

const formatDate = (d) => new Date(d).toLocaleDateString('en-ID', { day: '2-digit', month: 'short', year: 'numeric' });

const loadData = async () => {
  loading.value = true;
  try {
    const { data } = await api.get(`/reports/vendor/${month.value}/${year.value}`);
    vendor.value = data.vendor;
    employees.value = data.employees || [];
    submission.value = data.submission;
    if (data.submission?.invoice_value != null) reportForm.invoice_value = String(data.submission.invoice_value);
    else reportForm.invoice_value = '';
    Object.keys(reportForm.files).forEach((k) => { reportForm.files[k] = null; });
  } catch (e) {
    submitError.value = e.response?.data?.message || 'Failed to load.';
  } finally {
    loading.value = false;
  }
};

const getExisting = (k) => submission.value?.[k] || null;
const triggerUpload = (k) => fileInputs[k]?.click();
const onFile = (e, k) => { reportForm.files[k] = e.target.files[0] || null; };
const onDrop = (e, k) => { reportForm.files[k] = e.dataTransfer.files[0] || null; };

const downloadPdf = async () => {
  const res = await api.get(`/reports/vendor/${month.value}/${year.value}/pdf`, { responseType: 'blob' });
  downloadBlob(res.data, `timesheet-${year.value}-${String(month.value).padStart(2, '0')}.pdf`);
};

const submitReport = async () => {
  submitting.value = true;
  submitSuccess.value = false;
  submitError.value = '';
  try {
    const fd = new FormData();
    if (reportForm.invoice_value !== '') fd.append('invoice_value', reportForm.invoice_value);
    for (const [k, f] of Object.entries(reportForm.files)) if (f) fd.append(k, f);
    await api.post(`/reports/vendor/${month.value}/${year.value}`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    submitSuccess.value = true;
    await loadData();
  } catch (e) {
    submitError.value = e.response?.data?.message || 'Submit failed.';
  } finally {
    submitting.value = false;
  }
};

onMounted(loadData);
</script>

<style scoped>
.detail-layout { display: grid; grid-template-columns: 1fr 400px; gap: 24px; align-items: flex-start; }
.emp-head { display: flex; align-items: baseline; gap: 10px; margin: 16px 0 8px; }
.time-in { color: var(--bc-green-600); font-weight: 700; }
.time-out { color: var(--bc-rejected); font-weight: 700; }
.upload-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.file-ok { font-size: 10px; font-weight: 800; background: var(--bc-green-100); color: var(--bc-green-700); padding: 2px 8px; border-radius: 99px; margin-left: 6px; }
@media (max-width: 1100px) { .detail-layout { grid-template-columns: 1fr; } }
@media (max-width: 600px) { .upload-grid { grid-template-columns: 1fr; } }
</style>
