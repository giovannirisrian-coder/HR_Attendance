/**
 * Shared constants for the LS HR "Employee List" feature.
 *
 * Live employee data is now served by `GET /api/employees`. This module
 * only contains UI-side constants reused by the Create / Edit forms.
 */

export const EMPLOYMENT_STATUS_OPTIONS = ['Permanent', 'Contract'];
export const USER_STATUS_OPTIONS = ['Active', 'Deactive'];

export const EMPTY_EMPLOYEE = {
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
  supervisor_nik: '',
  supervisor_name: '',
  user_status: 'Active',
};
