<template>
  <div>
    <div class="page-header">
      <div>
        <h1 class="page-title">Edit Employee Group</h1>
        <p class="page-subtitle">Update the name of an existing employee group</p>
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

    <div v-if="loading" class="card loading-card">
      <span class="spinner"></span> Loading employee group…
    </div>

    <div v-else-if="loadError" class="card">
      <div class="card-body">
        <div class="alert alert-error"><span>⚠️</span> {{ loadError }}</div>
        <router-link to="/ls-hr/master-data/employee-groups" class="btn btn-primary">Return to List</router-link>
      </div>
    </div>

    <div v-else class="card">
      <div class="card-header">
        <span class="card-title">Edit Employee Group</span>
      </div>
      <div class="card-body">
        <EmployeeGroupForm
          :initial-data="group"
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
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../utils/api';
import EmployeeGroupForm from './EmployeeGroupForm.vue';

const route = useRoute();
const router = useRouter();
const group = ref(null);
const loading = ref(true);
const loadError = ref('');
const submitting = ref(false);
const errorMsg = ref('');

const fetchGroup = async () => {
  loading.value = true;
  loadError.value = '';
  try {
    const { data: res } = await api.get(`/employee-groups/${route.params.id}`);
    group.value = res?.data || null;
    if (!group.value) {
      loadError.value = 'Employee group not found.';
    }
  } catch (err) {
    loadError.value = err?.response?.data?.message || 'Failed to load employee group.';
  } finally {
    loading.value = false;
  }
};

const onSubmit = async (data) => {
  if (submitting.value) return;
  submitting.value = true;
  errorMsg.value = '';
  try {
    await api.put(`/employee-groups/${route.params.id}`, data);
    router.push('/ls-hr/master-data/employee-groups');
  } catch (err) {
    errorMsg.value =
      err?.response?.data?.message ||
      'Failed to update employee group. Please try again.';
  } finally {
    submitting.value = false;
  }
};

const onCancel = () => {
  router.push('/ls-hr/master-data/employee-groups');
};

onMounted(fetchGroup);
</script>
