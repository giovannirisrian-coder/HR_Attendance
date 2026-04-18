<template>
  <div>
    <div class="page-header">
      <div>
        <h1 class="page-title">Create Attendance</h1>
        <p class="page-subtitle">Submit your clock-in or clock-out for today</p>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;max-width:960px;">
      <!-- Form card -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">Attendance Form</span>
          <span class="badge" :class="`badge-${todayRecord?.status || 'draft'}`">
            {{ todayRecord ? todayRecord.status : 'No Record' }}
          </span>
        </div>
        <div class="card-body">
          <div v-if="successMsg" class="alert alert-success"><span>✅</span> {{ successMsg }}</div>
          <div v-if="errorMsg"   class="alert alert-error">  <span>⚠️</span> {{ errorMsg }}</div>

          <form @submit.prevent="submitAttendance">
            <div class="form-group">
              <label class="form-label">Attendance Type</label>
              <select v-model="form.type" class="form-control" required>
                <option value="">— Select Type —</option>
                <option value="clock_in"  :disabled="!!todayRecord?.clock_in_time">
                  🟢 Clock In {{ todayRecord?.clock_in_time ? '(Already recorded)' : '' }}
                </option>
                <option value="clock_out" :disabled="!todayRecord?.clock_in_time || !!todayRecord?.clock_out_time">
                  🔴 Clock Out {{ todayRecord?.clock_out_time ? '(Already recorded)' : !todayRecord?.clock_in_time ? '(Clock in first)' : '' }}
                </option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">Date</label>
              <input v-model="form.attendance_date" type="date" class="form-control" required />
            </div>

            <div class="form-group">
              <label class="form-label">Time</label>
              <input v-model="form.time" type="time" class="form-control" required />
            </div>

            <!-- Geolocation -->
            <div class="form-group">
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

            <button type="submit" class="btn btn-primary w-full" :disabled="loading || geoStatus !== 'success'">
              <span v-if="loading" class="spinner" style="width:16px;height:16px;border-width:2px;"></span>
              {{ loading ? 'Submitting…' : 'Submit Attendance' }}
            </button>
          </form>
        </div>
      </div>

      <!-- Today's summary -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">Today's Summary</span>
          <span class="text-muted text-sm">{{ todayDate }}</span>
        </div>
        <div class="card-body">
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

            <div v-if="todayRecord" class="mt-4">
              <div class="detail-row">
                <span class="detail-label">Status</span>
                <span class="badge" :class="`badge-${todayRecord.status}`">{{ todayRecord.status }}</span>
              </div>
              <div v-if="todayRecord.clock_in_time && todayRecord.clock_out_time" class="detail-row">
                <span class="detail-label">Duration</span>
                <span class="detail-value font-bold">{{ calcDuration(todayRecord.clock_in_time, todayRecord.clock_out_time) }}</span>
              </div>
            </div>

            <div v-else class="empty-state" style="padding:32px 0;">
              <div class="empty-state-icon">📋</div>
              <h3>No attendance today</h3>
              <p>Clock in to start tracking</p>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import api from '../../utils/api';

const loading = ref(false);
const loadingRecord = ref(false);
const successMsg = ref('');
const errorMsg = ref('');
const geoStatus = ref('idle'); // idle | loading | success | error
const todayRecord = ref(null);

const today = new Date();
const todayDate = today.toLocaleDateString('en-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
const todayStr  = today.toISOString().split('T')[0];
const nowTime   = `${String(today.getHours()).padStart(2,'0')}:${String(today.getMinutes()).padStart(2,'0')}`;

const form = reactive({
  type: '',
  attendance_date: todayStr,
  time: nowTime,
  latitude: null,
  longitude: null,
  address: '',
});

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
      // Reverse geocode via open-source Nominatim
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

const loadTodayRecord = async () => {
  loadingRecord.value = true;
  try {
    const { data } = await api.get('/attendance/my', { params: { start_date: todayStr, end_date: todayStr } });
    todayRecord.value = data.data?.[0] || null;
  } catch { /* silent */ } finally { loadingRecord.value = false; }
};

const submitAttendance = async () => {
  loading.value = true;
  successMsg.value = '';
  errorMsg.value = '';
  try {
    const { data } = await api.post('/attendance', form);
    if (data.success) {
      successMsg.value = data.message;
      await loadTodayRecord();
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

onMounted(() => { loadTodayRecord(); captureLocation(); });
</script>

<style scoped>
.geo-status {
  padding: 12px;
  border-radius: var(--radius);
  background: var(--bc-gray-50);
  border: 1.5px solid var(--bc-gray-200);
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13.5px;
  color: var(--bc-gray-600);
  min-height: 48px;
  justify-content: center;
}
.geo-status.success { background: var(--bc-green-50); border-color: var(--bc-green-300); color: var(--bc-green-800); }
.geo-status.error   { background: #fee2e2; border-color: #fca5a5; color: #991b1b; }
.geo-status small   { font-size: 11.5px; opacity: .75; }

.summary-row { display: flex; gap: 20px; }
.summary-item { flex: 1; text-align: center; padding: 20px 0; }
.summary-divider { width: 1px; background: var(--bc-gray-100); }
.summary-label { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; font-weight: 700; color: var(--bc-gray-400); margin-bottom: 8px; }
.summary-value { font-size: 26px; font-weight: 800; }
.summary-sub { font-size: 11px; color: var(--bc-gray-400); margin-top: 4px; }
.text-green { color: var(--bc-green-600); }
.text-red { color: var(--bc-rejected); }
.text-muted { color: var(--bc-gray-300); }

.detail-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--bc-gray-50); }
.detail-label { font-size: 13px; color: var(--bc-gray-500); }
.detail-value { font-size: 13.5px; color: var(--bc-gray-700); }
.mt-4 { margin-top: 16px; }

@media (max-width: 768px) {
  div[style*="grid-template-columns"] { grid-template-columns: 1fr !important; }
}
</style>
