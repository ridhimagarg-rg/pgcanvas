const express = require('express')
const router = express.Router()
const auth = require('../middleware/auth.middleware')
const usersController = require('../controllers/users.controller')

router.use(auth)

router.get('/me', usersController.getMe)
router.get('/', usersController.getAllUsers)
router.put('/:id/role', usersController.updateRole)
router.put('/:id/status', usersController.updateStatus)

module.exports = router
