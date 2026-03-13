const BaseModel = require('./BaseModel');

class PaymentModel extends BaseModel {
  constructor(prisma) {
    super(prisma || null);
    this.model = this.prisma.payment;
  }

  async getById(id) {
    return this.model.findUnique({ where: { id } });
  }

  async getByRef(reference) {
    return this.model.findUnique({ where: { reference } });
  }

  async getByApplicantId(applicantId) {
    return this.model.findMany({
      where: { applicantId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        reference: true,
        amount: true,
        status: true,
        feeId: true,
        userId: true,
        applicantId: true,
        applicationId: true,
        sessionId: true,
        level: true,
        semester: true,
        channel: true,
        proofUrl: true,
        createdAt: true,
        updatedAt: true,
        fee: {
          select: {
            name: true,
            amount: true,
            programId: true,
            description: true
          }
        }
      }
    });
  }

  async getByUserId(userId) {
    return this.model.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        reference: true,
        amount: true,
        status: true,
        feeId: true,
        userId: true,
        applicantId: true,
        applicationId: true,
        sessionId: true,
        level: true,
        semester: true,
        channel: true,
        proofUrl: true,
        createdAt: true,
        updatedAt: true,
        fee: {
          select: {
            name: true,
            amount: true,
            programId: true,
            description: true
          }
        }
      }
    });
  }

  async getByApplicationId(applicationId) {
    return this.model.findMany({
      where: { applicationId },
      orderBy: { createdAt: 'desc' },
      include: {
        fee: {
          select: {
            name: true,
            amount: true,
            programId: true,
            description: true
          },
        },
      },
    });
  }

  async getByApplicationIds(applicationIds) {
    return this.model.findMany({
      where: { applicationId: { in: applicationIds } },
      select: {
        applicationId: true,
        status: true,
        fee: { select: { name: true, description: true } },
        amount: true
      }
    });
  }

  async listAll() {
    return this.model.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        fee: {
          select: {
            name: true,
            amount: true,
            programId: true,
          },
        },
      },
    });
  }

  async createPaymentRecord({ feeId, feeIds, items, userId, payerType, studentEmail, studentName, amount, reference, status = 'PENDING', jambNumber, matricNumber, applicantId, applicationId, level, phoneNumber, address, originalReference, isManual = false, recordedBy = null, isBalancePayment = false, sessionId = null, bankTransferRef = null, programId = null, programLevelId = null, semester = null, channel = null }) {
    // Calculate percentagePaid and balanceDue
    let totalAmount = 0;
    let percentagePaid = 0;
    let balanceDue = 0;

    const primaryFeeId = feeId || (Array.isArray(feeIds) && feeIds.length > 0 ? feeIds[0] : null);

    if (Array.isArray(items) && items.length > 0) {
      // Multi-fee payment: calculate from items
      totalAmount = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    } else if (primaryFeeId) {
      // Single fee payment: get fee amount
      const fee = await this.prisma.fee.findUnique({ where: { id: primaryFeeId } });
      totalAmount = Number(fee?.amount || 0);
    }

    if (totalAmount > 0) {
      const amountPaid = Number(amount || 0);
      percentagePaid = Math.min(100, Math.max(0, (amountPaid / totalAmount) * 100));
      
      if (isBalancePayment || originalReference) {
        // Balance payment records are just transactions; they don't carry a balance of their own.
        // The original record tracks the actual student debt.
        balanceDue = 0;
      } else {
        balanceDue = Math.max(0, totalAmount - amountPaid);
      }
    }

    return this.model.create({
      data: {
        feeId: primaryFeeId,
        amount: amount,
        percentagePaid: Number(percentagePaid.toFixed(2)),
        balanceDue: balanceDue,
        reference: reference,
        status: status.toUpperCase(),
        userId,
        payerType,
        studentEmail,
        studentName,
        jambNumber,
        matricNumber,
        applicantId,
        applicationId,
        programId,
        programLevelId,
        semester,
        level,
        phoneNumber,
        address,
        channel,
        items: items || undefined,
        originalReference,
        sessionId: sessionId ? String(sessionId) : null,
        
        // Metadata for fields not in schema
        metadata: {
          isManual,
          recordedBy,
          isBalancePayment,
          bankTransferRef
        },
      },
    });
  }

  async updateStatusByRef(reference, status) {
    return this.model.update({ where: { reference }, data: { status: status.toUpperCase() } });
  }

  async setReceiptUrlById(id, url) {
    return this.model.update({ where: { id }, data: { proofUrl: url } });
  }

  async setReferenceById(id, newReference) {
    return this.model.update({ where: { id }, data: { reference: newReference } });
  }

  async updateBalanceByRef(reference, amountToAdd) {
    const payment = await this.getByRef(reference);
    if (!payment) throw new Error('Payment not found');

    // Determine total amount from items sum or single fee amount
    let totalAmount = 0;
    if (Array.isArray(payment.items) && payment.items.length > 0) {
      totalAmount = payment.items.reduce((sum, it) => sum + Number(it.amount || 0), 0);
    } else {
      const fee = await this.prisma.fee.findUnique({ where: { id: payment.feeId } });
      totalAmount = Number(fee?.amount || 0);
    }

    const currentPaid = Number(payment.amount || 0);
    const add = Number(amountToAdd || 0);
    if (add <= 0) throw new Error('Amount to add must be positive');

    const newPaid = currentPaid + add;
    const newBalance = Math.max(0, totalAmount - newPaid);
    const pct = totalAmount > 0 ? Math.min(100, Math.max(0, (newPaid / totalAmount) * 100)) : 0;

    const status = newBalance <= 0 ? 'SUCCESSFUL' : 'PENDING'; // Enum values

    return this.model.update({
      where: { reference },
      data: {
        amount: newPaid,
        balanceDue: newBalance,
        percentagePaid: Number(pct.toFixed(2)),
        status: status, // status is Enum
      },
    });
  }

  async updateMatricByApplicationId(applicationId, matricNumber) {
    return this.model.updateMany({
      where: { applicationId },
      data: {
        matricNumber,
        payerType: 'STUDENT'
      }
    });
  }

  async updateExpiredPendingPayments() {
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    return this.model.updateMany({
      where: {
        status: 'PENDING',
        createdAt: {
          lt: twoDaysAgo,
        },
      },
      data: {
        status: 'FAILED',
      },
    });
  }
}

module.exports = PaymentModel;
