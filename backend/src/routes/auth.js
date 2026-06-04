const express = require('express');
const router = express.Router();
const { login, changePassword, getProfile } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

router.post('/login', login);
// First-time login "Force Password Change" — public by design (the user
// has no token yet); re-verifies SID + current password internally.
router.post('/change-password', changePassword);
router.get('/profile', authenticate, getProfile);

module.exports = router;
