const express = require('express');
const ProgramModel = require('../models/ProgramModel');
const ProgramsController = require('../controllers/ProgramsController');
const { authenticateJWT, authorizeRole } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const { ProgramCreateSchema, ProgramUpdateSchema } = require('../validation/schemas');

const router = express.Router();
const programModel = new ProgramModel();
const controller = new ProgramsController(programModel);

router.get('/', (req, res) => controller.getAll(req, res));
router.post('/', authenticateJWT, authorizeRole('admin', 'super_admin'), validate(ProgramCreateSchema), (req, res) => controller.create(req, res));
router.put('/:id', authenticateJWT, authorizeRole('admin', 'super_admin'), validate(ProgramUpdateSchema), (req, res) => controller.update(req, res));
router.delete('/:id', authenticateJWT, authorizeRole('super_admin'), (req, res) => controller.remove(req, res));

module.exports = router;