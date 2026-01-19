const ApiResponse = require('../utils/apiResponse');
const PaymentGateway = require('../services/paymentGateway');
const ReceiptService = require('../services/receiptService');
const { buildReceiptEmail } = require('../services/emailTemplates');

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
        balance_due: payment.balance_due,
        percentage_paid: payment.percentage_paid,
        items: payment.items,
        receipt_drive_url: payment.receipt_drive_url ?? null,
        student_email: payment.student_email,
        student_name: payment.student_name ?? null,
        fee_id: payment.fee_id,
        phone_number: payment.phone_number,
        address: payment.address,
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

  async getBalanceByRef(req, res) {
    try {
      const { reference } = req.params;
      const payment = await this.paymentModel.getByRef(reference);
      if (!payment) return ApiResponse.error(res, 'Payment not found', 404);

      // Compute total from items or single fee
      let totalAmount = 0;
      if (Array.isArray(payment.items) && payment.items.length > 0) {
        totalAmount = payment.items.reduce((sum, it) => sum + Number(it.amount || 0), 0);
      } else {
        const fee = await this.feeModel.getById(payment.fee_id);
        totalAmount = Number(fee?.amount || 0);
      }

      const amountPaid = Number(payment.amount_paid || 0);
      const balanceDue = typeof payment.balance_due === 'string' || typeof payment.balance_due === 'number'
        ? Number(payment.balance_due)
        : Math.max(0, totalAmount - amountPaid);
      const pct = typeof payment.percentage_paid === 'string' || typeof payment.percentage_paid === 'number'
        ? Number(payment.percentage_paid)
        : (totalAmount > 0 ? Math.min(100, Math.max(0, (amountPaid / totalAmount) * 100)) : 0);

      return ApiResponse.ok(res, {
        payment_id: payment.payment_id,
        transaction_ref: payment.transaction_ref,
        status: payment.status,
        total_amount: totalAmount,
        amount_paid: amountPaid,
        balance_due: Number(balanceDue.toFixed(2)),
        percentage_paid: Number(pct.toFixed(2)),
        student_email: payment.student_email,
        student_name: payment.student_name ?? null,
        phone_number: payment.phone_number ?? null,
        items: payment.items || null,
      });
    } catch (err) {
      return ApiResponse.error(res, err);
    }
  }

  async initiateBalance(req, res) {
    try {
      const { reference, gateway = 'global', phoneNumber, address } = (req.validated && req.validated.body) || req.body;
      const payment = await this.paymentModel.getByRef(reference);
      if (!payment) return ApiResponse.error(res, 'Payment not found', 404);

      // Compute remaining balance
      let totalAmount = 0;
      let feeRecord = null;
      if (Array.isArray(payment.items) && payment.items.length > 0) {
        totalAmount = payment.items.reduce((sum, it) => sum + Number(it.amount || 0), 0);
      } else {
        const fee = await this.feeModel.getById(payment.fee_id);
        feeRecord = fee;
        totalAmount = Number(fee?.amount || 0);
      }
      const amountPaid = Number(payment.amount_paid || 0);
      const remaining = Math.max(0, totalAmount - amountPaid);
      if (remaining <= 0) return ApiResponse.error(res, 'Payment already fully paid', 400);

      const FRONTEND_URL = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      // Include original_reference so callback/verify can locate the existing record without mutating its reference
      const redirectUrl = `${FRONTEND_URL}/payment/callback?original_reference=${encodeURIComponent(payment.transaction_ref)}`;

      // Use provided phone/address overrides or fallback to existing payment record
      const effectivePhone = phoneNumber || payment.phone_number || '';
      const effectiveAddress = address || payment.address || '';
      if (gateway === 'global' && (!/^\d{11}$/.test(effectivePhone))) {
        return ApiResponse.error(res, 'Phone number must be 11 digits for GlobalPay balance payments', 400);
      }

      const initData = await PaymentGateway.initiatePayment({
        gateway,
        amount: Math.round(remaining),
        email: payment.student_email,
        metadata: {
          studentName: payment.student_name,
          balancePayment: true,
          balanceAmount: remaining,
          phoneNumber: effectivePhone,
          address: effectiveAddress,
          feeNames: Array.isArray(payment.items) && payment.items.length > 0 ? payment.items.map((i) => i.fee_category) : undefined,
        },
        redirectUrl,
      });

      // Create a distinct pending payment record for the balance using the gateway reference
      const newRef = initData.reference;
      const itemsArray = (Array.isArray(payment.items) && payment.items.length > 0)
        ? payment.items.map((it) => ({ fee_id: it.fee_id ?? payment.fee_id, fee_category: it.fee_category, amount: Number(it.amount || 0) }))
        : (feeRecord ? [{ fee_id: feeRecord.fee_id, fee_category: feeRecord.fee_category, amount: Number(feeRecord.amount || 0) }] : undefined);

      const createdBalance = await this.paymentModel.createPaymentRecord({
        feeId: payment.fee_id,
        items: itemsArray,
        studentEmail: payment.student_email,
        studentName: payment.student_name,
        amount: Math.round(remaining),
        reference: newRef,
        status: 'pending',
        jambNumber: payment.jamb_number,
        matricNumber: payment.matric_number,
        level: payment.level,
        phoneNumber: effectivePhone,
        address: effectiveAddress,
        originalReference: payment.transaction_ref,
      });

      // Do not overwrite the original transaction_ref; return both for client awareness
      return ApiResponse.ok(res, { reference: payment.transaction_ref, gateway_reference: newRef, paymentId: payment.payment_id, balancePaymentId: createdBalance.payment_id, ...initData });
    } catch (err) {
      return ApiResponse.error(res, err);
    }
  }

  async processBalance(req, res) {
    try {
      const { reference, amount } = (req.validated && req.validated.body) || req.body;
      const updated = await this.paymentModel.updateBalanceByRef(reference, amount);

      // If fully paid now, generate receipt
      if (updated.status === 'successful') {
        try {
          const fee = await this.feeModel.getById(updated.fee_id);
          const program = await this.feeModel.prisma.program.findUnique({ where: { program_id: fee.program_id } });
          const receipt = await ReceiptService.generateAndUploadReceipt({ payment: updated, fee, program, isBalanceSettlement: true });
          if (receipt.driveUrl) {
            await this.paymentModel.setReceiptUrlById(updated.payment_id, receipt.driveUrl);
          }
        } catch (genErr) {
          console.error('Receipt generation on balance completion failed:', genErr?.message || genErr);
        }
      }

      return ApiResponse.ok(res, {
        payment_id: updated.payment_id,
        transaction_ref: updated.transaction_ref,
        status: updated.status,
        total_amount: (Array.isArray(updated.items) && updated.items.length > 0)
          ? updated.items.reduce((sum, it) => sum + Number(it.amount || 0), 0)
          : undefined,
        amount_paid: Number(updated.amount_paid),
        balance_due: Number(updated.balance_due || 0),
        percentage_paid: Number(updated.percentage_paid || 0),
      });
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

      // Support partial payment: 25%, 50%, 75% or 100% for single or multiple fees
      const allowedPercents = [25, 50, 75, 100];
      const pct = allowedPercents.includes(Number(percent)) ? Number(percent) : 100;
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

  async manualEntry(req, res) {
    try {
      const { fee_id, feeIds, items, student_email, student_name, amount_paid, jamb_number, matric_number, level, phone_number, address, is_balance_payment } = (req.validated && req.validated.body) || req.body;
      const adminId = req.user?.id || req.user?.admin_id;
      if (!adminId) return ApiResponse.error(res, 'Unauthorized: Admin ID missing', 401);

      // Resolve items/fees
      let resolvedItems = items;
      let primaryFeeId = fee_id;

      if (!resolvedItems || resolvedItems.length === 0) {
        const ids = Array.isArray(feeIds) && feeIds.length > 0 ? feeIds.map((id) => Number(id)) : (fee_id ? [Number(fee_id)] : []);
        if (ids.length > 0) {
           const fees = await this.feeModel.prisma.fee.findMany({ where: { fee_id: { in: ids } } });
           resolvedItems = fees.map(f => ({ fee_id: f.fee_id, fee_category: f.fee_category, amount: Number(f.amount || 0) }));
           if (!primaryFeeId && ids.length > 0) primaryFeeId = ids[0];
        }
      }
      
      const reference = `MANUAL_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

      const payment = await this.paymentModel.createPaymentRecord({
        feeId: primaryFeeId,
        items: resolvedItems,
        studentEmail: student_email,
        studentName: student_name,
        amount: amount_paid,
        reference,
        status: 'successful',
        jambNumber: jamb_number,
        matricNumber: matric_number,
        level,
        phoneNumber: phone_number,
        address,
        isManual: true,
        recordedBy: adminId,
        isBalancePayment: !!is_balance_payment
      });

      // Audit Log
      await this.paymentModel.prisma.auditLog.create({
        data: {
          admin_id: adminId,
          action: 'MANUAL_PAYMENT',
          details: {
            payment_id: payment.payment_id,
            transaction_ref: reference,
            amount: amount_paid,
            student_email,
            is_balance_payment: !!is_balance_payment
          },
          ip_address: req.ip || req.socket.remoteAddress
        }
      });

      // Generate Receipt
      try {
        let fee = null;
        let program = null;
        if (primaryFeeId) {
           fee = await this.feeModel.getById(primaryFeeId);
           if (fee) {
             program = await this.feeModel.prisma.program.findUnique({ where: { program_id: fee.program_id } });
           }
        }
        
        if (fee && program) {
            const receipt = await ReceiptService.generateAndUploadReceipt({ payment, fee, program, isBalanceSettlement: !!is_balance_payment });
            if (receipt.driveUrl) {
                await this.paymentModel.setReceiptUrlById(payment.payment_id, receipt.driveUrl);
                payment.receipt_drive_url = receipt.driveUrl;
            }
        }
      } catch (rErr) {
        console.error('Manual payment receipt generation failed:', rErr);
      }

      return ApiResponse.ok(res, payment, 201);
    } catch (err) {
      return ApiResponse.error(res, err);
    }
  }

  async verify(req, res) {
    try {
      const { reference } = req.params;
      const { gateway, original_reference } = req.validated.query || req.query;
      // Attempt to find the payment using original_reference first, then the provided reference
      const lookupRef = original_reference || reference;
      let payment = await this.paymentModel.getByRef(lookupRef);
      // Don't fail early; GlobalPay may pass provider ref, while our DB stores merchant ref

      const verifyData = await PaymentGateway.verifyPayment({ gateway, reference });

      const provider = String(verifyData.paymentStatus || '').toLowerCase();
      const successVals = ['success', 'successful'];
      const failVals = ['failed', 'declined', 'reversed', 'cancelled', 'canceled'];
      const isSuccess = successVals.includes(provider);
      const isFail = failVals.includes(provider);
      const status = isSuccess ? 'successful' : isFail ? 'failed' : 'pending';
      if (original_reference) {
        // Balance payment flow: mark the new balance record by its own gateway reference
        const balanceUpdateRef = verifyData.merchantRef || reference;
        try {
          await this.paymentModel.updateStatusByRef(balanceUpdateRef, status);
        } catch (e) {
          // As a fallback, try updating by the path reference
          await this.paymentModel.updateStatusByRef(reference, status);
        }

        if (status === 'successful') {
          // Aggregate the balance payment amount into the original record
          const balanceRecord = await this.paymentModel.getByRef(verifyData.merchantRef || reference);
          const addAmount = Number(balanceRecord?.amount_paid || 0);
          try {
            const updatedOriginal = await this.paymentModel.updateBalanceByRef(original_reference, addAmount);

            // If now fully paid, generate receipt and email
            if (updatedOriginal.status === 'successful') {
              try {
                const fee = await this.feeModel.getById(updatedOriginal.fee_id);
                const program = await this.feeModel.prisma.program.findUnique({ where: { program_id: fee.program_id } });
                const receipt = await ReceiptService.generateAndUploadReceipt({ payment: updatedOriginal, fee, program, isBalanceSettlement: true });
                if (receipt.driveUrl) {
                  await this.paymentModel.setReceiptUrlById(updatedOriginal.payment_id, receipt.driveUrl);
                }

                if (this.emailService) {
                  const { subject, html } = await buildReceiptEmail({
                    payment: updatedOriginal,
                    fee,
                    program,
                    receiptDriveUrl: receipt.driveUrl,
                    isBalanceSettlement: true,
                  });
                  await this.emailService.sendMail({
                    to: updatedOriginal.student_email,
                    subject,
                    text: 'Your payment was successful. Receipt attached.',
                    html,
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
          } catch (updErr) {
            console.error('Balance aggregation failed:', updErr?.message || updErr);
          }
        }
      } else {
        // Normal payment flow: mark the original record by its own reference
        const normalUpdateRef = verifyData.merchantRef || lookupRef;
        await this.paymentModel.updateStatusByRef(normalUpdateRef, status);

        if (status === 'successful') {
          try {
            // Ensure we have the correct payment record using merchantRef, if available
            if (!payment || payment.transaction_ref !== normalUpdateRef) {
              payment = await this.paymentModel.getByRef(normalUpdateRef);
            }
            if (!payment) {
              return ApiResponse.error(res, 'Payment not found after verification', 404);
            }
            const fee = await this.feeModel.getById(payment.fee_id);
            const program = await this.feeModel.prisma.program.findUnique({ where: { program_id: fee.program_id } });
            const receipt = await ReceiptService.generateAndUploadReceipt({ payment, fee, program, isBalanceSettlement: false });
            if (receipt.driveUrl) {
              await this.paymentModel.setReceiptUrlById(payment.payment_id, receipt.driveUrl);
            }

            if (this.emailService) {
              const { subject, html } = await buildReceiptEmail({
                payment,
                fee,
                program,
                receiptDriveUrl: receipt.driveUrl,
                isBalanceSettlement: false,
              });
              await this.emailService.sendMail({
                to: payment.student_email,
                subject,
                text: 'Your payment was successful. Receipt attached.',
                html,
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
      }

      const finalRef = original_reference ? (verifyData.merchantRef || reference) : (verifyData.merchantRef || lookupRef);
      const finalPayment = await this.paymentModel.getByRef(finalRef).catch(() => null);
      return ApiResponse.ok(res, { reference: finalRef, status, paymentId: finalPayment?.payment_id, verifyData });
    } catch (err) {
      return ApiResponse.error(res, err);
    }
  }
}

module.exports = PaymentsController;
