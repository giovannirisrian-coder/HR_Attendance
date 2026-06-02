/**
 * LS HR ➜ Employee List routes (BAST Check master data).
 * All endpoints require LS HR authentication.
 */

const express = require('express');
const router = express.Router();
const {
  listEmployees,
  listVendors,
  getEmployeeById,
  createEmployee,
  updateEmployee,
} = require('../controllers/hrEmployeeController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate, authorize('ls_hr'));

// Vendor master lookup must be declared BEFORE the `/:id` route so
// `/vendors` is not mistakenly parsed as an employee id.
router.get('/vendors', listVendors);

router.get('/', listEmployees);
router.get('/:id', getEmployeeById);
router.post('/', createEmployee);
router.put('/:id', updateEmployee);

module.exports = router;
