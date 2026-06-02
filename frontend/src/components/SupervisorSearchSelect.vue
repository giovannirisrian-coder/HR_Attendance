<template>
  <div
    class="supervisor-search"
    :class="{ 'is-open': isOpen, 'is-disabled': disabled }"
    @keydown.esc.prevent="closeMenu"
    @keydown.down.prevent="moveActive(1)"
    @keydown.up.prevent="moveActive(-1)"
    @keydown.enter.prevent="selectActive"
    @keydown.tab="closeMenu"
  >
    <div class="supervisor-search-control" @click="onWrapperClick">
      <input
        ref="inputEl"
        v-model="query"
        type="text"
        class="form-control supervisor-search-input"
        :placeholder="placeholder"
        :disabled="disabled"
        autocomplete="off"
        spellcheck="false"
        @focus="openMenu"
        @input="onInput"
      />
      <button
        v-if="selectedSupervisor && !disabled"
        type="button"
        class="supervisor-search-clear"
        title="Clear supervisor"
        aria-label="Clear supervisor"
        @click.stop="clear"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
      <span class="supervisor-search-caret" aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </span>
    </div>

    <div v-if="isOpen" class="supervisor-search-menu" role="listbox">
      <div v-if="loading" class="supervisor-search-status">
        <span class="spinner" style="width:14px;height:14px;border-width:2px;"></span>
        Loading supervisors…
      </div>
      <div v-else-if="loadError" class="supervisor-search-status supervisor-search-status--error">
        ⚠️ {{ loadError }}
        <button type="button" class="supervisor-search-retry" @click="fetchSupervisors">Retry</button>
      </div>
      <template v-else>
        <div v-if="filteredSupervisors.length === 0" class="supervisor-search-status">
          No supervisors match “{{ query }}”.
        </div>
        <ul v-else class="supervisor-search-list">
          <li
            v-for="(sup, idx) in filteredSupervisors"
            :key="sup.id"
            class="supervisor-search-option"
            :class="{
              'is-active': idx === activeIndex,
              'is-selected': modelValue && sup.id === Number(modelValue),
            }"
            role="option"
            :aria-selected="modelValue && sup.id === Number(modelValue)"
            @mouseenter="activeIndex = idx"
            @mousedown.prevent="pick(sup)"
          >
            <div class="supervisor-search-option-name">{{ sup.name }}</div>
            <div v-if="sup.employee_id" class="supervisor-search-option-meta">
              {{ sup.employee_id }}
            </div>
          </li>
        </ul>
      </template>
    </div>
  </div>
</template>

<script setup>
/**
 * SupervisorSearchSelect
 * ──────────────────────
 * Searchable lookup tied to the `users` master table, restricted to
 * accounts with role='ls_supervisor'. Used by the LS HR (PIC LS)
 * Create / Edit Employee forms to replace the legacy free-text
 * Supervisor NPK + Supervisor Name inputs.
 *
 * Why this matters:
 * The Managerial Review stage of the workflow (Employee → Leader
 * Employee → Vendor → PIC LS → SSU) depends on the link between an
 * LS employee and their Leader. Storing the supervisor as a FK into
 * `users` (rather than free text) guarantees the same `users.id`
 * powers both PIC LS assignment AND downstream attendance / leave /
 * overtime approval, giving the audit trail a single source of truth.
 *
 * Behaviour:
 *   • Fetches the active LS Supervisor list once via
 *     `GET /api/employees/supervisors` and filters client-side as the
 *     user types — primary search axis is Supervisor Name (per spec),
 *     with NPK / employee_id matching as a convenience.
 *   • Emits the selected user id via v-model and a `change` event
 *     with the full supervisor object — the parent uses it to update
 *     any read-only display fields it keeps on the form model.
 *   • Keyboard navigation: ↑ / ↓ move the active option, Enter
 *     selects, Esc / blur closes the menu.
 *   • Berau Coal Green / White branding via the existing CSS variables.
 */
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import api from '../utils/api';

const props = defineProps({
  /** Currently selected supervisor user id (or null). */
  modelValue: {
    type: [Number, String, null],
    default: null,
  },
  /** Optional pre-fetched supervisor object so the input can show the
   *  name immediately while the master list is still loading (Edit). */
  initialSupervisor: {
    type: Object,
    default: null,
  },
  placeholder: {
    type: String,
    default: 'Search Supervisor by Name…',
  },
  disabled: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['update:modelValue', 'change']);

const supervisors = ref([]);
const loading = ref(false);
const loadError = ref('');
const isOpen = ref(false);
const query = ref('');
const activeIndex = ref(-1);
const inputEl = ref(null);

// `selectedSupervisor` is the supervisor object currently bound to
// `modelValue`. Kept as a separate computed value so the input can
// render the supervisor name even before the master list finishes
// loading (Edit page).
const selectedSupervisor = computed(() => {
  const id = props.modelValue;
  if (id == null || id === '') return null;
  const fromList = supervisors.value.find((s) => s.id === Number(id));
  if (fromList) return fromList;
  if (
    props.initialSupervisor &&
    Number(props.initialSupervisor.id) === Number(id)
  ) {
    return props.initialSupervisor;
  }
  return null;
});

const filteredSupervisors = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return supervisors.value;
  return supervisors.value.filter((s) => {
    const name = (s.name || '').toLowerCase();
    const npk = (s.employee_id || '').toLowerCase();
    return name.includes(q) || npk.includes(q);
  });
});

const fetchSupervisors = async () => {
  loading.value = true;
  loadError.value = '';
  try {
    const { data } = await api.get('/employees/supervisors');
    supervisors.value = Array.isArray(data?.data) ? data.data : [];
  } catch (err) {
    loadError.value =
      err?.response?.data?.message ||
      'Failed to load supervisor list. Please try again.';
    supervisors.value = [];
  } finally {
    loading.value = false;
  }
};

const openMenu = async () => {
  if (props.disabled) return;
  isOpen.value = true;
  if (supervisors.value.length === 0 && !loading.value && !loadError.value) {
    await fetchSupervisors();
  }
  await nextTick();
  // Highlight the currently-selected supervisor so arrow keys feel
  // natural; otherwise start above the first option so ArrowDown
  // lands on index 0.
  const selectedId = props.modelValue;
  if (selectedId != null) {
    const idx = filteredSupervisors.value.findIndex(
      (s) => s.id === Number(selectedId)
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
  if (props.disabled) return;
  if (!isOpen.value) {
    inputEl.value?.focus();
    openMenu();
  }
};

const onInput = () => {
  if (!isOpen.value) openMenu();
  activeIndex.value = filteredSupervisors.value.length > 0 ? 0 : -1;
};

const moveActive = (delta) => {
  if (!isOpen.value) {
    openMenu();
    return;
  }
  const len = filteredSupervisors.value.length;
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
  const sup = filteredSupervisors.value[activeIndex.value];
  if (sup) pick(sup);
};

const pick = (sup) => {
  emit('update:modelValue', sup.id);
  emit('change', sup);
  query.value = sup.name;
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
  const s = selectedSupervisor.value;
  query.value = s ? s.name : '';
};

watch(
  () => props.modelValue,
  () => syncQueryFromSelection()
);
watch(
  () => props.initialSupervisor,
  () => syncQueryFromSelection()
);

const onDocClick = (e) => {
  if (!isOpen.value) return;
  const root = inputEl.value?.closest('.supervisor-search');
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
.supervisor-search {
  position: relative;
  width: 100%;
}

.supervisor-search-control {
  position: relative;
  display: flex;
  align-items: center;
}

.supervisor-search-input {
  padding-right: 56px;
}

.supervisor-search.is-open .supervisor-search-input {
  border-color: var(--bc-green-400);
  box-shadow: 0 0 0 3px var(--bc-green-100);
}

.supervisor-search.is-disabled {
  opacity: 0.7;
  pointer-events: none;
}

.supervisor-search-caret {
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

.supervisor-search-clear {
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
.supervisor-search-clear:hover {
  background: var(--bc-gray-100);
  color: var(--bc-gray-700);
}

.supervisor-search-menu {
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

.supervisor-search-status {
  padding: 12px 14px;
  font-size: 13px;
  color: var(--bc-gray-500);
  display: flex;
  align-items: center;
  gap: 8px;
}
.supervisor-search-status--error {
  color: var(--bc-rejected);
}

.supervisor-search-retry {
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
.supervisor-search-retry:hover {
  background: var(--bc-green-50);
  border-color: var(--bc-green-400);
  color: var(--bc-green-700);
}

.supervisor-search-list {
  list-style: none;
  margin: 0;
  padding: 4px 0;
}

.supervisor-search-option {
  padding: 8px 14px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
  transition: background-color 0.1s;
}

.supervisor-search-option.is-active {
  background: var(--bc-green-50);
}

.supervisor-search-option.is-selected {
  background: var(--bc-green-100);
}
.supervisor-search-option.is-selected.is-active {
  background: var(--bc-green-200);
}

.supervisor-search-option-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--bc-gray-800);
}

.supervisor-search-option-meta {
  font-size: 12px;
  color: var(--bc-gray-500);
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, 'Courier New', monospace;
  letter-spacing: 0.02em;
}
</style>
