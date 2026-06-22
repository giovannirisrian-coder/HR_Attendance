<template>
  <div>
    <div class="page-header">
      <div>
        <h1 class="page-title">Report List</h1>
        <p class="page-subtitle">
          Monthly attendance aggregated for all LS employees under your vendor
          <span v-if="vendor?.close_book_date_label" class="close-book-hint">
            · Close book: {{ vendor.close_book_date_label }}
          </span>
        </p>
      </div>
      <div class="flex items-center gap-2">
        <span class="calendar-label" title="Year Filter" aria-label="Year filter">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="4" width="18" height="18" rx="2"></rect>
            <path d="M16 2v4M8 2v4M3 10h18"></path>
          </svg>
        </span>
        <select v-model="selectedYear" @change="fetchData" class="form-control" style="max-width:110px;">
          <option v-for="y in yearOptions" :key="y" :value="y">{{ y }}</option>
        </select>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <span class="card-title">{{ vendor?.name || 'Vendor' }} · Monthly overview</span>
      </div>
      <div class="table-wrapper" style="border:none;">
        <div v-if="loading" class="loading-overlay"><span class="spinner"></span> Loading…</div>
        <table v-else>
          <thead>
            <tr>
              <th>Month</th>
              <th>Reporting period</th>
              <th>LS headcount</th>
              <th>Attendance rows</th>
              <th>Approved rows</th>
              <th>Workflow</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.report_month">
              <td class="font-bold">{{ monthName(row.report_month) }}</td>
              <td class="text-sm text-muted period-cell">{{ row.period_label || '—' }}</td>
              <td>{{ row.ls_count }}</td>
              <td>{{ row.attendance_rows }}</td>
              <td>{{ row.approved_rows }}</td>
              <td>
                <span v-if="!row.workflow_status" class="badge badge-draft">Not submitted</span>
                <span v-else class="badge" :class="workflowBadge(row.workflow_status)">{{ workflowLabel(row.workflow_status) }}</span>
              </td>
              <td>
                <button type="button" class="btn btn-outline btn-sm" @click="goDetail(row.report_month)">View detail</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import api from '../../utils/api';

const router = useRouter();
const loading = ref(false);
const vendor = ref(null);
const data = ref([]);
const currentYear = new Date().getFullYear();
const selectedYear = ref(currentYear);
const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i);

const rows = computed(() => data.value || []);

const monthName = (m) => ['January','February','March','April','May','June','July','August','September','October','November','December'][m - 1];

const workflowLabel = (s) => {
  const map = {
    draft: 'Draft',
    pending_ls_hr: 'With LS HR',
    hr_rejected: 'Rejected (LS HR)',
    pending_ssu: 'With SSU',
    invoice_on_process: 'Invoice On Process',
    paid: 'Paid',
  };
  return map[s] || s;
};

const workflowBadge = (s) => {
  if (s === 'pending_ls_hr') return 'badge-pending';
  if (s === 'hr_rejected') return 'badge-rejected';
  if (s === 'pending_ssu') return 'badge-submitted';
  if (s === 'invoice_on_process') return 'badge-invoice-process';
  if (s === 'paid') return 'badge-approved';
  return 'badge-draft';
};

const fetchData = async () => {
  loading.value = true;
  try {
    const { data: res } = await api.get('/reports/vendor/summary', { params: { year: selectedYear.value } });
    vendor.value = res.vendor;
    data.value = res.data || [];
  } catch {
    vendor.value = null;
    data.value = [];
  } finally {
    loading.value = false;
  }
};

const goDetail = (month) => {
  router.push(`/vendor/reports/${month}/${selectedYear.value}/detail`);
};

onMounted(fetchData);
</script>

<style scoped>
.calendar-label {
  width: 32px;
  height: 32px;
  border: 1px solid var(--bc-gray-200);
  border-radius: var(--radius);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--bc-green-700);
  background: var(--bc-green-50);
}
.close-book-hint {
  color: var(--bc-green-700);
  font-weight: 600;
}
.period-cell {
  white-space: nowrap;
  font-size: 0.85rem;
}
</style>
