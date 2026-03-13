const express = require('express');
const PaymentModel = require('../models/PaymentModel');
const ReceiptsController = require('../controllers/ReceiptsController');

const router = express.Router();

const paymentModel = new PaymentModel();
const ctrl = new ReceiptsController(paymentModel);

router.post('/generate', (req, res) => ctrl.generate(req, res));
router.get('/:id', (req, res) => ctrl.getLinkByPaymentId(req, res));
router.get('/:id/serve', (req, res) => ctrl.serveReceipt(req, res));

module.exports = router;