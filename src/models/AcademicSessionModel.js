const BaseModel = require('./BaseModel');

class AcademicSessionModel extends BaseModel {
  async listAll() {
    return this.prisma.academicSession.findMany({
      orderBy: { created_at: 'desc' }
    });
  }

  async getById(id) {
    return this.prisma.academicSession.findUnique({
      where: { session_id: Number(id) }
    });
  }

  async create(data) {
    return this.prisma.$transaction(async (tx) => {
      // If this session is set to be current, unset all others
      if (data.is_current) {
        await tx.academicSession.updateMany({
          where: { is_current: true },
          data: { is_current: false }
        });
      }
      return tx.academicSession.create({ data });
    });
  }

  async update(id, data) {
    return this.prisma.$transaction(async (tx) => {
      // If setting this session to current, unset all others
      if (data.is_current) {
        await tx.academicSession.updateMany({
          where: { 
            is_current: true,
            session_id: { not: Number(id) }
          },
          data: { is_current: false }
        });
      }
      return tx.academicSession.update({
        where: { session_id: Number(id) },
        data
      });
    });
  }

  async delete(id) {
    return this.prisma.academicSession.delete({
      where: { session_id: Number(id) }
    });
  }
}

module.exports = AcademicSessionModel;
