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

    <div class="card approval-master-detail-card">
      <div class="approval-split">
        <SupervisorApprovalLsSidebar
          class="approval-split-master"
          :members="filteredLsMembers"
          :has-roster="lsMembers.length > 0"
          :selected-id="selectedUserId"
          :search="sidebarSearch"
          @update:search="sidebarSearch = $event"
          @update:selected-id="onSelectUser"
        />

        <div class="approval-split-detail">
          <div class="detail-panel-header">
            <div class="detail-panel-title-wrap">
              <h2 class="detail-panel-title">Daily attendance</h2>
              <p v-if="selectedLsLabel" class="detail-panel-sub">{{ selectedLsLabel }}</p>
              <p v-else class="detail-panel-sub text-muted">Select an LS employee to load records.</p>
            </div>
            <div class="bulk-toolbar">
              <span class="selected-info">{{ selectedIds.size }} selected</span>
              <button class="btn btn-primary btn-sm" :disabled="selectedIds.size === 0 || bulkProcessing" @click="openBulkModal">
                Approval
              </button>
            </div>
          </div>

          <div class="detail-panel-filters">
            <select v-model="filters.status" @change="onFilterChange" class="form-control" style="max-width:160px;">
              <option value="">All Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
            <input v-model="filters.start_date" @change="onFilterChange" type="date" class="form-control" style="max-width:150px;" />
            <input v-model="filters.end_date" @change="onFilterChange" type="date" class="form-control" style="max-width:150px;" />
            <button class="btn btn-outline btn-sm" @click="clearFilters">Reset</button>
          </div>

          <div class="table-wrapper detail-table-wrap">
            <div v-if="loading" class="loading-overlay"><span class="spinner"></span> Loading…</div>
            <table v-else>
              <thead>
                <tr>
                  <th style="width:42px;">
                    <input type="checkbox" :checked="allSelectableChecked" :indeterminate.prop="isPartiallyChecked" @change="toggleSelectAll" />
                  </th>
                  <th>Employee</th>
                  <th>NIK</th>
                  <th>Date</th>
                  <th>Clock In</th>
                  <th>Clock Out</th>
                  <th>Duration</th>
                  <th>OT range</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="!selectedUserId">
                  <td colspan="11">
                    <div class="empty-state">
                      <div class="empty-state-icon">👈</div>
                      <h3>Select a team member</h3>
                      <p>Choose an LS employee in the list on the left to review their attendance.</p>
                    </div>
                  </td>
                </tr>
                <tr v-else-if="records.length === 0">
                  <td colspan="11">
                    <div class="empty-state">
                      <div class="empty-state-icon">✅</div>
                      <h3>No records found</h3>
                      <p>All attendance records have been reviewed or no records match the filters.</p>
                    </div>
                  </td>
                </tr>
                <tr v-for="r in records" :key="r.id">
                  <td>
                    <input
                      type="checkbox"
                      :disabled="r.status !== 'pending'"
                      :checked="selectedIds.has(r.id)"
                      @change="toggleRow(r.id, $event.target.checked)"
                    />
                  </td>
                  <td>
                    <div class="font-bold">{{ r.employee_name }}</div>
                    <div class="text-sm text-muted">{{ r.employee_id }}</div>
                  </td>
                  <td><span class="text-sm font-mono">{{ r.nik || '—' }}</span></td>
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
                    <span v-if="r.ot_start_time && r.ot_end_time" class="text-sm font-bold" style="color:#b45309;">
                      {{ fmtHm(r.ot_start_time) }}–{{ fmtHm(r.ot_end_time) }}
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
                    <button class="btn btn-outline btn-sm" @click="openDetail(r)" title="View Detail">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      Detail
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div v-if="selectedUserId && pagination.total > 0" class="detail-pagination">
            <div class="pagination">
              <span class="pagination-info">{{ ((pagination.page-1)*pagination.limit)+1 }}–{{ Math.min(pagination.page*pagination.limit, pagination.total) }} of {{ pagination.total }}</span>
              <button class="btn btn-ghost btn-sm" :disabled="pagination.page<=1" @click="changePage(pagination.page-1)">‹ Prev</button>
              <button class="btn btn-ghost btn-sm" :disabled="pagination.page*pagination.limit>=pagination.total" @click="changePage(pagination.page+1)">Next ›</button>
            </div>
          </div>
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
                <div class="dl-row"><span>NIK</span><strong>{{ detailModal.record.nik || '—' }}</strong></div>
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
            <div class="detail-section" v-if="detailModal.record.ot_start_time && detailModal.record.ot_end_time">
              <h4>Overtime (Range Time)</h4>
              <div class="dl">
                <div class="dl-row"><span>Range</span><strong>{{ fmtHm(detailModal.record.ot_start_time) }} – {{ fmtHm(detailModal.record.ot_end_time) }}</strong></div>
                <div class="dl-row"><span>Duration</span><strong>{{ otDuration(detailModal.record) }}</strong></div>
                <div v-if="detailModal.record.ot_summary" class="dl-row" style="flex-direction:column;align-items:flex-start;gap:6px;">
                  <span>Summary</span>
                  <p class="ot-sum">{{ detailModal.record.ot_summary }}</p>
                </div>
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
          <button class="btn btn-outline" @click="detailModal.show = false">Close</button>
        </div>
      </div>
    </div>

    <!-- ── Bulk Approval Modal ── -->
    <div v-if="bulkModal.show" class="modal-backdrop" @click.self="bulkModal.show = false">
      <div class="modal" style="max-width:440px;">
        <div class="modal-header">
          <span class="modal-title">Bulk Approval Action</span>
          <button class="modal-close" @click="bulkModal.show = false">✕</button>
        </div>
        <div class="modal-body">
          <p style="margin-bottom:14px;color:var(--bc-gray-600);">
            You are about to process <strong>{{ selectedIds.size }}</strong> selected record(s).
          </p>
          <div class="form-group">
            <label class="form-label">Action <span style="color:var(--bc-rejected)">*</span></label>
            <select v-model="bulkModal.action" class="form-control">
              <option value="approve">Approve</option>
              <option value="reject">Reject</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">
              Rejection Reason
              <span v-if="bulkModal.action === 'reject'" style="color:var(--bc-rejected)">*</span>
            </label>
            <textarea
              v-model="bulkModal.note"
              class="form-control"
              rows="3"
              :placeholder="bulkModal.action === 'reject' ? 'Provide a reason for rejection…' : 'Optional note'"
            ></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" @click="bulkModal.show = false">Cancel</button>
          <button
            class="btn"
            :class="bulkModal.action === 'approve' ? 'btn-primary' : 'btn-danger'"
            @click="submitBulkApproval"
            :disabled="bulkProcessing || (bulkModal.action === 'reject' && !bulkModal.note.trim())"
          >
            {{ bulkModal.action === 'approve' ? 'Confirm Approve' : 'Confirm Reject' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import api from '../../utils/api';
import SupervisorApprovalLsSidebar from './SupervisorApprovalLsSidebar.vue';

const loading = ref(false);
const bulkProcessing = ref(false);
const records = ref([]);
const pagination = reactive({ total: 0, page: 1, limit: 15 });
const filters = reactive({ status: '', start_date: '', end_date: '' });

const lsMembers = ref([]);
const sidebarSearch = ref('');
const selectedUserId = ref(null);

const detailModal = reactive({ show: false, record: null });
const bulkModal = reactive({ show: false, action: 'approve', note: '' });
const selectedIds = ref(new Set());

const filteredLsMembers = computed(() => {
  const q = sidebarSearch.value.trim().toLowerCase();
  let list = lsMembers.value;
  if (q) {
    list = list.filter(
      (m) =>
        (m.name || '').toLowerCase().includes(q) ||
        String(m.nik || '').toLowerCase().includes(q) ||
        String(m.employee_id || '').toLowerCase().includes(q)
    );
  }
  const sel = selectedUserId.value;
  if (sel != null && !list.some((m) => m.id === sel)) {
    const full = lsMembers.value.find((m) => m.id === sel);
    if (full) list = [full, ...list];
  }
  return list;
});

const selectedLsLabel = computed(() => {
  const id = selectedUserId.value;
  if (id == null) return '';
  const m = lsMembers.value.find((x) => x.id === id);
  if (!m) return '';
  return `${m.name} · ${m.nik || '—'}`;
});

const pendingIdsOnPage = computed(() => records.value.filter((r) => r.status === 'pending').map((r) => r.id));
const allSelectableChecked = computed(() => pendingIdsOnPage.value.length > 0 && pendingIdsOnPage.value.every((id) => selectedIds.value.has(id)));
const isPartiallyChecked = computed(() => {
  const selectedOnPage = pendingIdsOnPage.value.filter((id) => selectedIds.value.has(id)).length;
  return selectedOnPage > 0 && selectedOnPage < pendingIdsOnPage.value.length;
});

const statusCounts = computed(() => ({
  pending:  records.value.filter(r => r.status === 'pending').length,
  approved: records.value.filter(r => r.status === 'approved').length,
  rejected: records.value.filter(r => r.status === 'rejected').length,
}));

const syncSelectionToMembers = () => {
  const list = lsMembers.value;
  if (!list.length) {
    selectedUserId.value = null;
    return;
  }
  if (selectedUserId.value == null || !list.some((m) => m.id === selectedUserId.value)) {
    selectedUserId.value = list[0].id;
  }
};

const fetchLsMembers = async () => {
  try {
    const { data } = await api.get('/attendance/team/members');
    lsMembers.value = data.data || [];
    syncSelectionToMembers();
  } catch { /* silent */ }
};

const fetchData = async () => {
  if (selectedUserId.value == null) {
    records.value = [];
    Object.assign(pagination, { total: 0, page: 1 });
    return;
  }
  loading.value = true;
  try {
    const params = {
      page: pagination.page,
      limit: pagination.limit,
      user_id: selectedUserId.value,
    };
    if (filters.status)     params.status     = filters.status;
    if (filters.start_date) params.start_date = filters.start_date;
    if (filters.end_date)   params.end_date   = filters.end_date;
    const { data } = await api.get('/attendance/team', { params });
    records.value = data.data;
    Object.assign(pagination, data.pagination);
    const selectableSet = new Set(records.value.filter((r) => r.status === 'pending').map((r) => r.id));
    selectedIds.value = new Set([...selectedIds.value].filter((id) => selectableSet.has(id)));
  } catch { /* silent */ } finally { loading.value = false; }
};

const onSelectUser = (id) => {
  if (selectedUserId.value === id) return;
  selectedUserId.value = id;
  pagination.page = 1;
  fetchData();
};

const onFilterChange = () => {
  pagination.page = 1;
  fetchData();
};

const changePage = (p) => { pagination.page = p; fetchData(); };
const clearFilters = () => {
  Object.assign(filters, { status:'', start_date:'', end_date:'' });
  pagination.page = 1;
  selectedIds.value = new Set();
  fetchData();
};

const openDetail = (r) => { detailModal.record = r; detailModal.show = true; };

const toggleSelectAll = (event) => {
  const checked = event.target.checked;
  if (checked) {
    const next = new Set(selectedIds.value);
    pendingIdsOnPage.value.forEach((id) => next.add(id));
    selectedIds.value = next;
    return;
  }
  const next = new Set(selectedIds.value);
  pendingIdsOnPage.value.forEach((id) => next.delete(id));
  selectedIds.value = next;
};

const toggleRow = (id, checked) => {
  const next = new Set(selectedIds.value);
  if (checked) next.add(id);
  else next.delete(id);
  selectedIds.value = next;
};

const openBulkModal = () => {
  bulkModal.action = 'approve';
  bulkModal.note = '';
  bulkModal.show = true;
};

const submitBulkApproval = async () => {
  if (bulkModal.action === 'reject' && !bulkModal.note.trim()) return;
  bulkProcessing.value = true;
  try {
    const payload = {
      attendance_ids: Array.from(selectedIds.value),
      action: bulkModal.action,
      rejection_note: bulkModal.action === 'reject' ? bulkModal.note.trim() : null,
    };
    const { data } = await api.put('/attendance/approval/bulk', payload);
    if (data?.data?.skipped_count > 0) {
      window.alert(`${data.data.skipped_count} record tidak diproses karena bukan status pending.`);
    }
    bulkModal.show = false;
    selectedIds.value = new Set();
    await fetchData();
  } catch (err) {
    window.alert(err?.response?.data?.message || 'Bulk approval gagal diproses.');
  } finally {
    bulkProcessing.value = false;
  }
};

const formatDate  = (d) => new Date(d).toLocaleDateString('en-ID', { day:'2-digit', month:'short', year:'numeric' });
const getDayName  = (d) => new Date(d).toLocaleDateString('en-ID', { weekday:'long' });
const fmtHm = (t) => (t ? String(t).slice(0, 5) : '');
const otDuration = (rec) => {
  if (!rec.ot_start_time || !rec.ot_end_time) return '—';
  const a = fmtHm(rec.ot_start_time);
  const b = fmtHm(rec.ot_end_time);
  const [ih, im] = a.split(':').map(Number);
  const [oh, om] = b.split(':').map(Number);
  const mins = (oh * 60 + om) - (ih * 60 + im);
  return mins < 0 ? '—' : `${Math.floor(mins / 60)}h ${mins % 60}m`;
};
const calcDuration = (inT, outT) => {
  const [ih,im] = inT.split(':').map(Number);
  const [oh,om] = outT.split(':').map(Number);
  const mins = (oh*60+om)-(ih*60+im);
  return mins<0?'—':`${Math.floor(mins/60)}h ${mins%60}m`;
};

onMounted(async () => {
  await fetchLsMembers();
  await fetchData();
});
</script>

<style scoped>
.bulk-toolbar { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.selected-info {
  font-size: 12px;
  font-weight: 600;
  color: var(--bc-gray-600);
  background: var(--bc-gray-100);
  padding: 4px 8px;
  border-radius: 999px;
}
.time-cell { font-size: 14px; font-weight: 700; }
.clock-in  { color: var(--bc-green-600); }
.clock-out { color: var(--bc-rejected); }
.text-green { color: var(--bc-green-600); }
.text-red   { color: var(--bc-rejected); }
.location-cell { display: flex; align-items: center; gap: 4px; font-size: 12px; color: var(--bc-gray-500); }

.approval-master-detail-card {
  padding: 0;
  overflow: hidden;
}

.approval-split {
  display: flex;
  align-items: stretch;
  min-height: min(70vh, 640px);
  max-height: min(78vh, 720px);
}

.approval-split-master {
  flex: 3 1 0;
  min-width: 200px;
  max-width: 360px;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.approval-split-detail {
  flex: 7 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: #fff;
  min-height: 0;
}

.detail-panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  padding: 14px 16px 10px;
  border-bottom: 1px solid var(--bc-gray-100);
}

.detail-panel-title-wrap {
  min-width: 0;
}

.detail-panel-title {
  margin: 0;
  font-size: 15px;
  font-weight: 800;
  color: var(--bc-green-600);
  letter-spacing: -0.02em;
}

.detail-panel-sub {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--bc-gray-600);
}

.detail-panel-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 10px 16px 12px;
  border-bottom: 1px solid var(--bc-gray-100);
  background: #fafdfb;
}

.detail-table-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
  border: none;
  border-radius: 0;
}

.detail-pagination {
  flex-shrink: 0;
  padding: 10px 16px 14px;
  border-top: 1px solid var(--bc-gray-100);
  background: #fff;
}

.detail-grid { display: flex; flex-direction: column; gap: 20px; }
.detail-section h4 { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; font-weight: 700; color: var(--bc-green-600); margin-bottom: 10px; }
.dl { display: flex; flex-direction: column; gap: 6px; }
.dl-row { display: flex; justify-content: space-between; align-items: center; font-size: 13.5px; padding: 4px 0; border-bottom: 1px solid var(--bc-gray-50); }
.dl-row span { color: var(--bc-gray-500); }
.map-link { display: flex; align-items: center; gap: 6px; font-size: 13px; }
.map-link a { color: var(--bc-green-600); font-weight: 600; }
.rejection-note { font-size: 13.5px; color: var(--bc-gray-700); background: #fee2e2; padding: 12px; border-radius: var(--radius); }
.ot-sum { margin: 0; font-size: 13px; white-space: pre-wrap; color: var(--bc-gray-700); }

@media (max-width: 900px) {
  .approval-split {
    flex-direction: column;
    max-height: none;
  }
  .approval-split-master {
    max-width: none;
    flex: 0 0 auto;
    max-height: 240px;
  }
  .approval-split-detail {
    flex: 1 1 auto;
    min-height: 360px;
  }
}
</style>
