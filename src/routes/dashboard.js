const express = require('express');
const PaymentModel = require('../models/PaymentModel');
const FeeModel = require('../models/FeeModel');
const ProgramModel = require('../models/ProgramModel');
const DashboardController = require('../controllers/DashboardController');
const { authenticateJWT, authorizeRole } = require('../middlewares/auth');

const router = express.Router();
const paymentModel = new PaymentModel();
const feeModel = new FeeModel();
const programModel = new ProgramModel();
const controller = new DashboardController(paymentModel, feeModel, programModel);

router.get('/analytics', authenticateJWT, authorizeRole('admin', 'super_admin'), (req, res) => controller.getAnalytics(req, res));

module.exports = router;