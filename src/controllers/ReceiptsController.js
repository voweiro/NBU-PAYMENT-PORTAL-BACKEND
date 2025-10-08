const ApiResponse = require('../utils/apiResponse');
const ReceiptService = require('../services/receiptService');

class ReceiptsController {
  constructor(paymentModel) {
    this.paymentModel = paymentModel;
  }

  async generate(req, res) {
    try {
      // Support ID from params (GET /:id) or POST body ({ id })
      const idFromParams = req.params?.id;
      const idFromBody = (req.body && (req.body.id ?? req.body.payment_id)) || undefined;
      const rawId = idFromParams ?? idFromBody;
      if (rawId === undefined || rawId === null || Number.isNaN(Number(rawId))) {
        return ApiResponse.error(res, 'Payment ID is required to generate receipt', 400);
      }

      const payment = await this.paymentModel.getById(rawId);
      if (!payment) return ApiResponse.error(res, 'Payment not found', 404);
      if (payment.status !== 'successful') return ApiResponse.error(res, 'Payment not successful', 400);

      const fee = await this.paymentModel.prisma.fee.findUnique({ where: { fee_id: payment.fee_id } });
      const program = await this.paymentModel.prisma.program.findUnique({ where: { program_id: fee.program_id } });
      const receipt = await ReceiptService.generateAndUploadReceipt({ payment, fee, program });
      await this.paymentModel.setReceiptUrlById(payment.payment_id, receipt.driveUrl);
      return ApiResponse.ok(res, { id: Number(rawId), receiptUrl: receipt.driveUrl });
    } catch (err) {
      return ApiResponse.error(res, err);
    }
  }

  async getLinkByPaymentId(req, res) {
    try {
      const { id } = req.params;
      const payment = await this.paymentModel.getById(id);
      if (!payment) return ApiResponse.error(res, 'Payment not found', 404);
      return ApiResponse.ok(res, { id, receiptUrl: payment.receipt_drive_url });
    } catch (err) {
      return ApiResponse.error(res, err);
    }
  }
}

module.exports = ReceiptsController;