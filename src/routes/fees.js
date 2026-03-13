const express = require('express');
const FeeModel = require('../models/FeeModel');
const FeesController = require('../controllers/FeesController');
const authMiddleware = require('../middlewares/authMiddleware');
const authorizePermission = require('../middlewares/permissionMiddleware');
const { validate } = require('../middlewares/validate');
const { FeeCreateSchema, FeeUpdateSchema } = require('../validation/schemas');

const router = express.Router();
const feeModel = new FeeModel();
const controller = new FeesController(feeModel);

router.get('/', (req, res) => controller.getAll(req, res));
router.get('/program/:programId', (req, res) => controller.getByProgramId(req, res));
router.get('/applicable', (req, res) => controller.getApplicable(req, res));
router.post('/', authMiddleware, authorizePermission('finance:manage'), validate(FeeCreateSchema), (req, res) => controller.create(req, res));
router.put('/:id', authMiddleware, authorizePermission('finance:manage'), validate(FeeUpdateSchema), (req, res) => controller.update(req, res));
router.delete('/:id', authMiddleware, authorizePermission('finance:manage'), (req, res) => controller.remove(req, res));

module.exports = router;
