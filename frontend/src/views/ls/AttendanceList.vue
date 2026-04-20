<template>
  <div>
    <div class="page-header">
      <div>
        <h1 class="page-title">Attendance List</h1>
        <p class="page-subtitle">Your daily attendance records</p>
      </div>
    </div>

    <!-- Stats -->
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-card-label">Total Days</div>
        <div class="stat-card-value">{{ pagination.total }}</div>
        <div class="stat-card-sub">This period</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">Approved</div>
        <div class="stat-card-value" style="color:var(--bc-green-500)">{{ stats.approved }}</div>
        <div class="stat-card-sub">Records</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">Pending</div>
        <div class="stat-card-value" style="color:var(--bc-pending)">{{ stats.pending }}</div>
        <div class="stat-card-sub">Awaiting review</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">Rejected</div>
        <div class="stat-card-value" style="color:var(--bc-rejected)">{{ stats.rejected }}</div>
        <div class="stat-card-sub">Records</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <span class="card-title">Records</span>
      </div>
      <div class="card-body" style="padding-bottom:0;">
        <!-- Filter bar -->
        <div class="filter-bar">
          <div class="search-wrap">
            <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            <input v-model="filters.search" @input="debouncedFetch" class="form-control" placeholder="Search date or NIK…" style="max-width:240px;" />
          </div>
          <input v-model="filters.start_date" @change="fetchData" type="date" class="form-control" style="max-width:160px;" placeholder="Start date" />
          <input v-model="filters.end_date"   @change="fetchData" type="date" class="form-control" style="max-width:160px;" placeholder="End date" />
          <button class="btn btn-outline btn-sm" @click="clearFilters">Reset</button>
        </div>
      </div>

      <!-- Table -->
      <div class="table-wrapper" style="border:none;border-radius:0;border-top:1px solid var(--bc-gray-200);">
        <div v-if="loading" class="loading-overlay"><span class="spinner"></span> Loading…</div>
        <table v-else>
          <thead>
            <tr>
              <th>Date</th>
              <th>NIK</th>
              <th>Clock In</th>
              <th>Clock Out</th>
              <th>Duration</th>
              <th>OT</th>
              <th>Location (In)</th>
              <th>Status</th>
              <th style="width:120px;">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="records.length === 0">
              <td colspan="9">
                <div class="empty-state">
                  <div class="empty-state-icon">📅</div>
                  <h3>No attendance records found</h3>
                  <p>Try adjusting the date range filters</p>
                </div>
              </td>
            </tr>
            <tr v-for="r in records" :key="r.id">
              <td>
                <div class="font-bold">{{ formatDate(r.attendance_date) }}</div>
                <div class="text-sm text-muted">{{ getDayName(r.attendance_date) }}</div>
              </td>
              <td><span class="text-sm font-mono">{{ r.nik || '—' }}</span></td>
              <td>
                <div class="time-cell clock-in">{{ r.clock_in_time || '—' }}</div>
              </td>
              <td>
                <div class="time-cell clock-out">{{ r.clock_out_time || '—' }}</div>
              </td>
              <td>
                <span v-if="r.clock_in_time && r.clock_out_time" class="font-bold">
                  {{ calcDuration(r.clock_in_time, r.clock_out_time) }}
                </span>
                <span v-else class="text-muted">—</span>
              </td>
              <td>
                <template v-if="r.ot_start_time && r.ot_end_time">
                  <div class="text-sm font-bold" style="color:#b45309;">{{ fmtHm(r.ot_start_time) }}–{{ fmtHm(r.ot_end_time) }}</div>
                  <div class="text-xs text-muted">{{ calcDuration(fmtHm(r.ot_start_time), fmtHm(r.ot_end_time)) }}</div>
                </template>
                <span v-else class="text-muted">—</span>
              </td>
              <td>
                <div v-if="r.clock_in_lat" class="location-cell">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  {{ Number(r.clock_in_lat).toFixed(5) }}, {{ Number(r.clock_in_lng).toFixed(5) }}
                </div>
                <span v-else class="text-muted">—</span>
              </td>
              <td><span class="badge" :class="`badge-${r.status}`">{{ r.status }}</span></td>
              <td>
                <router-link :to="`/ls/attendance/${r.id}`" class="btn btn-outline btn-sm">Detail</router-link>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div v-if="pagination.total > 0" class="card-body" style="padding-top:12px;border-top:1px solid var(--bc-gray-100);">
        <div class="pagination">
          <span class="pagination-info">
            Showing {{ ((pagination.page-1)*pagination.limit)+1 }}–{{ Math.min(pagination.page*pagination.limit, pagination.total) }} of {{ pagination.total }}
          </span>
          <button class="btn btn-ghost btn-sm" :disabled="pagination.page <= 1" @click="changePage(pagination.page-1)">‹ Prev</button>
          <button class="btn btn-ghost btn-sm" :disabled="pagination.page * pagination.limit >= pagination.total" @click="changePage(pagination.page+1)">Next ›</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import api from '../../utils/api';

const loading = ref(false);
const records = ref([]);
const pagination = reactive({ total: 0, page: 1, limit: 15 });
const filters = reactive({ search: '', start_date: '', end_date: '' });

const stats = computed(() => ({
  approved: records.value.filter(r => r.status === 'approved').length,
  pending:  records.value.filter(r => r.status === 'pending').length,
  rejected: records.value.filter(r => r.status === 'rejected').length,
}));

let debounceTimer;
const debouncedFetch = () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => { pagination.page = 1; fetchData(); }, 400);
};

const fetchData = async () => {
  loading.value = true;
  try {
    const params = { page: pagination.page, limit: pagination.limit };
    if (filters.search.trim()) params.search = filters.search.trim();
    if (filters.start_date) params.start_date = filters.start_date;
    if (filters.end_date)   params.end_date   = filters.end_date;
    const { data } = await api.get('/attendance/my', { params });
    records.value = data.data;
    Object.assign(pagination, data.pagination);
  } catch { /* silent */ } finally { loading.value = false; }
};

const changePage = (p) => { pagination.page = p; fetchData(); };
const clearFilters = () => {
  filters.search = ''; filters.start_date = ''; filters.end_date = '';
  pagination.page = 1; fetchData();
};

const formatDate = (d) => new Date(d).toLocaleDateString('en-ID', { day: '2-digit', month: 'short', year: 'numeric' });
const getDayName = (d) => new Date(d).toLocaleDateString('en-ID', { weekday: 'long' });
const fmtHm = (t) => (t ? String(t).slice(0, 5) : '');
const calcDuration = (inT, outT) => {
  const [ih, im] = inT.split(':').map(Number);
  const [oh, om] = outT.split(':').map(Number);
  const mins = (oh * 60 + om) - (ih * 60 + im);
  return mins < 0 ? '—' : `${Math.floor(mins/60)}h ${mins%60}m`;
};

onMounted(fetchData);
</script>

<style scoped>
.time-cell { font-size: 14px; font-weight: 700; }
.clock-in  { color: var(--bc-green-600); }
.clock-out { color: var(--bc-rejected); }
.location-cell { display: flex; align-items: center; gap: 4px; font-size: 12px; color: var(--bc-gray-500); }
</style>
