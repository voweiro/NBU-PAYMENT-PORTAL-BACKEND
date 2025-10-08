const ApiResponse = require('../utils/apiResponse');
const PaymentGateway = require('../services/paymentGateway');
const ReceiptService = require('../services/receiptService');

class PaymentsController {
  constructor(paymentModel, feeModel, emailService) {
    this.paymentModel = paymentModel;
    this.feeModel = feeModel;
    this.emailService = emailService;
  }

  async getByRef(req, res) {
    try {
      const { reference } = req.params;
      const payment = await this.paymentModel.getByRef(reference);
      if (!payment) return ApiResponse.error(res, 'Payment not found', 404);
      // Return a concise summary useful for student lookup
      return ApiResponse.ok(res, {
        payment_id: payment.payment_id,
        transaction_ref: payment.transaction_ref,
        status: payment.status,
        amount_paid: payment.amount_paid,
        receipt_drive_url: payment.receipt_drive_url ?? null,
        student_email: payment.student_email,
        student_name: payment.student_name ?? null,
      });
    } catch (err) {
      return ApiResponse.error(res, err);
    }
  }

  async getById(req, res) {
    try {
      const { id } = req.params;
      const payment = await this.paymentModel.getById(id);
      if (!payment) return ApiResponse.error(res, 'Payment not found', 404);
      return ApiResponse.ok(res, payment);
    } catch (err) {
      return ApiResponse.error(res, err);
    }
  }

  async listAll(req, res) {
    try {
      const payments = await this.paymentModel.listAll();
      return ApiResponse.ok(res, payments);
    } catch (err) {
      return ApiResponse.error(res, err);
    }
  }

  async initiate(req, res) {
    try {
      const { feeId, feeIds, studentEmail, studentName, gateway = 'global', jambNumber, matricNumber, percent, level, phoneNumber, address } = req.validated.body || req.body;
      // Support single or multiple fees
      const ids = Array.isArray(feeIds) && feeIds.length > 0 ? feeIds.map((id) => Number(id)) : [Number(feeId)];
      const fees = await this.feeModel.prisma.fee.findMany({ where: { fee_id: { in: ids } }, include: { program: true } });
      if (!fees || fees.length === 0) return ApiResponse.error(res, 'Fee(s) not available', 400);
      if (fees.length !== ids.length) return ApiResponse.error(res, 'Some selected fees were not found', 400);

      // If program type is undergraduate, require either JAMB or Matric number
      const program = fees[0].program;
      if (program?.program_type === 'undergraduate' && !jambNumber && !matricNumber) {
        return ApiResponse.error(res, 'JAMB number or Matric number is required for undergraduate payments', 400);
      }

      // For undergraduate programs, validate provided level against fee.levels
      if (program?.program_type === 'undergraduate') {
        const validLevels = ['L100', 'L200', 'L300', 'L400', 'L500', 'L600', 'ALL'];
        if (!level) {
          return ApiResponse.error(res, 'Level is required for undergraduate payments', 400);
        }
        if (!validLevels.includes(level)) {
          return ApiResponse.error(res, 'Invalid level selection', 400);
        }
        const allAllowLevel = fees.every((f) => {
          const allowed = Array.isArray(f.levels) ? f.levels : [];
          const isAll = allowed.includes('ALL');
          return isAll || allowed.includes(level);
        });
        if (!allAllowLevel) {
          return ApiResponse.error(res, 'Selected level is not applicable for one or more chosen fees', 400);
        }
      }

      // Support partial payment: 50% or 100% for single or multiple fees
      const pct = percent && Number(percent) === 50 ? 50 : 100;
      const totalAmount = fees.reduce((sum, f) => sum + Number(f.amount || 0), 0);
      const amountToCharge = Math.round(totalAmount * (pct / 100));

      const FRONTEND_URL = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      // GlobalPay expects redirect to your verification/callback page; keep base clean
      const redirectUrl = `${FRONTEND_URL}/payment/callback`;

      // Validate gateway secrets early to avoid opaque 500s
      // Paystack/Flutterwave disabled: no secret validation

      // For GlobalPay, enforce docs: phone must be 11 digits; address ≥ 6 chars
      if (gateway === 'global') {
        if (!phoneNumber) {
          return ApiResponse.error(res, 'Phone number is required for GlobalPay', 400);
        }
        const numOk = /^\d{11}$/.test(String(phoneNumber));
        if (!numOk) {
          return ApiResponse.error(res, 'Phone number must be exactly 11 digits for GlobalPay', 400);
        }
        if (address && String(address).trim().length < 6) {
          return ApiResponse.error(res, 'Address must be at least 6 characters for GlobalPay', 400);
        }
      }

      const initData = await PaymentGateway.initiatePayment({
        gateway,
        amount: amountToCharge,
        email: studentEmail,
        metadata: { studentName, percent: pct, phoneNumber, address, feeNames: fees.map((f) => f.fee_category) },
        redirectUrl,
      });

      const ref = initData.reference;

      const created = await this.paymentModel.createPaymentRecord({
        feeId: fees[0].fee_id,
        feeIds: ids,
        items: fees.map((f) => ({ fee_id: f.fee_id, fee_category: f.fee_category, amount: Number(f.amount || 0) })),
        studentEmail,
        studentName,
        amount: amountToCharge,
        reference: ref,
        status: 'pending',
        jambNumber,
        matricNumber,
        level,
        phoneNumber,
        address,
      });

      return ApiResponse.ok(res, { reference: ref, paymentId: created.payment_id, ...initData }, 201);
    } catch (err) {
      return ApiResponse.error(res, err);
    }
  }

  async verify(req, res) {
    try {
      const { reference } = req.params;
      const { gateway } = req.validated.query || req.query;
      const payment = await this.paymentModel.getByRef(reference);
      if (!payment) return ApiResponse.error(res, 'Payment not found', 404);

      const verifyData = await PaymentGateway.verifyPayment({ gateway, reference });

      const status = verifyData.verified ? 'successful' : 'failed';
      await this.paymentModel.updateStatusByRef(reference, status);

      if (status === 'successful') {
        try {
          const fee = await this.feeModel.getById(payment.fee_id);
          const program = await this.feeModel.prisma.program.findUnique({ where: { program_id: fee.program_id } });
          const receipt = await ReceiptService.generateAndUploadReceipt({ payment, fee, program });
          if (receipt.driveUrl) {
            await this.paymentModel.setReceiptUrlById(payment.payment_id, receipt.driveUrl);
          }

          if (this.emailService) {
            await this.emailService.sendMail({
              to: payment.student_email,
              subject: 'Payment Receipt',
              text: 'Your payment was successful. Receipt attached.',
              attachments: [
                {
                  filename: receipt.filename,
                  content: receipt.buffer,
                },
              ],
            });
          }
        } catch (genErr) {
          // Do not fail verification endpoint if receipt/email generation fails
          console.error('Receipt/email post-processing failed:', genErr?.message || genErr);
        }
      }

      return ApiResponse.ok(res, { reference, status, paymentId: payment.payment_id, verifyData });
    } catch (err) {
      return ApiResponse.error(res, err);
    }
  }
}

module.exports = PaymentsController;