<template>
  <div class="leave-hub leave-hub--single">
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
import { ref, reactive, computed, onMounted } from 'vue';
import api from '../utils/api';
import { getUser } from '../utils/auth';
import { formatYmdLocal, formatCalendarDateLocale } from '../utils/calendarDate';

const user = getUser();
const isLs = computed(() => user?.role === 'ls');

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
const filters = reactive({ search: '', status: '' });
const rejectModal = reactive({ show: false, id: null, note: '' });
const actionId = ref(null);

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

onMounted(() => {
  resetFormDates();
  fetchList();
});
</script>

<style scoped>
.leave-hub { max-width: 1120px; }
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
}
</style>
