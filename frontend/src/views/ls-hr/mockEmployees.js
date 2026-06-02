/**
 * Shared constants for the LS HR "Employee List" feature.
 *
 * Live employee data is now served by `GET /api/employees`. This module
 * only contains UI-side constants reused by the Create / Edit forms.
 */

export const EMPLOYMENT_STATUS_OPTIONS = ['Permanent', 'Contract'];
export const USER_STATUS_OPTIONS = ['Active', 'Deactive'];

export const EMPTY_EMPLOYEE = {
  vendor_id: null,
  vendor_number: '',
  user_department: '',
  department_title: '',
  vendor_name: '',
  employment_status: '',
  po_number: '',
  po_period_1: '',
  po_period_2: '',
  dic_hro: '',
  cost_center: '',
  npk: '',
  employee_name: '',
  email: '',
  position: '',
  position_group: '',
  category: '',
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
