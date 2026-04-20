<template>
  <div>
    <div class="page-header">
      <div>
        <h1 class="page-title">Approval List</h1>
        <p class="page-subtitle">
          {{ isHr ? 'Vendor monthly submissions for LS HR review' : 'Final document check (SSU)' }}
        </p>
      </div>
    </div>

    <div class="card">
      <div class="card-body" style="padding-bottom:0;">
        <div class="filter-bar">
          <select v-model="filters.month" @change="fetchData" class="form-control" style="max-width:120px;">
            <option value="">All months</option>
            <option v-for="m in 12" :key="m" :value="m">{{ monthShort(m) }}</option>
          </select>
          <input v-model.number="filters.year" @change="fetchData" type="number" class="form-control" style="max-width:100px;" placeholder="Year" min="2020" max="2035" />
          <input v-model="filters.vendor_search" @input="debouncedFetch" class="form-control" placeholder="Vendor name/code…" style="max-width:200px;" />
          <select v-if="!isHr" v-model="filters.vendor_id" @change="fetchData" class="form-control" style="max-width:160px;">
            <option value="">All vendors</option>
            <option v-for="v in vendorOptions" :key="v.id" :value="v.id">{{ v.name }}</option>
          </select>
          <select v-model="filters.status" @change="fetchData" class="form-control" style="max-width:200px;">
            <option value="">All statuses</option>
            <option v-for="o in statusOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
          <button type="button" class="btn btn-outline btn-sm" @click="resetFilters">Reset</button>
        </div>
      </div>

      <div class="table-wrapper" style="border:none;border-radius:0;border-top:1px solid var(--bc-gray-200);">
        <div v-if="loading" class="loading-overlay"><span class="spinner"></span> Loading…</div>
        <table v-else>
          <thead>
            <tr>
              <th>Vendor</th>
              <th>Period</th>
              <th>Invoice (IDR)</th>
              <th>Status</th>
              <th>Submitted</th>
              <th style="width:200px;">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="rows.length === 0">
              <td colspan="6">
                <div class="empty-state">
                  <div class="empty-state-icon">📋</div>
                  <h3>No records</h3>
                  <p>Try changing filters.</p>
                </div>
              </td>
            </tr>
            <tr v-for="r in rows" :key="r.id">
              <td>
                <div class="font-bold">{{ r.vendor_name }}</div>
                <div class="text-sm text-muted">{{ r.vendor_code }}</div>
              </td>
              <td>{{ monthShort(r.report_month) }} {{ r.report_year }}</td>
              <td>{{ formatMoney(r.invoice_value) }}</td>
              <td><span class="badge" :class="statusBadgeClass(r)">{{ statusLabel(r) }}</span></td>
              <td class="text-sm text-muted">{{ r.submitted_at ? formatDt(r.submitted_at) : '—' }}</td>
              <td>
                <div class="icon-actions">
                  <button type="button" class="btn-icon-action" title="Download attachments" :disabled="!hasAnyFile(r)" @click="dlZip(r.id)">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                  </button>
                  <button type="button" class="btn-icon-action" title="Download PDF timesheet" @click="dlPdf(r.id)">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>
                  </button>
                  <template v-if="canApproveReject(r)">
                    <button type="button" class="btn-icon-action success" title="Approve" @click="doApprove(r.id)">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>
                    </button>
                    <button type="button" class="btn-icon-action danger" title="Reject" @click="openReject(r)">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                  </template>
                  <button
                    v-if="canMarkPaid(r)"
                    type="button"
                    class="btn-icon-action success"
                    title="Mark as Paid"
                    @click="doMarkPaid(r.id)"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/><path d="M9 12l-2-2"/></svg>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="pagination.total > 0" class="card-body" style="padding-top:12px;border-top:1px solid var(--bc-gray-100);">
        <div class="pagination">
          <span class="pagination-info">{{ pagination.total }} total</span>
          <button class="btn btn-ghost btn-sm" :disabled="pagination.page <= 1" @click="changePage(pagination.page - 1)">‹ Prev</button>
          <button class="btn btn-ghost btn-sm" :disabled="pagination.page * pagination.limit >= pagination.total" @click="changePage(pagination.page + 1)">Next ›</button>
        </div>
      </div>
    </div>

    <!-- Reject modal -->
    <div v-if="rejectModal.show" class="modal-backdrop" @click.self="rejectModal.show = false">
      <div class="modal" style="max-width:440px;">
        <div class="modal-header">
          <span class="modal-title">Reject submission</span>
          <button type="button" class="modal-close" @click="rejectModal.show = false">✕</button>
        </div>
        <div class="modal-body">
          <p class="text-muted" style="margin-bottom:12px;">{{ isHr ? 'Vendor will be able to revise and resubmit.' : 'Submission returns to LS HR for review.' }}</p>
          <div class="form-group">
            <label class="form-label">Reason <span style="color:var(--bc-rejected)">*</span></label>
            <textarea v-model="rejectModal.note" class="form-control" rows="3" placeholder="Enter rejection reason…"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline" @click="rejectModal.show = false">Cancel</button>
          <button type="button" class="btn btn-danger" :disabled="!rejectModal.note.trim()" @click="confirmReject">Reject</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import api from '../utils/api';
import { downloadBlob } from '../utils/download';

const route = useRoute();
const isHr = computed(() => route.meta.queue === 'hr');
const basePath = computed(() => (isHr.value ? '/reports/hr' : '/reports/ssu'));

const loading = ref(false);
const rows = ref([]);
const vendorOptions = ref([]);
const pagination = reactive({ total: 0, page: 1, limit: 15 });
const filters = reactive({
  month: '',
  year: new Date().getFullYear(),
  vendor_search: '',
  vendor_id: '',
  status: '',
});

const statusOptions = computed(() => {
  if (isHr.value) {
    return [
      { value: 'request_approval', label: 'Request Approval' },
      { value: 'approved', label: 'Approved (forwarded)' },
      { value: 'rejected', label: 'Rejected' },
    ];
  }
  return [
    { value: 'request_approval', label: 'Request Approval' },
    { value: 'invoice_on_process', label: 'Invoice On Process' },
    { value: 'paid', label: 'Paid' },
    { value: 'rejected', label: 'Rejected (returned)' },
  ];
});

let debounceTimer;
const debouncedFetch = () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => { pagination.page = 1; fetchData(); }, 400);
};

const monthShort = (m) => ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m - 1] || m;

const formatMoney = (v) => {
  if (v == null || v === '') return '—';
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(v));
};

const formatDt = (s) => new Date(s).toLocaleString('en-ID', { dateStyle: 'medium', timeStyle: 'short' });

const statusLabel = (r) => {
  if (isHr.value) {
    if (r.workflow_status === 'pending_ls_hr') return 'Request Approval';
    if (r.workflow_status === 'hr_rejected') return 'Rejected';
    if (['pending_ssu', 'invoice_on_process', 'paid'].includes(r.workflow_status)) return 'Approved';
    return r.workflow_status;
  }
  if (r.workflow_status === 'pending_ssu') return 'Request Approval';
  if (r.workflow_status === 'invoice_on_process') return 'Invoice On Process';
  if (r.workflow_status === 'paid') return 'Paid';
  if (r.workflow_status === 'pending_ls_hr' && r.ssu_rejection_note) return 'Rejected';
  return r.workflow_status || '—';
};

const statusBadgeClass = (r) => {
  const lbl = statusLabel(r);
  if (lbl === 'Request Approval') return 'badge-pending';
  if (lbl === 'Rejected') return 'badge-rejected';
  if (lbl === 'Invoice On Process') return 'badge-invoice-process';
  if (lbl === 'Paid') return 'badge-approved';
  if (lbl === 'Approved') return 'badge-approved';
  return 'badge-draft';
};

const hasAnyFile = (r) => !!(r.bast_file || r.invoice_file || r.recap_salary_file || r.tax_file);

const canApproveReject = (r) => {
  if (isHr.value) return r.workflow_status === 'pending_ls_hr';
  return r.workflow_status === 'pending_ssu';
};

const canMarkPaid = (r) => !isHr.value && r.workflow_status === 'invoice_on_process';

const fetchData = async () => {
  loading.value = true;
  try {
    const params = { page: pagination.page, limit: pagination.limit };
    if (filters.month) params.month = filters.month;
    if (filters.year) params.year = filters.year;
    if (filters.vendor_search) params.vendor_search = filters.vendor_search;
    if (!isHr.value && filters.vendor_id) params.vendor_id = filters.vendor_id;
    if (filters.status) params.status = filters.status;
    const { data } = await api.get(`${basePath.value}/submissions`, { params });
    rows.value = data.data || [];
    Object.assign(pagination, data.pagination || { total: 0, page: 1, limit: 15 });
  } catch {
    rows.value = [];
  } finally {
    loading.value = false;
  }
};

const loadVendors = async () => {
  if (isHr.value) return;
  try {
    const { data } = await api.get('/users/vendors');
    vendorOptions.value = data.data || [];
  } catch { vendorOptions.value = []; }
};

const changePage = (p) => { pagination.page = p; fetchData(); };

const resetFilters = () => {
  filters.month = '';
  filters.year = new Date().getFullYear();
  filters.vendor_search = '';
  filters.vendor_id = '';
  filters.status = '';
  pagination.page = 1;
  fetchData();
};

const dlPdf = async (id) => {
  const res = await api.get(`${basePath.value}/submissions/${id}/pdf`, { responseType: 'blob' });
  downloadBlob(res.data, `timesheet-submission-${id}.pdf`);
};

const dlZip = async (id) => {
  const res = await api.get(`${basePath.value}/submissions/${id}/attachments`, { responseType: 'blob' });
  downloadBlob(res.data, `submission-${id}-attachments.zip`);
};

const doApprove = async (id) => {
  if (!confirm('Approve this submission?')) return;
  await api.post(`${basePath.value}/submissions/${id}/approve`);
  await fetchData();
};

const doMarkPaid = async (id) => {
  if (!confirm('Mark this submission as Paid?')) return;
  await api.post(`${basePath.value}/submissions/${id}/mark-paid`);
  await fetchData();
};

const rejectModal = reactive({ show: false, id: null, note: '' });
const openReject = (r) => {
  rejectModal.id = r.id;
  rejectModal.note = '';
  rejectModal.show = true;
};

const confirmReject = async () => {
  if (!rejectModal.note.trim() || !rejectModal.id) return;
  await api.post(`${basePath.value}/submissions/${rejectModal.id}/reject`, { note: rejectModal.note.trim() });
  rejectModal.show = false;
  await fetchData();
};

onMounted(() => {
  loadVendors();
  fetchData();
});
</script>

<style scoped>
.icon-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.btn-icon-action {
  width: 38px;
  height: 38px;
  border-radius: var(--radius);
  border: 1.5px solid var(--bc-gray-200);
  background: var(--bc-white);
  color: var(--bc-gray-600);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}
.btn-icon-action:hover:not(:disabled) {
  border-color: var(--bc-green-400);
  color: var(--bc-green-700);
  background: var(--bc-green-50);
}
.btn-icon-action:disabled { opacity: 0.35; cursor: not-allowed; }
.btn-icon-action.success:hover:not(:disabled) {
  border-color: var(--bc-approved);
  color: #fff;
  background: var(--bc-green-600);
}
.btn-icon-action.danger:hover:not(:disabled) {
  border-color: var(--bc-rejected);
  color: #fff;
  background: var(--bc-rejected);
}
</style>
