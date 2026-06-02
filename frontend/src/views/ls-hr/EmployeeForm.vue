<template>
  <form class="employee-form" @submit.prevent="onSubmit">
    <div v-if="errorMessage" class="alert alert-error"><span>⚠️</span> {{ errorMessage }}</div>
    <div v-if="successMessage" class="alert alert-success"><span>✅</span> {{ successMessage }}</div>

    <!-- ── Section: Vendor & Contract ─────────────────────────── -->
    <section class="form-section">
      <div class="form-section-header">
        <h2 class="form-section-title">Vendor &amp; Contract</h2>
        <p class="form-section-sub">Vendor identity and purchase order assignment</p>
      </div>

      <div class="form-grid">
        <div class="form-group">
          <label class="form-label">Vendor Number</label>
          <VendorSearchSelect
            v-model="form.vendor_id"
            :initial-vendor="initialVendorOption"
            @change="onVendorSelected"
          />
          <p class="text-sm text-muted" style="margin-top: 6px;">
            Search by Vendor Name or Code. Selecting a vendor auto-fills the Vendor Name field.
          </p>
        </div>
        <div class="form-group">
          <label class="form-label">Vendor Name</label>
          <input
            v-model="form.vendor_name"
            type="text"
            class="form-control"
            readonly
            placeholder="Auto-filled from selected vendor"
          />
        </div>

        <div class="form-group">
          <label class="form-label">User Department</label>
          <input v-model="form.user_department" type="text" class="form-control" />
        </div>
        <div class="form-group">
          <label class="form-label">Department Title</label>
          <input v-model="form.department_title" type="text" class="form-control" />
        </div>

        <div class="form-group">
          <label class="form-label">PO Number</label>
          <input v-model="form.po_number" type="text" class="form-control" />
        </div>
        <div class="form-group">
          <label class="form-label">DIC (HRO)</label>
          <input v-model="form.dic_hro" type="text" class="form-control" />
        </div>

        <div class="form-group">
          <label class="form-label">PO Period 1</label>
          <input v-model="form.po_period_1" type="text" class="form-control" />
        </div>
        <div class="form-group">
          <label class="form-label">PO Period 2</label>
          <input v-model="form.po_period_2" type="text" class="form-control" />
        </div>

        <div class="form-group">
          <label class="form-label">Cost Center</label>
          <input v-model="form.cost_center" type="text" class="form-control" />
        </div>
        <div class="form-group">
          <label class="form-label">Employment Status</label>
          <select v-model="form.employment_status" class="form-control">
            <option value=""></option>
            <option v-for="o in employmentStatusOptions" :key="o" :value="o">{{ o }}</option>
          </select>
        </div>
      </div>
    </section>

    <!-- ── Section: Employee Info ─────────────────────────────── -->
    <section class="form-section">
      <div class="form-section-header">
        <h2 class="form-section-title">Employee Information</h2>
        <p class="form-section-sub">Personal identity and current placement</p>
      </div>

      <div class="form-grid">
        <div class="form-group">
          <label class="form-label">Employee ID (NPK)</label>
          <input v-model="form.npk" type="text" class="form-control" />
        </div>
        <div class="form-group">
          <label class="form-label">Employee Name</label>
          <input v-model="form.employee_name" type="text" class="form-control" />
        </div>

        <div class="form-group">
          <label class="form-label">Email</label>
          <input v-model="form.email" type="email" class="form-control" maxlength="190" autocomplete="email" />
        </div>
        <div class="form-group">
          <label class="form-label">Position</label>
          <input v-model="form.position" type="text" class="form-control" />
        </div>

        <div class="form-group">
          <label class="form-label">Position Group</label>
          <input v-model="form.position_group" type="text" class="form-control" />
        </div>
        <div class="form-group">
          <label class="form-label">Category</label>
          <input v-model="form.category" type="text" class="form-control" />
        </div>

        <div class="form-group">
          <label class="form-label">Site</label>
          <input v-model="form.site" type="text" class="form-control" />
        </div>

        <div class="form-group">
          <label class="form-label">User Status</label>
          <select v-model="form.user_status" class="form-control">
            <option v-for="o in userStatusOptions" :key="o" :value="o">{{ o }}</option>
          </select>
          <p class="text-sm text-muted" style="margin-top: 6px;">
            <span v-if="form.user_status === 'Active'" class="status-hint status-hint--active">
              The user can be referenced in attendance and BAST checks.
            </span>
            <span v-else-if="form.user_status === 'Deactive'" class="status-hint status-hint--deactive">
              The user is excluded from active attendance flows.
            </span>
          </p>
        </div>
      </div>
    </section>

    <!-- ── Section: Supervisor ────────────────────────────────── -->
    <section class="form-section">
      <div class="form-section-header">
        <h2 class="form-section-title">Supervisor</h2>
        <p class="form-section-sub">
          Leader Employee (LS Supervisor) responsible for the Managerial Review stage
        </p>
      </div>

      <div class="form-grid">
        <div class="form-group form-group--full">
          <label class="form-label">Supervisor</label>
          <SupervisorSearchSelect
            v-model="form.supervisor_id"
            :initial-supervisor="initialSupervisorOption"
            @change="onSupervisorSelected"
          />
          <p class="text-sm text-muted" style="margin-top: 6px;">
            Optional. Search by Supervisor Name. Only users with the
            <strong>LS Supervisor</strong> role appear in the list. The
            employee record stores the supervisor's user ID so the
            Managerial Review stage has a robust audit trail.
          </p>
        </div>
      </div>
    </section>

    <!-- ── Actions ────────────────────────────────────────────── -->
    <div class="form-actions">
      <button type="button" class="btn btn-outline" :disabled="submitting" @click="onCancel">Cancel</button>
      <button type="submit" class="btn btn-primary" :disabled="submitting">
        <span v-if="submitting" class="spinner" style="width:16px;height:16px;border-width:2px;"></span>
        {{ submitting ? 'Saving…' : submitLabel }}
      </button>
    </div>
  </form>
</template>

<script setup>
import { reactive, computed, watch } from 'vue';
import {
  EMPTY_EMPLOYEE,
  EMPLOYMENT_STATUS_OPTIONS,
  USER_STATUS_OPTIONS,
} from './mockEmployees';
import VendorSearchSelect from '../../components/VendorSearchSelect.vue';
import SupervisorSearchSelect from '../../components/SupervisorSearchSelect.vue';

const props = defineProps({
  initialData: {
    type: Object,
    default: () => ({}),
  },
  submitLabel: {
    type: String,
    default: 'Save',
  },
  successMessage: {
    type: String,
    default: '',
  },
  errorMessage: {
    type: String,
    default: '',
  },
  submitting: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['submit', 'cancel']);

const employmentStatusOptions = EMPLOYMENT_STATUS_OPTIONS;
const userStatusOptions = USER_STATUS_OPTIONS;

const form = reactive({ ...EMPTY_EMPLOYEE, ...(props.initialData || {}) });

watch(
  () => props.initialData,
  (val) => {
    Object.assign(form, EMPTY_EMPLOYEE, val || {});
  }
);

/**
 * Seed the searchable lookup with the currently-saved vendor (if any)
 * so the Edit page shows the vendor name immediately, without waiting
 * for the master list fetch to complete. Built from the fields the
 * backend already returns on the employee payload.
 */
const initialVendorOption = computed(() => {
  if (!props.initialData || props.initialData.vendor_id == null) return null;
  return {
    id: props.initialData.vendor_id,
    code: props.initialData.vendor_number || '',
    name: props.initialData.vendor_name || '',
  };
});

/**
 * Auto-population hook — the spec mandates that picking a vendor fills
 * the Vendor Name textbox. We also mirror the vendor code into the
 * legacy Vendor Number snapshot so the field stays meaningful even if
 * the user never opens the dropdown again. Clearing the selection
 * wipes both snapshots so the form does not save stale data.
 */
const onVendorSelected = (vendor) => {
  if (vendor) {
    form.vendor_name = vendor.name || '';
    form.vendor_number = vendor.code || '';
  } else {
    form.vendor_name = '';
    form.vendor_number = '';
  }
};

/**
 * Seed the searchable supervisor lookup with the currently-saved user
 * (if any) so the Edit page shows the supervisor name immediately,
 * without waiting for the master list fetch to complete. Built from
 * the JOINed fields the backend already returns on the employee
 * payload (supervisor_id, supervisor_name, supervisor_employee_id).
 */
const initialSupervisorOption = computed(() => {
  if (!props.initialData || props.initialData.supervisor_id == null) return null;
  return {
    id: props.initialData.supervisor_id,
    name: props.initialData.supervisor_name || '',
    employee_id: props.initialData.supervisor_employee_id || '',
  };
});

/**
 * Picking a supervisor only needs to update the read-only display
 * mirror so the form (and any "you selected X" UX) stays in sync. The
 * authoritative value sent to the backend is `supervisor_id` — the
 * name is resolved from the users master at read time.
 */
const onSupervisorSelected = (supervisor) => {
  if (supervisor) {
    form.supervisor_name = supervisor.name || '';
    form.supervisor_employee_id = supervisor.employee_id || '';
  } else {
    form.supervisor_name = '';
    form.supervisor_employee_id = '';
  }
};

const onSubmit = () => {
  if (props.submitting) return;
  emit('submit', { ...form });
};

const onCancel = () => {
  emit('cancel');
};
</script>

<style scoped>
.employee-form {
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.form-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-bottom: 24px;
  border-bottom: 1px solid var(--bc-gray-100);
}
.form-section:last-of-type {
  border-bottom: none;
  padding-bottom: 0;
}

.form-section-header {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.form-section-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--bc-green-700);
  letter-spacing: 0.01em;
}
.form-section-sub {
  font-size: 12.5px;
  color: var(--bc-gray-500);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 24px;
}

.form-group {
  margin-bottom: 0;
}
.form-group--full {
  grid-column: 1 / -1;
}

.status-hint {
  display: inline-flex;
  align-items: center;
  font-size: 12.5px;
  font-weight: 500;
}
.status-hint--active {
  color: var(--bc-green-700);
}
.status-hint--deactive {
  color: var(--bc-rejected);
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 10px;
  padding-top: 4px;
}

@media (max-width: 768px) {
  .form-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }
  .form-actions {
    flex-direction: column-reverse;
    align-items: stretch;
  }
  .form-actions .btn {
    width: 100%;
    justify-content: center;
  }
}
</style>
