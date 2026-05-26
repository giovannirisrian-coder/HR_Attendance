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
        <router-link to="/ls-hr/employees/create" class="btn btn-primary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
          Create
        </router-link>
      </div>
    </div>

    <!-- Stats -->
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-card-label">Total Employees</div>
        <div class="stat-card-value">{{ employees.length }}</div>
        <div class="stat-card-sub">All vendors</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">Active</div>
        <div class="stat-card-value" style="color: var(--bc-green-500)">{{ activeCount }}</div>
        <div class="stat-card-sub">Currently working</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">Deactive</div>
        <div class="stat-card-value" style="color: var(--bc-rejected)">{{ deactiveCount }}</div>
        <div class="stat-card-sub">Not active</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">Vendors</div>
        <div class="stat-card-value" style="color: var(--bc-gray-700)">{{ vendorCount }}</div>
        <div class="stat-card-sub">Registered vendors</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <span class="card-title">Personnel Master Data</span>
        <span class="text-sm text-muted">{{ filteredEmployees.length }} of {{ employees.length }} shown</span>
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
              placeholder="Search Employee Name or NIK…"
              style="max-width: 260px;"
            />
          </div>
          <input
            v-model="filters.supervisor"
            class="form-control"
            placeholder="Supervisor Name…"
            style="max-width: 200px;"
          />
          <select v-model="filters.site" class="form-control" style="max-width: 180px;">
            <option value="">All Sites</option>
            <option v-for="s in siteOptions" :key="s" :value="s">{{ s }}</option>
          </select>
          <select v-model="filters.vendor" class="form-control" style="max-width: 220px;">
            <option value="">All Vendors</option>
            <option v-for="v in vendorOptions" :key="v" :value="v">{{ v }}</option>
          </select>
          <select v-model="filters.status" class="form-control" style="max-width: 160px;">
            <option value="">All Status</option>
            <option value="Active">Active</option>
            <option value="Deactive">Deactive</option>
          </select>
          <button type="button" class="btn btn-outline btn-sm" @click="resetFilters">Reset</button>
        </div>
      </div>

      <!-- Table -->
      <div class="table-wrapper employee-table-wrapper" style="border:none; border-radius:0; border-top:1px solid var(--bc-gray-200);">
        <table class="employee-table">
          <thead>
            <tr>
              <th class="col-no">No</th>
              <th>Vendor Number</th>
              <th>User Department</th>
              <th>Department Title</th>
              <th>Vendor Name</th>
              <th>Employment Status</th>
              <th>PO Number</th>
              <th>PO Period 1</th>
              <th>PO Period 2</th>
              <th>DIC (HRO)</th>
              <th>Cost Center</th>
              <th>Employee ID (NPK)</th>
              <th>Employee Name</th>
              <th>Position</th>
              <th>Position Group</th>
              <th>Category</th>
              <th>Site</th>
              <th>Supervisor NIK</th>
              <th>Supervisor Name</th>
              <th>User Status</th>
              <th class="col-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="filteredEmployees.length === 0">
              <td :colspan="21">
                <div class="empty-state">
                  <div class="empty-state-icon">👥</div>
                  <h3>No employees found</h3>
                  <p>Try adjusting your search keywords or filters.</p>
                </div>
              </td>
            </tr>
            <tr v-for="(emp, idx) in filteredEmployees" :key="emp.id">
              <td class="col-no font-bold">{{ idx + 1 }}</td>
              <td><span class="text-sm font-mono">{{ emp.vendor_number }}</span></td>
              <td>{{ emp.user_department }}</td>
              <td>{{ emp.department_title }}</td>
              <td class="font-bold">{{ emp.vendor_name }}</td>
              <td>{{ emp.employment_status }}</td>
              <td><span class="text-sm font-mono">{{ emp.po_number }}</span></td>
              <td class="text-sm">{{ formatDate(emp.po_period_1) }}</td>
              <td class="text-sm">{{ formatDate(emp.po_period_2) }}</td>
              <td>{{ emp.dic_hro }}</td>
              <td><span class="text-sm font-mono">{{ emp.cost_center }}</span></td>
              <td><span class="text-sm font-mono">{{ emp.employee_id }}</span></td>
              <td class="font-bold">{{ emp.employee_name }}</td>
              <td>{{ emp.position }}</td>
              <td>{{ emp.position_group }}</td>
              <td>{{ emp.category }}</td>
              <td>{{ emp.site }}</td>
              <td><span class="text-sm font-mono">{{ emp.supervisor_nik }}</span></td>
              <td>{{ emp.supervisor_name }}</td>
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
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue';
import { useRouter } from 'vue-router';
import { MOCK_EMPLOYEES } from './mockEmployees';

const router = useRouter();

const employees = ref([...MOCK_EMPLOYEES]);

const filters = reactive({
  search: '',
  supervisor: '',
  site: '',
  vendor: '',
  status: '',
});

const siteOptions = computed(() => {
  const set = new Set(employees.value.map((e) => e.site).filter(Boolean));
  return Array.from(set).sort();
});

const vendorOptions = computed(() => {
  const set = new Set(employees.value.map((e) => e.vendor_name).filter(Boolean));
  return Array.from(set).sort();
});

const filteredEmployees = computed(() => {
  const search = filters.search.trim().toLowerCase();
  const supervisor = filters.supervisor.trim().toLowerCase();

  return employees.value.filter((emp) => {
    if (search) {
      const matchName = emp.employee_name.toLowerCase().includes(search);
      const matchNik = String(emp.employee_id).toLowerCase().includes(search);
      if (!matchName && !matchNik) return false;
    }
    if (supervisor && !emp.supervisor_name.toLowerCase().includes(supervisor)) return false;
    if (filters.site && emp.site !== filters.site) return false;
    if (filters.vendor && emp.vendor_name !== filters.vendor) return false;
    if (filters.status && emp.user_status !== filters.status) return false;
    return true;
  });
});

const activeCount = computed(() => employees.value.filter((e) => e.user_status === 'Active').length);
const deactiveCount = computed(() => employees.value.filter((e) => e.user_status === 'Deactive').length);
const vendorCount = computed(() => new Set(employees.value.map((e) => e.vendor_name)).size);

const resetFilters = () => {
  filters.search = '';
  filters.supervisor = '';
  filters.site = '';
  filters.vendor = '';
  filters.status = '';
};

const goEdit = (id) => {
  router.push(`/ls-hr/employees/${id}/edit`);
};

const formatDate = (d) => {
  if (!d) return '—';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleDateString('en-ID', { day: '2-digit', month: 'short', year: 'numeric' });
};
</script>

<style scoped>
.employee-table-wrapper {
  overflow-x: auto;
}

.employee-table {
  min-width: 2400px;
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
</style>
