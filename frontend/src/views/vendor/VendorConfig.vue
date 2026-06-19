<template>
  <div class="vendor-config">
    <div class="page-header">
      <div>
        <h1 class="page-title">Configuration</h1>
        <p class="page-subtitle">Set your monthly reporting window for attendance, overtime, and leave data</p>
      </div>
    </div>

    <div v-if="loading" class="card loading-card">
      <span class="spinner"></span> Loading configuration…
    </div>

    <template v-else>
      <div class="config-grid">
        <div class="card config-card">
          <div class="card-header">
            <span class="card-title">Close Book Date</span>
          </div>
          <div class="card-body">
            <p class="config-intro">
              Your <strong>Close Book Date</strong> defines the start and end dates used when aggregates attendance, overtime, and leave for each monthly report, timesheet PDF, and BAST package.
              Choose the day that matches your vendor's financial closing cycle.
            </p>

            <div class="form-group">
              <label class="form-label" for="close-book-date">Close Book Date</label>
              <select
                id="close-book-date"
                v-model="selectedCloseBook"
                class="form-control config-select"
                :disabled="saving"
              >
                <option v-for="opt in dayOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
                <option value="eom">End of the month</option>
              </select>
            </div>

            <div class="examples-panel">
              <h3 class="examples-title">How your selection affects reporting</h3>
              <ul class="examples-list">
                <li>
                  <strong>Option 1</strong> — Fetches data from the 1st of the selected month to the last day of that month.
                </li>
                <li>
                  <strong>Option 11</strong> — Fetches data from the 11th of the previous month to the 10th of the selected month.
                </li>
                <li>
                  <strong>End of the month</strong> — Fetches data from the last day of the previous month to one day before the last day of the selected month.
                </li>
              </ul>
            </div>

            <div v-if="previewLabel" class="preview-panel">
              <div class="preview-label">Preview for {{ previewMonthName }} {{ previewYear }}</div>
              <div class="preview-range">{{ previewLabel }}</div>
            </div>

            <p v-if="saveMessage" class="status-msg" :class="saveOk ? 'status-ok' : 'status-err'">
              {{ saveMessage }}
            </p>

            <div class="form-actions">
              <button type="button" class="btn btn-primary" :disabled="saving || !dirty" @click="saveConfig">
                {{ saving ? 'Saving…' : 'Save configuration' }}
              </button>
            </div>
          </div>
        </div>

        <div class="card info-card">
          <div class="card-header">
            <span class="card-title">Vendor profile</span>
          </div>
          <div class="card-body">
            <dl class="profile-dl">
              <dt>Vendor name</dt>
              <dd>{{ vendor?.name || '—' }}</dd>
              <dt>Vendor code</dt>
              <dd>{{ vendor?.code || '—' }}</dd>
              <dt>Current setting</dt>
              <dd>{{ currentLabel }}</dd>
            </dl>
            <p class="info-note">
              Changes apply to all future monthly report views and PDF downloads. Previously submitted
              BAST packages retain the data captured at submission time.
            </p>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import api from '../../utils/api';

const CLOSE_BOOK_EOM = 28;

function pad2(n) {
  return String(n).padStart(2, '0');
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function normalizeCloseBook(val) {
  if (val === 'eom') return CLOSE_BOOK_EOM;
  const n = parseInt(val, 10);
  if (n === CLOSE_BOOK_EOM) return CLOSE_BOOK_EOM;
  if (n >= 1 && n <= 27) return n;
  return 1;
}

function calcPeriod(closeBook, reportMonth, reportYear) {
  const month = Math.min(12, Math.max(1, reportMonth));
  const year = reportYear;
  const cfg = normalizeCloseBook(closeBook);

  if (cfg === 1) {
    const last = daysInMonth(year, month);
    return { start: `${year}-${pad2(month)}-01`, end: `${year}-${pad2(month)}-${pad2(last)}` };
  }

  let prevMonth = month - 1;
  let prevYear = year;
  if (prevMonth < 1) {
    prevMonth = 12;
    prevYear -= 1;
  }

  if (cfg === CLOSE_BOOK_EOM) {
    const prevLast = daysInMonth(prevYear, prevMonth);
    const currLast = daysInMonth(year, month);
    return {
      start: `${prevYear}-${pad2(prevMonth)}-${pad2(prevLast)}`,
      end: `${year}-${pad2(month)}-${pad2(currLast - 1)}`,
    };
  }

  return {
    start: `${prevYear}-${pad2(prevMonth)}-${pad2(cfg)}`,
    end: `${year}-${pad2(month)}-${pad2(cfg - 1)}`,
  };
}

function formatYmd(ymd) {
  const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [y, m, d] = ymd.split('-').map(Number);
  return `${d} ${MONTH_SHORT[m - 1]} ${y}`;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const loading = ref(true);
const saving = ref(false);
const vendor = ref(null);
const selectedCloseBook = ref('1');
const savedCloseBook = ref('1');
const previewLabel = ref('');
const previewMonth = ref(null);
const previewYear = ref(null);
const saveMessage = ref('');
const saveOk = ref(false);

const dayOptions = Array.from({ length: 27 }, (_, i) => {
  const n = i + 1;
  return { value: String(n), label: String(n) };
});

const dirty = computed(() => selectedCloseBook.value !== savedCloseBook.value);

const currentLabel = computed(() => {
  const v = savedCloseBook.value;
  if (v === 'eom') return 'End of the month';
  return v || '1';
});

const previewMonthName = computed(() => {
  const m = previewMonth.value;
  return m ? MONTH_NAMES[m - 1] : '';
});

function refreshPreview() {
  const now = new Date();
  const m = previewMonth.value || now.getMonth() + 1;
  const y = previewYear.value || now.getFullYear();
  const { start, end } = calcPeriod(selectedCloseBook.value, m, y);
  previewLabel.value = `${formatYmd(start)} – ${formatYmd(end)}`;
}

watch(selectedCloseBook, refreshPreview);

function applyConfigPayload(data) {
  vendor.value = data.vendor;
  const cb = data.vendor?.close_book_date ?? 1;
  const normalized = cb === 'eom' || cb === 28 ? 'eom' : String(cb);
  selectedCloseBook.value = normalized;
  savedCloseBook.value = normalized;
  if (data.example_period) {
    previewMonth.value = data.example_period.report_month;
    previewYear.value = data.example_period.report_year;
  }
  refreshPreview();
}

const loadConfig = async () => {
  loading.value = true;
  try {
    const { data } = await api.get('/reports/vendor/config');
    applyConfigPayload(data);
  } catch (e) {
    saveMessage.value = e.response?.data?.message || 'Failed to load configuration.';
    saveOk.value = false;
  } finally {
    loading.value = false;
  }
};

const saveConfig = async () => {
  saving.value = true;
  saveMessage.value = '';
  try {
    const { data } = await api.put('/reports/vendor/config', {
      close_book_date: selectedCloseBook.value,
    });
    applyConfigPayload(data);
    saveMessage.value = data.message || 'Configuration saved.';
    saveOk.value = true;
  } catch (e) {
    saveMessage.value = e.response?.data?.message || 'Failed to save configuration.';
    saveOk.value = false;
  } finally {
    saving.value = false;
  }
};

onMounted(loadConfig);
</script>

<style scoped>
.vendor-config {
  max-width: 960px;
}

.config-grid {
  display: grid;
  grid-template-columns: 1fr 280px;
  gap: 20px;
  align-items: start;
}

@media (max-width: 900px) {
  .config-grid {
    grid-template-columns: 1fr;
  }
}

.loading-card {
  padding: 48px;
  text-align: center;
  color: var(--bc-gray-600);
}

.config-card .card-body {
  padding-top: 8px;
}

.config-intro {
  color: var(--bc-gray-700);
  line-height: 1.6;
  margin-bottom: 20px;
  font-size: 0.95rem;
}

.config-select {
  max-width: 280px;
}

.examples-panel {
  margin-top: 24px;
  padding: 16px 18px;
  background: var(--bc-green-50, #ecfdf5);
  border: 1px solid var(--bc-green-200, #a7f3d0);
  border-radius: var(--radius);
}

.examples-title {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--bc-green-900, #0d3320);
  margin: 0 0 10px;
}

.examples-list {
  margin: 0;
  padding-left: 1.2rem;
  color: var(--bc-gray-700);
  font-size: 0.88rem;
  line-height: 1.65;
}

.examples-list li + li {
  margin-top: 8px;
}

.preview-panel {
  margin-top: 20px;
  padding: 14px 16px;
  background: #fff;
  border: 1px solid var(--bc-gray-200);
  border-left: 4px solid var(--bc-green-700, #145228);
  border-radius: var(--radius);
}

.preview-label {
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--bc-gray-500);
  margin-bottom: 4px;
}

.preview-range {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--bc-green-900, #0d3320);
}

.form-actions {
  margin-top: 24px;
}

.status-msg {
  margin-top: 16px;
  font-size: 0.9rem;
}

.status-ok {
  color: var(--bc-green-700, #145228);
}

.status-err {
  color: var(--bc-rejected, #b91c1c);
}

.profile-dl {
  margin: 0 0 16px;
}

.profile-dl dt {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--bc-gray-500);
  margin-top: 12px;
}

.profile-dl dt:first-child {
  margin-top: 0;
}

.profile-dl dd {
  margin: 4px 0 0;
  font-weight: 600;
  color: var(--bc-gray-900);
}

.info-note {
  font-size: 0.82rem;
  color: var(--bc-gray-600);
  line-height: 1.55;
  margin: 0;
  padding-top: 12px;
  border-top: 1px solid var(--bc-gray-200);
}
</style>
