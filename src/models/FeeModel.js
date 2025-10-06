const BaseModel = require('./BaseModel');

class FeeModel extends BaseModel {
  async getById(id) {
    return this.prisma.fee.findUnique({ where: { fee_id: Number(id) } });
  }

  async listAll() {
    return this.prisma.fee.findMany({ orderBy: [{ program_id: 'asc' }, { fee_category: 'asc' }] });
  }

  async getByProgramId(programId) {
    return this.prisma.fee.findMany({
      where: { program_id: Number(programId) },
      orderBy: { fee_category: 'asc' },
    });
  }

  async create(data) {
    return this.prisma.fee.create({ data });
  }

  async update(id, data) {
    return this.prisma.fee.update({ where: { fee_id: id }, data });
  }

  async delete(id) {
    return this.prisma.fee.delete({ where: { fee_id: id } });
  }
}

module.exports = FeeModel;