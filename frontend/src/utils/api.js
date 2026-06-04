import axios from 'axios';

function resolveApiBaseUrl() {
  const raw = import.meta.env.VITE_API_BASE_URL;
  if (raw == null || String(raw).trim() === '') {
    return '/api';
  }
  return String(raw).trim().replace(/\/+$/, '') || '/api';
}

const api = axios.create({
  baseURL: resolveApiBaseUrl(),
  timeout: 15000,
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('bc_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Endpoints where a 401 is an expected business outcome (e.g. wrong
// credentials during sign-in) rather than an expired session. For these we
// must NOT force a redirect/reload — the calling component handles the error
// inline so the message stays visible on screen.
const AUTH_ENDPOINTS = ['/auth/login', '/auth/change-password'];

// Handle 401 globally — but only for protected requests. A 401 from the
// login flow is surfaced to the form's catch block instead of triggering a
// full-page navigation that would wipe the error message.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const requestUrl = err.config?.url || '';
    const isAuthRequest = AUTH_ENDPOINTS.some((path) => requestUrl.includes(path));

    if (err.response?.status === 401 && !isAuthRequest) {
      localStorage.removeItem('bc_token');
      localStorage.removeItem('bc_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
