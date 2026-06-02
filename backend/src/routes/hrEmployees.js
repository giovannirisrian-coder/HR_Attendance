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
} = require('../controllers/hrEmployeeController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate, authorize('ls_hr'));

// Master lookups must be declared BEFORE the `/:id` route so the
// static path segments are not mistakenly parsed as an employee id.
router.get('/vendors', listVendors);
router.get('/supervisors', listSupervisors);

router.get('/', listEmployees);
router.post('/upload', uploadHrEmployeesMiddleware, uploadEmployeesBulk);
router.get('/:id', getEmployeeById);
router.post('/', createEmployee);
router.put('/:id', updateEmployee);

module.exports = router;
