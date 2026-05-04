<template>
  <div>
    <div class="page-header">
      <div>
        <h1 class="page-title">Monthly Attendance Recap</h1>
        <p class="page-subtitle">Monthly recap of attendance and leave data for supervised LS employees.</p>
      </div>
    </div>

    <div class="card">
      <div class="card-body">
        <div class="filter-bar">
          <select v-model.number="filters.month" class="form-control" style="max-width:160px;">
            <option v-for="m in monthOptions" :key="m.value" :value="m.value">{{ m.label }}</option>
          </select>
          <input v-model.number="filters.year" type="number" min="2000" max="2100" class="form-control" style="max-width:120px;" />
          <button class="btn btn-primary btn-sm" @click="fetchRecap" :disabled="loading">Load Recap</button>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <span class="card-title">Recap Table</span>
      </div>
      <div class="table-wrapper" style="border:none;border-radius:0;border-top:1px solid var(--bc-gray-200);">
        <div v-if="loading" class="loading-overlay"><span class="spinner"></span> Loading…</div>
        <template v-else>
          <table>
            <thead>
              <tr>
                <th style="width:44px;"></th>
                <th>Employee</th>
                <th>NIK</th>
                <th>Clock In Days</th>
                <th>Attendance Records</th>
                <th>Approved</th>
                <th>Pending</th>
                <th>Rejected</th>
                <th>Cuti</th>
                <th>Izin</th>
                <th>Sakit</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="rows.length === 0">
                <td colspan="11">
                  <div class="empty-state">
                    <div class="empty-state-icon">📋</div>
                    <h3>No recap data</h3>
                    <p>No supervised LS records found for selected month.</p>
                  </div>
                </td>
              </tr>
              <template v-for="row in rows" :key="row.user_id">
                <tr>
                  <td>
                    <button
                      type="button"
                      class="btn-expand"
                      :aria-expanded="expandedUserId === row.user_id"
                      :title="(row.leave_requests || []).length ? 'Leave detail' : 'No leave in range'"
                      :disabled="!(row.leave_requests || []).length"
                      @click="toggleExpand(row.user_id)"
                    >
                      {{ expandedUserId === row.user_id ? '▼' : '▶' }}
                    </button>
                  </td>
                  <td>
                    <div class="font-bold">{{ row.employee_name }}</div>
                    <div class="text-sm text-muted">{{ row.employee_id || '-' }}</div>
                  </td>
                  <td><span class="text-sm font-mono">{{ row.nik || '—' }}</span></td>
                  <td><strong>{{ row.total_clock_in_days }}</strong></td>
                  <td>{{ row.total_attendance_records }}</td>
                  <td><span class="badge badge-approved">{{ row.approved_attendance }}</span></td>
                  <td><span class="badge badge-pending">{{ row.pending_attendance }}</span></td>
                  <td><span class="badge badge-rejected">{{ row.rejected_attendance }}</span></td>
                  <td>{{ row.leave_cuti }}</td>
                  <td>{{ row.leave_izin }}</td>
                  <td>{{ row.leave_sakit }}</td>
                </tr>
                <tr v-if="expandedUserId === row.user_id" class="leave-detail-row">
                  <td colspan="11">
                    <div class="leave-detail-panel">
                      <h4 class="leave-detail-title">Leave requests (overlap bulan)</h4>
                      <p v-if="!(row.leave_requests || []).length" class="text-muted text-sm" style="margin:0;">
                        Tidak ada pengajuan cuti/izin/sakit yang overlap periode bulan ini.
                      </p>
                      <div v-else class="table-wrapper leave-detail-table">
                        <table>
                          <thead>
                            <tr>
                              <th>Jenis</th>
                              <th>Periode</th>
                              <th>Hari</th>
                              <th>Status</th>
                              <th>Alasan</th>
                              <th>Catatan penolakan</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr v-for="lr in row.leave_requests" :key="lr.id">
                              <td><span class="badge badge-type">{{ leaveTypeLabel(lr.request_type) }}</span></td>
                              <td>{{ fmtRange(lr.start_date, lr.end_date) }}</td>
                              <td>{{ countLeaveDays(lr.start_date, lr.end_date) }}</td>
                              <td><span class="badge" :class="`badge-${lr.status}`">{{ lr.status }}</span></td>
                              <td class="cell-reason-wrap">{{ lr.reason || '—' }}</td>
                              <td class="cell-reason-wrap">{{ lr.rejection_note || '—' }}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import api from '../../utils/api';

const now = new Date();
const loading = ref(false);
const rows = ref([]);
const expandedUserId = ref(null);
const filters = reactive({
  month: now.getMonth() + 1,
  year: now.getFullYear(),
});

const monthOptions = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

const toNumber = (v) => Number.parseInt(v, 10) || 0;

const leaveTypeLabel = (t) => ({ cuti: 'Cuti', izin: 'Izin', sakit: 'Sakit' }[t] || t);

const fmtShort = (d) => new Date(d).toLocaleDateString('en-ID', { day: '2-digit', month: 'short', year: 'numeric' });
const fmtRange = (s, e) => {
  if (s === e) return fmtShort(s);
  return `${fmtShort(s)} → ${fmtShort(e)}`;
};

const countLeaveDays = (start, end) => {
  const a = new Date(`${start}T12:00:00`).getTime();
  const b = new Date(`${end}T12:00:00`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return '—';
  const d = Math.floor((b - a) / 86400000) + 1;
  return d < 1 ? '—' : d;
};

const toggleExpand = (userId) => {
  expandedUserId.value = expandedUserId.value === userId ? null : userId;
};

const fetchRecap = async () => {
  loading.value = true;
  expandedUserId.value = null;
  try {
    const { data } = await api.get('/attendance/team/monthly-recap', {
      params: {
        month: filters.month,
        year: filters.year,
      },
    });
    rows.value = (data?.data || []).map((row) => ({
      ...row,
      total_clock_in_days: toNumber(row.total_clock_in_days),
      total_attendance_records: toNumber(row.total_attendance_records),
      approved_attendance: toNumber(row.approved_attendance),
      pending_attendance: toNumber(row.pending_attendance),
      rejected_attendance: toNumber(row.rejected_attendance),
      leave_cuti: toNumber(row.leave_cuti),
      leave_izin: toNumber(row.leave_izin),
      leave_sakit: toNumber(row.leave_sakit),
      leave_requests: Array.isArray(row.leave_requests) ? row.leave_requests : [],
    }));
  } catch (err) {
    rows.value = [];
    window.alert(err?.response?.data?.message || 'Failed to load monthly recap.');
  } finally {
    loading.value = false;
  }
};

onMounted(fetchRecap);
</script>

<style scoped>
.btn-expand {
  width: 36px;
  height: 32px;
  border: 1px solid var(--bc-gray-200);
  border-radius: var(--radius);
  background: var(--bc-white);
  cursor: pointer;
  font-size: 11px;
  color: var(--bc-gray-700);
}
.btn-expand:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.leave-detail-row td {
  padding: 0 !important;
  border-top: none;
  background: var(--bc-gray-50);
}
.leave-detail-panel {
  padding: 14px 18px 18px;
  border-top: 1px solid var(--bc-gray-200);
}
.leave-detail-title {
  margin: 0 0 10px;
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--bc-green-700);
}
.leave-detail-table {
  border: 1px solid var(--bc-gray-200);
  border-radius: var(--radius);
  background: var(--bc-white);
}
.leave-detail-table table {
  width: 100%;
  font-size: 13px;
}
.leave-detail-table th,
.leave-detail-table td {
  padding: 8px 10px;
}
.badge-type {
  background: var(--bc-gray-100);
  color: var(--bc-gray-700);
  font-weight: 600;
  text-transform: none;
}
.cell-reason-wrap {
  max-width: 220px;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--bc-gray-700);
}
</style>
