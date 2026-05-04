<template>
  <div class="app-layout">
    <!-- ── Sidebar ── -->
    <aside class="sidebar" :class="{ collapsed: sidebarCollapsed }">
      <div class="sidebar-header">
        <div class="sidebar-logo">
          <div class="logo-mark">BC</div>
          <span v-if="!sidebarCollapsed" class="logo-text">Berau Coal</span>
        </div>
        <button class="collapse-btn" @click="sidebarCollapsed = !sidebarCollapsed">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path v-if="!sidebarCollapsed" d="M15 18l-6-6 6-6"/>
            <path v-else d="M9 18l6-6-6-6"/>
          </svg>
        </button>
      </div>

      <!-- User info -->
      <div v-if="!sidebarCollapsed" class="sidebar-user">
        <div class="user-avatar">{{ userInitials }}</div>
        <div class="user-info">
          <div class="user-name">{{ user?.name }}</div>
          <div class="user-role-badge">{{ roleLabel }}</div>
        </div>
      </div>

      <!-- Navigation -->
      <nav class="sidebar-nav">
        <div v-if="!sidebarCollapsed" class="nav-section-label">Menu</div>

        <template v-if="user?.role === 'ls'">
          <router-link to="/ls/attendance/create" class="nav-item" active-class="active">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
            <span v-if="!sidebarCollapsed">Create Attendance</span>
          </router-link>
          <router-link to="/ls/attendance/list" class="nav-item" active-class="active">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
            <span v-if="!sidebarCollapsed">Attendance List</span>
          </router-link>
          <router-link to="/ls/leave" class="nav-item" active-class="active" title="Cuti / Izin / Sakit">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 7V3m8 4V3M5 11h14M5 21h14M5 11a2 2 0 012-2h10a2 2 0 012 2v10a2 2 0 01-2 2H7a2 2 0 01-2-2V11z"/></svg>
            <span v-if="!sidebarCollapsed">Leave</span>
          </router-link>
        </template>

        <template v-if="user?.role === 'ls_supervisor'">
          <router-link
            to="/supervisor/approvals"
            class="nav-item nav-item--supervisor-approvals"
            active-class="active"
            :title="sidebarCollapsed && supervisorPendingTotal > 0 ? `${supervisorPendingTotal} pending attendance approval(s)` : undefined"
          >
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"/></svg>
            <span v-if="!sidebarCollapsed" class="nav-item-label-with-chip">
              <span class="nav-item-label-text">Approval List</span>
              <span
                v-if="supervisorPendingTotal > 0"
                class="nav-pending-chip"
                :aria-label="`${supervisorPendingTotal} pending`"
              >{{ supervisorPendingChipText }}</span>
            </span>
            <span
              v-else-if="supervisorPendingTotal > 0"
              class="nav-pending-chip nav-pending-chip--collapsed"
              :aria-label="`${supervisorPendingTotal} pending`"
            >{{ supervisorPendingChipText }}</span>
          </router-link>
          <router-link to="/supervisor/monthly-recap" class="nav-item" active-class="active">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 2v4M16 2v4M3 10h18M5 6h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2z"/><path d="M8 14h3M8 18h8M15 14h1"/></svg>
            <span v-if="!sidebarCollapsed">Monthly Attendance Recap</span>
          </router-link>
          <router-link to="/supervisor/leave" class="nav-item" active-class="active" title="Leave approvals">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 7V3m8 4V3M5 11h14M5 21h14M5 11a2 2 0 012-2h10a2 2 0 012 2v10a2 2 0 01-2 2H7a2 2 0 01-2-2V11z"/></svg>
            <span v-if="!sidebarCollapsed">Leave</span>
          </router-link>
        </template>

        <template v-if="user?.role === 'vendor'">
          <router-link to="/vendor/reports" class="nav-item" active-class="active">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            <span v-if="!sidebarCollapsed">Report List</span>
          </router-link>
        </template>

        <template v-if="user?.role === 'ls_hr'">
          <router-link to="/ls-hr/approvals" class="nav-item" active-class="active">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4m5 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            <span v-if="!sidebarCollapsed">Approval List</span>
          </router-link>
        </template>

        <template v-if="user?.role === 'ssu'">
          <router-link to="/ssu/approvals" class="nav-item" active-class="active">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            <span v-if="!sidebarCollapsed">Approval List</span>
          </router-link>
        </template>
      </nav>

      <!-- Logout -->
      <div class="sidebar-footer">
        <button class="nav-item logout-btn" @click="handleLogout">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
          <span v-if="!sidebarCollapsed">Sign Out</span>
        </button>
      </div>
    </aside>

    <!-- ── Main content ── -->
    <div class="main-content">
      <!-- Top bar -->
      <header class="topbar">
        <div class="topbar-left">
          <button class="mobile-menu-btn" @click="sidebarCollapsed = !sidebarCollapsed">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
          </button>
          <div class="breadcrumb">
            <span class="breadcrumb-app">Berau Coal DAARS</span>
            <span class="breadcrumb-sep">›</span>
            <span class="breadcrumb-page">{{ pageTitle }}</span>
          </div>
        </div>
        <div class="topbar-right">
          <div class="topbar-user">
            <div class="user-avatar sm">{{ userInitials }}</div>
            <span>{{ user?.name }}</span>
          </div>
        </div>
      </header>

      <!-- Page content -->
      <main class="page-content">
        <router-view />
      </main>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getUser, clearAuth } from '../../utils/auth';
import api from '../../utils/api';

const router = useRouter();
const route  = useRoute();
const sidebarCollapsed = ref(false);
const user = getUser();

/** Team-wide pending attendance count (all LS under this supervisor); same /attendance/team source as Approval List. */
const supervisorPendingTotal = ref(0);

const supervisorPendingChipText = computed(() => {
  const n = supervisorPendingTotal.value;
  return n > 99 ? '99+' : String(n);
});

const fetchSupervisorPendingTotal = async () => {
  if (user?.role !== 'ls_supervisor') return;
  try {
    const { data } = await api.get('/attendance/team', {
      params: { status: 'pending', page: 1, limit: 1 },
    });
    const total = data?.pagination?.total;
    supervisorPendingTotal.value = Number.isFinite(Number(total)) ? Number(total) : 0;
  } catch {
    /* keep previous value */
  }
};

const onVisibilityChange = () => {
  if (document.visibilityState === 'visible') fetchSupervisorPendingTotal();
};

onMounted(() => {
  if (user?.role === 'ls_supervisor') {
    fetchSupervisorPendingTotal();
    window.addEventListener('visibilitychange', onVisibilityChange);
  }
});

onUnmounted(() => {
  window.removeEventListener('visibilitychange', onVisibilityChange);
});

watch(
  () => route.path,
  () => {
    if (user?.role === 'ls_supervisor') fetchSupervisorPendingTotal();
  }
);

const userInitials = computed(() => {
  if (!user?.name) return 'U';
  return user.name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
});

const roleLabel = computed(() => {
  const map = {
    ls: 'LS Employee',
    ls_supervisor: 'LS Supervisor',
    vendor: 'Vendor',
    ls_hr: 'LS HR',
    ssu: 'SSU',
  };
  return map[user?.role] || user?.role;
});

const pageTitle = computed(() => {
  const path = route.path;
  if (path.includes('attendance/create')) return 'Create Attendance';
  if (path.includes('attendance/list'))   return 'Attendance List';
  if (path.match(/\/ls\/attendance\/\d+$/)) return 'Attendance Detail';
  if (path.includes('approvals'))         return 'Approval List';
  if (path.includes('/supervisor/monthly-recap')) return 'Monthly Attendance Recap';
  if (path.includes('/vendor/reports') && path.includes('detail')) return 'Report Detail';
  if (path.includes('/vendor/reports')) return 'Report List';
  if (path.includes('/ls-hr/approvals')) return 'LS HR Approvals';
  if (path.includes('/ssu/approvals')) return 'SSU Approvals';
  if (path.match(/\/(ls|supervisor)\/leave$/)) {
    return path.includes('/supervisor/') ? 'Leave — Approvals' : 'Leave';
  }
  return 'Dashboard';
});

const handleLogout = () => {
  clearAuth();
  router.push('/login');
};
</script>

<style scoped>
.app-layout {
  display: flex;
  min-height: 100vh;
  background: var(--bc-gray-50);
}

/* ── Sidebar ── */
.sidebar {
  width: 240px;
  background: var(--bc-green-900);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  transition: width .25s ease;
  overflow: hidden;
  position: sticky;
  top: 0;
  height: 100vh;
}
.sidebar.collapsed { width: 64px; }

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 14px;
  border-bottom: 1px solid rgba(255,255,255,.08);
  min-height: 68px;
}
.sidebar-logo { display: flex; align-items: center; gap: 12px; overflow: hidden; }
.logo-mark {
  width: 36px; height: 36px; flex-shrink: 0;
  background: var(--bc-green-500);
  border-radius: 9px;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 900; color: white;
}
.logo-text { color: white; font-size: 14px; font-weight: 800; white-space: nowrap; }

.collapse-btn {
  background: rgba(255,255,255,.08);
  border: none;
  border-radius: 7px;
  padding: 6px;
  color: rgba(255,255,255,.6);
  cursor: pointer;
  flex-shrink: 0;
  display: flex;
  transition: all .15s;
}
.collapse-btn:hover { background: rgba(255,255,255,.15); color: white; }

.sidebar-user {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px;
  border-bottom: 1px solid rgba(255,255,255,.08);
  overflow: hidden;
}
.user-avatar {
  width: 36px; height: 36px; flex-shrink: 0;
  background: linear-gradient(135deg, var(--bc-green-500), var(--bc-green-300));
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 700; color: white;
}
.user-avatar.sm { width: 30px; height: 30px; font-size: 11px; }
.user-info { overflow: hidden; }
.user-name { color: white; font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.user-role-badge {
  display: inline-block;
  font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em;
  background: rgba(255,255,255,.12); color: rgba(255,255,255,.7);
  padding: 2px 7px; border-radius: 99px; margin-top: 2px;
}

.sidebar-nav {
  flex: 1;
  padding: 12px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
}
.nav-section-label {
  font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .1em;
  color: rgba(255,255,255,.35);
  padding: 8px 8px 4px;
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: 9px;
  color: rgba(255,255,255,.65);
  font-size: 13.5px;
  font-weight: 500;
  text-decoration: none;
  transition: all .15s;
  cursor: pointer;
  border: none;
  background: none;
  width: 100%;
  white-space: nowrap;
  overflow: hidden;
}
.nav-item:hover { background: rgba(255,255,255,.08); color: white; }
.nav-item.active { background: var(--bc-green-600); color: white; font-weight: 700; box-shadow: 0 2px 8px rgba(34,153,74,.35); }
.nav-item--sub { padding-left: 14px; font-size: 13px; }
.nav-item--sub .nav-icon { width: 16px; height: 16px; opacity: .9; }
.nav-icon { width: 18px; height: 18px; flex-shrink: 0; }

.nav-item--supervisor-approvals {
  position: relative;
}

.nav-item-label-with-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.nav-item-label-text {
  overflow: hidden;
  text-overflow: ellipsis;
}

.nav-pending-chip {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.25rem;
  padding: 2px 7px;
  font-size: 11px;
  font-weight: 800;
  line-height: 1.2;
  letter-spacing: 0.01em;
  border-radius: 999px;
  color: #b45309;
  background: rgba(254, 243, 199, 0.95);
  border: 1px solid var(--bc-pending, #f59e0b);
  box-shadow: 0 1px 2px rgba(180, 83, 9, 0.12);
}

.nav-item.active .nav-pending-chip {
  color: #92400e;
  background: rgba(255, 251, 235, 0.98);
  border-color: rgba(245, 158, 11, 0.85);
}

.nav-pending-chip--collapsed {
  position: absolute;
  top: 4px;
  right: 5px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  font-size: 10px;
}

.sidebar-footer {
  padding: 8px;
  border-top: 1px solid rgba(255,255,255,.08);
}
.logout-btn { color: rgba(255,255,255,.5); }
.logout-btn:hover { background: rgba(239,68,68,.15); color: #fca5a5; }

/* ── Main ── */
.main-content { flex: 1; display: flex; flex-direction: column; min-width: 0; }

.topbar {
  height: 60px;
  background: var(--bc-white);
  border-bottom: 1px solid var(--bc-gray-200);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  position: sticky;
  top: 0;
  z-index: 100;
  box-shadow: var(--shadow-sm);
}
.topbar-left { display: flex; align-items: center; gap: 12px; }
.mobile-menu-btn { display: none; background: none; border: none; cursor: pointer; color: var(--bc-gray-600); padding: 6px; border-radius: var(--radius); }
.breadcrumb { display: flex; align-items: center; gap: 8px; }
.breadcrumb-app { font-size: 13px; color: var(--bc-gray-400); font-weight: 500; }
.breadcrumb-sep { color: var(--bc-gray-300); }
.breadcrumb-page { font-size: 13px; font-weight: 700; color: var(--bc-gray-700); }

.topbar-right { display: flex; align-items: center; gap: 12px; }
.topbar-user { display: flex; align-items: center; gap: 8px; font-size: 13.5px; font-weight: 600; color: var(--bc-gray-700); }

.page-content { flex: 1; padding: 28px; overflow-y: auto; }

@media (max-width: 768px) {
  .sidebar { position: fixed; z-index: 200; height: 100vh; }
  .sidebar.collapsed { width: 0; padding: 0; }
  .mobile-menu-btn { display: flex; }
  .page-content { padding: 16px; }
}
</style>
