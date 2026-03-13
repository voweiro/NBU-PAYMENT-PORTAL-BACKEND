const express = require('express');
const PaymentModel = require('../models/PaymentModel');
const FeeModel = require('../models/FeeModel');
const DashboardController = require('../controllers/DashboardController');
const authMiddleware = require('../middlewares/authMiddleware');
const authorizePermission = require('../middlewares/permissionMiddleware');

const router = express.Router();
const paymentModel = new PaymentModel();
const feeModel = new FeeModel();
// ProgramModel removed as it belongs to academic-service
const controller = new DashboardController(paymentModel, feeModel, null);

router.get('/analytics', authMiddleware, authorizePermission('finance:manage'), (req, res) => controller.getAnalytics(req, res));

module.exports = router;