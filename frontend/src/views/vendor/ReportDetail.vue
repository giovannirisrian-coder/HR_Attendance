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
          <p class="page-subtitle">
            {{ vendor?.name }} · {{ monthName }} {{ year }}
            <span v-if="period?.label" class="period-chip">{{ period.label }}</span>
          </p>
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

        <div class="card recap-card">
          <div class="card-header">
            <span class="card-title">BAST &amp; invoice submission</span>
          </div>
          <div class="card-body">
            <div v-if="submitSuccess" class="alert alert-success"><span>✅</span> Submitted to LS HR for review.</div>
            <div v-if="submitError" class="alert alert-error"><span>⚠️</span> {{ submitError }}</div>
            <div v-if="!canEdit" class="alert alert-info" style="margin-bottom:16px;">
              <span>ℹ️</span> This period is locked while it is with LS HR or SSU (or completed).
            </div>

            <form class="recap-form" @submit.prevent="submitReport">
              <div class="form-group">
                <label class="form-label">Invoice number</label>
                <input v-model="reportForm.invoice_number" type="text" class="form-control" autocomplete="off" :disabled="!canEdit" />
              </div>
              <div class="form-group">
                <label class="form-label">Invoice date</label>
                <input v-model="reportForm.invoice_date" type="date" class="form-control" :disabled="!canEdit" />
              </div>
              <div class="form-group">
                <label class="form-label">Due date (days)</label>
                <input v-model="reportForm.due_days" type="text" class="form-control" inputmode="numeric" placeholder="e.g. 30" :disabled="!canEdit" />
              </div>

              <div class="form-group line-items-section">
                <div class="line-items-head">
                  <label class="form-label" style="margin:0;">Description &amp; amount</label>
                  <button type="button" class="btn btn-outline btn-sm" :disabled="!canEdit" @click="addLineRow">+ Add line</button>
                </div>
                <p class="text-sm text-muted" style="margin:0 0 10px;">Each line pairs a description with an amount in IDR (thousand separators optional).</p>
                <div v-for="row in lineItems" :key="row.uid" class="line-item-row">
                  <textarea
                    v-model="row.description"
                    class="form-control line-desc"
                    rows="3"
                    placeholder="Description"
                    :disabled="!canEdit"
                  />
                  <div class="line-amt-wrap">
                    <label class="form-label text-sm">Amount (IDR)</label>
                    <div style="position:relative;">
                      <span class="rp-prefix">Rp</span>
                      <input
                        :value="row.amountStr"
                        type="text"
                        class="form-control amount-input"
                        inputmode="numeric"
                        placeholder="0"
                        :disabled="!canEdit"
                        @input="onLineAmountInput(row, $event)"
                      />
                    </div>
                    <button
                      v-if="lineItems.length > 1"
                      type="button"
                      class="btn btn-ghost btn-sm remove-line"
                      :disabled="!canEdit"
                      @click="removeLineRow(row.uid)"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">Subtotal (IDR)</label>
                <div style="position:relative;">
                  <span class="rp-prefix">Rp</span>
                  <input :value="subtotalDisplay" type="text" class="form-control readonly-field" readonly tabindex="-1" />
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">PPh (Income Tax) (IDR)</label>
                <div style="position:relative;">
                  <span class="rp-prefix">Rp</span>
                  <input
                    :value="reportForm.pphStr"
                    type="text"
                    class="form-control amount-input"
                    inputmode="numeric"
                    placeholder="0"
                    :disabled="!canEdit"
                    @input="onPphInput"
                  />
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">Total invoice amount (IDR)</label>
                <div style="position:relative;">
                  <span class="rp-prefix">Rp</span>
                  <input :value="totalInvoiceDisplay" type="text" class="form-control readonly-field" readonly tabindex="-1" />
                </div>
              </div>

              <div class="upload-section">
                <h3 class="upload-heading">Documents</h3>
                <div class="upload-grid">
                  <div v-for="doc in singleDocFields" :key="doc.uploadKey" class="form-group">
                    <label class="form-label">{{ doc.label }} <span v-if="getExisting(doc.existingKey)" class="file-ok">Uploaded</span></label>
                    <div
                      class="file-upload-area"
                      :class="{ 'has-file': reportForm.files[doc.uploadKey] || getExisting(doc.existingKey) }"
                      @click="canEdit && triggerUpload(doc.uploadKey)"
                      @dragover.prevent
                      @drop.prevent="canEdit && onDropSingle($event, doc.uploadKey)"
                    >
                      <template v-if="reportForm.files[doc.uploadKey]">
                        <div class="file-selected-row">
                          <span class="file-check" aria-hidden="true">✓</span>
                          <div class="file-name">{{ reportForm.files[doc.uploadKey].name }}</div>
                        </div>
                        <div class="text-sm text-muted">Ready to upload on submit</div>
                      </template>
                      <template v-else-if="getExisting(doc.existingKey)">
                        <div class="file-selected-row">
                          <span class="file-check" aria-hidden="true">✓</span>
                          <div class="file-name">{{ getExistingDisplayName(doc.existingKey) }}</div>
                        </div>
                        <div class="text-sm text-muted">Replace?</div>
                      </template>
                      <template v-else>
                        <div class="text-sm text-muted">Click or drop file</div>
                      </template>
                      <input
                        type="file"
                        :ref="(el) => (fileInputs[doc.uploadKey] = el)"
                        style="display:none;"
                        @change="onFileSingle($event, doc.uploadKey)"
                      />
                    </div>
                  </div>
                </div>

                <div class="form-group">
                  <label class="form-label">
                    Other supporting documents
                    <span v-if="existingOtherCount" class="file-ok">{{ existingOtherCount }} on record</span>
                  </label>
                  <div
                    class="file-upload-area multi"
                    :class="{ 'has-file': otherSupportingNewFiles.length > 0 || existingOtherNames.length > 0 }"
                    @click="canEdit && triggerOtherUpload()"
                    @dragover.prevent
                    @drop.prevent="canEdit && onDropOther($event)"
                  >
                    <template v-if="otherSupportingNewFiles.length">
                      <ul class="file-list">
                        <li v-for="(f, i) in otherSupportingNewFiles" :key="i" class="file-selected-row">
                          <span class="file-check" aria-hidden="true">✓</span>
                          <span class="file-name">{{ f.name }}</span>
                        </li>
                      </ul>
                      <div class="text-sm text-muted">Adds to submission (existing files kept)</div>
                    </template>
                    <template v-else-if="existingOtherNames.length">
                      <ul class="file-list">
                        <li v-for="(name, i) in existingOtherNames" :key="`ex-${i}`" class="file-selected-row">
                          <span class="file-check" aria-hidden="true">✓</span>
                          <span class="file-name">{{ name }}</span>
                        </li>
                      </ul>
                    </template>
                    <template v-else>
                      <div class="text-sm text-muted">Click or drop multiple files — all extensions accepted</div>
                    </template>
                    <input
                      ref="otherFilesInputRef"
                      type="file"
                      multiple
                      style="display:none;"
                      @change="onOtherFilesChange"
                    />
                  </div>
                </div>
              </div>

              <div v-if="submitting && uploadProgress > 0" class="upload-progress-wrap">
                <div class="upload-progress-label">
                  <span>Uploading documents…</span>
                  <span>{{ uploadProgress }}%</span>
                </div>
                <div class="upload-progress-track">
                  <div class="upload-progress-bar" :style="{ width: `${uploadProgress}%` }"></div>
                </div>
              </div>

              <button type="submit" class="btn btn-primary w-full" :disabled="submitting || !canEdit">
                {{ submitting ? (uploadProgress > 0 ? `Uploading… ${uploadProgress}%` : 'Submitting…') : 'Submit to LS HR' }}
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
import { formatIdr, parseIdrDigits } from '../../utils/idrFormat';

const route = useRoute();
const month = computed(() => parseInt(route.params.month, 10));
const year = computed(() => parseInt(route.params.year, 10));

const loading = ref(false);
const submitting = ref(false);
const uploadProgress = ref(0);
const submitSuccess = ref(false);
const submitError = ref('');
const vendor = ref(null);
const period = ref(null);
const employees = ref([]);
const submission = ref(null);

let uidSeq = 1;
const nextUid = () => uidSeq++;

const reportForm = reactive({
  invoice_number: '',
  invoice_date: '',
  due_days: '',
  pphStr: '',
  files: { tax_invoice_file: null, invoice_file: null, receipt_file: null },
});

const lineItems = ref([{ uid: nextUid(), description: '', amountStr: '' }]);
const otherSupportingNewFiles = ref([]);
const otherFilesInputRef = ref(null);
const fileInputs = {};

const singleDocFields = [
  { uploadKey: 'tax_invoice_file', existingKey: 'tax_file', label: 'Tax Invoice' },
  { uploadKey: 'invoice_file', existingKey: 'invoice_file', label: 'Invoice' },
  { uploadKey: 'receipt_file', existingKey: 'receipt_file', label: 'Receipt' },
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

const lineItemsSum = computed(() => lineItems.value.reduce((s, row) => s + parseIdrDigits(row.amountStr), 0));
const pphNumeric = computed(() => parseIdrDigits(reportForm.pphStr));
const subtotalDisplay = computed(() => formatIdr(lineItemsSum.value));
const totalInvoiceDisplay = computed(() => formatIdr(lineItemsSum.value + pphNumeric.value));

const existingOtherCount = computed(() => existingOtherNames.value.length);

function parseStoredFileRef(val) {
  if (val == null || val === '') return null;
  if (typeof val === 'object' && val.path) return val;
  const s = String(val);
  try {
    const j = JSON.parse(s);
    if (j && typeof j.path === 'string') return j;
  } catch {
    /* legacy plain filename */
  }
  return { path: s, name: s, legacy: true };
}

function storedFileDisplayName(val) {
  const ref = parseStoredFileRef(val);
  if (!ref) return null;
  if (ref.name && !ref.name.startsWith('gcs:')) return ref.name;
  if (String(ref.path).startsWith('gcs:') || String(ref.path).startsWith('local:')) return 'File on record';
  return ref.name || ref.path;
}

function parseOtherSupportingList(val) {
  if (val == null) return [];
  let arr = val;
  if (typeof val === 'string') {
    try {
      arr = JSON.parse(val);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];
  return arr.map((item) => parseStoredFileRef(item)).filter(Boolean);
}

const existingOtherNames = computed(() =>
  parseOtherSupportingList(submission.value?.other_supporting_files).map(
    (r) => storedFileDisplayName(r.legacy ? r.path : r) || r.name || 'File on record'
  )
);

const workflowLabel = (s) => {
  const map = {
    draft: 'Draft',
    pending_ls_hr: 'With LS HR',
    hr_rejected: 'Rejected (LS HR)',
    pending_ssu: 'With SSU',
    invoice_on_process: 'Invoice On Process',
    paid: 'Paid',
  };
  return map[s] || s || '—';
};

const workflowBadge = (s) => {
  if (s === 'pending_ls_hr') return 'badge-pending';
  if (s === 'hr_rejected') return 'badge-rejected';
  if (s === 'pending_ssu') return 'badge-submitted';
  if (s === 'invoice_on_process') return 'badge-invoice-process';
  if (s === 'paid') return 'badge-approved';
  return 'badge-draft';
};

const formatDate = (d) => new Date(d).toLocaleDateString('en-ID', { day: '2-digit', month: 'short', year: 'numeric' });

function parseSubmissionLineItems(raw) {
  if (raw == null) return [];
  let arr = raw;
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];
  return arr;
}

function applySubmissionToForm(sub) {
  reportForm.invoice_number = sub?.invoice_number ? String(sub.invoice_number) : '';
  reportForm.invoice_date = '';
  if (sub?.invoice_date) {
    const id = String(sub.invoice_date);
    reportForm.invoice_date = id.length >= 10 ? id.slice(0, 10) : id;
  }
  reportForm.due_days = sub?.due_days != null ? String(sub.due_days) : '';

  const pph = sub?.pph_amount != null && sub.pph_amount !== '' ? Number(sub.pph_amount) : 0;
  reportForm.pphStr = Number.isFinite(pph) && pph !== 0 ? formatIdr(pph) : '';

  const parsed = parseSubmissionLineItems(sub?.invoice_line_items);
  if (!parsed.length) {
    lineItems.value = [{ uid: nextUid(), description: '', amountStr: '' }];
  } else {
    lineItems.value = parsed.map((it) => ({
      uid: nextUid(),
      description: String(it.description ?? ''),
      amountStr: formatIdr(Number(it.amount) || 0),
    }));
  }

  Object.keys(reportForm.files).forEach((k) => {
    reportForm.files[k] = null;
  });
  otherSupportingNewFiles.value = [];
}

const loadData = async () => {
  loading.value = true;
  try {
    const { data } = await api.get(`/reports/vendor/${month.value}/${year.value}`);
    vendor.value = data.vendor;
    period.value = data.period || null;
    employees.value = data.employees || [];
    submission.value = data.submission;
    applySubmissionToForm(data.submission);
  } catch (e) {
    submitError.value = e.response?.data?.message || 'Failed to load.';
  } finally {
    loading.value = false;
  }
};

const getExisting = (k) => submission.value?.[k] || null;
const getExistingDisplayName = (k) => storedFileDisplayName(getExisting(k)) || 'File on record';

const addLineRow = () => {
  lineItems.value.push({ uid: nextUid(), description: '', amountStr: '' });
};
const removeLineRow = (uid) => {
  lineItems.value = lineItems.value.filter((r) => r.uid !== uid);
  if (!lineItems.value.length) lineItems.value.push({ uid: nextUid(), description: '', amountStr: '' });
};

const onLineAmountInput = (row, evt) => {
  const n = parseIdrDigits(evt.target.value);
  row.amountStr = formatIdr(n);
};

const onPphInput = (evt) => {
  const n = parseIdrDigits(evt.target.value);
  reportForm.pphStr = formatIdr(n);
};

const triggerUpload = (k) => fileInputs[k]?.click();
const onFileSingle = (e, k) => {
  reportForm.files[k] = e.target.files[0] || null;
};
const onDropSingle = (e, k) => {
  reportForm.files[k] = e.dataTransfer.files[0] || null;
};

const triggerOtherUpload = () => otherFilesInputRef.value?.click();
const onOtherFilesChange = (e) => {
  otherSupportingNewFiles.value = Array.from(e.target.files || []);
};
const onDropOther = (e) => {
  otherSupportingNewFiles.value = Array.from(e.dataTransfer.files || []);
};

const downloadPdf = async () => {
  const res = await api.get(`/reports/vendor/${month.value}/${year.value}/pdf`, { responseType: 'blob' });
  downloadBlob(res.data, `timesheet-${year.value}-${String(month.value).padStart(2, '0')}.pdf`);
};

const submitReport = async () => {
  submitting.value = true;
  uploadProgress.value = 0;
  submitSuccess.value = false;
  submitError.value = '';
  try {
    const payloadLines = lineItems.value
      .map((row) => ({
        description: String(row.description || '').trim(),
        amount: parseIdrDigits(row.amountStr),
      }))
      .filter((row) => row.description !== '' || row.amount > 0);

    const fd = new FormData();
    fd.append('invoice_number', reportForm.invoice_number.trim());
    if (reportForm.invoice_date) fd.append('invoice_date', reportForm.invoice_date);
    if (reportForm.due_days.trim() !== '') fd.append('due_days', reportForm.due_days.trim());
    fd.append('invoice_line_items', JSON.stringify(payloadLines));
    fd.append('pph_amount', String(parseIdrDigits(reportForm.pphStr)));

    for (const [k, f] of Object.entries(reportForm.files)) if (f) fd.append(k, f);
    for (const f of otherSupportingNewFiles.value) fd.append('other_supporting_documents', f);

    await api.post(`/reports/vendor/${month.value}/${year.value}`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (evt) => {
        if (evt.total) {
          uploadProgress.value = Math.min(100, Math.round((evt.loaded * 100) / evt.total));
        }
      },
    });
    uploadProgress.value = 100;
    submitSuccess.value = true;
    await loadData();
  } catch (e) {
    submitError.value = e.response?.data?.message || 'Submit failed.';
  } finally {
    submitting.value = false;
    uploadProgress.value = 0;
  }
};

onMounted(loadData);
</script>

<style scoped>
.detail-layout { display: grid; grid-template-columns: 1fr minmax(340px, 440px); gap: 24px; align-items: flex-start; }
.recap-card { position: sticky; top: 16px; }
.emp-head { display: flex; align-items: baseline; gap: 10px; margin: 16px 0 8px; }
.time-in { color: var(--bc-green-600); font-weight: 700; }
.time-out { color: var(--bc-rejected); font-weight: 700; }
.recap-form { display: flex; flex-direction: column; gap: 4px; }
.line-items-section { margin-top: 8px; }
.line-items-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.line-item-row {
  display: grid;
  grid-template-columns: 1fr minmax(140px, 160px);
  gap: 12px;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px dashed var(--bc-gray-200);
}
@media (max-width: 520px) {
  .line-item-row { grid-template-columns: 1fr; }
}
.line-desc { min-height: 72px; resize: vertical; }
.line-amt-wrap { display: flex; flex-direction: column; gap: 6px; }
.amount-input { padding-left: 36px !important; }
.remove-line { align-self: flex-start; padding-left: 0; }
.readonly-field { padding-left: 36px !important; background: var(--bc-gray-50); color: var(--bc-gray-800); cursor: default; }
.rp-prefix {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--bc-gray-400);
  font-weight: 600;
  font-size: 13px;
}
.upload-heading { font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; color: var(--bc-gray-500); margin: 16px 0 10px; }
.upload-section .upload-grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
.file-ok { font-size: 10px; font-weight: 800; background: var(--bc-green-100); color: var(--bc-green-700); padding: 2px 8px; border-radius: 99px; margin-left: 6px; }
.file-list { margin: 0; padding-left: 0; list-style: none; }
.file-upload-area.multi { text-align: left; }
.file-selected-row { display: flex; align-items: center; gap: 8px; justify-content: center; }
.file-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--bc-green-500);
  color: #fff;
  font-size: 12px;
  font-weight: 800;
  flex-shrink: 0;
}
.upload-progress-wrap { margin: 12px 0 4px; }
.upload-progress-label {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  font-weight: 600;
  color: var(--bc-green-700);
  margin-bottom: 6px;
}
.upload-progress-track {
  height: 8px;
  background: var(--bc-gray-200);
  border-radius: 99px;
  overflow: hidden;
}
.upload-progress-bar {
  height: 100%;
  background: linear-gradient(90deg, var(--bc-green-500), var(--bc-green-600));
  border-radius: 99px;
  transition: width 0.15s ease;
}
@media (max-width: 1100px) { .detail-layout { grid-template-columns: 1fr; } .recap-card { position: static; } }
.period-chip {
  display: inline-block;
  margin-left: 8px;
  padding: 2px 10px;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--bc-green-800, #145228);
  background: var(--bc-green-50, #ecfdf5);
  border: 1px solid var(--bc-green-200, #a7f3d0);
  border-radius: 99px;
  vertical-align: middle;
}
</style>
