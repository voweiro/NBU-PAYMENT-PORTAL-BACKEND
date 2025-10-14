const BaseModel = require('./BaseModel');

class PaymentModel extends BaseModel {
  constructor(prisma) {
    super(prisma || null);
    this.model = this.prisma.payment;
  }

  async getById(id) {
    return this.model.findUnique({ where: { payment_id: Number(id) } });
  }

  async getByRef(reference) {
    return this.model.findUnique({ where: { transaction_ref: reference } });
  }

  async listAll() {
    return this.model.findMany({
      orderBy: { payment_date: 'desc' },
      include: {
        fee: {
          select: {
            fee_category: true,
            amount: true,
            program: { select: { program_name: true, program_type: true } },
          },
        },
      },
    });
  }

  async createPaymentRecord({ feeId, feeIds, items, studentEmail, studentName, amount, reference, status = 'pending', jambNumber, matricNumber, level, phoneNumber, address, originalReference }) {
    // Calculate percentage_paid and balance_due
    let totalAmount = 0;
    let percentagePaid = 0;
    let balanceDue = 0;

    if (Array.isArray(items) && items.length > 0) {
      // Multi-fee payment: calculate from items
      totalAmount = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    } else if (feeId) {
      // Single fee payment: get fee amount
      const fee = await this.prisma.fee.findUnique({ where: { fee_id: Number(feeId) } });
      totalAmount = Number(fee?.amount || 0);
    }

    if (totalAmount > 0) {
      const amountPaid = Number(amount || 0);
      percentagePaid = Math.min(100, Math.max(0, (amountPaid / totalAmount) * 100));
      balanceDue = Math.max(0, totalAmount - amountPaid);
    }

    return this.model.create({
      data: {
        fee_id: Number(feeId ?? (Array.isArray(feeIds) ? Number(feeIds[0]) : undefined)),
        amount_paid: amount,
        percentage_paid: Number(percentagePaid.toFixed(2)),
        balance_due: balanceDue,
        transaction_ref: reference,
        status,
        student_email: studentEmail,
        student_name: studentName,
        jamb_number: jambNumber,
        matric_number: matricNumber,
        level,
        phone_number: phoneNumber,
        address,
        items,
        original_reference: originalReference,
      },
    });
  }

  async updateStatusByRef(reference, status) {
    return this.model.update({ where: { transaction_ref: reference }, data: { status } });
  }

  async setReceiptUrlById(id, url) {
    return this.model.update({ where: { payment_id: Number(id) }, data: { receipt_drive_url: url } });
  }

  async setReferenceById(id, newReference) {
    return this.model.update({ where: { payment_id: Number(id) }, data: { transaction_ref: newReference } });
  }

  async updateBalanceByRef(reference, amountToAdd) {
    const payment = await this.getByRef(reference);
    if (!payment) throw new Error('Payment not found');

    // Determine total amount from items sum or single fee amount
    let totalAmount = 0;
    if (Array.isArray(payment.items) && payment.items.length > 0) {
      totalAmount = payment.items.reduce((sum, it) => sum + Number(it.amount || 0), 0);
    } else {
      const fee = await this.prisma.fee.findUnique({ where: { fee_id: payment.fee_id } });
      totalAmount = Number(fee?.amount || 0);
    }

    const currentPaid = Number(payment.amount_paid || 0);
    const add = Number(amountToAdd || 0);
    if (add <= 0) throw new Error('Amount to add must be positive');
    if (add > Math.max(0, totalAmount - currentPaid)) throw new Error('Amount exceeds remaining balance');

    const newPaid = currentPaid + add;
    const newBalance = Math.max(0, totalAmount - newPaid);
    const pct = totalAmount > 0 ? Math.min(100, Math.max(0, (newPaid / totalAmount) * 100)) : 0;

    const status = newBalance <= 0 ? 'successful' : 'pending';

    return this.model.update({
      where: { transaction_ref: reference },
      data: {
        amount_paid: newPaid,
        balance_due: newBalance,
        percentage_paid: Number(pct.toFixed(2)),
        status,
      },
    });
  }
}

module.exports = PaymentModel;