const prisma = require('../config/prisma');
const PaymentModel = require('../models/PaymentModel');
const FeeModel = require('../models/FeeModel');
const PaymentGateway = require('./paymentGateway');
const ReceiptService = require('./receiptService');
const emailService = require('./email');
const { buildReceiptEmail } = require('./emailTemplates');

const paymentModel = new PaymentModel(prisma);
const feeModel = new FeeModel(prisma);

async function reconcileOnce() {
  const candidates = await prisma.payment.findMany({ where: { status: { in: ['pending'] } }, orderBy: { payment_date: 'asc' } });
  let processed = 0;
  for (const payment of candidates) {
    try {
      const verifyData = await PaymentGateway.verifyPayment({ gateway: 'global', reference: payment.transaction_ref });
      
      // Use the strict verification result from the gateway service
      let status = 'pending';
      if (verifyData.verified) {
        status = 'successful';
      } else {
        const provider = String(verifyData.paymentStatus || '').toLowerCase();
        const failVals = ['failed', 'declined', 'reversed', 'cancelled', 'canceled'];
        if (failVals.includes(provider)) {
          status = 'failed';
        }
      }

      const targetRef = verifyData.merchantRef || payment.transaction_ref;
      if (status === 'pending') {
        processed += 1;
        continue;
      }
      await paymentModel.updateStatusByRef(targetRef, status);
      if (status === 'successful') {
        let targetPayment = await paymentModel.getByRef(targetRef).catch(() => null);
        if (!targetPayment) targetPayment = payment;
        if (payment.original_reference) {
          const addAmount = Number(targetPayment.amount_paid || 0);
          const updatedOriginal = await paymentModel.updateBalanceByRef(payment.original_reference, addAmount).catch(() => null);
          if (updatedOriginal && updatedOriginal.status === 'successful') {
            const fee = await feeModel.getById(updatedOriginal.fee_id);
            const program = await feeModel.prisma.program.findUnique({ where: { program_id: fee.program_id } });
            const receipt = await ReceiptService.generateAndUploadReceipt({ payment: updatedOriginal, fee, program, isBalanceSettlement: true });
            if (receipt.driveUrl) await paymentModel.setReceiptUrlById(updatedOriginal.payment_id, receipt.driveUrl);
          if (String(process.env.RECONCILIATION_SEND_EMAIL || '').toLowerCase() === 'true') {
            try {
              const { subject, html } = await buildReceiptEmail({ payment: updatedOriginal, fee, program, receiptDriveUrl: receipt.driveUrl, isBalanceSettlement: true });
              await emailService.sendMail({
                to: updatedOriginal.student_email,
                subject,
                text: 'Your payment was successful. Receipt attached.',
                html,
                attachments: [{ filename: receipt.filename, content: receipt.buffer }],
              });
            } catch {}
          }
          }
        } else {
          const fee = await feeModel.getById(targetPayment.fee_id);
          const program = await feeModel.prisma.program.findUnique({ where: { program_id: fee.program_id } });
          const receipt = await ReceiptService.generateAndUploadReceipt({ payment: targetPayment, fee, program, isBalanceSettlement: false });
          if (receipt.driveUrl) await paymentModel.setReceiptUrlById(targetPayment.payment_id, receipt.driveUrl);
          if (String(process.env.RECONCILIATION_SEND_EMAIL || '').toLowerCase() === 'true') {
            try {
              const { subject, html } = await buildReceiptEmail({ payment: targetPayment, fee, program, receiptDriveUrl: receipt.driveUrl, isBalanceSettlement: false });
              await emailService.sendMail({
                to: targetPayment.student_email,
                subject,
                text: 'Your payment was successful. Receipt attached.',
                html,
                attachments: [{ filename: receipt.filename, content: receipt.buffer }],
              });
            } catch {}
          }
        }
      }
      processed += 1;
    } catch {
      processed += 1;
      continue;
    }
  }
  console.log(`Reconciliation run processed ${processed} pending payments`);
}

let timer = null;

function startReconciliation({ intervalMs = 60 * 1000 } = {}) {
  if (timer) return;
  const interval = Math.max(15000, Number(intervalMs) || 60000);
  timer = setInterval(() => {
    reconcileOnce().catch(() => {});
  }, interval);
  console.log(`Started reconciliation service with interval ${interval}ms`);
}

function stopReconciliation() {
  if (timer) {
    clearInterval(timer);
    timer = null;
    console.log('Stopped reconciliation service');
  }
}

module.exports = { startReconciliation, stopReconciliation, reconcileOnce };
