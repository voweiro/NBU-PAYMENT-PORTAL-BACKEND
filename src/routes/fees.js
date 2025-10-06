const express = require('express');
const FeeModel = require('../models/FeeModel');
const FeesController = require('../controllers/FeesController');
const { authenticateJWT, authorizeRole } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const { FeeCreateSchema, FeeUpdateSchema } = require('../validation/schemas');

const router = express.Router();
const feeModel = new FeeModel();
const controller = new FeesController(feeModel);

router.get('/', (req, res) => controller.getAll(req, res));
router.get('/program/:programId', (req, res) => controller.getByProgramId(req, res));
router.post('/', authenticateJWT, authorizeRole('admin', 'super_admin'), validate(FeeCreateSchema), (req, res) => controller.create(req, res));
router.put('/:id', authenticateJWT, authorizeRole('admin', 'super_admin'), validate(FeeUpdateSchema), (req, res) => controller.update(req, res));
router.delete('/:id', authenticateJWT, authorizeRole('super_admin'), (req, res) => controller.remove(req, res));

module.exports = router;