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
                <option value="clock_in" :disabled="!canClockIn">
                  🟢 Clock In {{ canClockIn ? '' : '(Complete latest Clock Out first)' }}
                </option>
                <option value="clock_out" :disabled="!canClockOut">
                  🔴 Clock Out {{ canClockOut ? '' : '(Clock In first)' }}
                </option>
              </select>
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
              <p class="text-sm text-muted" style="margin-top:6px;">
                Choose a date between {{ attendanceDateMin }} and today (max. 10 calendar days back). The server enforces the same range.
              </p>
            </div>

            <div class="form-group">
              <label class="form-label">Time</label>
              <input v-model="form.time" type="time" class="form-control" required />
            </div>

            <div class="form-group">
              <label class="form-label">NIK</label>
              <div class="form-control" style="background:var(--bc-gray-50);color:var(--bc-gray-700);font-family:ui-monospace,monospace;">
                {{ todayRecord?.nik || '—' }}
              </div>
              <p class="text-sm text-muted" style="margin-top:6px;">Diambil dari master karyawan (employees). Hubungi HR jika kosong atau salah.</p>
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

          <div class="ot-divider" />

          <form @submit.prevent="submitOvertime">
            <h3 class="ot-section-title">Overtime</h3>
            <div class="form-group">
              <label class="form-label">Type</label>
              <div class="ot-type-pill">Range Time</div>
            </div>
            <p class="text-sm text-muted" style="margin-bottom:12px;">Uses the same date as in the attendance form above.</p>
            <div class="form-group">
              <label class="form-label">Start time</label>
              <input v-model="otForm.ot_start_time" type="time" class="form-control" :disabled="!canEditOvertime" required />
            </div>
            <div class="form-group">
              <label class="form-label">End time</label>
              <input v-model="otForm.ot_end_time" type="time" class="form-control" :disabled="!canEditOvertime" required />
            </div>
            <div class="form-group">
              <label class="form-label">Summary <span class="text-muted text-sm">(optional)</span></label>
              <textarea
                v-model="otForm.ot_summary"
                class="form-control"
                rows="2"
                maxlength="2000"
                placeholder="Brief description if needed…"
                :disabled="!canEditOvertime"
              />
            </div>
            <div v-if="otSuccessMsg" class="alert alert-success"><span>✅</span> {{ otSuccessMsg }}</div>
            <div v-if="otErrorMsg" class="alert alert-error"><span>⚠️</span> {{ otErrorMsg }}</div>
            <button type="submit" class="btn btn-outline w-full" :disabled="otLoading || !canEditOvertime">
              <span v-if="otLoading" class="spinner" style="width:16px;height:16px;border-width:2px;"></span>
              {{ otLoading ? 'Saving…' : 'Save overtime' }}
            </button>
            <p v-if="!canEditOvertime && todayRecord" class="text-sm text-muted" style="margin-top:10px;">
              Overtime can be saved after clock-in, while the record is pending supervisor approval.
            </p>
            <p v-else-if="!todayRecord" class="text-sm text-muted" style="margin-top:10px;">
              Clock in for the selected date before saving overtime.
            </p>
          </form>
        </div>
      </div>

      <!-- Today's summary + Overtime summary (beside each other when OT exists) -->
      <div class="summary-aside" style="width:100%; max-width:none; margin-bottom:32px;">
        <div
          class="summary-pair"
          :class="{ 'summary-pair--split': hasOtSummary }"
          style="display: flex; gap: 24px; flex-wrap: wrap; width: 100%; align-items: stretch;"
        >
          <div
            class="card"
            style="
              flex: 1 1 320px;
              min-width: 320px;
              max-width: 540px;
              box-sizing: border-box;
              overflow: visible;
              min-height: 370px;
            "
          >
            <div class="card-header" style="display: flex; justify-content: space-between; align-items: flex-end;">
              <span class="card-title" style="font-size: 1.17em;">Daily summary</span>
              <span class="text-muted text-sm" style="white-space:nowrap; margin-left: 12px;">{{ summaryDateLabel }}</span>
            </div>
            <div class="card-body" style="overflow-x: auto;">
              <div v-if="loadingRecord" class="loading-overlay" style="padding:24px;">
                <span class="spinner"></span> Loading…
              </div>
              <template v-else>
                <div class="summary-row" style="display: flex; flex-direction: row; gap: 16px;">
                  <div class="summary-item" style="flex: 1 1 0; min-width: 0;">
                    <div class="summary-label">Clock In</div>
                    <div class="summary-value" :class="todayRecord?.clock_in_time ? 'text-green' : 'text-muted'">
                      {{ todayRecord?.clock_in_time || '—' }}
                    </div>
                    <div v-if="todayRecord?.clock_in_lat != null && todayRecord?.clock_in_lat !== ''" class="summary-sub">
                      📍 {{ fmtCoord(todayRecord.clock_in_lat, 5) }}, {{ fmtCoord(todayRecord.clock_in_lng, 5) }}
                    </div>
                  </div>
                  <div class="summary-divider" style="width:2px; background:#efefef; margin:0 8px;"></div>
                  <div class="summary-item" style="flex: 1 1 0; min-width: 0;">
                    <div class="summary-label">Clock Out</div>
                    <div class="summary-value" :class="todayRecord?.clock_out_time ? 'text-red' : 'text-muted'">
                      {{ todayRecord?.clock_out_time || '—' }}
                    </div>
                    <div v-if="todayRecord?.clock_out_lat != null && todayRecord?.clock_out_lat !== ''" class="summary-sub">
                      📍 {{ fmtCoord(todayRecord.clock_out_lat, 5) }}, {{ fmtCoord(todayRecord.clock_out_lng, 5) }}
                    </div>
                  </div>
                </div>

                <div v-if="todayRecord" class="mt-4" style="margin-top: 20px;">
                  <div class="detail-row" style="display:flex; justify-content:space-between; margin-bottom:8px;">
                    <span class="detail-label" style="flex-shrink:0;">NIK</span>
                    <span class="detail-value" style="word-break:break-all; max-width:70%;">{{ todayRecord.nik || '—' }}</span>
                  </div>
                  <div class="detail-row" style="display:flex; justify-content:space-between; margin-bottom:8px;">
                    <span class="detail-label" style="flex-shrink:0;">Status</span>
                    <span class="badge" :class="`badge-${todayRecord.status}`">{{ todayRecord.status }}</span>
                  </div>
                  <div v-if="todayRecord.clock_in_time && todayRecord.clock_out_time" class="detail-row" style="display:flex; justify-content:space-between;">
                    <span class="detail-label" style="flex-shrink:0;">Duration</span>
                    <span class="detail-value font-bold">{{ calcDuration(todayRecord.clock_in_time, todayRecord.clock_out_time) }}</span>
                  </div>
                </div>

                <div v-else class="empty-state" style="padding:32px 0;">
                  <div class="empty-state-icon">📋</div>
                  <h3>No attendance for this date</h3>
                  <p>Clock in to start tracking</p>
                </div>
              </template>
            </div>
          </div>

          <div
            v-if="hasOtSummary"
            class="card"
            style="
              flex: 1 1 320px;
              min-width: 320px;
              max-width: 420px;
              box-sizing: border-box;
              overflow: visible;
            "
          >
            <div class="card-header" style="display: flex; justify-content: space-between; align-items: flex-end;">
              <span class="card-title" style="font-size: 1.17em;">Overtime Summary</span>
              <span class="badge" :class="`badge-${todayRecord?.status || 'draft'}`">{{ todayRecord?.status }}</span>
            </div>
            <div class="card-body" style="overflow-x: auto;">
              <div class="summary-row single">
                <div class="summary-item">
                  <div class="summary-label">Range (start – end)</div>
                  <div class="summary-value summary-value--sm ot-range">
                    {{ fmtTimeHm(todayRecord.ot_start_time) }} – {{ fmtTimeHm(todayRecord.ot_end_time) }}
                  </div>
                  <div class="summary-sub">Type: Range Time</div>
                </div>
              </div>
              <div v-if="todayRecord.ot_start_time && todayRecord.ot_end_time" class="detail-row mt-4" style="display:flex; justify-content:space-between;">
                <span class="detail-label" style="flex-shrink:0;">Duration</span>
                <span class="detail-value font-bold">{{ calcDuration(fmtTimeHm(todayRecord.ot_start_time), fmtTimeHm(todayRecord.ot_end_time)) }}</span>
              </div>
              <div v-if="todayRecord.ot_summary" class="ot-summary-text" style="margin-top:18px;">
                <div class="summary-label" style="margin-bottom:6px;">Summary</div>
                <p style="white-space: pre-line;">{{ todayRecord.ot_summary }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue';
import api from '../../utils/api';
import { formatYmdLocal, addDaysToYmdLocal } from '../../utils/calendarDate';

const loading = ref(false);
const loadingRecord = ref(false);
const successMsg = ref('');
const errorMsg = ref('');
const otLoading = ref(false);
const otSuccessMsg = ref('');
const otErrorMsg = ref('');
const geoStatus = ref('idle'); // idle | loading | success | error
const todayRecord = ref(null);
const selectedDateRows = ref([]);

const now = new Date();
const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

const attendanceDateMax = computed(() => formatYmdLocal());
const attendanceDateMin = computed(() => addDaysToYmdLocal(attendanceDateMax.value, -10));

const form = reactive({
  type: '',
  attendance_date: formatYmdLocal(),
  time: nowTime,
  latitude: null,
  longitude: null,
  address: '',
});

const otForm = reactive({
  ot_start_time: '',
  ot_end_time: '',
  ot_summary: '',
});

const summaryDateLabel = computed(() => {
  try {
    return new Date(`${form.attendance_date}T12:00:00`).toLocaleDateString('en-ID', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
  } catch {
    return form.attendance_date;
  }
});

const hasOtSummary = computed(() => {
  const r = todayRecord.value;
  return !!(r?.ot_start_time && r?.ot_end_time);
});

const canEditOvertime = computed(() => {
  const r = todayRecord.value;
  return !!(r?.clock_in_time && r?.status === 'pending');
});

const latestOpenPairRecord = computed(() => {
  return selectedDateRows.value.find((r) => !!(r?.clock_in_time && !r?.clock_out_time)) || null;
});

const canClockOut = computed(() => !!latestOpenPairRecord.value);
const canClockIn = computed(() => !latestOpenPairRecord.value);

const fmtTimeHm = (t) => {
  if (t === undefined || t === null || t === '') return '—';
  return String(t).slice(0, 5);
};

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

const syncOtFormFromRecord = () => {
  const r = todayRecord.value;
  if (!r) {
    otForm.ot_start_time = '';
    otForm.ot_end_time = '';
    otForm.ot_summary = '';
    return;
  }
  otForm.ot_start_time = r.ot_start_time ? fmtTimeHm(r.ot_start_time) : '';
  otForm.ot_end_time = r.ot_end_time ? fmtTimeHm(r.ot_end_time) : '';
  otForm.ot_summary = r.ot_summary || '';
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
    syncOtFormFromRecord();
  } catch {
    selectedDateRows.value = [];
    todayRecord.value = null;
    syncOtFormFromRecord();
  } finally { loadingRecord.value = false; }
};

const submitOvertime = async () => {
  otSuccessMsg.value = '';
  otErrorMsg.value = '';
  if (!canEditOvertime.value) return;
  clampAttendanceDateToWindow();
  const min = attendanceDateMin.value;
  const max = attendanceDateMax.value;
  if (form.attendance_date < min || form.attendance_date > max) {
    otErrorMsg.value = 'Date must be within the last 10 calendar days through today.';
    return;
  }
  if (!otForm.ot_start_time || !otForm.ot_end_time) {
    otErrorMsg.value = 'Start and end time are required.';
    return;
  }
  otLoading.value = true;
  try {
    const { data } = await api.post('/attendance/overtime', {
      attendance_date: form.attendance_date,
      ot_start_time: otForm.ot_start_time,
      ot_end_time: otForm.ot_end_time,
      ot_summary: otForm.ot_summary || null,
    });
    if (data.success) {
      otSuccessMsg.value = data.message || 'Saved.';
      todayRecord.value = data.data;
      syncOtFormFromRecord();
    }
  } catch (err) {
    otErrorMsg.value = err.response?.data?.message || 'Save failed.';
  } finally {
    otLoading.value = false;
  }
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
  const prev = form.attendance_date;
  clampAttendanceDateToWindow();
  if (prev !== form.attendance_date) {
    loadRecordForSelectedDate();
  }
};

onMounted(() => {
  clampAttendanceDateToWindow();
  loadRecordForSelectedDate();
  captureLocation();
  dateTick = window.setInterval(syncDateWindow, 60_000);
});

onBeforeUnmount(() => {
  if (dateTick) window.clearInterval(dateTick);
});
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

.create-attendance-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  max-width: 1120px;
  align-items: start;
}
.summary-aside { min-width: 0; }
.summary-pair {
  display: grid;
  gap: 16px;
}
.summary-pair--split {
  grid-template-columns: 1fr 1fr;
}
.summary-row.single .summary-item { padding: 12px 0; }
.summary-value--sm { font-size: 20px !important; }
.ot-range { color: #b45309; }
.ot-summary-text {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--bc-gray-100);
  font-size: 13px;
  color: var(--bc-gray-700);
  line-height: 1.45;
}
.ot-summary-text p { margin: 0; white-space: pre-wrap; }
.ot-divider {
  margin: 20px 0;
  border: 0;
  border-top: 1px solid var(--bc-gray-200);
}
.ot-section-title {
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--bc-green-700);
  margin: 0 0 14px;
}
.ot-type-pill {
  display: inline-block;
  padding: 8px 12px;
  border-radius: var(--radius);
  background: var(--bc-gray-50);
  border: 1px solid var(--bc-gray-200);
  font-size: 13.5px;
  font-weight: 600;
  color: var(--bc-gray-700);
}

@media (max-width: 900px) {
  .create-attendance-grid { grid-template-columns: 1fr; }
  .summary-pair--split { grid-template-columns: 1fr; }
}
</style>
