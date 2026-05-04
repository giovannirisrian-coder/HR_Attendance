<template>
  <div>
    <div class="page-header">
      <div>
        <h1 class="page-title">Approval List</h1>
        <p class="page-subtitle">Review and approve attendance records from your team</p>
      </div>
    </div>

    <!-- Stats: bulan berjalan (API) -->
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-card-label">Total Records</div>
        <div class="stat-card-value">{{ monthStats.total }}</div>
        <div class="stat-card-sub">{{ monthStatsLabel }}</div>
      </div>
      <div class="stat-card" style="border-left:4px solid var(--bc-pending);">
        <div class="stat-card-label">Pending</div>
        <div class="stat-card-value" style="color:var(--bc-pending)">{{ monthStats.pending }}</div>
        <div class="stat-card-sub">Awaiting action</div>
      </div>
      <div class="stat-card" style="border-left:4px solid var(--bc-approved);">
        <div class="stat-card-label">Approved</div>
        <div class="stat-card-value" style="color:var(--bc-approved)">{{ monthStats.approved }}</div>
        <div class="stat-card-sub">Processed</div>
      </div>
      <div class="stat-card" style="border-left:4px solid var(--bc-rejected);">
        <div class="stat-card-label">Rejected</div>
        <div class="stat-card-value" style="color:var(--bc-rejected)">{{ monthStats.rejected }}</div>
        <div class="stat-card-sub">Denied</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <span class="card-title">Tim LS — {{ monthStatsLabel }}</span>
      </div>
      <div class="card-body" style="padding-bottom:0;">
        <div class="filter-bar filter-bar--wrap">
          <label class="overview-filter-label" for="overview-employee">Karyawan</label>
          <select
            id="overview-employee"
            v-model="overviewEmployeeUserId"
            class="form-control overview-employee-select"
          >
            <option value="">Semua karyawan</option>
            <option
              v-for="e in sortedOverviewEmployees"
              :key="e.user_id"
              :value="String(e.user_id)"
            >
              {{ e.employee_name }} — {{ e.employee_id }}<template v-if="e.nik"> ({{ e.nik }})</template>
            </option>
          </select>
          <button class="btn btn-outline btn-sm" type="button" @click="clearOverviewEmployeeFilter">Reset</button>
        </div>
      </div>

      <div class="overview-body">
        <div v-if="overviewLoading" class="loading-overlay"><span class="spinner"></span> Loading…</div>
        <div v-else class="employee-grid">
          <div v-if="employees.length === 0" class="empty-state empty-state--pad">
            <div class="empty-state-icon">✅</div>
            <h3>No team members or no data</h3>
            <p>There are no LS employees under your supervision.</p>
          </div>
          <div v-else-if="displayedOverviewEmployees.length === 0" class="empty-state empty-state--pad">
            <div class="empty-state-icon">🔎</div>
            <h3>No cards for this selection</h3>
            <p>Choose another employee or reset the filter.</p>
          </div>
          <button
            v-for="emp in displayedOverviewEmployees"
            :key="emp.user_id"
            type="button"
            class="employee-card"
            @click="openEmployeeSheet(emp)"
          >
            <div class="employee-card__main">
              <div class="font-bold employee-card__name">{{ emp.employee_name }}</div>
              <div class="text-sm text-muted">{{ emp.employee_id }}</div>
              <div v-if="emp.nik" class="text-sm text-muted font-mono">{{ emp.nik }}</div>
            </div>
            <div class="employee-card__counts">
              <span class="mini-pill">Total {{ emp.total }}</span>
              <span v-if="emp.pending > 0" class="mini-pill mini-pill--pending">Pending {{ emp.pending }}</span>
              <span class="mini-pill mini-pill--muted">OK {{ emp.approved }}</span>
              <span v-if="emp.rejected > 0" class="mini-pill mini-pill--rej">Rejected {{ emp.rejected }}</span>
            </div>
            <div class="employee-card__cta">Proses approval →</div>
          </button>
        </div>
      </div>
    </div>

    <!-- ── Sheet: detail per orang ── -->
    <div v-if="employeeSheet.show" class="modal-backdrop sheet-backdrop" @click.self="closeEmployeeSheet">
      <div class="modal sheet-modal">
        <div class="modal-header">
          <div>
            <span class="modal-title">{{ employeeSheet.employee_name }}</span>
            <div class="text-sm text-muted" style="margin-top:4px;">
              {{ employeeSheet.employee_id }}<span v-if="employeeSheet.nik"> · {{ employeeSheet.nik }}</span>
            </div>
          </div>
          <button class="modal-close" @click="closeEmployeeSheet">✕</button>
        </div>
        <div class="modal-body sheet-body">
          <div class="bulk-toolbar sheet-toolbar">
            <span class="selected-info">{{ sheetSelectedIds.size }} selected</span>
            <button class="btn btn-primary btn-sm" :disabled="sheetSelectedIds.size === 0 || bulkProcessing" @click="openBulkModal">
              Approval
            </button>
          </div>
          <div class="filter-bar">
            <div class="search-wrap">
              <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <input v-model="sheetFilters.search" @input="debouncedSheetFetch" class="form-control" placeholder="Search…" style="max-width:200px;" />
            </div>
            <select v-model="sheetFilters.status" @change="fetchSheetRecords" class="form-control" style="max-width:150px;">
              <option value="">All Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
            <input v-model="sheetFilters.start_date" @change="fetchSheetRecords" type="date" class="form-control" style="max-width:150px;" />
            <input v-model="sheetFilters.end_date"   @change="fetchSheetRecords" type="date" class="form-control" style="max-width:150px;" />
            <button class="btn btn-outline btn-sm" @click="resetSheetFilters">Reset range</button>
          </div>

          <div class="table-wrapper sheet-table">
            <div v-if="sheetLoading" class="loading-overlay"><span class="spinner"></span> Loading…</div>
            <table v-else>
              <thead>
                <tr>
                  <th style="width:42px;">
                    <input type="checkbox" :checked="sheetAllSelectableChecked" :indeterminate.prop="sheetPartiallyChecked" @change="toggleSheetSelectAll" />
                  </th>
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
                <tr v-if="sheetRecords.length === 0">
                  <td colspan="9">
                    <div class="empty-state">
                      <div class="empty-state-icon">📋</div>
                      <h3>No records</h3>
                      <p>No attendance for this person in the selected range.</p>
                    </div>
                  </td>
                </tr>
                <tr v-for="r in sheetRecords" :key="r.id">
                  <td>
                    <input
                      type="checkbox"
                      :disabled="r.status !== 'pending'"
                      :checked="sheetSelectedIds.has(r.id)"
                      @change="toggleSheetRow(r.id, $event.target.checked)"
                    />
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

          <div v-if="sheetPagination.total > 0" class="pagination sheet-pag">
            <span class="pagination-info">{{ ((sheetPagination.page-1)*sheetPagination.limit)+1 }}–{{ Math.min(sheetPagination.page*sheetPagination.limit, sheetPagination.total) }} of {{ sheetPagination.total }}</span>
            <button class="btn btn-ghost btn-sm" :disabled="sheetPagination.page<=1" @click="changeSheetPage(sheetPagination.page-1)">‹ Prev</button>
            <button class="btn btn-ghost btn-sm" :disabled="sheetPagination.page*sheetPagination.limit>=sheetPagination.total" @click="changeSheetPage(sheetPagination.page+1)">Next ›</button>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" @click="closeEmployeeSheet">Tutup</button>
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
          <span class="modal-title">Bulk Approval</span>
          <button class="modal-close" @click="bulkModal.show = false">✕</button>
        </div>
        <div class="modal-body">
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
            :disabled="bulkProcessing || sheetSelectedIds.size === 0 || (bulkModal.action === 'reject' && !bulkModal.note.trim())"
          >
            {{ bulkModal.action === 'approve' ? 'Confirm Approve' : 'Confirm Reject' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, inject } from 'vue';
import api from '../../utils/api';

const refreshSupervisorBadges = inject('refreshSupervisorBadges', null);

const monthStats = reactive({ year: null, month: null, total: 0, pending: 0, approved: 0, rejected: 0 });
const overviewLoading = ref(false);
const employees = ref([]);
/** '' = semua; otherwise matches `user_id` as string */
const overviewEmployeeUserId = ref('');

const employeeSheet = reactive({
  show: false,
  user_id: null,
  employee_name: '',
  employee_id: '',
  nik: null,
});
const sheetLoading = ref(false);
const sheetRecords = ref([]);
const sheetPagination = reactive({ total: 0, page: 1, limit: 15 });
const sheetFilters = reactive({ search: '', status: '', start_date: '', end_date: '' });
const sheetMonthBounds = reactive({ start: '', end: '' });

const bulkProcessing = ref(false);
const detailModal = reactive({ show: false, record: null });
const bulkModal = reactive({ show: false, action: 'approve', note: '' });
const sheetSelectedIds = ref(new Set());

const monthStatsLabel = computed(() => {
  if (!monthStats.year || !monthStats.month) return 'Bulan berjalan';
  const d = new Date(monthStats.year, monthStats.month - 1, 1);
  return d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
});

const sortedOverviewEmployees = computed(() =>
  [...employees.value].sort((a, b) =>
    String(a.employee_name || '').localeCompare(String(b.employee_name || ''), 'id', { sensitivity: 'base' })
  )
);

const displayedOverviewEmployees = computed(() => {
  const uid = overviewEmployeeUserId.value;
  if (!uid) return employees.value;
  return employees.value.filter((e) => String(e.user_id) === uid);
});

const sheetPendingIdsOnPage = computed(() => sheetRecords.value.filter((r) => r.status === 'pending').map((r) => r.id));
const sheetAllSelectableChecked = computed(() => sheetPendingIdsOnPage.value.length > 0 && sheetPendingIdsOnPage.value.every((id) => sheetSelectedIds.value.has(id)));
const sheetPartiallyChecked = computed(() => {
  const n = sheetPendingIdsOnPage.value.filter((id) => sheetSelectedIds.value.has(id)).length;
  return n > 0 && n < sheetPendingIdsOnPage.value.length;
});

const currentMonthBounds = () => {
  const t = new Date();
  const y = t.getFullYear();
  const m = t.getMonth() + 1;
  const start = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastD = new Date(y, m, 0).getDate();
  const end = `${y}-${String(m).padStart(2, '0')}-${String(lastD).padStart(2, '0')}`;
  return { start, end, y, m };
};

const fetchMonthStats = async () => {
  try {
    const { data } = await api.get('/attendance/team/month-stats');
    const d = data?.data;
    if (d) {
      Object.assign(monthStats, {
        year: d.year,
        month: d.month,
        total: d.total ?? 0,
        pending: d.pending ?? 0,
        approved: d.approved ?? 0,
        rejected: d.rejected ?? 0,
      });
    }
  } catch { /* silent */ }
};

const fetchEmployeesOverview = async () => {
  overviewLoading.value = true;
  try {
    const { data } = await api.get('/attendance/team/employees-overview');
    employees.value = data?.data || [];
    if (data?.meta?.year && data?.meta?.month) {
      monthStats.year = data.meta.year;
      monthStats.month = data.meta.month;
    }
    if (overviewEmployeeUserId.value && !employees.value.some((e) => String(e.user_id) === overviewEmployeeUserId.value)) {
      overviewEmployeeUserId.value = '';
    }
  } catch {
    employees.value = [];
  } finally {
    overviewLoading.value = false;
  }
};

const clearOverviewEmployeeFilter = () => {
  overviewEmployeeUserId.value = '';
};

const openEmployeeSheet = (emp) => {
  const { start, end } = currentMonthBounds();
  employeeSheet.user_id = emp.user_id;
  employeeSheet.employee_name = emp.employee_name;
  employeeSheet.employee_id = emp.employee_id;
  employeeSheet.nik = emp.nik;
  employeeSheet.show = true;
  sheetMonthBounds.start = start;
  sheetMonthBounds.end = end;
  Object.assign(sheetFilters, { search: '', status: '', start_date: start, end_date: end });
  sheetPagination.page = 1;
  sheetSelectedIds.value = new Set();
  fetchSheetRecords();
};

const closeEmployeeSheet = async () => {
  employeeSheet.show = false;
  sheetSelectedIds.value = new Set();
  await fetchEmployeesOverview();
  await fetchMonthStats();
  if (typeof refreshSupervisorBadges === 'function') await refreshSupervisorBadges();
};

const resetSheetFilters = () => {
  Object.assign(sheetFilters, {
    search: '',
    status: '',
    start_date: sheetMonthBounds.start,
    end_date: sheetMonthBounds.end,
  });
  sheetPagination.page = 1;
  fetchSheetRecords();
};

let sheetDebounce;
const debouncedSheetFetch = () => {
  clearTimeout(sheetDebounce);
  sheetDebounce = setTimeout(() => { sheetPagination.page = 1; fetchSheetRecords(); }, 400);
};

const fetchSheetRecords = async () => {
  if (!employeeSheet.user_id) return;
  sheetLoading.value = true;
  try {
    const params = {
      page: sheetPagination.page,
      limit: sheetPagination.limit,
      user_id: employeeSheet.user_id,
    };
    if (sheetFilters.search.trim()) params.search = sheetFilters.search.trim();
    if (sheetFilters.status) params.status = sheetFilters.status;
    if (sheetFilters.start_date) params.start_date = sheetFilters.start_date;
    if (sheetFilters.end_date) params.end_date = sheetFilters.end_date;
    const { data } = await api.get('/attendance/team', { params });
    sheetRecords.value = data.data;
    Object.assign(sheetPagination, data.pagination);
    const selectable = new Set(sheetRecords.value.filter((r) => r.status === 'pending').map((r) => r.id));
    sheetSelectedIds.value = new Set([...sheetSelectedIds.value].filter((id) => selectable.has(id)));
  } catch { /* silent */ } finally { sheetLoading.value = false; }
};

const changeSheetPage = (p) => { sheetPagination.page = p; fetchSheetRecords(); };

const openDetail = (r) => { detailModal.record = r; detailModal.show = true; };

const toggleSheetSelectAll = (event) => {
  const checked = event.target.checked;
  const next = new Set(sheetSelectedIds.value);
  if (checked) {
    sheetPendingIdsOnPage.value.forEach((id) => next.add(id));
  } else {
    sheetPendingIdsOnPage.value.forEach((id) => next.delete(id));
  }
  sheetSelectedIds.value = next;
};

const toggleSheetRow = (id, checked) => {
  const next = new Set(sheetSelectedIds.value);
  if (checked) next.add(id);
  else next.delete(id);
  sheetSelectedIds.value = next;
};

const openBulkModal = () => {
  bulkModal.action = 'approve';
  bulkModal.note = '';
  bulkModal.show = true;
};

const submitBulkApproval = async () => {
  if (bulkModal.action === 'reject' && !bulkModal.note.trim()) return;
  const attendance_ids = Array.from(sheetSelectedIds.value).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0);
  if (attendance_ids.length === 0) return;
  bulkProcessing.value = true;
  try {
    const payload = {
      attendance_ids,
      action: bulkModal.action,
      rejection_note: bulkModal.action === 'reject' ? bulkModal.note.trim() : null,
    };
    const { data } = await api.put('/attendance/approval/bulk', payload);
    if (data?.data?.skipped_count > 0) {
      window.alert(`${data.data.skipped_count} record tidak diproses karena bukan status pending.`);
    }
    bulkModal.show = false;
    sheetSelectedIds.value = new Set();
    await fetchSheetRecords();
    await fetchMonthStats();
    await fetchEmployeesOverview();
    if (typeof refreshSupervisorBadges === 'function') await refreshSupervisorBadges();
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
  await fetchMonthStats();
  await fetchEmployeesOverview();
});
</script>

<style scoped>
.bulk-toolbar { display: flex; align-items: center; gap: 8px; }
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

.detail-grid { display: flex; flex-direction: column; gap: 20px; }
.detail-section h4 { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; font-weight: 700; color: var(--bc-green-600); margin-bottom: 10px; }
.dl { display: flex; flex-direction: column; gap: 6px; }
.dl-row { display: flex; justify-content: space-between; align-items: center; font-size: 13.5px; padding: 4px 0; border-bottom: 1px solid var(--bc-gray-50); }
.dl-row span { color: var(--bc-gray-500); }
.map-link { display: flex; align-items: center; gap: 6px; font-size: 13px; }
.map-link a { color: var(--bc-green-600); font-weight: 600; }
.rejection-note { font-size: 13.5px; color: var(--bc-gray-700); background: #fee2e2; padding: 12px; border-radius: var(--radius); }
.ot-sum { margin: 0; font-size: 13px; white-space: pre-wrap; color: var(--bc-gray-700); }

.filter-bar--wrap { flex-wrap: wrap; align-items: center; gap: 10px; }
.overview-filter-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--bc-gray-600);
  margin: 0;
}
.overview-employee-select {
  min-width: 220px;
  max-width: min(420px, 100%);
}

.overview-body { position: relative; min-height: 120px; }
.employee-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 14px;
  padding: 16px;
}
.employee-card {
  text-align: left;
  border: 1px solid var(--bc-gray-200);
  border-radius: var(--radius);
  padding: 14px 16px;
  background: var(--bc-white);
  cursor: pointer;
  transition: box-shadow .15s, border-color .15s;
}
.employee-card:hover {
  border-color: var(--bc-green-500);
  box-shadow: var(--shadow-sm);
}
.employee-card__name { font-size: 15px; }
.employee-card__counts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}
.mini-pill {
  font-size: 11px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--bc-gray-100);
  color: var(--bc-gray-700);
}
.mini-pill--pending { background: #fef3c7; color: #b45309; }
.mini-pill--muted { background: #ecfdf5; color: var(--bc-green-700); }
.mini-pill--rej { background: #fee2e2; color: #b91c1c; }
.employee-card__cta {
  margin-top: 12px;
  font-size: 12px;
  font-weight: 700;
  color: var(--bc-green-600);
}
.empty-state--pad { padding: 32px 16px; }

.sheet-backdrop { align-items: flex-end; justify-content: center; padding: 0; }
@media (min-width: 900px) {
  .sheet-backdrop { align-items: center; padding: 24px; }
}
.sheet-modal {
  width: 100%;
  max-width: 960px;
  max-height: 92vh;
  display: flex;
  flex-direction: column;
  margin: 0;
  border-radius: 12px 12px 0 0;
}
@media (min-width: 900px) {
  .sheet-modal { border-radius: 12px; max-height: 90vh; }
}
.sheet-body {
  overflow: auto;
  flex: 1;
  min-height: 0;
}
.sheet-toolbar { margin-bottom: 12px; }
.sheet-table { border: 1px solid var(--bc-gray-200); border-radius: var(--radius); }
.sheet-pag {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 12px;
  padding-bottom: 4px;
}
</style>
