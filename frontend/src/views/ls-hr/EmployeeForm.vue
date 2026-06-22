<template>
  <form class="employee-form" @submit.prevent="onSubmit">
    <div v-if="errorMessage" class="alert alert-error"><span>⚠️</span> {{ errorMessage }}</div>
    <div v-if="successMessage" class="alert alert-success"><span>✅</span> {{ successMessage }}</div>

    <!-- ── Section: Vendor ────────────────────────────────────── -->
    <section class="form-section">
      <div class="form-section-header">
        <h2 class="form-section-title">Vendor</h2>
        <p class="form-section-sub">Vendor identity and placement</p>
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

        <div class="form-group form-group--full">
          <label class="form-label">User Department</label>
          <input v-model="form.user_department" type="text" class="form-control" />
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
          <label class="form-label">SID <span class="required-mark" aria-hidden="true">*</span></label>
          <input
            v-model="form.sid"
            type="text"
            class="form-control"
            :class="{ 'form-control--error': sidError }"
            maxlength="64"
            required
            aria-required="true"
            @blur="validateSid"
            @input="sidError = ''"
          />
          <p v-if="sidError" class="field-error">{{ sidError }}</p>
        </div>
        <div class="form-group">
          <label class="form-label">Employee ID (NPK)</label>
          <input v-model="form.npk" type="text" class="form-control" />
        </div>

        <div class="form-group form-group--full">
          <label class="form-label">Employee Name</label>
          <input v-model="form.employee_name" type="text" class="form-control" />
        </div>

        <div class="form-group form-group--full">
          <label class="form-label">Email</label>
          <input
            v-model="form.email"
            type="email"
            class="form-control"
            :class="{ 'form-control--error': emailError }"
            maxlength="190"
            @blur="validateEmail"
            @input="emailError = ''"
          />
          <p v-if="emailError" class="field-error">{{ emailError }}</p>
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
          <label class="form-label">Employee Group</label>
          <select v-model="form.employee_group" class="form-control">
            <option value="">— Select group —</option>
            <option v-for="g in EMPLOYEE_GROUP_OPTIONS" :key="g" :value="g">{{ g }}</option>
          </select>

        </div>
        <div class="form-group">
          <label class="form-label">Site</label>
          <input v-model="form.site" type="text" class="form-control" />
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
            <strong>LS Supervisor</strong> role appear in the list.
          </p>
        </div>
      </div>
    </section>

    <!-- ── Section: User Status (Edit only) ─────────────────── -->
    <section v-if="showUserStatus" class="form-section">
      <div class="form-section-header">
        <h2 class="form-section-title">User Status</h2>
        <p class="form-section-sub">
          Control whether this employee remains active in the attendance and reporting workflow
        </p>
      </div>

      <div class="form-grid">
        <div class="form-group form-group--full">
          <span class="form-label">Status</span>
          <div class="radio-group" role="radiogroup" aria-label="User Status">
            <label
              v-for="status in USER_STATUS_OPTIONS"
              :key="status"
              class="radio-option"
              :class="{
                'radio-option--selected': form.user_status === status,
                'radio-option--active': status === 'Active',
                'radio-option--deactive': status === 'Deactive',
              }"
            >
              <input
                v-model="form.user_status"
                type="radio"
                name="user_status"
                class="radio-input"
                :value="status"
              />
              <span class="radio-indicator" aria-hidden="true"></span>
              <span class="radio-label">{{ status }}</span>
            </label>
          </div>
        </div>
      </div>
    </section>

    <!-- ── Section: Replacement (optional) ──────────────────── -->
    <section v-if="showReplacementSection" class="form-section">
      <div class="form-section-header">
        <h2 class="form-section-title">Replacement</h2>
        <p class="form-section-sub">
          Optional. Link this employee to a deactivated predecessor from the same vendor.
        </p>
      </div>

      <div class="form-grid">
        <div class="form-group form-group--full">
          <label class="form-label">Replacement</label>
          <ReplacementSearchSelect
            v-model="form.replaces_employee_id"
            :vendor-id="form.vendor_id"
            :exclude-employee-id="excludeEmployeeId"
            :initial-employee="initialReplacementOption"
            @change="onReplacementSelected"
          />
          <p class="text-sm text-muted" style="margin-top: 6px;">
            Search by Employee Name. Only deactivated employees from the selected vendor who have not yet been replaced appear.
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
import { reactive, ref, computed, watch } from 'vue';
import { EMPTY_EMPLOYEE, EMPLOYEE_GROUP_OPTIONS, USER_STATUS_OPTIONS } from './mockEmployees';
import VendorSearchSelect from '../../components/VendorSearchSelect.vue';
import SupervisorSearchSelect from '../../components/SupervisorSearchSelect.vue';
import ReplacementSearchSelect from '../../components/ReplacementSearchSelect.vue';

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
  showUserStatus: {
    type: Boolean,
    default: false,
  },
  excludeEmployeeId: {
    type: [Number, String, null],
    default: null,
  },
});

const emit = defineEmits(['submit', 'cancel']);

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

/** Create: always show. Edit: only when User Status is Active. */
const showReplacementSection = computed(() => {
  if (!props.showUserStatus) return true;
  return form.user_status === 'Active';
});

const initialReplacementOption = computed(() => {
  if (!props.initialData || props.initialData.replaces_employee_id == null) return null;
  return {
    id: props.initialData.replaces_employee_id,
    employee_name: props.initialData.replaced_employee_name || '',
    npk: '',
    sid: '',
  };
});

const onReplacementSelected = (employee) => {
  form.replaced_employee_name = employee ? (employee.employee_name || '') : '';
};

// SID is the one mandatory field on this form. We validate on blur and
// again on submit so the form can never be saved without it, mirroring
// the backend's required check.
const sidError = ref('');

const validateSid = () => {
  if (!String(form.sid || '').trim()) {
    sidError.value = 'SID is required.';
    return false;
  }
  sidError.value = '';
  return true;
};

// Email is OPTIONAL — only validate the format when a value is typed so
// the user can leave the field empty on both Create and Edit.
const emailError = ref('');
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const validateEmail = () => {
  const email = String(form.email || '').trim();
  if (email && !EMAIL_REGEX.test(email)) {
    emailError.value = 'Please enter a valid email address.';
    return false;
  }
  emailError.value = '';
  return true;
};

watch(
  () => form.user_status,
  (status) => {
    if (status === 'Deactive') {
      form.replaces_employee_id = null;
      form.replaced_employee_name = '';
    }
  }
);

const onSubmit = () => {
  if (props.submitting) return;
  if (!validateSid()) return;
  if (!validateEmail()) return;
  const payload = {
    ...form,
    sid: String(form.sid || '').trim(),
    email: String(form.email || '').trim(),
  };
  if (props.showUserStatus && payload.user_status !== 'Active') {
    payload.replaces_employee_id = null;
  }
  emit('submit', payload);
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

.required-mark {
  color: var(--bc-rejected, #ef4444);
  font-weight: 700;
  margin-left: 2px;
}

.form-control--error,
.form-control--error:focus {
  border-color: var(--bc-rejected, #ef4444);
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.15);
}

.field-error {
  margin-top: 6px;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--bc-rejected, #ef4444);
}

.radio-group {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 6px;
}

.radio-option {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border: 1.5px solid var(--bc-gray-200);
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
  user-select: none;
}
.radio-option:hover {
  border-color: var(--bc-gray-300);
}
.radio-option--selected.radio-option--active {
  border-color: var(--bc-green-500, #22994a);
  background: var(--bc-green-50, #ecfdf5);
  box-shadow: 0 0 0 3px rgba(34, 153, 74, 0.12);
}
.radio-option--selected.radio-option--deactive {
  border-color: var(--bc-rejected, #ef4444);
  background: #fef2f2;
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1);
}

.radio-input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.radio-indicator {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid var(--bc-gray-300);
  background: #fff;
  flex-shrink: 0;
  position: relative;
  transition: border-color 0.15s, background 0.15s;
}
.radio-indicator::after {
  content: '';
  position: absolute;
  inset: 3px;
  border-radius: 50%;
  background: transparent;
  transition: background 0.15s;
}
.radio-option--selected.radio-option--active .radio-indicator {
  border-color: var(--bc-green-500, #22994a);
}
.radio-option--selected.radio-option--active .radio-indicator::after {
  background: var(--bc-green-500, #22994a);
}
.radio-option--selected.radio-option--deactive .radio-indicator {
  border-color: var(--bc-rejected, #ef4444);
}
.radio-option--selected.radio-option--deactive .radio-indicator::after {
  background: var(--bc-rejected, #ef4444);
}

.radio-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--bc-gray-700);
}
.radio-option--selected.radio-option--active .radio-label {
  color: var(--bc-green-800, #065f46);
}
.radio-option--selected.radio-option--deactive .radio-label {
  color: #991b1b;
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
