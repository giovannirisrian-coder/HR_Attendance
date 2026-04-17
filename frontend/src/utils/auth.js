export const getToken = () => localStorage.getItem('bc_token');
export const getUser  = () => {
  const raw = localStorage.getItem('bc_user');
  return raw ? JSON.parse(raw) : null;
};
export const setAuth = (token, user) => {
  localStorage.setItem('bc_token', token);
  localStorage.setItem('bc_user', JSON.stringify(user));
};
export const clearAuth = () => {
  localStorage.removeItem('bc_token');
  localStorage.removeItem('bc_user');
};
export const isAuthenticated = () => !!getToken();
export const hasRole = (role) => getUser()?.role === role;
