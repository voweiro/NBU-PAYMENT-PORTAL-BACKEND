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

  async getMyPayments(req, res) {
    try {
      if (!req.user || !req.user.id) {
        return ApiResponse.error(res, 'Unauthorized', 401);
      }
      const userId = req.user.id;

      // Fetch by userId (primary link to Auth Service)
      const payments = await this.paymentModel.getByUserId(userId);
      
      // Also fetch by applicantId (if different but linked)
      const applicantPayments = await this.paymentModel.getByApplicantId(userId);
      
      // Merge and deduplicate
      const paymentMap = new Map();
      payments.forEach(p => paymentMap.set(p.id, p));
      applicantPayments.forEach(p => paymentMap.set(p.id, p));
      
      const uniquePayments = Array.from(paymentMap.values()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      return ApiResponse.ok(res, uniquePayments);
    } catch (err) {
      return ApiResponse.error(res, err);
    }
  }

  async getByRef(req, res) {
    try {
      const { reference } = req.params;
      const payment = await this.paymentModel.getByRef(reference);
      if (!payment) return ApiResponse.error(res, 'Payment not found', 404);
      // Return a concise summary useful for student lookup
      return ApiResponse.ok(res, {
        id: payment.id,
        reference: payment.reference,
        status: payment.status,
        amount: payment.amount,
        balanceDue: payment.balanceDue,
        percentagePaid: payment.percentagePaid,
        items: payment.items,
        proofUrl: payment.proofUrl ?? null,
        studentEmail: payment.studentEmail,
        studentName: payment.studentName ?? null,
        feeId: payment.feeId,
        phoneNumber: payment.phoneNumber,
        address: payment.address,
        jambNumber: payment.jambNumber,
        matricNumber: payment.matricNumber,
        applicantId: payment.applicantId,
        applicationId: payment.applicationId,
        level: payment.level,
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

  async getByApplicationId(req, res) {
    try {
      const { applicationId } = req.params;
      const payments = await this.paymentModel.getByApplicationId(applicationId);
      return ApiResponse.ok(res, payments);
    } catch (err) {
      return ApiResponse.error(res, err);
    }
  }

  async getByApplicantId(req, res) {
    try {
      const { applicantId } = req.params;
      const payments = await this.paymentModel.getByApplicantId(applicantId);
      return ApiResponse.ok(res, payments);
    } catch (err) {
      return ApiResponse.error(res, err);
    }
  }

  async getBulkStatus(req, res) {
    try {
      const { applicationIds } = req.query; // Comma separated IDs
      if (!applicationIds) return ApiResponse.ok(res, []);
      
      const ids = applicationIds.split(',');
      const payments = await this.paymentModel.getByApplicationIds(ids);
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
        const fee = await this.feeModel.getById(payment.feeId);
        totalAmount = Number(fee?.amount || 0);
      }

      const amountPaid = Number(payment.amount || 0);
      const balanceDue = typeof payment.balanceDue === 'string' || typeof payment.balanceDue === 'number'
        ? Number(payment.balanceDue)
        : Math.max(0, totalAmount - amountPaid);
      const pct = typeof payment.percentagePaid === 'string' || typeof payment.percentagePaid === 'number'
        ? Number(payment.percentagePaid)
        : (totalAmount > 0 ? Math.min(100, Math.max(0, (amountPaid / totalAmount) * 100)) : 0);

      return ApiResponse.ok(res, {
        id: payment.id,
        reference: payment.reference,
        status: payment.status,
        totalAmount: totalAmount,
        amount: amountPaid,
        balanceDue: Number(balanceDue.toFixed(2)),
        percentagePaid: Number(pct.toFixed(2)),
        studentEmail: payment.studentEmail,
        studentName: payment.studentName ?? null,
        phoneNumber: payment.phoneNumber ?? null,
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
        const fee = await this.feeModel.getById(payment.feeId);
        feeRecord = fee;
        totalAmount = Number(fee?.amount || 0);
      }
      const amountPaid = Number(payment.amount || 0);
      const remaining = Math.max(0, totalAmount - amountPaid);
      if (remaining <= 0) return ApiResponse.error(res, 'Payment already fully paid', 400);

      const FRONTEND_URL = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';
      // Include original_reference so callback/verify can locate the existing record without mutating its reference
      const redirectUrl = `${FRONTEND_URL}/payment/callback?original_reference=${encodeURIComponent(payment.reference)}`;

      // Use provided phone/address overrides or fallback to existing payment record
      const effectivePhone = phoneNumber || payment.phoneNumber || '';
      const effectiveAddress = address || payment.address || '';
      if (gateway === 'global' && (!/^\d{10,15}$/.test(effectivePhone))) {
        return ApiResponse.error(res, 'Phone number must be 10 to 15 digits for GlobalPay balance payments', 400);
      }

      // Check for existing pending balance transaction for this original reference
      const existingBalancePending = await this.paymentModel.model.findFirst({
        where: {
          originalReference: payment.reference,
          status: 'PENDING',
          amount: Math.round(remaining), // Ensure amount matches remaining balance (schema uses amount, not amount_paid for Payment)
        }
      });

      if (existingBalancePending) {
         // Reuse existing balance transaction
         const initData = await PaymentGateway.initiatePayment({
            gateway,
            amount: Math.round(remaining),
            email: payment.studentEmail,
            metadata: {
              studentName: payment.studentName,
              balancePayment: true,
              balanceAmount: remaining,
              phoneNumber: effectivePhone,
              address: effectiveAddress,
              feeNames: Array.isArray(payment.items) && payment.items.length > 0 ? payment.items.map((i) => i.name) : undefined,
            },
            redirectUrl,
            reference: existingBalancePending.reference // REUSE REFERENCE
         });

         // Update details if needed
         await this.paymentModel.model.update({
            where: { id: existingBalancePending.id },
            data: {
                phoneNumber: effectivePhone,
                address: effectiveAddress
            }
         });

         return ApiResponse.ok(res, { reference: payment.reference, gateway_reference: existingBalancePending.reference, paymentId: payment.id, balancePaymentId: existingBalancePending.id, ...initData });
      }

      const initData = await PaymentGateway.initiatePayment({
        gateway,
        amount: Math.round(remaining),
        email: payment.studentEmail,
        metadata: {
          studentName: payment.studentName,
          balancePayment: true,
          balanceAmount: remaining,
          phoneNumber: effectivePhone,
          address: effectiveAddress,
          feeNames: Array.isArray(payment.items) && payment.items.length > 0 ? payment.items.map((i) => i.name) : undefined,
        },
        redirectUrl,
      });

      // Create a distinct pending payment record for the balance using the gateway reference
      const newRef = initData.reference;
      const itemsArray = (Array.isArray(payment.items) && payment.items.length > 0)
        ? payment.items.map((it) => ({ feeId: it.feeId ?? payment.feeId, name: it.name, amount: Number(it.amount || 0) }))
        : (feeRecord ? [{ feeId: feeRecord.id, name: feeRecord.name, amount: Number(feeRecord.amount || 0) }] : undefined);

      const createdBalance = await this.paymentModel.createPaymentRecord({
        feeId: payment.feeId,
        items: itemsArray,
        userId: payment.userId,
        payerType: payment.payerType,
        studentEmail: payment.studentEmail,
        studentName: payment.studentName,
        amount: Math.round(remaining),
        reference: newRef,
        status: 'PENDING',
        jambNumber: payment.jambNumber,
        matricNumber: payment.matricNumber,
        applicantId: payment.applicantId,
        applicationId: payment.applicationId,
        programId: payment.programId,
        level: payment.level,
        phoneNumber: effectivePhone,
        address: effectiveAddress,
        originalReference: payment.reference,
        channel: gateway?.toUpperCase(),
      });

      // Do not overwrite the original transaction_ref; return both for client awareness
      return ApiResponse.ok(res, { reference: payment.reference, gateway_reference: newRef, paymentId: payment.id, balancePaymentId: createdBalance.id, ...initData });
    } catch (err) {
      return ApiResponse.error(res, err);
    }
  }

  async processBalance(req, res) {
    try {
      const { reference, amount } = (req.validated && req.validated.body) || req.body;
      const updated = await this.paymentModel.updateBalanceByRef(reference, amount);

      // If fully paid now, generate receipt
      if (updated.status === 'SUCCESSFUL') {
        try {
          const fee = await this.feeModel.getById(updated.feeId);
          // Assuming fee.programId is stored in Fee model, but FeeModel returns Prisma object which has camelCase 'programId'
          const program = await this.feeModel.prisma.program.findUnique({ where: { programId: fee.programId } });
          let session = null;
          if (updated.sessionId) {
            session = await this.feeModel.prisma.academicSession.findUnique({ where: { sessionId: updated.sessionId } });
          }
          const receipt = await ReceiptService.generateAndUploadReceipt({ payment: updated, fee, program, session, isBalanceSettlement: true });
          if (receipt.driveUrl) {
            await this.paymentModel.setReceiptUrlById(updated.id, receipt.driveUrl);
          }
        } catch (genErr) {
          console.error('Receipt generation on balance completion failed:', genErr?.message || genErr);
        }
      }

      return ApiResponse.ok(res, {
        id: updated.id,
        reference: updated.reference,
        status: updated.status,
        totalAmount: (Array.isArray(updated.items) && updated.items.length > 0)
          ? updated.items.reduce((sum, it) => sum + Number(it.amount || 0), 0)
          : undefined,
        amount: Number(updated.amount),
        balanceDue: Number(updated.balanceDue || 0),
        percentagePaid: Number(updated.percentagePaid || 0),
      });
    } catch (err) {
      return ApiResponse.error(res, err);
    }
  }

  async initiate(req, res) {
    try {
      const { feeId, feeIds, userId: bodyUserId, studentEmail, studentName, gateway = 'global', jambNumber, matricNumber, applicantId, applicationId, percent, level, phoneNumber, address, sessionId, programType: bodyProgramType, programId: bodyProgramId } = req.validated.body || req.body;
      const userId = bodyUserId || applicantId || req.user?.id;
      if (!userId) return ApiResponse.error(res, 'userId or applicantId is required', 400);
      // Support single or multiple fees
      const ids = Array.isArray(feeIds) && feeIds.length > 0 ? feeIds : (feeId ? [feeId] : []);
      const fees = await this.feeModel.prisma.fee.findMany({ where: { id: { in: ids } } });
      
      // Since ids are UUIDs (strings), and feeIds coming from body might be strings, this is fine.
      // Note: Fee model `id` is String @id @default(uuid()).
      
      if (!fees || fees.length === 0) return ApiResponse.error(res, 'Fee(s) not available', 400);
      if (fees.length !== ids.length) return ApiResponse.error(res, 'Some selected fees were not found', 400);

      // We need program info. Since fees can be from same program, let's fetch program from first fee.
      // Ideally fees should be from same program if paying together, or at least we check.
      const firstFee = fees[0];
      const programClient = this.feeModel.prisma.program;
      const resolvedProgramId = bodyProgramId || firstFee.programId;
      const program = programClient && resolvedProgramId
        ? await programClient.findUnique({ where: { programId: resolvedProgramId } })
        : null;
      const normalizeProgramType = (value) => value ? String(value).toUpperCase() : undefined;
      const resolvedProgramType = normalizeProgramType(bodyProgramType || program?.programType || program?.programLevel);
      
      // Validation Logic
      const isUndergraduate = normalizeProgramType(program?.programType || program?.programLevel) === 'UNDERGRADUATE';
      if (isUndergraduate) {
        // Allow applicantId to satisfy identity requirement for new applicants
        if (!jambNumber && !matricNumber && !applicantId) {
           return ApiResponse.error(res, 'JAMB number, Matric number, or Applicant ID is required for undergraduate payments', 400);
        }
        const validLevels = ['L100', 'L200', 'L300', 'L400', 'L500', 'L600', 'ALL'];
        const anyLevels = fees.some((f) => Array.isArray(f.levels) && f.levels.length > 0);
        if (anyLevels) {
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
      }

      const feeProgramMismatch = resolvedProgramType
        ? fees.find((fee) => {
            const feeType = normalizeProgramType(fee.programType);
            return feeType && feeType !== resolvedProgramType;
          })
        : null;
      if (feeProgramMismatch) {
        return ApiResponse.error(res, 'Selected fee is not applicable to your program type', 400);
      }

      const payerType = matricNumber ? 'STUDENT' : 'APPLICANT';
      const resolvedApplicantId = applicantId || (payerType === 'APPLICANT' ? userId : undefined);
      const resolvedApplicationId = applicationId || undefined;
      const resolvedJambNumber = jambNumber || undefined;
      const resolvedMatricNumber = matricNumber || undefined;

      // Support partial payment: 25%, 50%, 75% or 100% for single or multiple fees
      const allowedPercents = [25, 50, 75, 100];
      const pct = allowedPercents.includes(Number(percent)) ? Number(percent) : 100;
      const totalAmount = fees.reduce((sum, f) => sum + Number(f.amount || 0), 0);
      const amountToCharge = Math.round(totalAmount * (pct / 100));

      const FRONTEND_URL = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';
      // GlobalPay expects redirect to your verification/callback page; keep base clean
      const redirectUrl = `${FRONTEND_URL}/payment/callback`;

      // Validate gateway secrets early to avoid opaque 500s
      // Paystack/Flutterwave disabled: no secret validation

      // For GlobalPay, enforce docs: phone must be 11 digits; address ≥ 6 chars
      if (gateway === 'global') {
        if (!phoneNumber) {
          return ApiResponse.error(res, 'Phone number is required for GlobalPay', 400);
        }
        const numOk = /^\d{10,15}$/.test(String(phoneNumber));
        if (!numOk) {
          return ApiResponse.error(res, 'Phone number must be 10 to 15 digits for GlobalPay', 400);
        }
        if (address && String(address).trim().length < 6) {
          return ApiResponse.error(res, 'Address must be at least 6 characters for GlobalPay', 400);
        }
      }

      // Check for existing pending transaction to prevent duplicates
      const existingPending = await this.paymentModel.model.findFirst({
        where: {
          studentEmail: studentEmail,
          status: 'PENDING',
          feeId: fees[0].id,
          amount: amountToCharge, // Ensure amount matches
          ...(sessionId ? { sessionId: sessionId } : {})
        }
      });

      if (existingPending) {
        // Reuse the existing record and its transaction reference
        const initData = await PaymentGateway.initiatePayment({
          gateway,
          amount: amountToCharge,
          email: studentEmail,
          metadata: { studentName, percent: pct, phoneNumber, address, feeNames: fees.map((f) => f.name) },
          redirectUrl,
          reference: existingPending.reference // Pass the existing reference explicitly
        });

        // Update the existing record with any new details provided by the user
        await this.paymentModel.model.update({
          where: { id: existingPending.id },
          data: {
            userId: userId,
            payerType: payerType,
            studentName: studentName,
            jambNumber: resolvedJambNumber,
            matricNumber: resolvedMatricNumber,
            applicantId: resolvedApplicantId,
            applicationId: resolvedApplicationId,
            programId: firstFee.programId || undefined,
            level: level,
            phoneNumber: phoneNumber,
            address: address,
            channel: gateway?.toUpperCase()
          }
        });

        return ApiResponse.ok(res, { reference: existingPending.reference, paymentId: existingPending.id, ...initData }, 200);
      }

      const initData = await PaymentGateway.initiatePayment({
        gateway,
        amount: amountToCharge,
        email: studentEmail,
        metadata: { studentName, percent: pct, phoneNumber, address, feeNames: fees.map((f) => f.name) },
        redirectUrl,
      });

      const ref = initData.reference;

      const created = await this.paymentModel.createPaymentRecord({
        feeId: fees[0].id,
        feeIds: ids,
        items: fees.map((f) => ({ feeId: f.id, name: f.name, amount: Number(f.amount || 0) })),
        userId,
        payerType,
        studentEmail,
        studentName,
        amount: amountToCharge,
        reference: ref,
        status: 'PENDING',
        jambNumber: resolvedJambNumber,
        matricNumber: resolvedMatricNumber,
        applicantId: resolvedApplicantId,
        applicationId: resolvedApplicationId,
        programId: resolvedProgramId || undefined,
        level,
        phoneNumber,
        address,
        sessionId,
        channel: gateway?.toUpperCase()
      });

      return ApiResponse.ok(res, { reference: ref, paymentId: created.id, ...initData }, 201);
    } catch (err) {
      return ApiResponse.error(res, err);
    }
  }

  async manualEntry(req, res) {
    try {
      const { feeId, feeIds, items, studentEmail, studentName, amount, jambNumber, matricNumber, applicantId, applicationId, level, phoneNumber, address, isBalancePayment, originalReference, sessionId } = (req.validated && req.validated.body) || req.body;
      const adminId = req.user?.id || req.user?.admin_id;
      if (!adminId) return ApiResponse.error(res, 'Unauthorized: Admin ID missing', 401);

      // Resolve items/fees
      let resolvedItems = items;
      let primaryFeeId = feeId;

      if (!resolvedItems || resolvedItems.length === 0) {
        const ids = Array.isArray(feeIds) && feeIds.length > 0 ? feeIds : (feeId ? [feeId] : []);
        if (ids.length > 0) {
           const fees = await this.feeModel.prisma.fee.findMany({ where: { id: { in: ids } } });
           resolvedItems = fees.map(f => ({ feeId: f.id, name: f.name, amount: Number(f.amount || 0) }));
           if (!primaryFeeId && ids.length > 0) primaryFeeId = ids[0];
        }
      }
      
      const reference = `NBUPORTAL_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

      const userId = applicantId || applicationId || matricNumber || jambNumber;
      if (!userId) return ApiResponse.error(res, 'applicantId or matricNumber is required for manual payments', 400);
      const payerType = matricNumber ? 'STUDENT' : 'APPLICANT';

      const payment = await this.paymentModel.createPaymentRecord({
        feeId: primaryFeeId,
        items: resolvedItems,
        userId,
        payerType,
        studentEmail: studentEmail,
        studentName: studentName,
        amount: amount,
        reference,
        status: 'SUCCESSFUL',
        jambNumber: jambNumber,
        matricNumber: matricNumber,
        applicantId: applicantId,
        applicationId: applicationId,
        level,
        phoneNumber: phoneNumber,
        address,
        isManual: true,
        recordedBy: adminId,
        isBalancePayment: !!isBalancePayment,
        originalReference: originalReference,
        sessionId,
        channel: 'MANUAL'
      });

      // If this is a balance payment, update the original record
      if (isBalancePayment && originalReference) {
          try {
              // We don't check for "payment not found" here because createPaymentRecord didn't fail
              // But updateBalanceByRef will throw if not found.
              const updatedOriginal = await this.paymentModel.updateBalanceByRef(originalReference, amount);
              
              // If now fully paid, generate receipt for the original payment too?
              // Logic similar to processBalance could go here, but let's stick to the core requirement first.
          } catch (balanceErr) {
              console.error("Failed to update original payment balance:", balanceErr);
              // We log but do not fail the request because the manual payment itself was recorded successfully.
          }
      }

      // Audit Log
      await this.paymentModel.prisma.auditLog.create({
        data: {
          admin_id: adminId, // AuditLog might still use snake_case? Assuming standard AuditLog schema.
          action: 'MANUAL_PAYMENT',
          details: {
            paymentId: payment.id,
            reference: reference,
            amount: amount,
            studentEmail,
            isBalancePayment: !!isBalancePayment
          },
          ip_address: req.ip || req.socket.remoteAddress
        }
      });

      // Generate Receipt and Send Email
      try {
        let fee = null;
        let program = null;
        if (primaryFeeId) {
           fee = await this.feeModel.getById(primaryFeeId);
           if (fee) {
             program = await this.feeModel.prisma.program.findUnique({ where: { programId: fee.programId } });
           }
        }
        
        let session = null;
        if (sessionId && this.feeModel.prisma.academicSession) {
            session = await this.feeModel.prisma.academicSession.findUnique({ where: { sessionId: sessionId } });
        }

        const receipt = await ReceiptService.generateAndUploadReceipt({ payment, fee, program, session });
        if (receipt.driveUrl) {
          await this.paymentModel.setReceiptUrlById(payment.id, receipt.driveUrl);
        }
        
        if (studentEmail) {
            const emailContent = await buildReceiptEmail({
                payment,
                fee,
                program,
                receiptDriveUrl: receipt.driveUrl,
                isBalanceSettlement: !!isBalancePayment
            });
            await this.emailService.sendMail({
                to: studentEmail,
                subject: emailContent.subject,
                html: emailContent.html,
                attachments: receipt.buffer ? [{ filename: receipt.filename, content: receipt.buffer }] : undefined
            });
        }

      } catch (receiptErr) {
        console.error('Receipt generation failed:', receiptErr);
      }

      return ApiResponse.ok(res, payment, 201);
    } catch (err) {
      return ApiResponse.error(res, err);
    }
  }

  async verify(req, res) {
      // Logic for verifying payment from gateway callback
      // GlobalPay verification involves checking query params or calling an endpoint if needed
      // For now, let's assume standard verification flow using Gateway Service
      try {
          const { reference } = req.params;
          const payment = await this.paymentModel.getByRef(reference);
          if (!payment) return ApiResponse.error(res, 'Payment not found', 404);

          // If already successful, just return
          if (payment.status === 'SUCCESSFUL') {
              return ApiResponse.ok(res, payment);
          }

          // Verify with Gateway
          // Note: GlobalPay usually sends a POST to notification URL, but we might also verify on callback
          // We need to know which gateway was used. stored in channel? or infer?
          // Payment model has `channel` but we didn't set it explicitly in initiate (default null).
          // However, we know we default to 'global'.
          
          // If we have a gateway in payment record (future improvement), use it.
          // For now, try GlobalPay verification if pending.
          
          // For GlobalPay, the verifyPayment method in service expects (reference, amount, etc.)
          // Actually, `paymentGateway.js` `verifyPayment` implementation for GlobalPay:
          // It checks `merchantTransactionReference`.
          
          const verifyData = await PaymentGateway.verifyPayment({
              gateway: 'global', // forcing global for now as it's the active one
              reference,
              amount: Number(payment.amount)
          });

          const targetRef = verifyData.merchantRef || reference;
          const statusRaw = String(verifyData.paymentStatus || '').trim().toLowerCase();
          const codeRaw = String(verifyData.responseCode || '').trim();
          const okCodes = new Set(['00', '0', '200']);
          const successStates = new Set(['success', 'successful', 'approved', 'completed', 'paid']);
          const isGatewaySuccess = !!verifyData.verified || successStates.has(statusRaw) || okCodes.has(codeRaw) || verifyData.isSuccessful === true;
          if (isGatewaySuccess) {
              // Update status
              const updated = await this.paymentModel.updateStatusByRef(targetRef, 'SUCCESSFUL');
              
              // Generate Receipt
               try {
                const fee = await this.feeModel.getById(updated.feeId);
                let program = null;
                if (this.feeModel.prisma.program) {
                  if (updated.programId) {
                    program = await this.feeModel.prisma.program.findUnique({ where: { programId: updated.programId } });
                  }
                  if (!program && fee?.programId) {
                    program = await this.feeModel.prisma.program.findUnique({ where: { programId: fee.programId } });
                  }
                }
                let session = null;
                if (this.feeModel.prisma.academicSession) {
                  if (updated.sessionId) {
                    session = await this.feeModel.prisma.academicSession.findUnique({ where: { sessionId: updated.sessionId } });
                  }
                  if (!session && fee?.sessionId) {
                    session = await this.feeModel.prisma.academicSession.findUnique({ where: { sessionId: fee.sessionId } });
                  }
                }
                const receipt = await ReceiptService.generateAndUploadReceipt({ payment: updated, fee, program, session });
                if (receipt.driveUrl) {
                    await this.paymentModel.setReceiptUrlById(updated.id, receipt.driveUrl);
                }
                
                if (updated.studentEmail) {
                    const emailContent = await buildReceiptEmail({
                        payment: updated,
                        fee,
                        program,
                        receiptDriveUrl: receipt.driveUrl,
                        isBalanceSettlement: false
                    });
                    await this.emailService.sendMail({
                        to: updated.studentEmail,
                        subject: emailContent.subject,
                        html: emailContent.html,
                        attachments: receipt.buffer ? [{ filename: receipt.filename, content: receipt.buffer }] : undefined
                    });
                }
              } catch (receiptErr) {
                console.error('Receipt generation failed:', receiptErr);
              }
              
              return ApiResponse.ok(res, updated);
          }

          const failedStatusRaw = String(verifyData.paymentStatus || '').trim().toLowerCase();
          const failedStates = ['failed', 'declined', 'reversed', 'cancelled', 'canceled'];
          if (failedStates.includes(failedStatusRaw)) {
            const updated = await this.paymentModel.updateStatusByRef(targetRef, 'FAILED');
            try {
              if (updated?.proofUrl) {
                await this.paymentModel.setReceiptUrlById(updated.id, null);
                console.warn(`Audit: Cleared receipt for FAILED payment ${updated.reference}`);
              }
            } catch (clearErr) {
              console.error(`Audit: Failed to clear receipt for FAILED payment ${targetRef}:`, clearErr?.message || clearErr);
            }
            return ApiResponse.ok(res, updated);
          }

          const refreshed = targetRef !== reference
            ? await this.paymentModel.getByRef(targetRef)
            : payment;
          return ApiResponse.ok(res, refreshed);

      } catch (err) {
          return ApiResponse.error(res, err);
      }
  }

  async syncMatric(req, res) {
    try {
      const { applicationId, matricNumber } = req.body;
      if (!applicationId || !matricNumber) {
        return ApiResponse.error(res, 'applicationId and matricNumber are required', 400);
      }
      
      const result = await this.paymentModel.updateMatricByApplicationId(applicationId, matricNumber);
      return ApiResponse.ok(res, { message: 'Matric number synced to payments', count: result.count });
    } catch (err) {
      return ApiResponse.error(res, err);
    }
  }
}

module.exports = PaymentsController;
