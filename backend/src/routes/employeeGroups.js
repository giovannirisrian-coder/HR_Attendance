/**
 * LS HR ➜ Employee Group master data routes.
 */

const express = require('express');
const router = express.Router();
const {
  listEmployeeGroups,
  getEmployeeGroupById,
  createEmployeeGroup,
  updateEmployeeGroup,
} = require('../controllers/employeeGroupController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate, authorize('ls_hr'));

router.get('/', listEmployeeGroups);
router.get('/:id', getEmployeeGroupById);
router.post('/', createEmployeeGroup);
router.put('/:id', updateEmployeeGroup);

module.exports = router;
