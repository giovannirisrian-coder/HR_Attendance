<template>
  <aside class="ls-sidebar" aria-label="LS employees">
    <div class="ls-sidebar-head">
      <label class="ls-sidebar-label" for="ls-sidebar-search">Search LS</label>
      <div class="search-wrap">
        <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          id="ls-sidebar-search"
          :value="search"
          class="form-control ls-search-input"
          type="search"
          autocomplete="off"
          placeholder="Filter by name or NPK…"
          @input="$emit('update:search', $event.target.value)"
        />
      </div>
    </div>
    <div class="ls-list-scroll">
      <div v-if="!members.length" class="ls-empty">
        <p v-if="hasRoster">No LS employees match your search.</p>
        <p v-else>No LS employees are assigned to your supervision.</p>
      </div>
      <ul v-else class="ls-list" role="listbox" :aria-activedescendant="selectedId != null ? `ls-item-${selectedId}` : undefined">
        <li
          v-for="m in members"
          :id="`ls-item-${m.id}`"
          :key="m.id"
          role="option"
          :aria-selected="selectedId === m.id"
          class="ls-item"
          :class="{ active: selectedId === m.id }"
          tabindex="0"
          @click="select(m.id)"
          @keydown.enter.prevent="select(m.id)"
          @keydown.space.prevent="select(m.id)"
        >
          <span class="ls-item-name">{{ m.name }}</span>
          <span class="ls-item-npk">{{ m.npk || '—' }}</span>
        </li>
      </ul>
    </div>
  </aside>
</template>

<script setup>
defineProps({
  members: { type: Array, default: () => [] },
  hasRoster: { type: Boolean, default: false },
  selectedId: {
    default: null,
    validator: (v) => v == null || typeof v === 'number',
  },
  search: { type: String, default: '' },
});

const emit = defineEmits(['update:search', 'update:selectedId']);

const select = (id) => {
  emit('update:selectedId', id);
};
</script>

<style scoped>
.ls-sidebar {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: linear-gradient(180deg, #f8faf8 0%, var(--bc-gray-50, #f9fafb) 100%);
  border-right: 1px solid var(--bc-gray-200);
}

.ls-sidebar-head {
  flex-shrink: 0;
  padding: 14px 12px 12px;
  border-bottom: 1px solid var(--bc-gray-200);
  background: #fff;
}

.ls-sidebar-label {
  display: block;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--bc-green-600, #166534);
  margin-bottom: 8px;
}

.search-wrap {
  position: relative;
}

.search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--bc-gray-400);
  pointer-events: none;
}

.ls-search-input {
  width: 100%;
  padding-left: 34px;
  font-size: 13px;
}

.ls-list-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px;
}

.ls-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.ls-item {
  padding: 10px 12px;
  margin-bottom: 4px;
  border-radius: var(--radius, 8px);
  cursor: pointer;
  border: 1px solid transparent;
  transition: background 0.15s, border-color 0.15s;
  outline: none;
}

.ls-item:hover {
  background: #fff;
  border-color: var(--bc-gray-200);
}

.ls-item:focus-visible {
  box-shadow: 0 0 0 2px var(--bc-green-600, #166534);
}

.ls-item.active {
  background: #fff;
  border-color: var(--bc-green-600, #166534);
  box-shadow: 0 1px 3px rgba(22, 101, 52, 0.12);
}

.ls-item-name {
  display: block;
  font-weight: 700;
  font-size: 13px;
  color: var(--bc-gray-800, #1f2937);
  line-height: 1.3;
}

.ls-item-npk {
  display: block;
  font-size: 11px;
  color: var(--bc-gray-500);
  margin-top: 2px;
  font-family: ui-monospace, monospace;
}

.ls-empty {
  padding: 24px 12px;
  text-align: center;
  font-size: 13px;
  color: var(--bc-gray-500);
}

.ls-empty p {
  margin: 0;
}
</style>
