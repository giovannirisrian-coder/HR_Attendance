<template>
  <div class="login-page">
    <!-- Left panel: branding -->
    <div class="login-brand">
      <div class="brand-content">
        <div class="brand-logo">
          <div class="logo-mark">BC</div>
        </div>
        <h1>Berau Coal</h1>
        <p>Digital Attendance &amp; Approval System</p>
        <div class="brand-features">
          <div class="feature-item">
            <span class="feature-icon">📍</span>
            <span>Real-time Geotagged Attendance</span>
          </div>
          <div class="feature-item">
            <span class="feature-icon">✅</span>
            <span>Digital Approval Workflow</span>
          </div>
          <div class="feature-item">
            <span class="feature-icon">📊</span>
            <span>Integrated Vendor Reporting</span>
          </div>
        </div>
      </div>
      <div class="brand-footer">© 2026 Berau Coal. All rights reserved.</div>
    </div>

    <!-- Right panel: form -->
    <div class="login-form-panel">
      <div class="login-form-wrap">
        <div class="login-header">
          <h2>Welcome back</h2>
          <p>Sign in to your account to continue</p>
        </div>

        <div v-if="errorMsg" class="alert alert-error">
          <span>⚠️</span> {{ errorMsg }}
        </div>

        <form @submit.prevent="handleLogin">
          <div class="form-group">
            <label class="form-label">SID</label>
            <input
              v-model="form.sid"
              type="text"
              class="form-control"
              placeholder="Your System ID (SID)"
              autocomplete="username"
              required
            />
          </div>

          <div class="form-group">
            <label class="form-label">Password</label>
            <div class="password-wrap">
              <input
                v-model="form.password"
                :type="showPassword ? 'text' : 'password'"
                class="form-control"
                placeholder="••••••••"
                autocomplete="current-password"
                required
              />
              <button type="button" class="pw-toggle" @click="showPassword = !showPassword">
                {{ showPassword ? '🙈' : '👁️' }}
              </button>
            </div>
          </div>

          <button type="submit" class="btn btn-primary btn-lg w-full" :disabled="loading">
            <span v-if="loading" class="spinner" style="width:18px;height:18px;border-width:2px;"></span>
            <span>{{ loading ? 'Signing in…' : 'Sign In' }}</span>
          </button>
        </form>

        <div class="demo-accounts">
          <p class="demo-title">Demo Accounts (Password: <code>password</code>)</p>
          <div class="demo-grid">
            <button type="button" class="demo-btn" @click="fillDemo('ls1@beraucoal.com')">
              <span class="demo-role">LS</span> Ahmad Fauzi
            </button>
            <button type="button" class="demo-btn" @click="fillDemo('supervisor1@beraucoal.com')">
              <span class="demo-role">Supervisor</span> Budi Santoso
            </button>
            <button type="button" class="demo-btn" @click="fillDemo('vendor1@beraucoal.com')">
              <span class="demo-role">Vendor</span> Admin MKU
            </button>
            <button type="button" class="demo-btn" @click="fillDemo('lshr@beraucoal.com')">
              <span class="demo-role">LS HR</span> LS HR Officer
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ── First-time login: forced password change ──────────────── -->
    <div v-if="firstLogin.show" class="modal-backdrop">
      <div class="modal" style="max-width:440px;">
        <div class="modal-header">
          <span class="modal-title">Change Your Password</span>
        </div>
        <form @submit.prevent="handleChangePassword">
          <div class="modal-body">
            <p class="fl-intro">
              For your security, you must set a new password before signing in
              for the first time.
            </p>

            <div v-if="firstLogin.error" class="alert alert-error">
              <span>⚠️</span> {{ firstLogin.error }}
            </div>

            <div class="form-group">
              <label class="form-label">New Password</label>
              <div class="password-wrap">
                <input
                  v-model="firstLogin.newPassword"
                  :type="firstLogin.showNew ? 'text' : 'password'"
                  class="form-control"
                  placeholder="At least 8 characters"
                  autocomplete="new-password"
                  required
                />
                <button type="button" class="pw-toggle" @click="firstLogin.showNew = !firstLogin.showNew">
                  {{ firstLogin.showNew ? '🙈' : '👁️' }}
                </button>
              </div>
            </div>

            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label">Confirm New Password</label>
              <div class="password-wrap">
                <input
                  v-model="firstLogin.confirmPassword"
                  :type="firstLogin.showConfirm ? 'text' : 'password'"
                  class="form-control"
                  placeholder="Re-enter your new password"
                  autocomplete="new-password"
                  required
                />
                <button type="button" class="pw-toggle" @click="firstLogin.showConfirm = !firstLogin.showConfirm">
                  {{ firstLogin.showConfirm ? '🙈' : '👁️' }}
                </button>
              </div>
              <p class="fl-hint">Minimum 8 characters. Both fields must match.</p>
            </div>
          </div>
          <div class="modal-footer">
            <button type="submit" class="btn btn-primary w-full" :disabled="firstLogin.saving">
              <span v-if="firstLogin.saving" class="spinner" style="width:16px;height:16px;border-width:2px;"></span>
              {{ firstLogin.saving ? 'Updating…' : 'Update Password & Sign In' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue';
import { useRouter } from 'vue-router';
import api from '../utils/api';
import { setAuth } from '../utils/auth';

const MIN_PASSWORD_LENGTH = 8;

const router = useRouter();
const loading = ref(false);
const errorMsg = ref('');
const showPassword = ref(false);
const form = reactive({ sid: '', password: '' });

// First-time login "Force Password Change" dialog state. Opened when the
// login endpoint replies with `mustChangePassword: true` instead of a
// session token.
const firstLogin = reactive({
  show: false,
  sid: '',
  newPassword: '',
  confirmPassword: '',
  showNew: false,
  showConfirm: false,
  saving: false,
  error: '',
});

const fillDemo = (sid) => {
  form.sid = sid;
  form.password = 'password';
};

// Resolve the post-login landing route for a role.
const routeForRole = (role) => {
  if (role === 'ls') return '/ls/attendance/create';
  if (role === 'ls_supervisor') return '/supervisor/approvals';
  if (role === 'vendor') return '/vendor/reports';
  if (role === 'ls_hr') return '/ls-hr/approvals';
  if (role === 'ssu') return '/ssu/approvals';
  return '/';
};

const handleLogin = async () => {
  loading.value = true;
  errorMsg.value = '';
  try {
    const { data } = await api.post('/auth/login', form);

    // First-time login: no token is issued yet. Pop the forced
    // password-change dialog instead of routing to a dashboard.
    if (data.success && data.mustChangePassword) {
      firstLogin.sid = data.sid || form.sid;
      firstLogin.newPassword = '';
      firstLogin.confirmPassword = '';
      firstLogin.error = '';
      firstLogin.show = true;
      return;
    }

    if (data.success) {
      setAuth(data.token, data.user);
      router.push(routeForRole(data.user.role));
    }
  } catch (err) {
    errorMsg.value = err.response?.data?.message || 'Login failed. Please try again.';
  } finally {
    loading.value = false;
  }
};

const handleChangePassword = async () => {
  firstLogin.error = '';

  const next = String(firstLogin.newPassword || '');
  if (next.length < MIN_PASSWORD_LENGTH) {
    firstLogin.error = `New password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    return;
  }
  if (next !== String(firstLogin.confirmPassword || '')) {
    firstLogin.error = 'New password and confirmation do not match.';
    return;
  }

  firstLogin.saving = true;
  try {
    await api.post('/auth/change-password', {
      sid: firstLogin.sid,
      currentPassword: form.password,
      newPassword: next,
      confirmPassword: firstLogin.confirmPassword,
    });

    // Password updated and is_first_login cleared server-side — sign in
    // immediately with the new credential so the user lands on their
    // dashboard without re-typing the SID.
    form.password = next;
    const { data } = await api.post('/auth/login', form);
    if (data.success && data.token) {
      setAuth(data.token, data.user);
      firstLogin.show = false;
      router.push(routeForRole(data.user.role));
    } else {
      // Defensive: should not happen now that the flag is cleared.
      firstLogin.show = false;
      errorMsg.value = 'Password updated. Please sign in with your new password.';
    }
  } catch (err) {
    firstLogin.error =
      err.response?.data?.message || 'Could not update password. Please try again.';
  } finally {
    firstLogin.saving = false;
  }
};
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 1fr 1fr;
}

/* ── Brand panel ─ */
.login-brand {
  background: linear-gradient(145deg, var(--bc-green-800) 0%, var(--bc-green-600) 60%, var(--bc-green-400) 100%);
  color: white;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 48px;
  position: relative;
  overflow: hidden;
}
.login-brand::before {
  content: '';
  position: absolute;
  inset: 0;
  background: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Ccircle cx='30' cy='30' r='4'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
}
.brand-content { position: relative; }
.brand-logo { margin-bottom: 28px; }
.logo-mark {
  width: 72px; height: 72px;
  background: rgba(255,255,255,.15);
  border: 2px solid rgba(255,255,255,.3);
  border-radius: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: 900;
  letter-spacing: -1px;
  backdrop-filter: blur(8px);
}
.login-brand h1 { font-size: 34px; font-weight: 900; letter-spacing: -1px; margin-bottom: 8px; }
.login-brand > .brand-content > p { font-size: 15px; opacity: .8; margin-bottom: 48px; }
.brand-features { display: flex; flex-direction: column; gap: 16px; }
.feature-item { display: flex; align-items: center; gap: 14px; font-size: 14.5px; }
.feature-icon { font-size: 20px; }
.brand-footer { position: relative; font-size: 12.5px; opacity: .6; }

/* ── Form panel ─ */
.login-form-panel {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px 32px;
  background: var(--bc-white);
}
.login-form-wrap { width: 100%; max-width: 420px; }
.login-header { margin-bottom: 32px; }
.login-header h2 { font-size: 28px; font-weight: 800; color: var(--bc-gray-900); margin-bottom: 6px; }
.login-header p  { color: var(--bc-gray-500); font-size: 14.5px; }

.password-wrap { position: relative; }
.password-wrap .form-control { padding-right: 44px; }
.pw-toggle {
  position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
  background: none; border: none; cursor: pointer; font-size: 16px; opacity: .6;
  transition: opacity .15s;
}
.pw-toggle:hover { opacity: 1; }

/* ── Demo accounts ─ */
.demo-accounts { margin-top: 32px; padding-top: 24px; border-top: 1px solid var(--bc-gray-100); }
.demo-title { font-size: 12px; color: var(--bc-gray-400); text-align: center; margin-bottom: 12px; }
.demo-title code { background: var(--bc-gray-100); padding: 1px 6px; border-radius: 4px; font-family: monospace; }
.demo-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; max-width: 520px; margin: 0 auto; }
.demo-btn {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 10px 8px;
  background: var(--bc-gray-50);
  border: 1.5px solid var(--bc-gray-200);
  border-radius: var(--radius);
  cursor: pointer;
  font-size: 11.5px;
  color: var(--bc-gray-600);
  transition: all .15s;
  font-weight: 600;
}
.demo-btn:hover { border-color: var(--bc-green-400); background: var(--bc-green-50); color: var(--bc-green-700); }
.demo-role {
  font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em;
  background: var(--bc-green-100); color: var(--bc-green-700);
  padding: 2px 7px; border-radius: var(--radius-full);
}

/* ── First-time login dialog ─ */
.fl-intro {
  font-size: 13.5px;
  color: var(--bc-gray-600);
  line-height: 1.5;
  margin-bottom: 18px;
}
.fl-hint {
  margin-top: 6px;
  font-size: 12px;
  color: var(--bc-gray-400);
}
.modal-body .form-group { margin-bottom: 16px; }
.modal-body .password-wrap { position: relative; }
.modal-body .password-wrap .form-control { padding-right: 44px; }

@media (max-width: 900px) {
  .login-page { grid-template-columns: 1fr; }
  .login-brand { display: none; }
}
</style>
