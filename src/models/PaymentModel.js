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

  async createPaymentRecord({ feeId, studentEmail, studentName, amount, reference, status = 'pending', jambNumber, matricNumber, level, phoneNumber, address }) {
    return this.model.create({
      data: {
        fee_id: Number(feeId),
        amount_paid: amount,
        transaction_ref: reference,
        status,
        student_email: studentEmail,
        student_name: studentName,
        jamb_number: jambNumber,
        matric_number: matricNumber,
        level,
        phone_number: phoneNumber,
        address,
      },
    });
  }

  async updateStatusByRef(reference, status) {
    return this.model.update({ where: { transaction_ref: reference }, data: { status } });
  }

  async setReceiptUrlById(id, url) {
    return this.model.update({ where: { payment_id: Number(id) }, data: { receipt_drive_url: url } });
  }
}

module.exports = PaymentModel;