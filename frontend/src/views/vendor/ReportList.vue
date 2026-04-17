<template>
  <div>
    <div class="page-header">
      <div>
        <h1 class="page-title">Report List</h1>
        <p class="page-subtitle">Monthly attendance summaries for your LS employees</p>
      </div>
      <div class="flex items-center gap-2">
        <label class="form-label" style="margin:0;white-space:nowrap;">Year:</label>
        <select v-model="selectedYear" @change="fetchData" class="form-control" style="max-width:110px;">
          <option v-for="y in yearOptions" :key="y" :value="y">{{ y }}</option>
        </select>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <span class="card-title">LS Employees</span>
      </div>
      <div class="card-body" style="padding-bottom:0;">
        <div class="filter-bar">
          <div class="search-wrap">
            <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            <input v-model="filters.search" @input="debouncedFetch" class="form-control" placeholder="Search employee…" style="max-width:220px;" />
          </div>
          <button class="btn btn-outline btn-sm" @click="clearFilters">Reset</button>
        </div>
      </div>

      <div class="table-wrapper" style="border:none;border-radius:0;border-top:1px solid var(--bc-gray-200);">
        <div v-if="loading" class="loading-overlay"><span class="spinner"></span> Loading…</div>
        <table v-else>
          <thead>
            <tr>
              <th>Employee</th>
              <th v-for="m in months" :key="m.num">{{ m.short }}</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="employees.length === 0">
              <td :colspan="14">
                <div class="empty-state">
                  <div class="empty-state-icon">👥</div>
                  <h3>No employees found</h3>
                  <p>No LS employees are assigned to your vendor account.</p>
                </div>
              </td>
            </tr>
            <tr v-for="emp in employees" :key="emp.user_id">
              <td>
                <div class="font-bold">{{ emp.employee_name }}</div>
                <div class="text-sm text-muted">{{ emp.employee_id }}</div>
              </td>
              <td v-for="m in months" :key="m.num">
                <div class="month-cell">
                  <span
                    class="badge"
                    :class="getMonthBadge(emp.user_id, m.num)"
                    :title="getMonthStatus(emp.user_id, m.num)"
                  >{{ getMonthDays(emp.user_id, m.num) }}</span>
                </div>
              </td>
              <td>
                <div class="action-btns">
                  <button
                    v-for="m in activeMonths"
                    :key="m.num"
                    class="btn btn-outline btn-sm"
                    @click="goToDetail(emp.user_id, m.num)"
                    :title="`View ${m.short} ${selectedYear}`"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    {{ m.short }}
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="pagination.total > 0" class="card-body" style="padding-top:12px;border-top:1px solid var(--bc-gray-100);">
        <div class="pagination">
          <span class="pagination-info">{{ pagination.total }} employees</span>
          <button class="btn btn-ghost btn-sm" :disabled="pagination.page<=1" @click="changePage(pagination.page-1)">‹ Prev</button>
          <button class="btn btn-ghost btn-sm" :disabled="pagination.page*pagination.limit>=pagination.total" @click="changePage(pagination.page+1)">Next ›</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import api from '../../utils/api';

const router = useRouter();
const loading = ref(false);
const allData = ref([]);
const pagination = reactive({ total: 0, page: 1, limit: 20 });
const filters = reactive({ search: '' });
const currentYear = new Date().getFullYear();
const selectedYear = ref(currentYear);

const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i);

const months = [
  { num: 1,  short: 'Jan' }, { num: 2,  short: 'Feb' }, { num: 3,  short: 'Mar' },
  { num: 4,  short: 'Apr' }, { num: 5,  short: 'May' }, { num: 6,  short: 'Jun' },
  { num: 7,  short: 'Jul' }, { num: 8,  short: 'Aug' }, { num: 9,  short: 'Sep' },
  { num: 10, short: 'Oct' }, { num: 11, short: 'Nov' }, { num: 12, short: 'Dec' },
];

const activeMonths = computed(() => {
  const now = new Date();
  return selectedYear.value < currentYear
    ? months
    : months.filter(m => m.num <= now.getMonth() + 1);
});

// Deduplicate – group by user
const employees = computed(() => {
  const map = {};
  for (const row of allData.value) {
    if (!map[row.user_id]) {
      map[row.user_id] = { user_id: row.user_id, employee_name: row.employee_name, employee_id: row.employee_id, months: {} };
    }
    if (row.report_month) {
      map[row.user_id].months[row.report_month] = row;
    }
  }
  return Object.values(map);
});

const getMonthReport = (userId, month) => {
  const emp = employees.value.find(e => e.user_id === userId);
  return emp?.months?.[month] || null;
};

const getMonthDays = (userId, month) => {
  const r = getMonthReport(userId, month);
  return r ? r.approved_days || 0 : '—';
};

const getMonthBadge = (userId, month) => {
  const r = getMonthReport(userId, month);
  if (!r) return 'badge-draft';
  if (r.report_status === 'submitted') return 'badge-submitted';
  return 'badge-approved';
};

const getMonthStatus = (userId, month) => {
  const r = getMonthReport(userId, month);
  if (!r || !r.report_month) return 'No data';
  return `${r.approved_days} approved days – ${r.report_status || 'draft'}`;
};

let debounceTimer;
const debouncedFetch = () => { clearTimeout(debounceTimer); debounceTimer = setTimeout(fetchData, 400); };

const fetchData = async () => {
  loading.value = true;
  try {
    const params = { page: pagination.page, limit: pagination.limit, year: selectedYear.value };
    if (filters.search) params.search = filters.search;
    const { data } = await api.get('/reports', { params });
    allData.value = data.data;
    Object.assign(pagination, data.pagination);
  } catch { /* silent */ } finally { loading.value = false; }
};

const changePage = (p) => { pagination.page = p; fetchData(); };
const clearFilters = () => { filters.search = ''; pagination.page = 1; fetchData(); };

const goToDetail = (userId, month) => {
  router.push(`/vendor/reports/${userId}/${month}/${selectedYear.value}/detail`);
};

onMounted(fetchData);
</script>

<style scoped>
.month-cell { text-align: center; }
.action-btns { display: flex; gap: 4px; flex-wrap: wrap; }
</style>
