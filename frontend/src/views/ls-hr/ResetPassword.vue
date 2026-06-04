<template>
  <div>
    <div class="page-header">
      <div>
        <h1 class="page-title">Reset Password</h1>
        <p class="page-subtitle">
          Reset a user account password (Employee / Leader / Vendor) by SID to support smooth system operations.
        </p>
      </div>
    </div>

    <div class="card reset-card">
      <div class="card-header">
        <span class="card-title">Reset Password Form</span>
      </div>
      <div class="card-body">
        <form @submit.prevent="onSubmit" novalidate>
          <div class="form-group">
            <label class="form-label" for="reset-sid">
              SID <span class="req">*</span>
            </label>
            <input
              id="reset-sid"
              v-model.trim="form.sid"
              type="text"
              class="form-control"
              :class="{ 'is-invalid': errors.sid }"
              placeholder="Enter user SID"
              autocomplete="off"
              @input="clearStatus"
            />
            <p v-if="errors.sid" class="field-error">{{ errors.sid }}</p>
          </div>

          <div class="form-group">
            <label class="form-label" for="reset-new-password">
              New Password <span class="req">*</span>
            </label>
            <div class="password-wrap">
              <input
                id="reset-new-password"
                v-model="form.newPassword"
                :type="showNew ? 'text' : 'password'"
                class="form-control"
                :class="{ 'is-invalid': errors.newPassword }"
                placeholder="Minimum 8 characters required"
                autocomplete="new-password"
                @input="clearStatus"
              />
              <button type="button" class="pw-toggle" @click="showNew = !showNew">
                {{ showNew ? '🙈' : '👁️' }}
              </button>
            </div>
            <p v-if="errors.newPassword" class="field-error">{{ errors.newPassword }}</p>
          </div>

          <div class="form-group">
            <label class="form-label" for="reset-confirm-password">
              Confirm Reset Password <span class="req">*</span>
            </label>
            <div class="password-wrap">
              <input
                id="reset-confirm-password"
                v-model="form.confirmPassword"
                :type="showConfirm ? 'text' : 'password'"
                class="form-control"
                :class="{ 'is-invalid': errors.confirmPassword }"
                placeholder="Re-enter the new password"
                autocomplete="new-password"
                @input="clearStatus"
              />
              <button type="button" class="pw-toggle" @click="showConfirm = !showConfirm">
                {{ showConfirm ? '🙈' : '👁️' }}
              </button>
            </div>
            <p v-if="errors.confirmPassword" class="field-error">{{ errors.confirmPassword }}</p>
          </div>

          <p v-if="statusMessage" class="alert-inline" :class="statusOk ? 'ok' : 'err'">
            {{ statusMessage }}
          </p>

          <div class="form-actions">
            <button type="submit" class="btn btn-primary" :disabled="submitting">
              {{ submitting ? 'Processing...' : 'Reset Password' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue';
import api from '../../utils/api';

const MIN_PASSWORD_LENGTH = 8;

const form = reactive({
  sid: '',
  newPassword: '',
  confirmPassword: '',
});

const errors = reactive({
  sid: '',
  newPassword: '',
  confirmPassword: '',
});

const submitting = ref(false);
const statusMessage = ref('');
const statusOk = ref(false);

// Independent show/hide state per field, mirroring the Login page's
// "Force Change Password" dialog (showNew / showConfirm).
const showNew = ref(false);
const showConfirm = ref(false);

function clearStatus() {
  statusMessage.value = '';
}

function validate() {
  errors.sid = '';
  errors.newPassword = '';
  errors.confirmPassword = '';

  if (!form.sid) {
    errors.sid = 'This field is required.';
  }
  if (!form.newPassword) {
    errors.newPassword = 'This field is required.';
  } else if (form.newPassword.length < MIN_PASSWORD_LENGTH) {
    errors.newPassword = 'Minimum 8 characters required.';
  }
  if (!form.confirmPassword) {
    errors.confirmPassword = 'This field is required.';
  } else if (form.confirmPassword.length < MIN_PASSWORD_LENGTH) {
    errors.confirmPassword = 'Minimum 8 characters required.';
  } else if (form.confirmPassword !== form.newPassword) {
    errors.confirmPassword = 'Passwords do not match.';
  }

  return !errors.sid && !errors.newPassword && !errors.confirmPassword;
}

async function onSubmit() {
  clearStatus();
  if (!validate()) return;

  submitting.value = true;
  try {
    const { data } = await api.post('/employees/reset-password', {
      sid: form.sid,
      newPassword: form.newPassword,
      confirmPassword: form.confirmPassword,
    });

    statusOk.value = true;
    statusMessage.value = data?.message || 'Password has been successfully reset.';
    form.newPassword = '';
    form.confirmPassword = '';
  } catch (err) {
    statusOk.value = false;
    const msg = err.response?.data?.message;
    if (err.response?.status === 404) {
      errors.sid = msg || 'SID not found in the system.';
    }
    statusMessage.value = msg || 'An error occurred while resetting the password.';
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.reset-card {
  max-width: 520px;
}
.form-group {
  margin-bottom: 18px;
}
.form-label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--bc-gray-700);
}
.req {
  color: #b91c1c;
}
.form-control.is-invalid {
  border-color: #dc2626;
}
.password-wrap {
  position: relative;
}
.password-wrap .form-control {
  padding-right: 44px;
}
.pw-toggle {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  font-size: 16px;
  opacity: .6;
  transition: opacity .15s;
}
.pw-toggle:hover {
  opacity: 1;
}
.field-error {
  margin: 6px 0 0;
  font-size: 12.5px;
  color: #b91c1c;
}
.form-actions {
  margin-top: 8px;
}
.alert-inline {
  margin: 0 0 16px;
  font-size: 14px;
  padding: 10px 12px;
  border-radius: var(--radius);
}
.alert-inline.ok {
  color: var(--bc-green-700);
  background: var(--bc-green-50, #ecfdf5);
  border: 1px solid var(--bc-green-300, #6ee7b7);
}
.alert-inline.err {
  color: #b91c1c;
  background: #fef2f2;
  border: 1px solid #fecaca;
}
</style>
