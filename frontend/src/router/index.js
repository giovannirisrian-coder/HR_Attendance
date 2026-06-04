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
      if (role === 'ls_hr') return '/ls-hr/approvals';
      if (role === 'ssu') return '/ssu/approvals';
      return '/login';
    },
  },
  { path: '/login', component: () => import('../views/LoginView.vue'), meta: { public: true } },

  {
    path: '/ls',
    component: () => import('../views/layouts/AppLayout.vue'),
    meta: { requiresAuth: true, role: 'ls' },
    children: [
      { path: 'attendance/create', component: () => import('../views/ls/CreateAttendance.vue') },
      { path: 'attendance/list', component: () => import('../views/ls/AttendanceList.vue') },
      { path: 'overtime', component: () => import('../views/OvertimeHubView.vue') },
      { path: 'attendance/:id', component: () => import('../views/ls/AttendanceDetail.vue') },
      { path: 'leave', component: () => import('../views/LeaveHubView.vue') },
    ],
  },

  {
    path: '/supervisor',
    component: () => import('../views/layouts/AppLayout.vue'),
    meta: { requiresAuth: true, role: 'ls_supervisor' },
    children: [
      { path: 'approvals', component: () => import('../views/supervisor/ApprovalList.vue') },
      { path: 'monthly-recap', component: () => import('../views/supervisor/MonthlyAttendanceRecap.vue') },
      { path: 'overtime', component: () => import('../views/OvertimeHubView.vue') },
      { path: 'glog-upload', component: () => import('../views/glog/GlogUpload.vue') },
      { path: 'leave', component: () => import('../views/LeaveHubView.vue') },
    ],
  },

  {
    path: '/vendor',
    component: () => import('../views/layouts/AppLayout.vue'),
    meta: { requiresAuth: true, role: 'vendor' },
    children: [
      { path: 'reports', component: () => import('../views/vendor/ReportList.vue') },
      { path: 'reports/:month/:year/detail', component: () => import('../views/vendor/ReportDetail.vue') },
    ],
  },

  {
    path: '/ls-hr',
    component: () => import('../views/layouts/AppLayout.vue'),
    meta: { requiresAuth: true, role: 'ls_hr' },
    children: [
      { path: 'approvals', component: () => import('../views/SubmissionQueue.vue'), meta: { queue: 'hr' } },
      { path: 'glog-upload', component: () => import('../views/glog/GlogUpload.vue') },
      { path: 'employees/upload', component: () => import('../views/ls-hr/EmployeeUpload.vue') },
      { path: 'employees', component: () => import('../views/ls-hr/EmployeeList.vue') },
      { path: 'employees/create', component: () => import('../views/ls-hr/EmployeeCreate.vue') },
      { path: 'employees/:id/edit', component: () => import('../views/ls-hr/EmployeeEdit.vue') },
      { path: 'reset-password', component: () => import('../views/ls-hr/ResetPassword.vue') },
    ],
  },

  {
    path: '/ssu',
    component: () => import('../views/layouts/AppLayout.vue'),
    meta: { requiresAuth: true, role: 'ssu' },
    children: [
      { path: 'approvals', component: () => import('../views/SubmissionQueue.vue'), meta: { queue: 'ssu' } },
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
