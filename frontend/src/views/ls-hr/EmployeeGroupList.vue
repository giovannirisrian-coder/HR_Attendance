<template>
  <div>
    <div class="page-header">
      <div>
        <h1 class="page-title">Employee Group</h1>
        <p class="page-subtitle">Manage employee group master data</p>
      </div>
      <div class="flex items-center gap-2">
        <button type="button" class="btn btn-outline btn-sm" :disabled="loading" @click="fetchData">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
          Refresh
        </button>
        <router-link to="/ls-hr/master-data/employee-groups/create" class="btn btn-primary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
          Create
        </router-link>
      </div>
    </div>

    <div v-if="errorMsg" class="alert alert-error" style="margin-bottom: 16px;">
      <span>⚠️</span> {{ errorMsg }}
    </div>

    <div class="card">
      <div class="card-header">
        <span class="card-title">Employee Groups</span>
        <span class="text-sm text-muted">{{ groups.length }} total</span>
      </div>
      <div class="table-wrapper" style="border:none; border-radius:0;">
        <div v-if="loading" class="loading-overlay"><span class="spinner"></span> Loading…</div>
        <table v-else class="data-table">
          <thead>
            <tr>
              <th>Employee Group</th>
              <th class="col-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="groups.length === 0">
              <td colspan="2">
                <div class="empty-state">
                  <div class="empty-state-icon">📋</div>
                  <h3>No employee groups yet</h3>
                  <p>Create your first employee group to use in the Employee List forms.</p>
                </div>
              </td>
            </tr>
            <tr v-for="group in groups" :key="group.id">
              <td class="font-bold">{{ group.employee_group }}</td>
              <td class="col-actions">
                <div class="icon-actions">
                  <button
                    type="button"
                    class="btn-icon-action"
                    title="Edit employee group"
                    @click="goEdit(group.id)"
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
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import api from '../../utils/api';

const router = useRouter();
const groups = ref([]);
const loading = ref(false);
const errorMsg = ref('');

const fetchData = async () => {
  loading.value = true;
  errorMsg.value = '';
  try {
    const { data: res } = await api.get('/employee-groups');
    groups.value = res?.data || [];
  } catch (err) {
    errorMsg.value = err?.response?.data?.message || 'Failed to load employee groups.';
  } finally {
    loading.value = false;
  }
};

const goEdit = (id) => {
  router.push(`/ls-hr/master-data/employee-groups/${id}/edit`);
};

onMounted(fetchData);
</script>

<style scoped>
.data-table {
  width: 100%;
  border-collapse: collapse;
}
.data-table th,
.data-table td {
  padding: 12px 16px;
  text-align: left;
  border-bottom: 1px solid var(--bc-gray-100);
}
.data-table th {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--bc-gray-500);
  background: var(--bc-gray-50);
}
.col-actions {
  width: 100px;
  text-align: center;
}
.icon-actions {
  display: flex;
  justify-content: center;
  gap: 6px;
}
.btn-icon-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 1px solid var(--bc-gray-200);
  border-radius: 8px;
  background: #fff;
  color: var(--bc-green-700);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.btn-icon-action:hover {
  background: var(--bc-green-50);
  border-color: var(--bc-green-300);
}
</style>
