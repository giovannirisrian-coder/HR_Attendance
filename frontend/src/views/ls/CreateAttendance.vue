<template>
  <div>
    <div class="page-header">
      <div>
        <h1 class="page-title">Create Attendance</h1>
        <p class="page-subtitle">Submit clock-in or clock-out for the selected date (up to 10 calendar days back)</p>
      </div>
    </div>

    <div class="create-attendance-grid">
      <!-- Form card -->
      <div class="card form-card">
        <div class="card-header">
          <span class="card-title">Attendance Form</span>
          <span class="badge" :class="`badge-${todayRecord?.status || 'draft'}`">
            {{ todayRecord ? todayRecord.status : 'No Record' }}
          </span>
        </div>
        <div class="card-body card-body--tight">
          <div v-if="successMsg" class="alert alert-success"><span>✅</span> {{ successMsg }}</div>
          <div v-if="errorMsg"   class="alert alert-error">  <span>⚠️</span> {{ errorMsg }}</div>

          <form @submit.prevent="submitAttendance" class="attendance-form">
            <div class="form-grid">
              <div class="form-group">
                <label class="form-label">Attendance Type</label>
                <select v-model="form.type" class="form-control" required>
                  <option value="">— Select Type —</option>
                  <option value="clock_in" :disabled="!canClockIn">
                    🟢 Clock In {{ canClockIn ? '' : '(Complete latest Clock Out first)' }}
                  </option>
                  <option value="clock_out" :disabled="!canClockOut">
                    🔴 Clock Out {{ canClockOut ? '' : '(Clock In first)' }}
                  </option>
                </select>
              </div>

              <div class="form-group">
                <label class="form-label">NPK</label>
                <div
                  class="form-control form-control--readonly"
                  :class="{ 'form-control--placeholder': !displayNpk }"
                  :title="displayNpk ? 'Pre-filled from your employee profile' : 'Linking to employee profile…'"
                  aria-readonly="true"
                >
                  <template v-if="displayNpk">{{ displayNpk }}</template>
                  <template v-else-if="loadingProfile">
                    <span class="spinner" style="width:12px;height:12px;border-width:2px;"></span>
                    Loading NPK…
                  </template>
                  <template v-else>NPK belum tertaut. Hubungi HR.</template>
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">Date</label>
                <input
                  v-model="form.attendance_date"
                  type="date"
                  class="form-control"
                  required
                  :min="attendanceDateMin"
                  :max="attendanceDateMax"
                  @change="onAttendanceDateChange"
                />
              </div>

              <div class="form-group">
                <label class="form-label">Time</label>
                <input
                  v-model="form.time"
                  type="time"
                  class="form-control"
                  :class="{ 'form-control--error': timeError }"
                  required
                  min="00:00"
                  :max="timeMax"
                  @input="onTimeInput"
                  @change="onTimeChange"
                />
                <p v-if="timeError" class="field-error">{{ timeError }}</p>
              </div>
            </div>

            <p class="form-helper text-sm text-muted">
              Allowed range: {{ attendanceDateMin }} → {{ attendanceDateMax }} (server enforces the same window).
            </p>

            <div class="form-group form-group--tight">
              <label class="form-label">Location (Auto-captured)</label>
              <div class="geo-status" :class="geoStatus">
                <template v-if="geoStatus === 'loading'">
                  <span class="spinner" style="width:14px;height:14px;border-width:2px;"></span>
                  Capturing location…
                </template>
                <template v-else-if="geoStatus === 'success'">
                  📍 {{ fmtCoord(form.latitude, 6) }}, {{ fmtCoord(form.longitude, 6) }}
                  <small v-if="form.address">{{ form.address }}</small>
                </template>
                <template v-else-if="geoStatus === 'error'">
                  ⚠️ Unable to capture location. Please enable GPS.
                </template>
                <template v-else>
                  <button type="button" class="btn btn-outline btn-sm" @click="captureLocation">
                    📍 Capture Location
                  </button>
                </template>
              </div>
            </div>

            <button type="submit" class="btn btn-primary w-full submit-btn" :disabled="loading || geoStatus !== 'success' || !!timeError">
              <span v-if="loading" class="spinner" style="width:16px;height:16px;border-width:2px;"></span>
              {{ loading ? 'Submitting…' : 'Submit Attendance' }}
            </button>
          </form>
        </div>
      </div>

      <!-- Daily summary -->
      <div class="card summary-card">
        <div class="card-header">
          <span class="card-title">Daily Summary</span>
          <span class="text-muted text-sm summary-date">{{ summaryDateLabel }}</span>
        </div>
        <div class="card-body card-body--tight">
          <div v-if="loadingRecord" class="loading-overlay" style="padding:24px;">
            <span class="spinner"></span> Loading…
          </div>
          <template v-else>
            <div class="summary-row">
              <div class="summary-item">
                <div class="summary-label">Clock In</div>
                <div class="summary-value" :class="todayRecord?.clock_in_time ? 'text-green' : 'text-muted'">
                  {{ todayRecord?.clock_in_time || '—' }}
                </div>
                <div v-if="todayRecord?.clock_in_lat != null && todayRecord?.clock_in_lat !== ''" class="summary-sub">
                  📍 {{ fmtCoord(todayRecord.clock_in_lat, 5) }}, {{ fmtCoord(todayRecord.clock_in_lng, 5) }}
                </div>
              </div>
              <div class="summary-divider"></div>
              <div class="summary-item">
                <div class="summary-label">Clock Out</div>
                <div class="summary-value" :class="todayRecord?.clock_out_time ? 'text-red' : 'text-muted'">
                  {{ todayRecord?.clock_out_time || '—' }}
                </div>
                <div v-if="todayRecord?.clock_out_lat != null && todayRecord?.clock_out_lat !== ''" class="summary-sub">
                  📍 {{ fmtCoord(todayRecord.clock_out_lat, 5) }}, {{ fmtCoord(todayRecord.clock_out_lng, 5) }}
                </div>
              </div>
            </div>

            <div v-if="todayRecord" class="detail-list">
              <div class="detail-row">
                <span class="detail-label">NPK</span>
                <span class="detail-value">{{ todayRecord.npk || displayNpk || '—' }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Status</span>
                <span class="badge" :class="`badge-${todayRecord.status}`">{{ todayRecord.status }}</span>
              </div>
              <div v-if="todayRecord.clock_in_time && todayRecord.clock_out_time" class="detail-row">
                <span class="detail-label">Duration</span>
                <span class="detail-value font-bold">{{ calcDuration(todayRecord.clock_in_time, todayRecord.clock_out_time) }}</span>
              </div>
            </div>

            <div v-else class="empty-state empty-state--compact">
              <div class="empty-state-icon">📋</div>
              <h3>No attendance for this date</h3>
              <p>Clock in to start tracking</p>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue';
import api from '../../utils/api';
import { formatYmdLocal, addDaysToYmdLocal } from '../../utils/calendarDate';
import { getUser, updateCachedUser } from '../../utils/auth';

const loading = ref(false);
const loadingRecord = ref(false);
const loadingProfile = ref(false);
const successMsg = ref('');
const errorMsg = ref('');
const geoStatus = ref('idle'); // idle | loading | success | error
const todayRecord = ref(null);
const selectedDateRows = ref([]);
/**
 * NPK from the auth context (hr_employees.npk linked to users.user_id).
 * Surfaced in the form even before any attendance record exists so the
 * LS user can confirm their identifier prior to submitting the Biometric
 * Capture / Correction request that flows downstream to the Leader
 * Employee.
 */
const profileNpk = ref(getUser()?.npk || null);

const clockNow = ref(new Date());

const formatTimeHm = (d) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

const attendanceDateMax = computed(() => formatYmdLocal());
const attendanceDateMin = computed(() => addDaysToYmdLocal(attendanceDateMax.value, -10));

const form = reactive({
  type: '',
  attendance_date: formatYmdLocal(),
  time: formatTimeHm(clockNow.value),
  latitude: null,
  longitude: null,
  address: '',
});

const isAttendanceDateToday = computed(() => form.attendance_date === attendanceDateMax.value);

/** For today: cap at current local time; past dates allow any time that day. */
const timeMax = computed(() => (isAttendanceDateToday.value ? formatTimeHm(clockNow.value) : '23:59'));

const timeError = computed(() => {
  if (!form.time || !isAttendanceDateToday.value) return '';
  if (form.time > timeMax.value) return 'Time cannot be in the future.';
  return '';
});

/**
 * Prefer the master profile NPK so the field stays populated in the
 * "No Record" state; fall back to the record's NPK only if the auth
 * context hasn't supplied one yet (e.g. legacy cached session).
 */
const displayNpk = computed(() => profileNpk.value || todayRecord.value?.npk || '');

const summaryDateLabel = computed(() => {
  try {
    return new Date(`${form.attendance_date}T12:00:00`).toLocaleDateString('en-ID', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
  } catch {
    return form.attendance_date;
  }
});

/**
 * Multi-record-per-date support: an "open pair" is a clock-in without a matching
 * clock-out. Driving canClockIn/canClockOut from this lets the LS file additional
 * correction records on the same date as long as the previous pair is closed.
 */
const latestOpenPairRecord = computed(() => {
  return selectedDateRows.value.find((r) => !!(r?.clock_in_time && !r?.clock_out_time)) || null;
});

const canClockOut = computed(() => !!latestOpenPairRecord.value);
const canClockIn = computed(() => !latestOpenPairRecord.value);

/** MySQL DECIMAL / JSON often arrives as strings; `.toFixed` only exists on numbers. */
const fmtCoord = (val, digits = 5) => {
  const n = Number(val);
  return Number.isFinite(n) ? n.toFixed(digits) : '—';
};

const captureLocation = () => {
  if (!navigator.geolocation) { geoStatus.value = 'error'; return; }
  geoStatus.value = 'loading';
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      form.latitude  = pos.coords.latitude;
      form.longitude = pos.coords.longitude;
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${form.latitude}&lon=${form.longitude}&format=json`);
        const d = await r.json();
        form.address = d.display_name || '';
      } catch { form.address = ''; }
      geoStatus.value = 'success';
    },
    () => { geoStatus.value = 'error'; },
    { enableHighAccuracy: true, timeout: 10000 }
  );
};

const clampAttendanceDateToWindow = () => {
  const min = attendanceDateMin.value;
  const max = attendanceDateMax.value;
  if (form.attendance_date < min) form.attendance_date = min;
  if (form.attendance_date > max) form.attendance_date = max;
};

const onAttendanceDateChange = () => {
  clampAttendanceDateToWindow();
  loadRecordForSelectedDate();
};

const onTimeInput = () => {
  if (errorMsg.value === 'Time cannot be in the future.') errorMsg.value = '';
};

const onTimeChange = () => {
  onTimeInput();
};

const loadRecordForSelectedDate = async () => {
  loadingRecord.value = true;
  try {
    clampAttendanceDateToWindow();
    const d = form.attendance_date;
    const { data } = await api.get('/attendance/my', { params: { start_date: d, end_date: d } });
    selectedDateRows.value = (Array.isArray(data.data) ? data.data : [])
      .slice()
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    todayRecord.value = selectedDateRows.value[0] || null;
  } catch {
    selectedDateRows.value = [];
    todayRecord.value = null;
  } finally { loadingRecord.value = false; }
};

const submitAttendance = async () => {
  clampAttendanceDateToWindow();
  const min = attendanceDateMin.value;
  const max = attendanceDateMax.value;
  if (form.attendance_date < min || form.attendance_date > max) {
    errorMsg.value = 'Date must be within the last 10 calendar days through today.';
    return;
  }
  if (form.type === 'clock_in' && !canClockIn.value) {
    errorMsg.value = 'Please complete clock-out for the latest clock-in before creating a new pair.';
    return;
  }
  if (form.type === 'clock_out' && !canClockOut.value) {
    errorMsg.value = 'Please submit clock-in first for this date.';
    return;
  }
  if (timeError.value) {
    errorMsg.value = timeError.value;
    return;
  }
  loading.value = true;
  successMsg.value = '';
  errorMsg.value = '';
  try {
    const payload = { ...form };
    const { data } = await api.post('/attendance', payload);
    if (data.success) {
      successMsg.value = data.message;
      await loadRecordForSelectedDate();
      form.type = '';
    }
  } catch (err) {
    errorMsg.value = err.response?.data?.message || 'Submission failed.';
  } finally { loading.value = false; }
};

const calcDuration = (inTime, outTime) => {
  const [ih, im] = inTime.split(':').map(Number);
  const [oh, om] = outTime.split(':').map(Number);
  const mins = (oh * 60 + om) - (ih * 60 + im);
  if (mins < 0) return '—';
  return `${Math.floor(mins/60)}h ${mins%60}m`;
};

let dateTick;
/** Keep selected date within the allowed window when the calendar day rolls over. */
const syncDateWindow = () => {
  clockNow.value = new Date();
  const prev = form.attendance_date;
  clampAttendanceDateToWindow();
  if (prev !== form.attendance_date) {
    loadRecordForSelectedDate();
  }
};

/**
 * Pre-fetch the LS user's NPK from the auth profile when the cached session
 * doesn't have it yet (older logins). Updates the local cache so subsequent
 * page visits show NPK instantly without an extra round-trip.
 */
const ensureProfileNpk = async () => {
  if (profileNpk.value) return;
  loadingProfile.value = true;
  try {
    const { data } = await api.get('/auth/profile');
    const fetchedNpk = data?.user?.npk || null;
    if (fetchedNpk) {
      profileNpk.value = fetchedNpk;
      updateCachedUser({ npk: fetchedNpk });
    }
  } catch {
    /* Silent: NPK still falls back to the record's npk when one exists. */
  } finally {
    loadingProfile.value = false;
  }
};

onMounted(() => {
  clampAttendanceDateToWindow();
  ensureProfileNpk();
  loadRecordForSelectedDate();
  captureLocation();
  dateTick = window.setInterval(syncDateWindow, 60_000);
});

onBeforeUnmount(() => {
  if (dateTick) window.clearInterval(dateTick);
});
</script>

<style scoped>
/* ── Layout ─────────────────────────────────────────────── */
.create-attendance-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
  gap: 20px;
  max-width: 1080px;
  align-items: start;
}
.card-body--tight { padding: 18px 20px 20px; }

/* ── Form ───────────────────────────────────────────────── */
.attendance-form { display: flex; flex-direction: column; gap: 0; }
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 18px;
  margin-bottom: 6px;
}
.form-grid .form-group { margin-bottom: 0; }
.form-group--tight { margin-bottom: 14px; }
.form-helper { margin: 0 0 14px; }
.form-control--readonly {
  background: var(--bc-gray-50);
  color: var(--bc-gray-700);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  cursor: not-allowed;
}
.form-control--placeholder {
  color: var(--bc-gray-400);
  font-family: inherit;
  font-style: italic;
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
.submit-btn { margin-top: 4px; }

/* ── Geolocation pill ───────────────────────────────────── */
.geo-status {
  padding: 10px 12px;
  border-radius: var(--radius);
  background: var(--bc-gray-50);
  border: 1.5px solid var(--bc-gray-200);
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: var(--bc-gray-600);
  min-height: 44px;
  justify-content: center;
}
.geo-status.success { background: var(--bc-green-50); border-color: var(--bc-green-300); color: var(--bc-green-800); }
.geo-status.error   { background: #fee2e2; border-color: #fca5a5; color: #991b1b; }
.geo-status small   { font-size: 11.5px; opacity: .75; }

/* ── Daily summary ──────────────────────────────────────── */
.summary-card { position: sticky; top: 16px; }
.summary-date { white-space: nowrap; margin-left: 12px; }
.summary-row { display: flex; gap: 12px; align-items: stretch; }
.summary-item { flex: 1; text-align: center; padding: 14px 4px; min-width: 0; }
.summary-divider { width: 1px; background: var(--bc-gray-100); }
.summary-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: .08em;
  font-weight: 700;
  color: var(--bc-gray-400);
  margin-bottom: 6px;
}
.summary-value { font-size: 24px; font-weight: 800; line-height: 1.15; }
.summary-sub { font-size: 11px; color: var(--bc-gray-400); margin-top: 4px; word-break: break-all; }
.text-green { color: var(--bc-green-600); }
.text-red { color: var(--bc-rejected); }
.text-muted { color: var(--bc-gray-300); }

.detail-list { margin-top: 14px; }
.detail-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 7px 0;
  border-bottom: 1px solid var(--bc-gray-50);
}
.detail-row:last-child { border-bottom: 0; }
.detail-label { font-size: 12.5px; color: var(--bc-gray-500); }
.detail-value { font-size: 13px; color: var(--bc-gray-700); }

.empty-state--compact { padding: 28px 12px; }
.empty-state--compact .empty-state-icon { font-size: 36px; margin-bottom: 10px; }

/* ── Responsive ─────────────────────────────────────────── */
@media (max-width: 960px) {
  .create-attendance-grid { grid-template-columns: 1fr; gap: 16px; }
  .summary-card { position: static; }
}
@media (max-width: 520px) {
  .form-grid { grid-template-columns: 1fr; }
}
</style>
