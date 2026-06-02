<template>
  <div class="ot-hub" :class="isSupervisor ? 'ot-hub--supervisor-split' : 'ot-hub--single'">
    <div class="ot-obj-header">
      <div class="ot-obj-header__titles">
        <h1 class="page-title">{{ isLs ? 'Overtime Request' : 'Overtime Approvals' }}</h1>
        <p class="page-subtitle">
          {{
            isLs
              ? 'Submit and track your overtime requests independently from daily attendance.'
              : 'Review overtime requests from your team. Approval links to the latest approved attendance.'
          }}
        </p>
      </div>
    </div>

    <!-- ─── LS view: submission + own list ─── -->
    <template v-if="isLs">
      <div class="ot-grid">
        <div class="card ot-new-card">
          <div class="card-header">
            <span class="card-title">New Overtime</span>
          </div>
          <div class="card-body">
            <div v-if="formSuccess" class="alert alert-success"><span>✅</span> {{ formSuccess }}</div>
            <div v-if="formWarning" class="alert alert-warning" role="alert">
              <span class="alert-icon" aria-hidden="true">!</span>
              <span>
                <span class="alert-title">{{ formWarningTitle }}</span>
                <span class="alert-body">{{ formWarning }}</span>
              </span>
            </div>
            <div v-if="formError" class="alert alert-error"><span>⚠️</span> {{ formError }}</div>
            <form @submit.prevent="submitOvertime">
              <div class="form-group">
                <label class="form-label">Date</label>
                <input v-model="form.request_date" type="date" class="form-control" required />
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Start Time</label>
                  <input v-model="form.start_time" type="time" class="form-control" required />
                </div>
                <div class="form-group">
                  <label class="form-label">End Time</label>
                  <input v-model="form.end_time" type="time" class="form-control" required />
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">
                  Remarks
                  <span class="text-muted text-sm">(optional)</span>
                </label>
                <textarea
                  v-model="form.remarks"
                  class="form-control"
                  rows="3"
                  maxlength="2000"
                  placeholder="Briefly describe the overtime work…"
                />
              </div>
              <p v-if="durationLabel" class="text-sm text-muted" style="margin-bottom:12px;">
                Duration: <strong>{{ durationLabel }}</strong>
              </p>
              <button type="submit" class="btn btn-primary w-full" :disabled="submitting">
                <span v-if="submitting" class="spinner" style="width:16px;height:16px;border-width:2px;"></span>
                {{ submitting ? 'Submitting…' : 'Submit Request' }}
              </button>
            </form>
          </div>
        </div>

        <div class="card ot-list-card">
          <div class="card-header">
            <span class="card-title">My Requests</span>
            <div class="toolbar-filters">
              <select v-model="filterStatus" class="form-control toolbar-select" @change="onFilterChange">
                <option value="">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="cancelled">Cancelled</option>
                <option value="withdrawn">Withdrawn</option>
              </select>
              <input
                v-model="filterStartDate"
                type="date"
                class="form-control toolbar-date"
                @change="onFilterChange"
                aria-label="Start date"
              />
              <input
                v-model="filterEndDate"
                type="date"
                class="form-control toolbar-date"
                @change="onFilterChange"
                aria-label="End date"
              />
              <button type="button" class="btn btn-outline btn-sm" @click="resetLsFilters">Reset</button>
            </div>
          </div>
          <div class="table-wrapper ot-ls-table" style="border:none;border-radius:0;border-top:1px solid var(--bc-gray-200);">
            <div v-if="loading" class="loading-overlay"><span class="spinner"></span> Loading…</div>
            <table v-else>
              <colgroup>
                <col style="width:140px;" />
                <col style="width:150px;" />
                <col style="width:96px;" />
                <col />
                <col style="width:160px;" />
                <col style="width:170px;" />
              </colgroup>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Time Range</th>
                  <th>Duration</th>
                  <th>Remarks</th>
                  <th>Approval Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="records.length === 0">
                  <td colspan="6">
                    <div class="empty-state">
                      <div class="empty-state-icon">⏱️</div>
                      <h3>No overtime yet</h3>
                      <p>Submit a request using the form on the left or adjust the filters.</p>
                    </div>
                  </td>
                </tr>
                <tr v-for="r in records" :key="r.id">
                  <td>
                    <div class="font-bold">{{ fmtDate(r.request_date) }}</div>
                    <div class="text-sm text-muted">{{ fmtDayName(r.request_date) }}</div>
                  </td>
                  <td>
                    <span class="time-range">{{ fmtHm(r.start_time) }} – {{ fmtHm(r.end_time) }}</span>
                  </td>
                  <td>{{ rangeDuration(r.start_time, r.end_time) }}</td>
                  <td><span class="cell-reason">{{ r.remarks || '—' }}</span></td>
                  <td>
                    <span class="badge" :class="`badge-${r.status}`">{{ statusLabel(r.status) }}</span>
                    <div v-if="r.status === 'rejected' && r.rejection_note" class="text-xs text-muted" style="margin-top:4px;max-width:200px;">
                      {{ r.rejection_note }}
                    </div>
                  </td>
                  <td>
                    <div class="row-actions">
                      <button
                        v-if="r.status === 'pending'"
                        type="button"
                        class="btn btn-outline btn-sm btn-cancel"
                        :disabled="lifecycleId === r.id"
                        title="Cancel this pending overtime request"
                        @click="openLifecycleConfirm(r, 'cancel')"
                      >Cancel</button>
                      <button
                        v-else-if="r.status === 'approved'"
                        type="button"
                        class="btn btn-outline btn-sm btn-withdraw"
                        :disabled="lifecycleId === r.id"
                        title="Withdraw this approved overtime"
                        @click="openLifecycleConfirm(r, 'withdraw')"
                      >Withdraw</button>
                      <span v-else class="text-muted text-sm">—</span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="pagination.total > 0" class="card-body" style="padding-top:12px;border-top:1px solid var(--bc-gray-100);">
            <div class="pagination">
              <span class="pagination-info">
                {{ ((pagination.page - 1) * pagination.limit) + 1 }}–{{ Math.min(pagination.page * pagination.limit, pagination.total) }} of {{ pagination.total }}
              </span>
              <button class="btn btn-ghost btn-sm" :disabled="pagination.page <= 1" @click="changePage(pagination.page - 1)">‹ Prev</button>
              <button class="btn btn-ghost btn-sm" :disabled="pagination.page * pagination.limit >= pagination.total" @click="changePage(pagination.page + 1)">Next ›</button>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- ─── Supervisor view: master/detail split ─── -->
    <template v-else-if="isSupervisor">
      <div class="ot-supervisor-split">
        <aside class="ot-master card" aria-label="LS employee list">
          <div class="ot-master__head">
            <span class="card-title ot-master__title">LS Employees</span>
            <div class="search-wrap ot-master__search">
              <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <input v-model="sidebarSearch" class="form-control" type="search" placeholder="Search by name or NPK…" autocomplete="off" />
            </div>
          </div>
          <div class="ot-master__scroll">
            <div v-if="membersLoading" class="ot-master__loading"><span class="spinner"></span> Loading…</div>
            <template v-else>
              <p v-if="filteredMembers.length === 0" class="ot-master__empty text-muted text-sm">
                {{ lsMembers.length === 0 ? 'No LS employees are assigned to your supervision.' : 'No matching employees.' }}
              </p>
              <ul v-else class="ot-master__list" role="listbox" :aria-activedescendant="selectedUserId ? `ot-item-${selectedUserId}` : undefined">
                <li
                  v-for="m in filteredMembers"
                  :id="`ot-item-${m.id}`"
                  :key="m.id"
                  role="option"
                  :aria-selected="selectedUserId == m.id"
                  class="ot-master__item"
                  :class="{ 'ot-master__item--active': selectedUserId == m.id }"
                  @click="selectMember(m.id)"
                >
                  <div class="ot-master__item-name">{{ m.name }}</div>
                  <div class="ot-master__item-npk" title="NPK">{{ m.npk || '—' }}</div>
                  <span v-if="pendingByUser[m.id] > 0" class="ot-master__pending">{{ pendingByUser[m.id] }} pending</span>
                </li>
              </ul>
            </template>
          </div>
        </aside>

        <div class="ot-detail card">
          <div class="ot-detail__head card-header">
            <div class="ot-detail__head-left">
              <span class="card-title">Overtime Requests</span>
              <template v-if="selectedMemberLabel">
                <span class="ot-detail__sep" aria-hidden="true">·</span>
                <span class="ot-detail__selected">{{ selectedMemberLabel }}</span>
              </template>
            </div>
          </div>
          <div class="ot-detail__filter-row detail-panel-filters">
            <select v-model="filters.status" class="form-control ot-detail__select" @change="onSupervisorFilterChange">
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
            <input v-model="filters.start_date" type="date" class="form-control ot-detail__date" @change="onSupervisorFilterChange" />
            <input v-model="filters.end_date" type="date" class="form-control ot-detail__date" @change="onSupervisorFilterChange" />
            <button type="button" class="btn btn-outline btn-sm" @click="clearSupervisorDetailFilters">Reset</button>
          </div>
          <div class="ot-detail__body">
            <template v-if="!selectedUserId">
              <div class="empty-state ot-detail__placeholder">
                <div class="empty-state-icon">👈</div>
                <h3>Select an LS employee</h3>
                <p>Use the list on the left to review their overtime requests.</p>
              </div>
            </template>
            <template v-else>
              <div v-if="loading" class="loading-overlay"><span class="spinner"></span> Loading…</div>
              <div v-else-if="records.length === 0" class="empty-state ot-detail__placeholder">
                <div class="empty-state-icon">⏱️</div>
                <h3>No overtime found</h3>
                <p class="text-muted text-sm">Adjust the filters above or pick another employee.</p>
              </div>
              <div v-else class="table-wrapper ot-detail__table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Time Range</th>
                      <th>Duration</th>
                      <th>Remarks</th>
                      <th>Approval Status</th>
                      <th style="min-width:160px;">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="r in records" :key="r.id">
                      <td>
                        <div class="font-bold">{{ fmtDate(r.request_date) }}</div>
                        <div class="text-sm text-muted">{{ fmtDayName(r.request_date) }}</div>
                      </td>
                      <td><span class="time-range">{{ fmtHm(r.start_time) }} – {{ fmtHm(r.end_time) }}</span></td>
                      <td>{{ rangeDuration(r.start_time, r.end_time) }}</td>
                      <td><span class="cell-reason">{{ r.remarks || '—' }}</span></td>
                      <td>
                        <span class="badge" :class="`badge-${r.status}`">{{ statusLabel(r.status) }}</span>
                        <div v-if="r.status === 'rejected' && r.rejection_note" class="text-xs text-muted" style="margin-top:4px;max-width:200px;">
                          {{ r.rejection_note }}
                        </div>
                      </td>
                      <td>
                        <div class="action-btns">
                          <template v-if="r.status === 'pending'">
                            <button
                              class="icon-btn icon-btn--approve"
                              :disabled="actionId === r.id"
                              :title="`Approve overtime on ${fmtDate(r.request_date)}`"
                              aria-label="Approve overtime"
                              @click="approve(r.id)"
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 13l4 4L19 7"/></svg>
                            </button>
                            <button
                              class="icon-btn icon-btn--reject"
                              :disabled="actionId === r.id"
                              :title="`Reject overtime on ${fmtDate(r.request_date)}`"
                              aria-label="Reject overtime"
                              @click="openReject(r)"
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
                            </button>
                          </template>
                          <span v-else class="text-muted text-sm">—</span>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div v-if="pagination.total > 0" class="pagination ot-detail__pag">
                <span class="pagination-info">
                  {{ ((pagination.page - 1) * pagination.limit) + 1 }}–{{ Math.min(pagination.page * pagination.limit, pagination.total) }} of {{ pagination.total }}
                </span>
                <button class="btn btn-ghost btn-sm" :disabled="pagination.page <= 1" @click="changePage(pagination.page - 1)">‹ Prev</button>
                <button class="btn btn-ghost btn-sm" :disabled="pagination.page * pagination.limit >= pagination.total" @click="changePage(pagination.page + 1)">Next ›</button>
              </div>
            </template>
          </div>
        </div>
      </div>

      <div v-if="rejectModal.show" class="modal-backdrop" @click.self="rejectModal.show = false">
        <div class="modal" style="max-width:440px;">
          <div class="modal-header">
            <span class="modal-title">Reject Overtime</span>
            <button type="button" class="modal-close" @click="rejectModal.show = false">✕</button>
          </div>
          <div class="modal-body">
            <p class="text-sm text-muted" style="margin-bottom:12px;">
              {{ rejectModal.label }}
            </p>
            <div class="form-group">
              <label class="form-label">Remarks <span style="color:var(--bc-rejected)">*</span></label>
              <textarea v-model="rejectModal.note" class="form-control" rows="3" placeholder="Provide a reason…" />
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline" @click="rejectModal.show = false">Cancel</button>
            <button
              type="button"
              class="btn btn-danger"
              :disabled="!rejectModal.note.trim() || actionId"
              @click="confirmReject"
            >Confirm Reject</button>
          </div>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="card">
        <div class="card-body">
          <p class="text-muted">Overtime is only available to LS employees and their supervisors.</p>
        </div>
      </div>
    </template>

    <!-- LS: Cancel / Withdraw confirmation -->
    <div v-if="lifecycleModal.show" class="modal-backdrop" @click.self="lifecycleModal.show = false">
      <div class="modal" style="max-width:420px;">
        <div class="modal-header">
          <span class="modal-title">
            {{ lifecycleModal.action === 'cancel' ? 'Cancel Overtime' : 'Withdraw Overtime' }}
          </span>
          <button type="button" class="modal-close" @click="lifecycleModal.show = false">✕</button>
        </div>
        <div class="modal-body">
          <p class="text-sm" style="margin-bottom:10px;">
            <template v-if="lifecycleModal.action === 'cancel'">
              Mark this <strong>pending</strong> overtime request as <strong>Cancelled</strong>?
              It will leave the Supervisor review queue and stop counting toward your recap.
            </template>
            <template v-else>
              Withdraw this <strong>approved</strong> overtime?
              The hours will be removed from the Vendor Monthly Sheet / BAST aggregation.
            </template>
          </p>
          <p class="text-sm text-muted" v-if="lifecycleModal.label">{{ lifecycleModal.label }}</p>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline" @click="lifecycleModal.show = false">Back</button>
          <button
            type="button"
            class="btn"
            :class="lifecycleModal.action === 'cancel' ? 'btn-danger' : 'btn-primary'"
            :disabled="lifecycleId === lifecycleModal.id"
            @click="confirmLifecycle"
          >
            {{ lifecycleModal.action === 'cancel' ? 'Confirm Cancel' : 'Confirm Withdraw' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue';
import api from '../utils/api';
import { getUser } from '../utils/auth';
import { formatYmdLocal, formatCalendarDateLocale } from '../utils/calendarDate';

const user = getUser();
const isLs = computed(() => user?.role === 'ls');
const isSupervisor = computed(() => user?.role === 'ls_supervisor');

const statusLabel = (s) => ({
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  withdrawn: 'Withdrawn',
}[s] || s);

const fmtDate = (d) => formatCalendarDateLocale(d, 'en-ID', { day: '2-digit', month: 'short', year: 'numeric' });
const fmtDayName = (d) => formatCalendarDateLocale(d, 'en-ID', { weekday: 'long' });
const fmtHm = (t) => (t ? String(t).slice(0, 5) : '—');

const rangeMinutes = (start, end) => {
  const s = fmtHm(start);
  const e = fmtHm(end);
  if (s === '—' || e === '—') return null;
  const [sh, sm] = s.split(':').map(Number);
  const [eh, em] = e.split(':').map(Number);
  const mins = (eh * 60 + em) - (sh * 60 + sm);
  return Number.isFinite(mins) ? mins : null;
};

const rangeDuration = (start, end) => {
  const m = rangeMinutes(start, end);
  if (m == null || m <= 0) return '—';
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};

// ─── LS state ───
const form = reactive({
  request_date: formatYmdLocal(),
  start_time: '17:00',
  end_time: '20:00',
  remarks: '',
});
const formSuccess = ref('');
const formError = ref('');
const formWarning = ref('');
const formWarningTitle = ref('');
const submitting = ref(false);

const durationLabel = computed(() => {
  const m = rangeMinutes(form.start_time, form.end_time);
  if (m == null) return '';
  if (m <= 0) return 'Invalid range';
  return `${Math.floor(m / 60)}h ${m % 60}m`;
});

// ─── Shared list state ───
const loading = ref(false);
const records = ref([]);
const pagination = reactive({ total: 0, page: 1, limit: 20 });

// ─── LS filters ───
const filterStatus = ref('');
const filterStartDate = ref('');
const filterEndDate = ref('');

// ─── LS cancel/withdraw state ───
const lifecycleId = ref(null);
const lifecycleModal = reactive({ show: false, id: null, action: 'cancel', label: '' });

// ─── Supervisor state ───
const lsMembers = ref([]);
const membersLoading = ref(false);
const sidebarSearch = ref('');
const selectedUserId = ref(null);
const filters = reactive({ status: '', start_date: '', end_date: '' });
const pendingByUser = reactive({});
const rejectModal = reactive({ show: false, id: null, note: '', label: '' });
const actionId = ref(null);

const filteredMembers = computed(() => {
  const q = sidebarSearch.value.trim().toLowerCase();
  if (!q) return lsMembers.value;
  return lsMembers.value.filter(
    (m) =>
      String(m.name || '').toLowerCase().includes(q) ||
      String(m.npk || '').toLowerCase().includes(q) ||
      String(m.employee_id || '').toLowerCase().includes(q)
  );
});

const selectedMemberLabel = computed(() => {
  const m = lsMembers.value.find((x) => x.id == selectedUserId.value);
  if (!m) return '';
  return `${m.name} · NPK ${m.npk || '—'}`;
});

// ─── LS list fetch ───
const fetchLsList = async () => {
  loading.value = true;
  try {
    const params = { page: pagination.page, limit: pagination.limit };
    if (filterStatus.value) params.status = filterStatus.value;
    if (filterStartDate.value) params.start_date = filterStartDate.value;
    if (filterEndDate.value) params.end_date = filterEndDate.value;
    const { data } = await api.get('/overtimes/my', { params });
    records.value = data.data || [];
    Object.assign(pagination, data.pagination || {});
  } catch {
    records.value = [];
  } finally {
    loading.value = false;
  }
};

const onFilterChange = () => {
  pagination.page = 1;
  fetchLsList();
};

const resetLsFilters = () => {
  filterStatus.value = '';
  filterStartDate.value = '';
  filterEndDate.value = '';
  onFilterChange();
};

const changePage = (p) => {
  pagination.page = p;
  if (isLs.value) fetchLsList();
  else if (isSupervisor.value) fetchSupervisorList();
};

// ─── LS cancel / withdraw ───
const openLifecycleConfirm = (record, action) => {
  lifecycleModal.id = record.id;
  lifecycleModal.action = action;
  lifecycleModal.label = `${fmtDate(record.request_date)} · ${fmtHm(record.start_time)}–${fmtHm(record.end_time)}`;
  lifecycleModal.show = true;
};

const confirmLifecycle = async () => {
  if (!lifecycleModal.id) return;
  lifecycleId.value = lifecycleModal.id;
  try {
    const { data } = await api.put(
      `/overtimes/${lifecycleModal.id}/cancel-withdraw`,
      { action: lifecycleModal.action }
    );
    if (data?.success === false) {
      window.alert(data.message || 'Operation failed.');
    }
    lifecycleModal.show = false;
    await fetchLsList();
  } catch (err) {
    window.alert(err?.response?.data?.message || 'Operation failed.');
  } finally {
    lifecycleId.value = null;
  }
};

// ─── LS submit ───
const OVERTIME_DUP_CODES = new Set(['OVERTIME_ACTIVE_EXISTS', 'OVERTIME_APPROVED_EXISTS']);

const submitOvertime = async () => {
  formSuccess.value = '';
  formError.value = '';
  formWarning.value = '';
  formWarningTitle.value = '';
  if ((rangeMinutes(form.start_time, form.end_time) || 0) <= 0) {
    formError.value = 'End time must be after start time.';
    return;
  }
  submitting.value = true;
  try {
    const payload = {
      request_date: String(form.request_date || '').slice(0, 10),
      start_time: form.start_time,
      end_time: form.end_time,
      remarks: form.remarks?.trim() || null,
    };
    const { data } = await api.post('/overtimes', payload);
    if (data.success) {
      formSuccess.value = data.message || 'Overtime request submitted.';
      form.remarks = '';
      pagination.page = 1;
      await fetchLsList();
    }
  } catch (err) {
    const resp = err.response?.data;
    const msg = resp?.message || 'Submission failed.';
    const code = resp?.code;
    const isDup =
      err.response?.status === 409 &&
      (OVERTIME_DUP_CODES.has(code) || /pending|approved/i.test(msg));
    if (isDup) {
      formWarning.value = msg;
      formWarningTitle.value =
        resp?.existing_status === 'pending'
          ? 'Pending request already exists for this date'
          : 'Approved request already exists for this date';
    } else {
      formError.value = msg;
    }
  } finally {
    submitting.value = false;
  }
};

// ─── Supervisor list fetch ───
const fetchSupervisorMembers = async () => {
  membersLoading.value = true;
  try {
    const { data } = await api.get('/attendance/team/members');
    lsMembers.value = data.data || [];
    if (selectedUserId.value == null && lsMembers.value.length) {
      selectedUserId.value = lsMembers.value[0].id;
    }
  } catch {
    lsMembers.value = [];
  } finally {
    membersLoading.value = false;
  }
};

const fetchSupervisorList = async () => {
  if (selectedUserId.value == null) {
    records.value = [];
    Object.assign(pagination, { total: 0, page: 1 });
    return;
  }
  loading.value = true;
  try {
    const params = {
      user_id: selectedUserId.value,
      page: pagination.page,
      limit: pagination.limit,
    };
    if (filters.status) params.status = filters.status;
    if (filters.start_date) params.start_date = filters.start_date;
    if (filters.end_date) params.end_date = filters.end_date;
    const { data } = await api.get('/overtimes/team', { params });
    records.value = data.data || [];
    Object.assign(pagination, data.pagination || {});
  } catch {
    records.value = [];
  } finally {
    loading.value = false;
  }
};

const fetchPendingTotalsPerUser = async () => {
  try {
    const { data } = await api.get('/overtimes/team', {
      params: { status: 'pending', page: 1, limit: 500 },
    });
    const counts = {};
    for (const r of data.data || []) {
      const uid = r.user_id;
      if (uid == null) continue;
      counts[uid] = (counts[uid] || 0) + 1;
    }
    Object.keys(pendingByUser).forEach((k) => delete pendingByUser[k]);
    Object.assign(pendingByUser, counts);
  } catch {
    /* keep previous values */
  }
};

const selectMember = (id) => {
  if (selectedUserId.value === id) return;
  selectedUserId.value = id;
  pagination.page = 1;
  fetchSupervisorList();
};

const onSupervisorFilterChange = () => {
  pagination.page = 1;
  fetchSupervisorList();
};

const clearSupervisorDetailFilters = () => {
  filters.status = '';
  filters.start_date = '';
  filters.end_date = '';
  onSupervisorFilterChange();
};

watch(selectedUserId, () => {
  if (isSupervisor.value && selectedUserId.value != null) {
    fetchSupervisorList();
  }
});

// ─── Approval actions ───
const approve = async (id) => {
  actionId.value = id;
  try {
    const { data } = await api.put(`/overtimes/${id}/approval`, { action: 'approve' });
    if (data.success) {
      await Promise.all([fetchSupervisorList(), fetchPendingTotalsPerUser()]);
    } else if (data.message) {
      window.alert(data.message);
    }
  } catch (err) {
    window.alert(err?.response?.data?.message || 'Failed to approve overtime.');
  } finally {
    actionId.value = null;
  }
};

const openReject = (r) => {
  rejectModal.id = r.id;
  rejectModal.note = '';
  rejectModal.label = `${fmtDate(r.request_date)} · ${fmtHm(r.start_time)}–${fmtHm(r.end_time)}`;
  rejectModal.show = true;
};

const confirmReject = async () => {
  if (!rejectModal.note.trim() || !rejectModal.id) return;
  actionId.value = rejectModal.id;
  try {
    await api.put(`/overtimes/${rejectModal.id}/approval`, {
      action: 'reject',
      rejection_note: rejectModal.note.trim(),
    });
    rejectModal.show = false;
    await Promise.all([fetchSupervisorList(), fetchPendingTotalsPerUser()]);
  } catch (err) {
    window.alert(err?.response?.data?.message || 'Failed to reject overtime.');
  } finally {
    actionId.value = null;
  }
};

onMounted(async () => {
  if (isLs.value) {
    fetchLsList();
  } else if (isSupervisor.value) {
    await fetchSupervisorMembers();
    await Promise.all([fetchSupervisorList(), fetchPendingTotalsPerUser()]);
  }
});
</script>

<style scoped>
.ot-hub { max-width: 1120px; }
.ot-hub--supervisor-split { max-width: 1400px; }
/* LS employee view: use full page width so the request list mirrors AttendanceList */
.ot-hub--single { max-width: none; }

.ot-obj-header {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 22px;
  position: relative;
}
.ot-obj-header__titles { flex: 1; min-width: 0; }

.ot-grid {
  display: grid;
  grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);
  gap: 24px;
  align-items: start;
}
.ot-new-card { box-shadow: var(--shadow-sm); }
.ot-list-card { box-shadow: var(--shadow-sm); min-width: 0; }

/* LS list: let Remarks breathe across the full available width */
.ot-ls-table table { table-layout: fixed; }
.ot-ls-table .cell-reason {
  display: -webkit-box;
  max-width: 100%;
  white-space: normal;
  overflow: hidden;
  text-overflow: ellipsis;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  line-height: 1.4;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.form-row .form-group { margin-bottom: 16px; }

.toolbar-filters {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}
.toolbar-select { max-width: 140px; font-size: 13px; padding: 6px 10px; }
.toolbar-date { max-width: 150px; font-size: 13px; padding: 6px 10px; }

.time-range {
  font-weight: 700;
  color: #b45309;
  font-variant-numeric: tabular-nums;
}

.cell-reason {
  display: inline-block;
  max-width: 240px;
  font-size: 13px;
  color: var(--bc-gray-600);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}

.action-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.btn-cancel {
  color: var(--bc-rejected);
  border-color: #fecaca;
}
.btn-cancel:hover:not(:disabled) {
  background: #fee2e2;
  border-color: var(--bc-rejected);
}
.btn-withdraw {
  color: #b45309;
  border-color: #fde68a;
}
.btn-withdraw:hover:not(:disabled) {
  background: #fef3c7;
  border-color: #f59e0b;
}
.icon-btn {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  border: 1px solid var(--bc-gray-200);
  background: #fff;
  color: var(--bc-gray-600);
  cursor: pointer;
  transition: all 0.15s;
}
.icon-btn:hover:not(:disabled) {
  border-color: currentColor;
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
}
.icon-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.icon-btn--approve { color: var(--bc-green-600); }
.icon-btn--approve:hover:not(:disabled) {
  background: var(--bc-green-50, #ecfdf5);
}
.icon-btn--reject { color: var(--bc-rejected); }
.icon-btn--reject:hover:not(:disabled) {
  background: #fef2f2;
}

/* ─── Supervisor split layout ─── */
.ot-supervisor-split {
  display: flex;
  align-items: stretch;
  gap: 24px;
  min-height: min(72vh, 800px);
}

.ot-master {
  flex: 0 0 30%;
  width: 30%;
  max-width: 30%;
  min-width: 220px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0;
  border: 1px solid var(--bc-gray-200);
}
.ot-master__head {
  flex-shrink: 0;
  padding: 14px 14px 12px;
  border-bottom: 1px solid var(--bc-gray-100);
  background: linear-gradient(180deg, #fff 0%, var(--bc-gray-50, #f9fafb) 100%);
}
.ot-master__title {
  display: block;
  margin-bottom: 10px;
  font-size: 15px;
}
.ot-master__search .form-control {
  width: 100%;
  max-width: none;
  border-color: var(--bc-gray-200);
}
.ot-master__search .form-control:focus {
  border-color: var(--bc-green-500);
  box-shadow: 0 0 0 2px rgba(22, 163, 74, 0.12);
}
.ot-master__scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px;
}
.ot-master__loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 28px 12px;
  color: var(--bc-gray-600);
  font-size: 14px;
}
.ot-master__empty {
  padding: 16px 10px;
  text-align: center;
}
.ot-master__list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.ot-master__item {
  padding: 12px 12px;
  margin-bottom: 6px;
  border-radius: 8px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.ot-master__item:hover {
  background: var(--bc-gray-50, #f9fafb);
  border-color: var(--bc-gray-200);
}
.ot-master__item--active {
  background: #ecfdf5;
  border-color: var(--bc-green-500);
  box-shadow: 0 1px 2px rgba(22, 101, 52, 0.08);
}
.ot-master__item-name {
  font-weight: 700;
  font-size: 14px;
  color: var(--bc-gray-900);
}
.ot-master__item-npk {
  font-size: 12px;
  color: var(--bc-gray-600);
  margin-top: 2px;
  font-family: ui-monospace, 'Cascadia Code', 'Consolas', monospace;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}
.ot-master__pending {
  display: inline-block;
  margin-top: 6px;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
  background: #fef3c7;
  color: #92400e;
}

.ot-detail {
  flex: 1 1 70%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0;
  border: 1px solid var(--bc-gray-200);
}
.ot-detail__head {
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--bc-gray-100);
  background: #fff;
}
.ot-detail__head-left {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}
.ot-detail__sep { color: var(--bc-gray-400); }
.ot-detail__selected {
  font-size: 14px;
  font-weight: 600;
  color: var(--bc-green-800);
}
.ot-detail__select { max-width: 160px; }
.ot-detail__date { max-width: 150px; }
.ot-detail__filter-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 10px 16px 12px;
  border-bottom: 1px solid var(--bc-gray-100);
  background: #fafdfb;
}
.ot-detail__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 16px 20px;
  position: relative;
}
.ot-detail__placeholder {
  padding: 40px 16px;
}
.ot-detail__table-wrap {
  border: 1px solid var(--bc-gray-200);
  border-radius: 8px;
}
.ot-detail__pag {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 12px;
}

@media (max-width: 900px) {
  .ot-grid { grid-template-columns: 1fr; }
  .ot-supervisor-split {
    flex-direction: column;
    min-height: auto;
  }
  .ot-master {
    flex: 0 0 auto;
    width: 100%;
    max-width: none;
    max-height: 280px;
  }
}
</style>
