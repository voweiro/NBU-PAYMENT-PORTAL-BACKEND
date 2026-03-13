const express = require('express');
const PaymentModel = require('../models/PaymentModel');
const FeeModel = require('../models/FeeModel');
const PaymentsController = require('../controllers/PaymentsController');
const authMiddleware = require('../middlewares/authMiddleware');
const authorizePermission = require('../middlewares/permissionMiddleware');
const { validate } = require('../middlewares/validate');
const { PaymentInitiateSchema, PaymentVerifySchema, PaymentManualSchema, BalanceInitiateSchema, BalanceProcessSchema } = require('../validation/schemas');
const emailService = require('../services/email');

const router = express.Router();
const paymentModel = new PaymentModel();
const feeModel = new FeeModel();
const controller = new PaymentsController(paymentModel, feeModel, emailService);

router.post('/initiate', validate(PaymentInitiateSchema), (req, res) => controller.initiate(req, res));
router.get('/my-payments', authMiddleware, (req, res) => controller.getMyPayments(req, res));
router.post('/manual', authMiddleware, authorizePermission('finance:manage'), validate(PaymentManualSchema), (req, res) => controller.manualEntry(req, res));
router.get('/verify/:reference', validate(PaymentVerifySchema), (req, res) => controller.verify(req, res));
router.get('/by-ref/:reference', (req, res) => controller.getByRef(req, res));
router.get('/balance/by-ref/:reference', (req, res) => controller.getBalanceByRef(req, res));
router.post('/balance/initiate', validate(BalanceInitiateSchema), (req, res) => controller.initiateBalance(req, res));
router.post('/balance/process', validate(BalanceProcessSchema), (req, res) => controller.processBalance(req, res));
router.get('/bulk-status', authMiddleware, authorizePermission('finance:manage'), (req, res) => controller.getBulkStatus(req, res));
router.get('/application/:applicationId', authMiddleware, authorizePermission(['finance:manage', 'admissions:manage', 'admissions:view']), (req, res) => controller.getByApplicationId(req, res));
router.get('/applicant/:applicantId', authMiddleware, authorizePermission(['finance:manage', 'admissions:manage', 'admissions:view']), (req, res) => controller.getByApplicantId(req, res));
router.get('/:id', authMiddleware, authorizePermission('finance:manage'), (req, res) => controller.getById(req, res));
router.get('/', authMiddleware, authorizePermission('finance:manage'), (req, res) => controller.listAll(req, res));
router.post('/sync-matric', (req, res) => controller.syncMatric(req, res));

module.exports = router;
