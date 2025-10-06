const BaseModel = require('./BaseModel');

class AdminModel extends BaseModel {
  async findByEmail(email) {
    return this.prisma.admin.findUnique({ where: { email } });
  }

  async create(data) {
    return this.prisma.admin.create({ data });
  }

  async list() {
    return this.prisma.admin.findMany({ orderBy: { created_at: 'desc' } });
  }

  async update(id, data) {
    return this.prisma.admin.update({ where: { admin_id: Number(id) }, data });
  }

  async delete(id) {
    return this.prisma.admin.delete({ where: { admin_id: id } });
  }
}

module.exports = AdminModel;