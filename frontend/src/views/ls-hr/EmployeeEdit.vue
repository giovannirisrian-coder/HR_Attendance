<template>
  <div>
    <div class="page-header">
      <div>
        <h1 class="page-title">
          Edit User<span v-if="employee">  -  {{ employee.employee_name }}</span>
        </h1>
        <p class="page-subtitle">
          <template v-if="employee">
            Update master data for <strong>{{ employee.employee_id }}</strong> · {{ employee.vendor_name }}
          </template>
          <template v-else>
            The selected employee could not be found in the mockup dataset.
          </template>
        </p>
      </div>
      <div class="flex items-center gap-2">
        <span v-if="employee" class="badge" :class="employee.user_status === 'Active' ? 'badge-active' : 'badge-deactive'">
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

    <div v-if="!employee" class="card">
      <div class="card-body">
        <div class="empty-state">
          <div class="empty-state-icon">🔍</div>
          <h3>Employee not found</h3>
          <p>The user with ID #{{ routeId }} does not exist in the mockup dataset.</p>
          <div style="margin-top: 16px;">
            <router-link to="/ls-hr/employees" class="btn btn-primary">Return to Employee List</router-link>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="card">
      <div class="card-header">
        <span class="card-title">Edit User Form</span>
        <span class="text-sm text-muted">All fields marked <span style="color: var(--bc-rejected); font-weight: 700;">*</span> are required</span>
      </div>
      <div class="card-body">
        <EmployeeForm
          :initial-data="employee"
          submit-label="Save Changes"
          @submit="onSubmit"
          @cancel="onCancel"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import EmployeeForm from './EmployeeForm.vue';
import { findEmployeeById } from './mockEmployees';

const route = useRoute();
const router = useRouter();
const toast = ref('');

const routeId = computed(() => route.params.id);
const employee = computed(() => findEmployeeById(routeId.value));

const onSubmit = (data) => {
  toast.value = `Changes for "${data.employee_name}" saved successfully (mockup).`;
  setTimeout(() => {
    router.push('/ls-hr/employees');
  }, 900);
};

const onCancel = () => {
  router.push('/ls-hr/employees');
};
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
