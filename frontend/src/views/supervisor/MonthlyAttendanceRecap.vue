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
        <table v-else>
          <thead>
            <tr>
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
              <td colspan="10">
                <div class="empty-state">
                  <div class="empty-state-icon">📋</div>
                  <h3>No recap data</h3>
                  <p>No supervised LS records found for selected month.</p>
                </div>
              </td>
            </tr>
            <tr v-for="row in rows" :key="row.user_id">
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
          </tbody>
        </table>
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

const fetchRecap = async () => {
  loading.value = true;
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
