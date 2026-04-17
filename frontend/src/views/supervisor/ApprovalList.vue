<template>
  <div>
    <div class="page-header">
      <div>
        <h1 class="page-title">Approval List</h1>
        <p class="page-subtitle">Review and approve attendance records from your team</p>
      </div>
    </div>

    <!-- Stats -->
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-card-label">Total Records</div>
        <div class="stat-card-value">{{ pagination.total }}</div>
        <div class="stat-card-sub">This period</div>
      </div>
      <div class="stat-card" style="border-left:4px solid var(--bc-pending);">
        <div class="stat-card-label">Pending</div>
        <div class="stat-card-value" style="color:var(--bc-pending)">{{ statusCounts.pending }}</div>
        <div class="stat-card-sub">Awaiting action</div>
      </div>
      <div class="stat-card" style="border-left:4px solid var(--bc-approved);">
        <div class="stat-card-label">Approved</div>
        <div class="stat-card-value" style="color:var(--bc-approved)">{{ statusCounts.approved }}</div>
        <div class="stat-card-sub">Processed</div>
      </div>
      <div class="stat-card" style="border-left:4px solid var(--bc-rejected);">
        <div class="stat-card-label">Rejected</div>
        <div class="stat-card-value" style="color:var(--bc-rejected)">{{ statusCounts.rejected }}</div>
        <div class="stat-card-sub">Denied</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <span class="card-title">Pending Reviews</span>
      </div>
      <div class="card-body" style="padding-bottom:0;">
        <!-- Filters -->
        <div class="filter-bar">
          <div class="search-wrap">
            <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            <input v-model="filters.search" @input="debouncedFetch" class="form-control" placeholder="Search employee…" style="max-width:220px;" />
          </div>
          <select v-model="filters.status" @change="fetchData" class="form-control" style="max-width:160px;">
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
          <input v-model="filters.start_date" @change="fetchData" type="date" class="form-control" style="max-width:150px;" />
          <input v-model="filters.end_date"   @change="fetchData" type="date" class="form-control" style="max-width:150px;" />
          <button class="btn btn-outline btn-sm" @click="clearFilters">Reset</button>
        </div>
      </div>

      <div class="table-wrapper" style="border:none;border-radius:0;border-top:1px solid var(--bc-gray-200);">
        <div v-if="loading" class="loading-overlay"><span class="spinner"></span> Loading…</div>
        <table v-else>
          <thead>
            <tr>
              <th>Employee</th>
              <th>Date</th>
              <th>Clock In</th>
              <th>Clock Out</th>
              <th>Duration</th>
              <th>Location</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="records.length === 0">
              <td colspan="8">
                <div class="empty-state">
                  <div class="empty-state-icon">✅</div>
                  <h3>No records found</h3>
                  <p>All attendance records have been reviewed or no records match the filters.</p>
                </div>
              </td>
            </tr>
            <tr v-for="r in records" :key="r.id">
              <td>
                <div class="font-bold">{{ r.employee_name }}</div>
                <div class="text-sm text-muted">{{ r.employee_id }}</div>
              </td>
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
              <td>
                <div v-if="r.clock_in_lat" class="location-cell">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  {{ Number(r.clock_in_lat).toFixed(4) }}, {{ Number(r.clock_in_lng).toFixed(4) }}
                </div>
                <span v-else class="text-muted">—</span>
              </td>
              <td><span class="badge" :class="`badge-${r.status}`">{{ r.status }}</span></td>
              <td>
                <div class="action-btns">
                  <button class="btn btn-outline btn-sm" @click="openDetail(r)" title="View Detail">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    Detail
                  </button>
                  <template v-if="r.status === 'pending'">
                    <button class="btn btn-primary btn-sm" @click="doApprove(r.id)" :disabled="actionLoading === r.id">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>
                      Approve
                    </button>
                    <button class="btn btn-danger btn-sm" @click="openReject(r)" :disabled="actionLoading === r.id">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
                      Reject
                    </button>
                  </template>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="pagination.total > 0" class="card-body" style="padding-top:12px;border-top:1px solid var(--bc-gray-100);">
        <div class="pagination">
          <span class="pagination-info">{{ ((pagination.page-1)*pagination.limit)+1 }}–{{ Math.min(pagination.page*pagination.limit, pagination.total) }} of {{ pagination.total }}</span>
          <button class="btn btn-ghost btn-sm" :disabled="pagination.page<=1" @click="changePage(pagination.page-1)">‹ Prev</button>
          <button class="btn btn-ghost btn-sm" :disabled="pagination.page*pagination.limit>=pagination.total" @click="changePage(pagination.page+1)">Next ›</button>
        </div>
      </div>
    </div>

    <!-- ── Detail Modal ── -->
    <div v-if="detailModal.show" class="modal-backdrop" @click.self="detailModal.show = false">
      <div class="modal">
        <div class="modal-header">
          <span class="modal-title">Attendance Detail</span>
          <button class="modal-close" @click="detailModal.show = false">✕</button>
        </div>
        <div class="modal-body">
          <div v-if="detailModal.record" class="detail-grid">
            <div class="detail-section">
              <h4>Employee</h4>
              <div class="dl">
                <div class="dl-row"><span>Name</span><strong>{{ detailModal.record.employee_name }}</strong></div>
                <div class="dl-row"><span>ID</span><strong>{{ detailModal.record.employee_id }}</strong></div>
              </div>
            </div>
            <div class="detail-section">
              <h4>Attendance</h4>
              <div class="dl">
                <div class="dl-row"><span>Date</span><strong>{{ formatDate(detailModal.record.attendance_date) }}</strong></div>
                <div class="dl-row"><span>Clock In</span><strong class="text-green">{{ detailModal.record.clock_in_time || '—' }}</strong></div>
                <div class="dl-row"><span>Clock Out</span><strong class="text-red">{{ detailModal.record.clock_out_time || '—' }}</strong></div>
                <div class="dl-row"><span>Status</span><span class="badge" :class="`badge-${detailModal.record.status}`">{{ detailModal.record.status }}</span></div>
              </div>
            </div>
            <div class="detail-section" v-if="detailModal.record.clock_in_lat">
              <h4>Clock-In Location</h4>
              <div class="map-link">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                <a :href="`https://maps.google.com/?q=${detailModal.record.clock_in_lat},${detailModal.record.clock_in_lng}`" target="_blank">
                  {{ Number(detailModal.record.clock_in_lat).toFixed(6) }}, {{ Number(detailModal.record.clock_in_lng).toFixed(6) }}
                </a>
              </div>
              <div v-if="detailModal.record.clock_in_address" class="text-sm text-muted" style="margin-top:4px;">{{ detailModal.record.clock_in_address }}</div>
            </div>
            <div class="detail-section" v-if="detailModal.record.clock_out_lat">
              <h4>Clock-Out Location</h4>
              <div class="map-link">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                <a :href="`https://maps.google.com/?q=${detailModal.record.clock_out_lat},${detailModal.record.clock_out_lng}`" target="_blank">
                  {{ Number(detailModal.record.clock_out_lat).toFixed(6) }}, {{ Number(detailModal.record.clock_out_lng).toFixed(6) }}
                </a>
              </div>
            </div>
            <div v-if="detailModal.record.rejection_note" class="detail-section">
              <h4>Rejection Note</h4>
              <p class="rejection-note">{{ detailModal.record.rejection_note }}</p>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <template v-if="detailModal.record?.status === 'pending'">
            <button class="btn btn-danger" @click="openReject(detailModal.record); detailModal.show = false">Reject</button>
            <button class="btn btn-primary" @click="doApprove(detailModal.record.id); detailModal.show = false">Approve</button>
          </template>
          <button class="btn btn-outline" @click="detailModal.show = false">Close</button>
        </div>
      </div>
    </div>

    <!-- ── Reject Modal ── -->
    <div v-if="rejectModal.show" class="modal-backdrop" @click.self="rejectModal.show = false">
      <div class="modal" style="max-width:440px;">
        <div class="modal-header">
          <span class="modal-title">Reject Attendance</span>
          <button class="modal-close" @click="rejectModal.show = false">✕</button>
        </div>
        <div class="modal-body">
          <p style="margin-bottom:14px;color:var(--bc-gray-600);">
            You are about to reject the attendance record for <strong>{{ rejectModal.record?.employee_name }}</strong> on <strong>{{ rejectModal.record ? formatDate(rejectModal.record.attendance_date) : '' }}</strong>.
          </p>
          <div class="form-group">
            <label class="form-label">Rejection Reason <span style="color:var(--bc-rejected)">*</span></label>
            <textarea v-model="rejectModal.note" class="form-control" rows="3" placeholder="Provide a reason for rejection…"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" @click="rejectModal.show = false">Cancel</button>
          <button class="btn btn-danger" @click="doReject" :disabled="!rejectModal.note.trim()">Confirm Reject</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import api from '../../utils/api';

const loading = ref(false);
const actionLoading = ref(null);
const records = ref([]);
const pagination = reactive({ total: 0, page: 1, limit: 15 });
const filters = reactive({ search: '', status: '', start_date: '', end_date: '' });

const detailModal = reactive({ show: false, record: null });
const rejectModal = reactive({ show: false, record: null, note: '' });

const statusCounts = computed(() => ({
  pending:  records.value.filter(r => r.status === 'pending').length,
  approved: records.value.filter(r => r.status === 'approved').length,
  rejected: records.value.filter(r => r.status === 'rejected').length,
}));

let debounceTimer;
const debouncedFetch = () => { clearTimeout(debounceTimer); debounceTimer = setTimeout(fetchData, 400); };

const fetchData = async () => {
  loading.value = true;
  try {
    const params = { page: pagination.page, limit: pagination.limit };
    if (filters.search)     params.search     = filters.search;
    if (filters.status)     params.status     = filters.status;
    if (filters.start_date) params.start_date = filters.start_date;
    if (filters.end_date)   params.end_date   = filters.end_date;
    const { data } = await api.get('/attendance/team', { params });
    records.value = data.data;
    Object.assign(pagination, data.pagination);
  } catch { /* silent */ } finally { loading.value = false; }
};

const changePage = (p) => { pagination.page = p; fetchData(); };
const clearFilters = () => {
  Object.assign(filters, { search:'', status:'', start_date:'', end_date:'' });
  pagination.page = 1; fetchData();
};

const openDetail = (r) => { detailModal.record = r; detailModal.show = true; };
const openReject = (r) => { rejectModal.record = r; rejectModal.note = ''; rejectModal.show = true; };

const doApprove = async (id) => {
  actionLoading.value = id;
  try {
    await api.put(`/attendance/${id}/approval`, { action: 'approve' });
    await fetchData();
  } finally { actionLoading.value = null; }
};

const doReject = async () => {
  if (!rejectModal.note.trim()) return;
  actionLoading.value = rejectModal.record.id;
  try {
    await api.put(`/attendance/${rejectModal.record.id}/approval`, {
      action: 'reject',
      rejection_note: rejectModal.note,
    });
    rejectModal.show = false;
    await fetchData();
  } finally { actionLoading.value = null; }
};

const formatDate  = (d) => new Date(d).toLocaleDateString('en-ID', { day:'2-digit', month:'short', year:'numeric' });
const getDayName  = (d) => new Date(d).toLocaleDateString('en-ID', { weekday:'long' });
const calcDuration = (inT, outT) => {
  const [ih,im] = inT.split(':').map(Number);
  const [oh,om] = outT.split(':').map(Number);
  const mins = (oh*60+om)-(ih*60+im);
  return mins<0?'—':`${Math.floor(mins/60)}h ${mins%60}m`;
};

onMounted(fetchData);
</script>

<style scoped>
.action-btns { display: flex; gap: 6px; flex-wrap: wrap; }
.time-cell { font-size: 14px; font-weight: 700; }
.clock-in  { color: var(--bc-green-600); }
.clock-out { color: var(--bc-rejected); }
.text-green { color: var(--bc-green-600); }
.text-red   { color: var(--bc-rejected); }
.location-cell { display: flex; align-items: center; gap: 4px; font-size: 12px; color: var(--bc-gray-500); }

.detail-grid { display: flex; flex-direction: column; gap: 20px; }
.detail-section h4 { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; font-weight: 700; color: var(--bc-green-600); margin-bottom: 10px; }
.dl { display: flex; flex-direction: column; gap: 6px; }
.dl-row { display: flex; justify-content: space-between; align-items: center; font-size: 13.5px; padding: 4px 0; border-bottom: 1px solid var(--bc-gray-50); }
.dl-row span { color: var(--bc-gray-500); }
.map-link { display: flex; align-items: center; gap: 6px; font-size: 13px; }
.map-link a { color: var(--bc-green-600); font-weight: 600; }
.rejection-note { font-size: 13.5px; color: var(--bc-gray-700); background: #fee2e2; padding: 12px; border-radius: var(--radius); }
</style>
