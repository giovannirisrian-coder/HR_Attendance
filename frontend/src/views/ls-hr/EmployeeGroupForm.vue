<template>
  <form class="employee-group-form" @submit.prevent="onSubmit">
    <div v-if="errorMessage" class="alert alert-error"><span>⚠️</span> {{ errorMessage }}</div>

    <div class="form-group">
      <label class="form-label" for="employee-group-name">
        Employee Group <span class="required-mark" aria-hidden="true">*</span>
      </label>
      <input
        id="employee-group-name"
        v-model="form.employee_group"
        type="text"
        class="form-control"
        :class="{ 'form-control--error': fieldError }"
        maxlength="150"
        required
        aria-required="true"
        placeholder="Enter employee group name"
        @input="fieldError = ''"
      />
      <p v-if="fieldError" class="field-error">{{ fieldError }}</p>
    </div>

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
import { reactive, ref, watch } from 'vue';

const props = defineProps({
  initialData: {
    type: Object,
    default: () => ({}),
  },
  submitLabel: {
    type: String,
    default: 'Save',
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

const form = reactive({
  employee_group: '',
  ...(props.initialData || {}),
});

watch(
  () => props.initialData,
  (val) => {
    form.employee_group = val?.employee_group || '';
  }
);

const fieldError = ref('');

const onSubmit = () => {
  if (props.submitting) return;
  const name = String(form.employee_group || '').trim();
  if (!name) {
    fieldError.value = 'Employee Group is required.';
    return;
  }
  fieldError.value = '';
  emit('submit', { employee_group: name });
};

const onCancel = () => {
  emit('cancel');
};
</script>

<style scoped>
.employee-group-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 480px;
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

.form-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 10px;
  padding-top: 4px;
}

@media (max-width: 768px) {
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
