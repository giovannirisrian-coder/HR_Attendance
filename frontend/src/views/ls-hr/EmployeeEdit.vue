<template>
  <div>
    <div class="page-header">
      <div>
        <h1 class="page-title">
          Edit User<span v-if="employee">  -  {{ employee.employee_name }}</span>
        </h1>
        <p class="page-subtitle">
          <template v-if="employee">
            Update master data for <strong>{{ employee.npk }}</strong> · {{ employee.vendor_name }}
          </template>
          <template v-else-if="!loading">
            The selected employee could not be found.
          </template>
          <template v-else>
            Loading employee details…
          </template>
        </p>
      </div>
      <div class="flex items-center gap-2">
        <span
          v-if="employee"
          class="badge"
          :class="employee.user_status === 'Active' ? 'badge-active' : 'badge-deactive'"
        >
          {{ employee.user_status }}
        </span>
        <router-link to="/ls-hr/employees" class="btn btn-outline btn-sm">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Back to List
        </router-link>
      </div>
    </div>

    <div v-if="toast" class="alert alert-success" style="margin-bottom: 16px;">
      <span>✅</span> {{ toast }}
    </div>

    <!-- Loading state -->
    <div v-if="loading" class="card">
      <div class="card-body" style="padding: 60px 24px;">
        <div class="loading-overlay"><span class="spinner"></span> Loading employee details…</div>
      </div>
    </div>

    <!-- Not found -->
    <div v-else-if="!employee" class="card">
      <div class="card-body">
        <div class="empty-state">
          <div class="empty-state-icon">🔍</div>
          <h3>Employee not found</h3>
          <p>
            <template v-if="loadError">{{ loadError }}</template>
            <template v-else>The user with ID #{{ routeId }} does not exist.</template>
          </p>
          <div style="margin-top: 16px;">
            <router-link to="/ls-hr/employees" class="btn btn-primary">Return to Employee List</router-link>
          </div>
        </div>
      </div>
    </div>

    <!-- Form -->
    <div v-else class="card">
      <div class="card-header">
        <span class="card-title">Edit User Form</span>
        <span class="text-sm text-muted">All fields are optional — update only the information that needs to change.</span>
      </div>
      <div class="card-body">
        <EmployeeForm
          :initial-data="employee"
          submit-label="Save Changes"
          :submitting="submitting"
          :error-message="errorMsg"
          @submit="onSubmit"
          @cancel="onCancel"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../utils/api';
import EmployeeForm from './EmployeeForm.vue';

const route = useRoute();
const router = useRouter();

const loading = ref(true);
const submitting = ref(false);
const employee = ref(null);
const loadError = ref('');
const errorMsg = ref('');
const toast = ref('');

const routeId = computed(() => route.params.id);

const fetchEmployee = async () => {
  loading.value = true;
  loadError.value = '';
  employee.value = null;
  try {
    const { data } = await api.get(`/employees/${routeId.value}`);
    const d = data?.data;
    if (!d) {
      loadError.value = 'Employee not found.';
      return;
    }
    employee.value = { ...d };
  } catch (err) {
    if (err?.response?.status === 404) {
      loadError.value = 'Employee not found.';
    } else {
      loadError.value =
        err?.response?.data?.message ||
        'Failed to load employee. Please try again.';
    }
  } finally {
    loading.value = false;
  }
};

const onSubmit = async (data) => {
  if (submitting.value || !employee.value) return;
  submitting.value = true;
  errorMsg.value = '';
  try {
    const { data: res } = await api.put(`/employees/${employee.value.id}`, data);
    const updated = res?.data;
    if (updated) {
      employee.value = { ...updated };
    }
    toast.value = `Changes for "${data.employee_name}" saved successfully.`;
    setTimeout(() => {
      router.push('/ls-hr/employees');
    }, 900);
  } catch (err) {
    errorMsg.value =
      err?.response?.data?.message ||
      'Failed to save changes. Please try again.';
  } finally {
    submitting.value = false;
  }
};

const onCancel = () => {
  router.push('/ls-hr/employees');
};

watch(() => route.params.id, (newId, oldId) => {
  if (newId && newId !== oldId) fetchEmployee();
});

onMounted(fetchEmployee);
</script>

<style scoped>
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
