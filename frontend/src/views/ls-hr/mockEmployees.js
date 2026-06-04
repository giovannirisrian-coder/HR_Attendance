/**
 * Shared constants for the LS HR "Employee List" feature.
 *
 * Live employee data is now served by `GET /api/employees`. This module
 * only contains UI-side constants reused by the Create / Edit forms.
 */

export const USER_STATUS_OPTIONS = ['Active', 'Deactive'];
// Coarse "Group" classification used by the Automated Analytics
// step to bucket recap rows for audit / payroll reporting.
// Optional — an empty selection submits as NULL.
export const EMPLOYEE_GROUP_OPTIONS = ['BC', 'MTL'];

export const EMPTY_EMPLOYEE = {
  vendor_id: null,
  vendor_number: '',
  user_department: '',
  vendor_name: '',
  npk: '',
  employee_name: '',
  email: '',
  position: '',
  position_group: '',
  employee_group: '',
  site: '',
  // Supervisor is now a FK into the `users` master (role =
  // 'ls_supervisor'). `supervisor_name` / `supervisor_employee_id`
  // are read-only display copies populated by the backend JOIN —
  // they are kept on the form model so the searchable lookup can
  // pre-populate the selected user's name on the Edit page without
  // an extra round-trip.
  supervisor_id: null,
  supervisor_name: '',
  supervisor_employee_id: '',
  user_status: 'Active',
};
