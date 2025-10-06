const ApiResponse = require('../utils/apiResponse');
const ReceiptService = require('../services/receiptService');

class ReceiptsController {
  constructor(paymentModel) {
    this.paymentModel = paymentModel;
  }

  async generate(req, res) {
    try {
      const { id } = req.params;
      const payment = await this.paymentModel.getById(id);
      if (!payment) return ApiResponse.error(res, 'Payment not found', 404);
      if (payment.status !== 'successful') return ApiResponse.error(res, 'Payment not successful', 400);

      const fee = await this.paymentModel.prisma.fee.findUnique({ where: { fee_id: payment.fee_id } });
      const program = await this.paymentModel.prisma.program.findUnique({ where: { program_id: fee.program_id } });
      const receipt = await ReceiptService.generateAndUploadReceipt({ payment, fee, program });
      await this.paymentModel.setReceiptUrlById(payment.payment_id, receipt.driveUrl);
      return ApiResponse.ok(res, { id, receiptUrl: receipt.driveUrl });
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