<template>
  <div>
    <div class="page-header">
      <div>
        <h1 class="page-title">Report List</h1>
        <p class="page-subtitle">Monthly attendance aggregated for all LS employees under your vendor</p>
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
        <span class="card-title">{{ vendor?.name || 'Vendor' }} · Monthly overview</span>
      </div>
      <div class="table-wrapper" style="border:none;">
        <div v-if="loading" class="loading-overlay"><span class="spinner"></span> Loading…</div>
        <table v-else>
          <thead>
            <tr>
              <th>Month</th>
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
  };
  return map[s] || s;
};

const workflowBadge = (s) => {
  if (s === 'pending_ls_hr') return 'badge-pending';
  if (s === 'hr_rejected') return 'badge-rejected';
  if (s === 'pending_ssu') return 'badge-submitted';
  if (s === 'invoice_on_process') return 'badge-invoice-process';
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
