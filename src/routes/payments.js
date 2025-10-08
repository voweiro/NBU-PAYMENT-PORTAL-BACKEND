const express = require('express');
const PaymentModel = require('../models/PaymentModel');
const FeeModel = require('../models/FeeModel');
const PaymentsController = require('../controllers/PaymentsController');
const { authenticateJWT, authorizeRole } = require('../middlewares/auth');
const { validate } = require('../middlewares/validate');
const { PaymentInitiateSchema, PaymentVerifySchema, BalanceInitiateSchema, BalanceProcessSchema } = require('../validation/schemas');
const emailService = require('../services/email');

const router = express.Router();
const paymentModel = new PaymentModel();
const feeModel = new FeeModel();
const controller = new PaymentsController(paymentModel, feeModel, emailService);

router.post('/initiate', validate(PaymentInitiateSchema), (req, res) => controller.initiate(req, res));
router.get('/verify/:reference', validate(PaymentVerifySchema), (req, res) => controller.verify(req, res));
router.get('/by-ref/:reference', (req, res) => controller.getByRef(req, res));
router.get('/balance/by-ref/:reference', (req, res) => controller.getBalanceByRef(req, res));
router.post('/balance/initiate', validate(BalanceInitiateSchema), (req, res) => controller.initiateBalance(req, res));
router.post('/balance/process', validate(BalanceProcessSchema), (req, res) => controller.processBalance(req, res));
router.get('/:id', authenticateJWT, authorizeRole('admin', 'super_admin'), (req, res) => controller.getById(req, res));
router.get('/', authenticateJWT, authorizeRole('admin', 'super_admin'), (req, res) => controller.listAll(req, res));

module.exports = router;