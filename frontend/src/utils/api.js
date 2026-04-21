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

// Handle 401 globally
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('bc_token');
      localStorage.removeItem('bc_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
