<template>
  <div>
    <div class="page-header">
      <div>
        <h1 class="page-title">Employee List</h1>
        <p class="page-subtitle">
          Master data of vendor personnel used for BAST checks and monthly attendance verification
        </p>
      </div>
      <div class="flex items-center gap-2">
        <button type="button" class="btn btn-outline btn-sm" :disabled="loading" @click="fetchData">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
          Refresh
        </button>
        <router-link to="/ls-hr/employees/create" class="btn btn-primary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
          Create
        </router-link>
      </div>
    </div>

    <div v-if="errorMsg" class="alert alert-error" style="margin-bottom: 16px;">
      <span>⚠️</span> {{ errorMsg }}
    </div>

    <!-- Stats -->
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-card-label">Total Employees</div>
        <div class="stat-card-value">{{ summary.total }}</div>
        <div class="stat-card-sub">All vendors</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">Active</div>
        <div class="stat-card-value" style="color: var(--bc-green-500)">{{ summary.active }}</div>
        <div class="stat-card-sub">Currently working</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">Deactive</div>
        <div class="stat-card-value" style="color: var(--bc-rejected)">{{ summary.deactive }}</div>
        <div class="stat-card-sub">Not active</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">Vendors</div>
        <div class="stat-card-value" style="color: var(--bc-gray-700)">{{ summary.vendors }}</div>
        <div class="stat-card-sub">Registered vendors</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <span class="card-title">Personnel Master Data</span>
        <span class="text-sm text-muted">
          {{ pagination.total }} total · page {{ pagination.page }} of {{ totalPages }}
        </span>
      </div>
      <div class="card-body" style="padding-bottom: 0;">
        <!-- Filter bar -->
        <div class="filter-bar">
          <div class="search-wrap">
            <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <input
              v-model="filters.search"
              class="form-control"
              placeholder="Search Employee Name or NPK…"
              style="max-width: 260px;"
              @input="debouncedFetch"
            />
          </div>
          <input
            v-model="filters.supervisor"
            class="form-control"
            placeholder="Supervisor Name…"
            style="max-width: 220px;"
            @input="debouncedFetch"
            title="Filter by the LS Supervisor's name"
          />
          <select v-model="filters.site" class="form-control" style="max-width: 180px;" @change="resetAndFetch">
            <option value="">All Sites</option>
            <option v-for="s in siteOptions" :key="s" :value="s">{{ s }}</option>
          </select>
          <select v-model="filters.vendor_id" class="form-control" style="max-width: 240px;" @change="resetAndFetch">
            <option value="">All Vendors</option>
            <option v-for="v in vendorOptions" :key="v.id" :value="v.id">{{ v.name }} ({{ v.code }})</option>
          </select>
          <select v-model="filters.status" class="form-control" style="max-width: 160px;" @change="resetAndFetch">
            <option value="">All Status</option>
            <option value="Active">Active</option>
            <option value="Deactive">Deactive</option>
          </select>
          <button type="button" class="btn btn-outline btn-sm" @click="resetFilters">Reset</button>
        </div>
      </div>

      <!-- Table -->
      <div class="table-wrapper employee-table-wrapper" style="border:none; border-radius:0; border-top:1px solid var(--bc-gray-200);">
        <div v-if="loading" class="loading-overlay"><span class="spinner"></span> Loading…</div>
        <table v-else class="employee-table">
          <thead>
            <tr>
              <th class="col-no">No</th>
              <th>Vendor Number</th>
              <th>User Department</th>
              <th>Vendor Name</th>
              <th>Employee ID (NPK)</th>
              <th>SID</th>
              <th>Employee Name</th>
              <th class="col-email">Email</th>
              <th>Position</th>
              <th>Position Group</th>
              <th>Group</th>
              <th>Site</th>
              <th>Supervisor</th>
              <th>User Status</th>
              <th class="col-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="employees.length === 0">
              <td :colspan="15">
                <div class="empty-state">
                  <div class="empty-state-icon">👥</div>
                  <h3>No employees found</h3>
                  <p>Try adjusting your search keywords or filters.</p>
                </div>
              </td>
            </tr>
            <tr v-for="(emp, idx) in employees" :key="emp.id">
              <td class="col-no font-bold">{{ rowNumber(idx) }}</td>
              <td><span class="text-sm font-mono">{{ emp.vendor_number }}</span></td>
              <td>{{ emp.user_department }}</td>
              <td class="font-bold">{{ emp.vendor_name }}</td>
              <td><span class="text-sm font-mono">{{ emp.npk }}</span></td>
              <td>
                <span v-if="emp.sid" class="text-sm font-mono">{{ emp.sid }}</span>
                <span v-else class="text-muted">—</span>
              </td>
              <td class="font-bold">{{ emp.employee_name }}</td>
              <td class="col-email">
                <a
                  v-if="emp.email"
                  :href="`mailto:${emp.email}`"
                  class="email-link"
                  :title="emp.email"
                >{{ emp.email }}</a>
                <span v-else class="text-muted">—</span>
              </td>
              <td>{{ emp.position }}</td>
              <td>{{ emp.position_group }}</td>
              <td>
                <span v-if="emp.employee_group" class="badge badge-group">{{ emp.employee_group }}</span>
                <span v-else class="text-muted">—</span>
              </td>
              <td>{{ emp.site }}</td>
              <td>
                <span v-if="emp.supervisor_name">{{ emp.supervisor_name }}</span>
                <span v-else class="text-muted">—</span>
              </td>
              <td>
                <span class="badge" :class="emp.user_status === 'Active' ? 'badge-active' : 'badge-deactive'">
                  {{ emp.user_status }}
                </span>
              </td>
              <td class="col-actions">
                <div class="icon-actions">
                  <button
                    type="button"
                    class="btn-icon-action"
                    title="Edit employee"
                    @click="goEdit(emp.id)"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div v-if="pagination.total > 0" class="card-body" style="padding-top:12px; border-top:1px solid var(--bc-gray-100);">
        <div class="pagination">
          <span class="pagination-info">
            Showing {{ rangeStart }}–{{ rangeEnd }} of {{ pagination.total }}
          </span>
          <button class="btn btn-ghost btn-sm" :disabled="pagination.page <= 1" @click="changePage(pagination.page - 1)">‹ Prev</button>
          <button class="btn btn-ghost btn-sm" :disabled="pagination.page * pagination.limit >= pagination.total" @click="changePage(pagination.page + 1)">Next ›</button>
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
const errorMsg = ref('');
const employees = ref([]);
const siteOptions = ref([]);
const vendorOptions = ref([]);

const pagination = reactive({ total: 0, page: 1, limit: 25 });
const summary = reactive({ total: 0, active: 0, deactive: 0, vendors: 0 });

const filters = reactive({
  search: '',
  supervisor: '',
  site: '',
  vendor_id: '',
  status: '',
});

const totalPages = computed(() => Math.max(1, Math.ceil(pagination.total / pagination.limit)));
const rangeStart = computed(() => (pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1));
const rangeEnd = computed(() => Math.min(pagination.page * pagination.limit, pagination.total));

const rowNumber = (idx) => (pagination.page - 1) * pagination.limit + idx + 1;

let debounceTimer;
const debouncedFetch = () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    pagination.page = 1;
    fetchData();
  }, 400);
};

const resetAndFetch = () => {
  pagination.page = 1;
  fetchData();
};

const fetchData = async () => {
  loading.value = true;
  errorMsg.value = '';
  try {
    const params = { page: pagination.page, limit: pagination.limit };
    if (filters.search.trim()) params.search = filters.search.trim();
    if (filters.supervisor.trim()) params.supervisor = filters.supervisor.trim();
    if (filters.site) params.site = filters.site;
    if (filters.vendor_id) params.vendor_id = filters.vendor_id;
    if (filters.status) params.status = filters.status;

    const { data } = await api.get('/employees', { params });
    employees.value = Array.isArray(data?.data) ? data.data : [];
    Object.assign(pagination, data?.pagination || { total: 0, page: 1, limit: pagination.limit });

    siteOptions.value = data?.meta?.sites || [];
    vendorOptions.value = data?.meta?.vendors || [];
    Object.assign(summary, data?.meta?.summary || { total: 0, active: 0, deactive: 0, vendors: 0 });
  } catch (err) {
    employees.value = [];
    errorMsg.value =
      err?.response?.data?.message ||
      'Failed to load employees. Please try again.';
  } finally {
    loading.value = false;
  }
};

const changePage = (p) => {
  if (p < 1) return;
  pagination.page = p;
  fetchData();
};

const resetFilters = () => {
  filters.search = '';
  filters.supervisor = '';
  filters.site = '';
  filters.vendor_id = '';
  filters.status = '';
  pagination.page = 1;
  fetchData();
};

const goEdit = (id) => {
  router.push(`/ls-hr/employees/${id}/edit`);
};

onMounted(fetchData);
</script>

<style scoped>
.employee-table-wrapper {
  overflow-x: auto;
  position: relative;
  min-height: 120px;
}

.employee-table {
  min-width: 1500px;
}

.employee-table thead th,
.employee-table tbody td {
  white-space: nowrap;
}

.col-no {
  width: 56px;
  text-align: center;
}

.col-actions {
  width: 90px;
  text-align: center;
}

.col-email {
  width: 220px;
  max-width: 220px;
}

.col-email .email-link {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
  color: var(--bc-green-700);
  text-decoration: none;
  font-size: 13px;
}

.col-email .email-link:hover {
  text-decoration: underline;
  color: var(--bc-green-500);
}

.font-mono {
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, 'Courier New', monospace;
  color: var(--bc-gray-700);
}

.icon-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.btn-icon-action {
  width: 34px;
  height: 34px;
  border-radius: var(--radius);
  border: 1.5px solid var(--bc-gray-200);
  background: var(--bc-white);
  color: var(--bc-gray-600);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.btn-icon-action:hover:not(:disabled) {
  border-color: var(--bc-green-400);
  color: var(--bc-green-700);
  background: var(--bc-green-50);
}

.badge-active {
  background: #d1fae5;
  color: #065f46;
}
.badge-active::before {
  background: #22994a;
}

.badge-deactive {
  background: #fee2e2;
  color: #991b1b;
}
.badge-deactive::before {
  background: #ef4444;
}

.badge-group {
  background: var(--bc-green-50, #ecfdf5);
  color: var(--bc-green-700, #047857);
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, 'Courier New', monospace;
  letter-spacing: 0.04em;
}
.badge-group::before {
  background: var(--bc-green-500, #22994a);
}
</style>
