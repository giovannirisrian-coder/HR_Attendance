<template>
  <div>
    <div class="page-header">
      <div>
        <h1 class="page-title">Create Employee Group</h1>
        <p class="page-subtitle">Add a new employee group to the master data catalog</p>
      </div>
      <div class="flex items-center gap-2">
        <router-link to="/ls-hr/master-data/employee-groups" class="btn btn-outline btn-sm">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Back to List
        </router-link>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <span class="card-title">New Employee Group</span>
      </div>
      <div class="card-body">
        <EmployeeGroupForm
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
import EmployeeGroupForm from './EmployeeGroupForm.vue';

const router = useRouter();
const submitting = ref(false);
const errorMsg = ref('');

const onSubmit = async (data) => {
  if (submitting.value) return;
  submitting.value = true;
  errorMsg.value = '';
  try {
    await api.post('/employee-groups', data);
    router.push('/ls-hr/master-data/employee-groups');
  } catch (err) {
    errorMsg.value =
      err?.response?.data?.message ||
      'Failed to create employee group. Please try again.';
  } finally {
    submitting.value = false;
  }
};

const onCancel = () => {
  router.push('/ls-hr/master-data/employee-groups');
};
</script>
