<template>
  <div class="leave-hub" :class="isSupervisor ? 'leave-hub--supervisor-split' : 'leave-hub--single'">
    <header class="leave-obj-header">
      <div class="leave-obj-header__titles">
        <h1 class="page-title">{{ isLs ? 'Leave' : 'Leave approvals' }}</h1>
        <p class="page-subtitle">Cuti, izin, dan sakit — pilih jenis saat mengajukan atau saring daftar.</p>
      </div>
      <div class="leave-accent" aria-hidden="true" />
    </header>

    <template v-if="isLs">
      <div class="leave-grid">
        <div class="card leave-new-card">
          <div class="card-header">
            <span class="card-title">Pengajuan baru</span>
          </div>
          <div class="card-body">
            <div v-if="formSuccess" class="alert alert-success"><span>✅</span> {{ formSuccess }}</div>
            <div v-if="formError" class="alert alert-error"><span>⚠️</span> {{ formError }}</div>
            <form @submit.prevent="submitLeave">
              <div class="form-group">
                <label class="form-label">Jenis</label>
                <select v-model="form.request_type" class="form-control" required>
                  <option value="cuti">Cuti</option>
                  <option value="izin">Izin</option>
                  <option value="sakit">Sakit</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Tanggal mulai</label>
                <input v-model="form.start_date" type="date" class="form-control" required />
              </div>
              <div class="form-group">
                <label class="form-label">Tanggal selesai</label>
                <input v-model="form.end_date" type="date" class="form-control" required />
              </div>
              <div class="form-group">
                <label class="form-label">
                  Alasan
                  <span v-if="reasonRequired" class="req">*</span>
                  <span v-else class="text-muted text-sm">(opsional)</span>
                </label>
                <textarea
                  v-model="form.reason"
                  class="form-control"
                  rows="3"
                  maxlength="2000"
                  :required="reasonRequired"
                  :placeholder="reasonPlaceholder"
                />
              </div>
              <p v-if="dayCount !== null" class="text-sm text-muted" style="margin-bottom:12px;">
                Durasi: <strong>{{ dayCount }}</strong> hari kalender
              </p>
              <button type="submit" class="btn btn-primary w-full" :disabled="submitting">
                <span v-if="submitting" class="spinner" style="width:16px;height:16px;border-width:2px;"></span>
                {{ submitting ? 'Mengirim…' : 'Kirim pengajuan' }}
              </button>
            </form>
          </div>
        </div>

        <div class="card leave-list-card">
          <div class="card-header">
            <span class="card-title">Riwayat pengajuan</span>
            <div class="toolbar-filters">
              <select v-model="filterRequestType" class="form-control toolbar-select" @change="onFilterChange">
                <option value="">Semua jenis</option>
                <option value="cuti">Cuti</option>
                <option value="izin">Izin</option>
                <option value="sakit">Sakit</option>
              </select>
              <select v-model="filterStatus" class="form-control toolbar-select" @change="onFilterChange">
                <option value="">Semua status</option>
                <option value="pending">Pending</option>
                <option value="approved">Disetujui</option>
                <option value="rejected">Ditolak</option>
              </select>
            </div>
          </div>
          <div class="table-wrapper" style="border:none;border-radius:0;border-top:1px solid var(--bc-gray-200);">
            <div v-if="loading" class="loading-overlay"><span class="spinner"></span> Loading…</div>
            <table v-else>
              <thead>
                <tr>
                  <th>Jenis</th>
                  <th>Periode</th>
                  <th>Hari</th>
                  <th>Alasan</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="records.length === 0">
                  <td colspan="5">
                    <div class="empty-state">
                      <div class="empty-state-icon">📋</div>
                      <h3>Belum ada pengajuan</h3>
                      <p>Gunakan formulir di kiri atau ubah filter.</p>
                    </div>
                  </td>
                </tr>
                <tr v-for="r in records" :key="r.id">
                  <td><span class="badge badge-type">{{ typeLabel(r.request_type) }}</span></td>
                  <td>
                    <div class="font-bold">{{ fmtRange(r.start_date, r.end_date) }}</div>
                    <div class="text-sm text-muted">{{ fmtShort(r.start_date) }} – {{ fmtShort(r.end_date) }}</div>
                  </td>
                  <td>{{ countDays(r.start_date, r.end_date) }}</td>
                  <td><span class="cell-reason">{{ r.reason || '—' }}</span></td>
                  <td><span class="badge" :class="`badge-${r.status}`">{{ r.status }}</span></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="pagination.total > 0" class="card-body" style="padding-top:12px;border-top:1px solid var(--bc-gray-100);">
            <div class="pagination">
              <span class="pagination-info">
                {{ ((pagination.page - 1) * pagination.limit) + 1 }}–{{ Math.min(pagination.page * pagination.limit, pagination.total) }} dari {{ pagination.total }}
              </span>
              <button class="btn btn-ghost btn-sm" :disabled="pagination.page <= 1" @click="changePage(pagination.page - 1)">‹ Prev</button>
              <button class="btn btn-ghost btn-sm" :disabled="pagination.page * pagination.limit >= pagination.total" @click="changePage(pagination.page + 1)">Next ›</button>
            </div>
          </div>
        </div>
      </div>
    </template>

    <template v-else-if="isSupervisor">
      <div class="leave-supervisor-split">
        <aside class="leave-master card" aria-label="Daftar karyawan LS">
          <div class="leave-master__head">
            <span class="card-title leave-master__title">Karyawan LS</span>
            <div class="search-wrap leave-master__search">
              <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <input v-model="sidebarSearch" class="form-control" type="search" placeholder="Cari nama atau NIK…" autocomplete="off" />
            </div>
          </div>
          <div class="leave-master__scroll">
            <div v-if="loading" class="leave-master__loading"><span class="spinner"></span> Memuat…</div>
            <template v-else>
              <p v-if="filteredSidebarEmployees.length === 0" class="leave-master__empty text-muted text-sm">
                {{ uniqueEmployees.length === 0 ? 'Belum ada pengajuan tim untuk filter ini.' : 'Tidak ada karyawan yang cocok.' }}
              </p>
              <ul v-else class="leave-master__list" role="listbox" :aria-activedescendant="selectedUserId ? `ls-item-${selectedUserId}` : undefined">
                <li
                  v-for="emp in filteredSidebarEmployees"
                  :id="`ls-item-${emp.user_id}`"
                  :key="emp.user_id"
                  role="option"
                  :aria-selected="selectedUserId == emp.user_id"
                  class="leave-master__item"
                  :class="{ 'leave-master__item--active': selectedUserId == emp.user_id }"
                  @click="selectedUserId = emp.user_id"
                >
                  <div class="leave-master__item-name">{{ emp.employee_name }}</div>
                  <div class="leave-master__item-nik" title="NIK">{{ emp.nik || '—' }}</div>
                  <span v-if="pendingCountForUser(emp.user_id) > 0" class="leave-master__pending">{{ pendingCountForUser(emp.user_id) }} pending</span>
                </li>
              </ul>
            </template>
          </div>
        </aside>

        <div class="leave-detail card">
          <div class="leave-detail__head card-header">
            <div class="leave-detail__head-left">
              <span class="card-title">Pengajuan tim</span>
              <template v-if="selectedEmployeeLabel">
                <span class="leave-detail__sep" aria-hidden="true">·</span>
                <span class="leave-detail__selected">{{ selectedEmployeeLabel }}</span>
              </template>
            </div>
          </div>
          <div class="leave-detail__filter-row detail-panel-filters">
            <select v-model="filterRequestType" class="form-control leave-detail__select" @change="onFilterChange">
              <option value="">Semua jenis</option>
              <option value="cuti">Cuti</option>
              <option value="izin">Izin</option>
              <option value="sakit">Sakit</option>
            </select>
            <select v-model="filters.status" class="form-control leave-detail__select" @change="onFilterChange">
              <option value="">Semua status</option>
              <option value="pending">Pending</option>
              <option value="approved">Disetujui</option>
              <option value="rejected">Ditolak</option>
            </select>
            <input v-model="filters.start_date" type="date" class="form-control leave-detail__date" @change="onFilterChange" />
            <input v-model="filters.end_date" type="date" class="form-control leave-detail__date" @change="onFilterChange" />
            <button type="button" class="btn btn-outline btn-sm" @click="clearSupervisorDetailFilters">Reset</button>
          </div>
          <p v-if="supervisorTruncated" class="leave-detail__trunc text-sm text-muted">
            Menampilkan {{ records.length }} pengajuan terbaru dari {{ pagination.total }} total — saring jenis, status, atau tanggal untuk menyempitkan.
          </p>
          <div class="leave-detail__body">
            <template v-if="!selectedUserId">
              <div class="empty-state leave-detail__placeholder">
                <div class="empty-state-icon">👈</div>
                <h3>Pilih karyawan LS</h3>
                <p>Gunakan daftar di kiri untuk membuka cuti, izin, dan sakit.</p>
              </div>
            </template>
            <template v-else>
              <div v-if="sortedLeavesForSelectedUser.length === 0" class="empty-state leave-detail__placeholder">
                <div class="empty-state-icon">📋</div>
                <h3>Tidak ada pengajuan</h3>
                <p class="text-muted text-sm">Tidak ada cuti, izin, atau sakit untuk karyawan ini dengan filter saat ini.</p>
              </div>
              <div v-else class="table-wrapper leave-detail__table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Jenis</th>
                      <th>Periode</th>
                      <th>Hari</th>
                      <th>Alasan</th>
                      <th>Status</th>
                      <th style="min-width:200px;">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="r in sortedLeavesForSelectedUser" :key="r.id">
                      <td><span class="badge badge-type">{{ typeLabel(r.request_type) }}</span></td>
                      <td>
                        <div class="font-bold">{{ fmtRange(r.start_date, r.end_date) }}</div>
                      </td>
                      <td>{{ countDays(r.start_date, r.end_date) }}</td>
                      <td><span class="cell-reason">{{ r.reason || '—' }}</span></td>
                      <td><span class="badge" :class="`badge-${r.status}`">{{ r.status }}</span></td>
                      <td>
                        <div class="action-btns">
                          <template v-if="r.status === 'pending'">
                            <button class="btn btn-primary btn-sm" :disabled="actionId === r.id" @click="approve(r.id)">Setujui</button>
                            <button class="btn btn-danger btn-sm" :disabled="actionId === r.id" @click="openReject(r)">Tolak</button>
                          </template>
                          <span v-else class="text-muted text-sm">—</span>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </template>
          </div>
        </div>
      </div>

      <div v-if="rejectModal.show" class="modal-backdrop" @click.self="rejectModal.show = false">
        <div class="modal" style="max-width:440px;">
          <div class="modal-header">
            <span class="modal-title">Tolak pengajuan</span>
            <button type="button" class="modal-close" @click="rejectModal.show = false">✕</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">Alasan <span style="color:var(--bc-rejected)">*</span></label>
              <textarea v-model="rejectModal.note" class="form-control" rows="3" placeholder="Berikan alasan…" />
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline" @click="rejectModal.show = false">Batal</button>
            <button type="button" class="btn btn-danger" :disabled="!rejectModal.note.trim() || actionId" @click="confirmReject">Konfirmasi</button>
          </div>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="card">
        <div class="card-header">
          <span class="card-title">Pengajuan tim</span>
        </div>
        <div class="card-body" style="padding-bottom:0;">
          <div class="filter-bar">
            <div class="search-wrap">
              <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <input v-model="filters.search" class="form-control" placeholder="Cari nama, ID, alasan…" style="max-width:240px;" @input="debouncedFetch" />
            </div>
            <select v-model="filterRequestType" class="form-control" style="max-width:160px;" @change="onFilterChange">
              <option value="">Semua jenis</option>
              <option value="cuti">Cuti</option>
              <option value="izin">Izin</option>
              <option value="sakit">Sakit</option>
            </select>
            <select v-model="filters.status" class="form-control" style="max-width:160px;" @change="onFilterChange">
              <option value="">Semua status</option>
              <option value="pending">Pending</option>
              <option value="approved">Disetujui</option>
              <option value="rejected">Ditolak</option>
            </select>
          </div>
        </div>
        <div class="table-wrapper" style="border:none;border-radius:0;border-top:1px solid var(--bc-gray-200);">
          <div v-if="loading" class="loading-overlay"><span class="spinner"></span> Loading…</div>
          <table v-else>
            <thead>
              <tr>
                <th>Karyawan</th>
                <th>Jenis</th>
                <th>Periode</th>
                <th>Hari</th>
                <th>Alasan</th>
                <th>Status</th>
                <th style="min-width:200px;">Aksi</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="records.length === 0">
                <td colspan="7">
                  <div class="empty-state">
                    <div class="empty-state-icon">✅</div>
                    <h3>Tidak ada data</h3>
                    <p>Coba ubah filter.</p>
                  </div>
                </td>
              </tr>
              <tr v-for="r in records" :key="r.id">
                <td>
                  <div class="font-bold">{{ r.employee_name }}</div>
                  <div class="text-sm text-muted">{{ r.employee_id }}</div>
                </td>
                <td><span class="badge badge-type">{{ typeLabel(r.request_type) }}</span></td>
                <td>
                  <div class="font-bold">{{ fmtRange(r.start_date, r.end_date) }}</div>
                </td>
                <td>{{ countDays(r.start_date, r.end_date) }}</td>
                <td><span class="cell-reason">{{ r.reason || '—' }}</span></td>
                <td><span class="badge" :class="`badge-${r.status}`">{{ r.status }}</span></td>
                <td>
                  <div class="action-btns">
                    <template v-if="r.status === 'pending'">
                      <button class="btn btn-primary btn-sm" :disabled="actionId === r.id" @click="approve(r.id)">Setujui</button>
                      <button class="btn btn-danger btn-sm" :disabled="actionId === r.id" @click="openReject(r)">Tolak</button>
                    </template>
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
              {{ ((pagination.page - 1) * pagination.limit) + 1 }}–{{ Math.min(pagination.page * pagination.limit, pagination.total) }} dari {{ pagination.total }}
            </span>
            <button class="btn btn-ghost btn-sm" :disabled="pagination.page <= 1" @click="changePage(pagination.page - 1)">‹ Prev</button>
            <button class="btn btn-ghost btn-sm" :disabled="pagination.page * pagination.limit >= pagination.total" @click="changePage(pagination.page + 1)">Next ›</button>
          </div>
        </div>
      </div>

      <div v-if="rejectModal.show" class="modal-backdrop" @click.self="rejectModal.show = false">
        <div class="modal" style="max-width:440px;">
          <div class="modal-header">
            <span class="modal-title">Tolak pengajuan</span>
            <button type="button" class="modal-close" @click="rejectModal.show = false">✕</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">Alasan <span style="color:var(--bc-rejected)">*</span></label>
              <textarea v-model="rejectModal.note" class="form-control" rows="3" placeholder="Berikan alasan…" />
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline" @click="rejectModal.show = false">Batal</button>
            <button type="button" class="btn btn-danger" :disabled="!rejectModal.note.trim() || actionId" @click="confirmReject">Konfirmasi</button>
          </div>
        </div>
      </div>
    </template>
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

const SUPERVISOR_TEAM_FETCH_LIMIT = 500;

const typeLabel = (t) => ({ cuti: 'Cuti', izin: 'Izin', sakit: 'Sakit' }[t] || t);

const form = reactive({
  request_type: 'cuti',
  start_date: '',
  end_date: '',
  reason: '',
});
const formSuccess = ref('');
const formError = ref('');
const submitting = ref(false);
const loading = ref(false);
const records = ref([]);
const pagination = reactive({ total: 0, page: 1, limit: 15 });
const filterStatus = ref('');
const filterRequestType = ref('');
const filters = reactive({ search: '', status: '', start_date: '', end_date: '' });
const rejectModal = reactive({ show: false, id: null, note: '' });
const actionId = ref(null);

const sidebarSearch = ref('');
const selectedUserId = ref(null);

const uniqueEmployees = computed(() => {
  const map = new Map();
  for (const r of records.value) {
    const uid = r.user_id;
    if (uid == null) continue;
    if (!map.has(uid)) {
      map.set(uid, {
        user_id: uid,
        employee_name: r.employee_name,
        employee_id: r.employee_id,
        nik: r.nik || null,
      });
    } else if (r.nik) {
      const cur = map.get(uid);
      if (!cur.nik) cur.nik = r.nik;
    }
  }
  return [...map.values()].sort((a, b) =>
    String(a.employee_name || '').localeCompare(String(b.employee_name || ''), 'id', { sensitivity: 'base' })
  );
});

const filteredSidebarEmployees = computed(() => {
  const q = sidebarSearch.value.trim().toLowerCase();
  if (!q) return uniqueEmployees.value;
  return uniqueEmployees.value.filter(
    (e) =>
      String(e.employee_name || '').toLowerCase().includes(q) ||
      String(e.nik || '').toLowerCase().includes(q) ||
      String(e.employee_id || '').toLowerCase().includes(q)
  );
});

const leavesForSelectedUser = computed(() => {
  if (selectedUserId.value == null) return [];
  return records.value.filter((r) => r.user_id == selectedUserId.value);
});

const sortedLeavesForSelectedUser = computed(() =>
  leavesForSelectedUser.value
    .slice()
    .sort((a, b) => {
      const cmp = String(b.start_date || '').localeCompare(String(a.start_date || ''));
      if (cmp !== 0) return cmp;
      return (b.id || 0) - (a.id || 0);
    })
);

const selectedEmployeeLabel = computed(() => {
  const emp = uniqueEmployees.value.find((e) => e.user_id == selectedUserId.value);
  if (!emp) return '';
  return `${emp.employee_name} · NIK ${emp.nik || '—'}`;
});

const supervisorTruncated = computed(
  () => isSupervisor.value && pagination.total > records.value.length
);

function pendingCountForUser(userId) {
  return records.value.filter((r) => r.user_id == userId && r.status === 'pending').length;
}

const reasonRequired = computed(() => form.request_type === 'izin' || form.request_type === 'sakit');
const reasonPlaceholder = computed(() => {
  if (form.request_type === 'cuti') return 'Opsional — konteks untuk approver…';
  return 'Wajib (min. 5 karakter)…';
});

const dayCount = computed(() => {
  if (!form.start_date || !form.end_date) return null;
  const n = countDays(form.start_date, form.end_date);
  return Number.isFinite(n) ? n : null;
});

const countDays = (start, end) => {
  const a = new Date(`${String(start).slice(0, 10)}T12:00:00`).getTime();
  const b = new Date(`${String(end).slice(0, 10)}T12:00:00`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return '—';
  const d = Math.floor((b - a) / 86400000) + 1;
  return d < 1 ? '—' : d;
};

const fmtShort = (d) => formatCalendarDateLocale(d, 'en-ID', { day: '2-digit', month: 'short', year: 'numeric' });
const fmtRange = (s, e) => {
  if (s === e) return fmtShort(s);
  return `${fmtShort(s)} → ${fmtShort(e)}`;
};

const resetFormDates = () => {
  const ymd = formatYmdLocal();
  form.start_date = ymd;
  form.end_date = ymd;
  form.reason = '';
  form.request_type = 'cuti';
};

let debounceTimer;
const debouncedFetch = () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => { pagination.page = 1; fetchList(); }, 400);
};

const onFilterChange = () => {
  pagination.page = 1;
  fetchList();
};

const clearSupervisorDetailFilters = () => {
  filters.status = '';
  filters.start_date = '';
  filters.end_date = '';
  onFilterChange();
};

const fetchList = async () => {
  loading.value = true;
  try {
    const params = {
      page: pagination.page,
      limit: pagination.limit,
    };
    if (filterRequestType.value) params.request_type = filterRequestType.value;
    if (isLs.value) {
      if (filterStatus.value) params.status = filterStatus.value;
      const { data } = await api.get('/leaves/my', { params });
      records.value = data.data || [];
      Object.assign(pagination, data.pagination || {});
    } else if (isSupervisor.value) {
      params.page = 1;
      params.limit = SUPERVISOR_TEAM_FETCH_LIMIT;
      if (filters.status) params.status = filters.status;
      const sd = String(filters.start_date || '').slice(0, 10);
      const ed = String(filters.end_date || '').slice(0, 10);
      if (sd) params.start_date = sd;
      if (ed) params.end_date = ed;
      const { data } = await api.get('/leaves/team', { params });
      records.value = data.data || [];
      Object.assign(pagination, data.pagination || {});
    } else {
      if (filters.search.trim()) params.search = filters.search.trim();
      if (filters.status) params.status = filters.status;
      const { data } = await api.get('/leaves/team', { params });
      records.value = data.data || [];
      Object.assign(pagination, data.pagination || {});
    }
  } catch {
    records.value = [];
  } finally {
    loading.value = false;
  }
};

const changePage = (p) => {
  pagination.page = p;
  fetchList();
};

const submitLeave = async () => {
  formSuccess.value = '';
  formError.value = '';
  submitting.value = true;
  try {
    const startYmd = String(form.start_date || '').slice(0, 10);
    const endYmd = String(form.end_date || '').slice(0, 10);
    const { data } = await api.post('/leaves', {
      request_type: form.request_type,
      start_date: startYmd,
      end_date: endYmd,
      reason: form.reason || null,
    });
    if (data.success) {
      formSuccess.value = data.message || 'Submitted.';
      resetFormDates();
      await fetchList();
    }
  } catch (err) {
    formError.value = err.response?.data?.message || 'Submission failed.';
  } finally {
    submitting.value = false;
  }
};

const approve = async (id) => {
  actionId.value = id;
  try {
    await api.put(`/leaves/${id}/approval`, { action: 'approve' });
    await fetchList();
  } catch { /* */ } finally {
    actionId.value = null;
  }
};

const openReject = (r) => {
  rejectModal.id = r.id;
  rejectModal.note = '';
  rejectModal.show = true;
};

const confirmReject = async () => {
  if (!rejectModal.note.trim() || !rejectModal.id) return;
  actionId.value = rejectModal.id;
  try {
    await api.put(`/leaves/${rejectModal.id}/approval`, {
      action: 'reject',
      rejection_note: rejectModal.note,
    });
    rejectModal.show = false;
    await fetchList();
  } catch { /* */ } finally {
    actionId.value = null;
  }
};

watch(
  [filteredSidebarEmployees, loading, records],
  () => {
    if (!isSupervisor.value) return;
    if (loading.value) return;
    const list = filteredSidebarEmployees.value;
    if (list.length === 0) {
      selectedUserId.value = null;
      return;
    }
    const stillVisible = list.some((e) => e.user_id == selectedUserId.value);
    if (selectedUserId.value == null || !stillVisible) {
      selectedUserId.value = list[0].user_id;
    }
  },
  { flush: 'post' }
);

onMounted(() => {
  resetFormDates();
  fetchList();
});
</script>

<style scoped>
.leave-hub { max-width: 1120px; }
.leave-hub--supervisor-split {
  max-width: 1400px;
}

.leave-supervisor-split {
  display: flex;
  align-items: stretch;
  gap: 24px;
  min-height: min(72vh, 800px);
}

.leave-master {
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

.leave-master__head {
  flex-shrink: 0;
  padding: 14px 14px 12px;
  border-bottom: 1px solid var(--bc-gray-100);
  background: linear-gradient(180deg, #fff 0%, var(--bc-gray-50, #f9fafb) 100%);
}

.leave-master__title {
  display: block;
  margin-bottom: 10px;
  font-size: 15px;
}

.leave-master__search .form-control {
  width: 100%;
  max-width: none;
  border-color: var(--bc-gray-200);
}

.leave-master__search .form-control:focus {
  border-color: var(--bc-green-500);
  box-shadow: 0 0 0 2px rgba(22, 163, 74, 0.12);
}

.leave-master__scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px;
}

.leave-master__loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 28px 12px;
  color: var(--bc-gray-600);
  font-size: 14px;
}

.leave-master__empty {
  padding: 16px 10px;
  text-align: center;
}

.leave-master__list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.leave-master__item {
  padding: 12px 12px;
  margin-bottom: 6px;
  border-radius: 8px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.leave-master__item:hover {
  background: var(--bc-gray-50, #f9fafb);
  border-color: var(--bc-gray-200);
}

.leave-master__item--active {
  background: #ecfdf5;
  border-color: var(--bc-green-500);
  box-shadow: 0 1px 2px rgba(22, 101, 52, 0.08);
}

.leave-master__item-name {
  font-weight: 700;
  font-size: 14px;
  color: var(--bc-gray-900);
}

.leave-master__item-nik {
  font-size: 12px;
  color: var(--bc-gray-600);
  margin-top: 2px;
  font-family: ui-monospace, 'Cascadia Code', 'Consolas', monospace;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}

.leave-master__pending {
  display: inline-block;
  margin-top: 6px;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
  background: #fef3c7;
  color: #92400e;
}

.leave-detail {
  flex: 1 1 70%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0;
  border: 1px solid var(--bc-gray-200);
}

.leave-detail__head {
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--bc-gray-100);
  background: #fff;
}

.leave-detail__head-left {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}

.leave-detail__sep {
  color: var(--bc-gray-400);
}

.leave-detail__selected {
  font-size: 14px;
  font-weight: 600;
  color: var(--bc-green-800);
}

.leave-detail__select {
  max-width: 160px;
}

.leave-detail__filter-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 10px 16px 12px;
  border-bottom: 1px solid var(--bc-gray-100);
  background: #fafdfb;
}

.leave-detail__date {
  max-width: 150px;
}

.leave-detail__trunc {
  margin: 0;
  padding: 8px 16px 0;
}

.leave-detail__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 16px 20px;
}

.leave-detail__placeholder {
  padding: 40px 16px;
}

.leave-detail__table-wrap {
  border: 1px solid var(--bc-gray-200);
  border-radius: 8px;
}
.leave-obj-header {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 22px;
  position: relative;
}
.leave-obj-header__titles { flex: 1; min-width: 0; }
.leave-accent {
  width: 4px;
  border-radius: 4px;
  flex-shrink: 0;
  align-self: stretch;
  min-height: 48px;
  background: var(--bc-green-500);
}
.leave-hub--single .leave-accent { background: var(--bc-green-600); }

.leave-grid {
  display: grid;
  grid-template-columns: minmax(280px, 360px) 1fr;
  gap: 24px;
  align-items: start;
}
.leave-new-card { box-shadow: var(--shadow-sm); }
.leave-list-card { box-shadow: var(--shadow-sm); }
.toolbar-filters { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.toolbar-select { max-width: 140px; font-size: 13px; padding: 6px 10px; }

.badge-type {
  background: var(--bc-gray-100);
  color: var(--bc-gray-700);
  font-weight: 600;
  text-transform: none;
}

.cell-reason {
  display: inline-block;
  max-width: 220px;
  font-size: 13px;
  color: var(--bc-gray-600);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}

.req { color: var(--bc-rejected); }

.action-btns { display: flex; flex-wrap: wrap; gap: 6px; }

@media (max-width: 900px) {
  .leave-grid { grid-template-columns: 1fr; }

  .leave-supervisor-split {
    flex-direction: column;
    min-height: auto;
  }

  .leave-master {
    flex: 0 0 auto;
    width: 100%;
    max-width: none;
    max-height: 280px;
  }
}
</style>
