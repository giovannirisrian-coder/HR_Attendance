<template>
  <div
    class="replacement-search"
    :class="{ 'is-open': isOpen, 'is-disabled': disabled || !vendorId }"
    @keydown.esc.prevent="closeMenu"
    @keydown.down.prevent="moveActive(1)"
    @keydown.up.prevent="moveActive(-1)"
    @keydown.enter.prevent="selectActive"
    @keydown.tab="closeMenu"
  >
    <div class="replacement-search-control" @click="onWrapperClick">
      <input
        ref="inputEl"
        v-model="query"
        type="text"
        class="form-control replacement-search-input"
        :placeholder="placeholderText"
        :disabled="disabled || !vendorId"
        autocomplete="off"
        spellcheck="false"
        @focus="openMenu"
        @input="onInput"
      />
      <button
        v-if="selectedEmployee && !disabled && vendorId"
        type="button"
        class="replacement-search-clear"
        title="Clear replacement"
        aria-label="Clear replacement"
        @click.stop="clear"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
      <span class="replacement-search-caret" aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </span>
    </div>

    <div v-if="isOpen" class="replacement-search-menu" role="listbox">
      <div v-if="!vendorId" class="replacement-search-status">
        Select a vendor first to search deactivated employees.
      </div>
      <div v-else-if="loading" class="replacement-search-status">
        <span class="spinner" style="width:14px;height:14px;border-width:2px;"></span>
        Loading employees…
      </div>
      <div v-else-if="loadError" class="replacement-search-status replacement-search-status--error">
        ⚠️ {{ loadError }}
        <button type="button" class="replacement-search-retry" @click="fetchCandidates">Retry</button>
      </div>
      <template v-else>
        <div v-if="filteredEmployees.length === 0" class="replacement-search-status">
          No deactivated employees match “{{ query }}”.
        </div>
        <ul v-else class="replacement-search-list">
          <li
            v-for="(emp, idx) in filteredEmployees"
            :key="emp.id"
            class="replacement-search-option"
            :class="{
              'is-active': idx === activeIndex,
              'is-selected': modelValue && emp.id === Number(modelValue),
            }"
            role="option"
            :aria-selected="modelValue && emp.id === Number(modelValue)"
            @mouseenter="activeIndex = idx"
            @mousedown.prevent="pick(emp)"
          >
            <div class="replacement-search-option-name">{{ emp.employee_name }}</div>
            <div v-if="emp.npk || emp.sid" class="replacement-search-option-meta">
              <span v-if="emp.npk">{{ emp.npk }}</span>
              <span v-if="emp.npk && emp.sid"> · </span>
              <span v-if="emp.sid">{{ emp.sid }}</span>
            </div>
          </li>
        </ul>
      </template>
    </div>
  </div>
</template>

<script setup>
/**
 * ReplacementSearchSelect
 * Searchable lookup for deactivated hr_employees from the same vendor.
 * Used on Create / Edit Employee forms to link a new active hire to the
 * employee they replace.
 */
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import api from '../utils/api';

const props = defineProps({
  modelValue: {
    type: [Number, String, null],
    default: null,
  },
  vendorId: {
    type: [Number, String, null],
    default: null,
  },
  excludeEmployeeId: {
    type: [Number, String, null],
    default: null,
  },
  initialEmployee: {
    type: Object,
    default: null,
  },
  placeholder: {
    type: String,
    default: 'Search deactivated employee by name…',
  },
  disabled: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['update:modelValue', 'change']);

const employees = ref([]);
const loading = ref(false);
const loadError = ref('');
const isOpen = ref(false);
const query = ref('');
const activeIndex = ref(-1);
const inputEl = ref(null);
const lastVendorId = ref(null);

const placeholderText = computed(() => {
  if (!props.vendorId) return 'Select a vendor first…';
  return props.placeholder;
});

const selectedEmployee = computed(() => {
  const id = props.modelValue;
  if (id == null || id === '') return null;
  const fromList = employees.value.find((e) => e.id === Number(id));
  if (fromList) return fromList;
  if (
    props.initialEmployee &&
    Number(props.initialEmployee.id) === Number(id)
  ) {
    return props.initialEmployee;
  }
  return null;
});

const filteredEmployees = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return employees.value;
  return employees.value.filter((e) => {
    const name = (e.employee_name || '').toLowerCase();
    const npk = (e.npk || '').toLowerCase();
    const sid = (e.sid || '').toLowerCase();
    return name.includes(q) || npk.includes(q) || sid.includes(q);
  });
});

const fetchCandidates = async () => {
  if (!props.vendorId) {
    employees.value = [];
    return;
  }
  loading.value = true;
  loadError.value = '';
  try {
    const params = { vendor_id: props.vendorId, limit: 500 };
    if (props.excludeEmployeeId) params.exclude_id = props.excludeEmployeeId;
    const { data } = await api.get('/employees/replacements', { params });
    employees.value = Array.isArray(data?.data) ? data.data : [];
    lastVendorId.value = Number(props.vendorId);
  } catch (err) {
    loadError.value =
      err?.response?.data?.message ||
      'Failed to load replacement candidates. Please try again.';
    employees.value = [];
  } finally {
    loading.value = false;
  }
};

const openMenu = async () => {
  if (props.disabled || !props.vendorId) return;
  isOpen.value = true;
  const vendorChanged = lastVendorId.value !== Number(props.vendorId);
  if (employees.value.length === 0 || vendorChanged) {
    await fetchCandidates();
  }
  await nextTick();
  const selectedId = props.modelValue;
  if (selectedId != null) {
    const idx = filteredEmployees.value.findIndex(
      (e) => e.id === Number(selectedId)
    );
    activeIndex.value = idx >= 0 ? idx : -1;
  } else {
    activeIndex.value = -1;
  }
};

const closeMenu = () => {
  isOpen.value = false;
  syncQueryFromSelection();
};

const onWrapperClick = () => {
  if (props.disabled || !props.vendorId) return;
  if (!isOpen.value) {
    inputEl.value?.focus();
    openMenu();
  }
};

const onInput = () => {
  if (!isOpen.value) openMenu();
  activeIndex.value = filteredEmployees.value.length > 0 ? 0 : -1;
};

const moveActive = (delta) => {
  if (!isOpen.value) {
    openMenu();
    return;
  }
  const len = filteredEmployees.value.length;
  if (len === 0) {
    activeIndex.value = -1;
    return;
  }
  const next = (activeIndex.value + delta + len) % len;
  activeIndex.value = next;
};

const selectActive = () => {
  if (!isOpen.value) {
    openMenu();
    return;
  }
  const emp = filteredEmployees.value[activeIndex.value];
  if (emp) pick(emp);
};

const pick = (emp) => {
  emit('update:modelValue', emp.id);
  emit('change', emp);
  query.value = emp.employee_name || '';
  isOpen.value = false;
};

const clear = () => {
  emit('update:modelValue', null);
  emit('change', null);
  query.value = '';
  isOpen.value = false;
  inputEl.value?.focus();
};

const syncQueryFromSelection = () => {
  const e = selectedEmployee.value;
  query.value = e ? (e.employee_name || '') : '';
};

watch(
  () => props.modelValue,
  () => syncQueryFromSelection()
);
watch(
  () => props.initialEmployee,
  () => syncQueryFromSelection()
);
watch(
  () => props.vendorId,
  (newVal, oldVal) => {
    if (newVal !== oldVal) {
      employees.value = [];
      lastVendorId.value = null;
      if (props.modelValue != null) {
        emit('update:modelValue', null);
        emit('change', null);
      }
      query.value = '';
    }
  }
);

const onDocClick = (e) => {
  if (!isOpen.value) return;
  const root = inputEl.value?.closest('.replacement-search');
  if (root && !root.contains(e.target)) {
    closeMenu();
  }
};

onMounted(() => {
  syncQueryFromSelection();
  document.addEventListener('mousedown', onDocClick);
});
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocClick);
});
</script>

<style scoped>
.replacement-search {
  position: relative;
  width: 100%;
}

.replacement-search-control {
  position: relative;
  display: flex;
  align-items: center;
}

.replacement-search-input {
  padding-right: 56px;
}

.replacement-search.is-open .replacement-search-input {
  border-color: var(--bc-green-400);
  box-shadow: 0 0 0 3px var(--bc-green-100);
}

.replacement-search.is-disabled {
  opacity: 0.7;
  pointer-events: none;
}

.replacement-search-caret {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--bc-gray-400);
  pointer-events: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.replacement-search-clear {
  position: absolute;
  right: 32px;
  top: 50%;
  transform: translateY(-50%);
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--bc-gray-400);
  cursor: pointer;
  border-radius: 4px;
  transition: background-color 0.15s, color 0.15s;
}
.replacement-search-clear:hover {
  background: var(--bc-gray-100);
  color: var(--bc-gray-700);
}

.replacement-search-menu {
  position: absolute;
  z-index: 30;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: var(--bc-white);
  border: 1.5px solid var(--bc-green-200);
  border-radius: var(--radius);
  box-shadow: var(--shadow-md);
  max-height: 280px;
  overflow-y: auto;
}

.replacement-search-status {
  padding: 12px 14px;
  font-size: 13px;
  color: var(--bc-gray-500);
  display: flex;
  align-items: center;
  gap: 8px;
}
.replacement-search-status--error {
  color: var(--bc-rejected);
}

.replacement-search-retry {
  margin-left: auto;
  background: transparent;
  border: 1px solid var(--bc-gray-200);
  color: var(--bc-gray-700);
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s, color 0.15s;
}
.replacement-search-retry:hover {
  background: var(--bc-green-50);
  border-color: var(--bc-green-400);
  color: var(--bc-green-700);
}

.replacement-search-list {
  list-style: none;
  margin: 0;
  padding: 4px 0;
}

.replacement-search-option {
  padding: 8px 14px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
  transition: background-color 0.1s;
}

.replacement-search-option.is-active {
  background: var(--bc-green-50);
}

.replacement-search-option.is-selected {
  background: var(--bc-green-100);
}
.replacement-search-option.is-selected.is-active {
  background: var(--bc-green-200);
}

.replacement-search-option-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--bc-gray-800);
}

.replacement-search-option-meta {
  font-size: 12px;
  color: var(--bc-gray-500);
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, 'Courier New', monospace;
  letter-spacing: 0.02em;
}
</style>
