/**
 * LS HR ➜ Employee List routes (BAST Check master data).
 * All endpoints require LS HR authentication.
 */

const express = require('express');
const router = express.Router();
const {
  listEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
} = require('../controllers/hrEmployeeController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate, authorize('ls_hr'));

router.get('/', listEmployees);
router.get('/:id', getEmployeeById);
router.post('/', createEmployee);
router.put('/:id', updateEmployee);

module.exports = router;
