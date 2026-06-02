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
          <label class="form-label">Vendor Number <span class="required">*</span></label>
          <input v-model="form.vendor_number" type="text" class="form-control" placeholder="e.g. V-001234" required />
        </div>
        <div class="form-group">
          <label class="form-label">Vendor Name <span class="required">*</span></label>
          <input v-model="form.vendor_name" type="text" class="form-control" placeholder="e.g. PT Karya Tambang Sejahtera" required />
        </div>

        <div class="form-group">
          <label class="form-label">User Department <span class="required">*</span></label>
          <input v-model="form.user_department" type="text" class="form-control" placeholder="e.g. Mining Operation" required />
        </div>
        <div class="form-group">
          <label class="form-label">Department Title <span class="required">*</span></label>
          <input v-model="form.department_title" type="text" class="form-control" placeholder="e.g. Production" required />
        </div>

        <div class="form-group">
          <label class="form-label">PO Number <span class="required">*</span></label>
          <input v-model="form.po_number" type="text" class="form-control" placeholder="e.g. PO-2026-00112" required />
        </div>
        <div class="form-group">
          <label class="form-label">DIC (HRO) <span class="required">*</span></label>
          <input v-model="form.dic_hro" type="text" class="form-control" placeholder="DIC name from HRO" required />
        </div>

        <div class="form-group">
          <label class="form-label">PO Period 1 (Start) <span class="required">*</span></label>
          <input v-model="form.po_period_1" type="date" class="form-control" required />
        </div>
        <div class="form-group">
          <label class="form-label">PO Period 2 (End) <span class="required">*</span></label>
          <input
            v-model="form.po_period_2"
            type="date"
            class="form-control"
            :min="form.po_period_1 || undefined"
            required
          />
        </div>

        <div class="form-group">
          <label class="form-label">Cost Center <span class="required">*</span></label>
          <input v-model="form.cost_center" type="text" class="form-control" placeholder="e.g. CC-3001" required />
        </div>
        <div class="form-group">
          <label class="form-label">Employment Status <span class="required">*</span></label>
          <select v-model="form.employment_status" class="form-control" required>
            <option value="">— Select Employment Status —</option>
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
          <label class="form-label">Employee ID (NPK) <span class="required">*</span></label>
          <input v-model="form.npk" type="text" class="form-control" placeholder="e.g. NPK-100245" required />
        </div>
        <div class="form-group">
          <label class="form-label">Employee Name <span class="required">*</span></label>
          <input v-model="form.employee_name" type="text" class="form-control" placeholder="Full legal name" required />
        </div>

        <div class="form-group">
          <label class="form-label">Position <span class="required">*</span></label>
          <input v-model="form.position" type="text" class="form-control" placeholder="e.g. Heavy Equipment Operator" required />
        </div>
        <div class="form-group">
          <label class="form-label">Position Group <span class="required">*</span></label>
          <input v-model="form.position_group" type="text" class="form-control" placeholder="e.g. Operator, Staff, Supervisor" required />
        </div>

        <div class="form-group">
          <label class="form-label">Category <span class="required">*</span></label>
          <input v-model="form.category" type="text" class="form-control" placeholder="e.g. Field, Workshop, Office" required />
        </div>
        <div class="form-group">
          <label class="form-label">Site <span class="required">*</span></label>
          <input v-model="form.site" type="text" class="form-control" placeholder="e.g. Lati, Sambarata, Binungan" required />
        </div>

        <div class="form-group">
          <label class="form-label">User Status <span class="required">*</span></label>
          <select v-model="form.user_status" class="form-control" required>
            <option v-for="o in userStatusOptions" :key="o" :value="o">{{ o }}</option>
          </select>
          <p class="text-sm text-muted" style="margin-top: 6px;">
            <span v-if="form.user_status === 'Active'" class="status-hint status-hint--active">
              The user can be referenced in attendance and BAST checks.
            </span>
            <span v-else class="status-hint status-hint--deactive">
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
        <p class="form-section-sub">Direct supervisor responsible for daily approval</p>
      </div>

      <div class="form-grid">
        <div class="form-group">
          <label class="form-label">Supervisor NIK <span class="required">*</span></label>
          <input v-model="form.supervisor_nik" type="text" class="form-control" placeholder="e.g. 880123" required />
        </div>
        <div class="form-group">
          <label class="form-label">Supervisor Name <span class="required">*</span></label>
          <input v-model="form.supervisor_name" type="text" class="form-control" placeholder="Supervisor full name" required />
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
import { reactive, watch } from 'vue';
import {
  EMPTY_EMPLOYEE,
  EMPLOYMENT_STATUS_OPTIONS,
  USER_STATUS_OPTIONS,
} from './mockEmployees';

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

.required {
  color: var(--bc-rejected);
  margin-left: 2px;
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
