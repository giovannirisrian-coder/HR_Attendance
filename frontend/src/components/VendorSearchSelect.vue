<template>
  <div
    class="vendor-search"
    :class="{ 'is-open': isOpen, 'is-disabled': disabled }"
    @keydown.esc.prevent="closeMenu"
    @keydown.down.prevent="moveActive(1)"
    @keydown.up.prevent="moveActive(-1)"
    @keydown.enter.prevent="selectActive"
    @keydown.tab="closeMenu"
  >
    <div class="vendor-search-control" @click="onWrapperClick">
      <input
        ref="inputEl"
        v-model="query"
        type="text"
        class="form-control vendor-search-input"
        :placeholder="placeholder"
        :disabled="disabled"
        autocomplete="off"
        spellcheck="false"
        @focus="openMenu"
        @input="onInput"
      />
      <button
        v-if="selectedVendor && !disabled"
        type="button"
        class="vendor-search-clear"
        title="Clear vendor"
        aria-label="Clear vendor"
        @click.stop="clear"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
      <span class="vendor-search-caret" aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </span>
    </div>

    <div v-if="isOpen" class="vendor-search-menu" role="listbox">
      <div v-if="loading" class="vendor-search-status">
        <span class="spinner" style="width:14px;height:14px;border-width:2px;"></span>
        Loading vendors…
      </div>
      <div v-else-if="loadError" class="vendor-search-status vendor-search-status--error">
        ⚠️ {{ loadError }}
        <button type="button" class="vendor-search-retry" @click="fetchVendors">Retry</button>
      </div>
      <template v-else>
        <div v-if="filteredVendors.length === 0" class="vendor-search-status">
          No vendors match “{{ query }}”.
        </div>
        <ul v-else class="vendor-search-list">
          <li
            v-for="(vendor, idx) in filteredVendors"
            :key="vendor.id"
            class="vendor-search-option"
            :class="{
              'is-active': idx === activeIndex,
              'is-selected': modelValue && vendor.id === modelValue,
            }"
            role="option"
            :aria-selected="modelValue && vendor.id === modelValue"
            @mouseenter="activeIndex = idx"
            @mousedown.prevent="pick(vendor)"
          >
            <div class="vendor-search-option-name">{{ vendor.name }}</div>
            <div class="vendor-search-option-code">{{ vendor.code }}</div>
          </li>
        </ul>
      </template>
    </div>
  </div>
</template>

<script setup>
/**
 * VendorSearchSelect
 * ──────────────────
 * Searchable lookup tied to the `vendors` master table. Used by the
 * LS HR (PIC LS) Create / Edit Employee forms to replace the legacy
 * free-text Vendor Number input.
 *
 * Behaviour:
 *   • Fetches the active vendor list once via `GET /api/employees/vendors`
 *     and filters client-side as the user types.
 *   • Search matches either `name` OR `code` (case-insensitive substring).
 *   • Emits the selected vendor id via v-model and a `change` event with
 *     the full vendor object — the parent uses it to auto-populate the
 *     denormalized Vendor Name textbox.
 *   • Keyboard navigation: ↑ / ↓ move the active option, Enter selects,
 *     Esc / blur closes the menu.
 *   • Berau Coal Green / White branding via the existing CSS variables.
 */
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import api from '../utils/api';

const props = defineProps({
  /** Currently selected vendor id (or null). */
  modelValue: {
    type: [Number, String, null],
    default: null,
  },
  /** Optional pre-fetched vendor object so the input can show the name
   *  immediately while the master list is still loading (e.g. on Edit). */
  initialVendor: {
    type: Object,
    default: null,
  },
  placeholder: {
    type: String,
    default: 'Search by Vendor Name or Code…',
  },
  disabled: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['update:modelValue', 'change']);

const vendors = ref([]);
const loading = ref(false);
const loadError = ref('');
const isOpen = ref(false);
const query = ref('');
const activeIndex = ref(-1);
const inputEl = ref(null);

// `selectedVendor` is the vendor object currently bound to `modelValue`.
// We keep it as a separate computed value so the input can render the
// vendor name even before the master list finishes loading (Edit page).
const selectedVendor = computed(() => {
  const id = props.modelValue;
  if (id == null || id === '') return null;
  const fromList = vendors.value.find((v) => v.id === Number(id));
  if (fromList) return fromList;
  if (props.initialVendor && Number(props.initialVendor.id) === Number(id)) {
    return props.initialVendor;
  }
  return null;
});

const filteredVendors = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return vendors.value;
  return vendors.value.filter((v) => {
    const name = (v.name || '').toLowerCase();
    const code = (v.code || '').toLowerCase();
    return name.includes(q) || code.includes(q);
  });
});

const fetchVendors = async () => {
  loading.value = true;
  loadError.value = '';
  try {
    const { data } = await api.get('/employees/vendors');
    vendors.value = Array.isArray(data?.data) ? data.data : [];
  } catch (err) {
    loadError.value =
      err?.response?.data?.message ||
      'Failed to load vendor list. Please try again.';
    vendors.value = [];
  } finally {
    loading.value = false;
  }
};

const openMenu = async () => {
  if (props.disabled) return;
  isOpen.value = true;
  if (vendors.value.length === 0 && !loading.value && !loadError.value) {
    await fetchVendors();
  }
  await nextTick();
  // When opening with a selected vendor, highlight it in the list so
  // arrow keys feel natural; otherwise start above the first option so
  // ArrowDown lands on index 0.
  const selectedId = props.modelValue;
  if (selectedId != null) {
    const idx = filteredVendors.value.findIndex((v) => v.id === Number(selectedId));
    activeIndex.value = idx >= 0 ? idx : -1;
  } else {
    activeIndex.value = -1;
  }
};

const closeMenu = () => {
  isOpen.value = false;
  // Reset the typed query back to the selected vendor's name when the
  // menu closes without an explicit pick (acts like a combobox).
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
  activeIndex.value = filteredVendors.value.length > 0 ? 0 : -1;
};

const moveActive = (delta) => {
  if (!isOpen.value) {
    openMenu();
    return;
  }
  const len = filteredVendors.value.length;
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
  const vendor = filteredVendors.value[activeIndex.value];
  if (vendor) pick(vendor);
};

const pick = (vendor) => {
  emit('update:modelValue', vendor.id);
  emit('change', vendor);
  query.value = vendor.name;
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
  const v = selectedVendor.value;
  query.value = v ? v.name : '';
};

watch(
  () => props.modelValue,
  () => syncQueryFromSelection()
);
watch(
  () => props.initialVendor,
  () => syncQueryFromSelection()
);

// Close the menu when the user clicks outside the component.
const onDocClick = (e) => {
  if (!isOpen.value) return;
  const root = inputEl.value?.closest('.vendor-search');
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
.vendor-search {
  position: relative;
  width: 100%;
}

.vendor-search-control {
  position: relative;
  display: flex;
  align-items: center;
}

.vendor-search-input {
  padding-right: 56px;
}

.vendor-search.is-open .vendor-search-input {
  border-color: var(--bc-green-400);
  box-shadow: 0 0 0 3px var(--bc-green-100);
}

.vendor-search.is-disabled {
  opacity: 0.7;
  pointer-events: none;
}

.vendor-search-caret {
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

.vendor-search-clear {
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
.vendor-search-clear:hover {
  background: var(--bc-gray-100);
  color: var(--bc-gray-700);
}

.vendor-search-menu {
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

.vendor-search-status {
  padding: 12px 14px;
  font-size: 13px;
  color: var(--bc-gray-500);
  display: flex;
  align-items: center;
  gap: 8px;
}
.vendor-search-status--error {
  color: var(--bc-rejected);
}

.vendor-search-retry {
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
.vendor-search-retry:hover {
  background: var(--bc-green-50);
  border-color: var(--bc-green-400);
  color: var(--bc-green-700);
}

.vendor-search-list {
  list-style: none;
  margin: 0;
  padding: 4px 0;
}

.vendor-search-option {
  padding: 8px 14px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
  transition: background-color 0.1s;
}

.vendor-search-option.is-active {
  background: var(--bc-green-50);
}

.vendor-search-option.is-selected {
  background: var(--bc-green-100);
}
.vendor-search-option.is-selected.is-active {
  background: var(--bc-green-200);
}

.vendor-search-option-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--bc-gray-800);
}

.vendor-search-option-code {
  font-size: 12px;
  color: var(--bc-gray-500);
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, 'Courier New', monospace;
  letter-spacing: 0.02em;
}
</style>
