<template>
  <div>
    <div class="page-header">
      <div>
        <h1 class="page-title">Create New User</h1>
        <p class="page-subtitle">Register a new vendor employee in the master data</p>
      </div>
      <div class="flex items-center gap-2">
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

    <div class="card">
      <div class="card-header">
        <span class="card-title">New User Form</span>
        <span class="text-sm text-muted">All fields marked <span style="color: var(--bc-rejected); font-weight: 700;">*</span> are required</span>
      </div>
      <div class="card-body">
        <EmployeeForm
          submit-label="Save"
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
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import api from '../../utils/api';
import EmployeeForm from './EmployeeForm.vue';

const router = useRouter();
const toast = ref('');
const errorMsg = ref('');
const submitting = ref(false);

const onSubmit = async (data) => {
  if (submitting.value) return;
  submitting.value = true;
  errorMsg.value = '';
  try {
    const { data: res } = await api.post('/employees', data);
    const name = res?.data?.employee_name || data.employee_name || 'New User';
    toast.value = `Employee "${name}" created successfully.`;
    setTimeout(() => {
      router.push('/ls-hr/employees');
    }, 900);
  } catch (err) {
    errorMsg.value =
      err?.response?.data?.message ||
      'Failed to create employee. Please check the form and try again.';
  } finally {
    submitting.value = false;
  }
};

const onCancel = () => {
  router.push('/ls-hr/employees');
};
</script>
