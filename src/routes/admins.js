const express = require('express');
const AdminModel = require('../models/AdminModel');
const AdminsController = require('../controllers/AdminsController');
const { authenticateJWT, authorizeRole } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const { AdminLoginSchema, AdminCreateSchema, AdminUpdateSchema } = require('../validation/schemas');

const router = express.Router();
const adminModel = new AdminModel();
const controller = new AdminsController(adminModel);

router.post('/login', validate(AdminLoginSchema), (req, res) => controller.login(req, res));
router.post('/', authenticateJWT, authorizeRole('super_admin'), validate(AdminCreateSchema), (req, res) => controller.create(req, res));
router.get('/', authenticateJWT, authorizeRole('super_admin'), (req, res) => controller.list(req, res));
router.put('/:id', authenticateJWT, authorizeRole('super_admin'), validate(AdminUpdateSchema), (req, res) => controller.update(req, res));
router.delete('/:id', authenticateJWT, authorizeRole('super_admin'), (req, res) => controller.remove(req, res));

module.exports = router;