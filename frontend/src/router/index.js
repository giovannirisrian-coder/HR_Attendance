import { createRouter, createWebHistory } from 'vue-router';
import { isAuthenticated, getUser } from '../utils/auth';

const routes = [
  {
    path: '/',
    redirect: () => {
      if (!isAuthenticated()) return '/login';
      const role = getUser()?.role;
      if (role === 'ls') return '/ls/attendance/create';
      if (role === 'ls_supervisor') return '/supervisor/approvals';
      if (role === 'vendor') return '/vendor/reports';
      return '/login';
    },
  },
  { path: '/login', component: () => import('../views/LoginView.vue'), meta: { public: true } },

  // ── LS routes ──
  {
    path: '/ls',
    component: () => import('../views/layouts/AppLayout.vue'),
    meta: { requiresAuth: true, role: 'ls' },
    children: [
      { path: 'attendance/create', component: () => import('../views/ls/CreateAttendance.vue') },
      { path: 'attendance/list',   component: () => import('../views/ls/AttendanceList.vue') },
    ],
  },

  // ── Supervisor routes ──
  {
    path: '/supervisor',
    component: () => import('../views/layouts/AppLayout.vue'),
    meta: { requiresAuth: true, role: 'ls_supervisor' },
    children: [
      { path: 'approvals', component: () => import('../views/supervisor/ApprovalList.vue') },
    ],
  },

  // ── Vendor routes ──
  {
    path: '/vendor',
    component: () => import('../views/layouts/AppLayout.vue'),
    meta: { requiresAuth: true, role: 'vendor' },
    children: [
      { path: 'reports',                              component: () => import('../views/vendor/ReportList.vue') },
      { path: 'reports/:userId/:month/:year/detail',  component: () => import('../views/vendor/ReportDetail.vue') },
    ],
  },

  { path: '/:pathMatch(.*)*', redirect: '/' },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to, from, next) => {
  if (to.meta.public) return next();
  if (!isAuthenticated()) return next('/login');
  if (to.meta.role && getUser()?.role !== to.meta.role) return next('/');
  next();
});

export default router;
