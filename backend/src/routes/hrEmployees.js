/**
 * LS HR ➜ Employee List routes (BAST Check master data).
 * All endpoints require LS HR authentication.
 */

const express = require('express');
const router = express.Router();
const {
  listEmployees,
  listVendors,
  listSupervisors,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  uploadHrEmployeesMiddleware,
  uploadEmployeesBulk,
  downloadEmployeeTemplate,
  resetUserPassword,
} = require('../controllers/hrEmployeeController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate, authorize('ls_hr'));

// Master lookups must be declared BEFORE the `/:id` route so the
// static path segments are not mistakenly parsed as an employee id.
router.get('/vendors', listVendors);
router.get('/supervisors', listSupervisors);

// Administrative password reset by SID (PIC LS). Declared before the
// `/:id` routes so the static segment is not parsed as an employee id.
router.post('/reset-password', resetUserPassword);

// Bulk-upload Excel template download. Declared before the `/:id` route
// so the static segment is not parsed as an employee id.
router.get('/template', downloadEmployeeTemplate);

router.get('/', listEmployees);
router.post('/upload', uploadHrEmployeesMiddleware, uploadEmployeesBulk);
router.get('/:id', getEmployeeById);
router.post('/', createEmployee);
router.put('/:id', updateEmployee);

module.exports = router;
