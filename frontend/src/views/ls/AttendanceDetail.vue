<template>
  <div>
    <div class="page-header">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <button type="button" class="btn btn-ghost btn-sm" @click="$router.push('/ls/attendance/list')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          Back to list
        </button>
        <div>
          <h1 class="page-title">Attendance detail</h1>
          <p class="page-subtitle" v-if="record">{{ formatDate(record.attendance_date) }}</p>
        </div>
      </div>
    </div>

    <div v-if="loading" class="card" style="padding:48px;text-align:center;">
      <span class="spinner"></span> Loading…
    </div>
    <div v-else-if="errorMsg" class="alert alert-error"><span>⚠️</span> {{ errorMsg }}</div>
    <div v-else-if="record" class="card">
      <div class="card-header">
        <span class="card-title">Record</span>
        <span class="badge" :class="`badge-${record.status}`">{{ record.status }}</span>
      </div>
      <div class="card-body">
        <div class="dl">
          <div class="dl-row"><span>NPK</span><strong>{{ record.npk || '—' }}</strong></div>
          <div class="dl-row"><span>Date</span><strong>{{ formatDate(record.attendance_date) }}</strong></div>
          <div class="dl-row"><span>Clock in</span><strong class="text-green">{{ record.clock_in_time || '—' }}</strong></div>
          <div class="dl-row"><span>Clock out</span><strong class="text-red">{{ record.clock_out_time || '—' }}</strong></div>
          <template v-if="record.ot_start_time && record.ot_end_time">
            <div class="dl-row">
              <span>Overtime (Range)</span>
              <strong>{{ fmtHm(record.ot_start_time) }} – {{ fmtHm(record.ot_end_time) }}</strong>
            </div>
            <div class="dl-row">
              <span>OT duration</span>
              <strong>{{ otDuration(record) }}</strong>
            </div>
            <div v-if="record.ot_summary" class="dl-row" style="flex-direction:column;align-items:flex-start;gap:6px;">
              <span>Overtime summary</span>
              <p class="ot-sum">{{ record.ot_summary }}</p>
            </div>
          </template>
          <div class="dl-row" v-if="record.clock_in_lat">
            <span>Location (in)</span>
            <a :href="`https://maps.google.com/?q=${record.clock_in_lat},${record.clock_in_lng}`" target="_blank" rel="noopener">
              {{ Number(record.clock_in_lat).toFixed(5) }}, {{ Number(record.clock_in_lng).toFixed(5) }}
            </a>
          </div>
          <div class="dl-row" v-if="record.clock_out_lat">
            <span>Location (out)</span>
            <a :href="`https://maps.google.com/?q=${record.clock_out_lat},${record.clock_out_lng}`" target="_blank" rel="noopener">
              {{ Number(record.clock_out_lat).toFixed(5) }}, {{ Number(record.clock_out_lng).toFixed(5) }}
            </a>
          </div>
          <div v-if="record.rejection_note" class="dl-row" style="flex-direction:column;align-items:flex-start;gap:8px;">
            <span>Rejection note</span>
            <p class="rejection">{{ record.rejection_note }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../utils/api';
import { formatCalendarDateLocale } from '../../utils/calendarDate';

const route = useRoute();
const id = computed(() => route.params.id);
const loading = ref(true);
const errorMsg = ref('');
const record = ref(null);

const formatDate = (d) => formatCalendarDateLocale(d, 'en-ID', { day: '2-digit', month: 'short', year: 'numeric', weekday: 'long' });

const fmtHm = (t) => (t ? String(t).slice(0, 5) : '—');
const otDuration = (rec) => {
  if (!rec.ot_start_time || !rec.ot_end_time) return '—';
  const a = fmtHm(rec.ot_start_time);
  const b = fmtHm(rec.ot_end_time);
  const [ih, im] = a.split(':').map(Number);
  const [oh, om] = b.split(':').map(Number);
  const mins = (oh * 60 + om) - (ih * 60 + im);
  if (mins < 0) return '—';
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
};

onMounted(async () => {
  loading.value = true;
  errorMsg.value = '';
  try {
    const { data } = await api.get(`/attendance/${id.value}`);
    if (data.success) record.value = data.data;
    else errorMsg.value = data.message || 'Failed to load.';
  } catch (err) {
    errorMsg.value = err.response?.data?.message || 'Failed to load.';
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.dl { display: flex; flex-direction: column; gap: 8px; max-width: 520px; }
.dl-row { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 10px 0; border-bottom: 1px solid var(--bc-gray-100); font-size: 14px; }
.dl-row span { color: var(--bc-gray-500); }
.text-green { color: var(--bc-green-600); }
.text-red { color: var(--bc-rejected); }
.rejection { margin: 0; font-size: 13px; background: #fee2e2; padding: 10px 12px; border-radius: var(--radius); width: 100%; }
.ot-sum { margin: 0; font-size: 13px; white-space: pre-wrap; color: var(--bc-gray-700); }
</style>
