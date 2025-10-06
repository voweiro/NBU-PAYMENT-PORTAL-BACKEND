const BaseModel = require('./BaseModel');

class ProgramModel extends BaseModel {
  async getAll() {
    return this.prisma.program.findMany({ orderBy: { program_name: 'asc' } });
  }

  async create(data) {
    return this.prisma.program.create({ data });
  }

  async update(id, data) {
    return this.prisma.program.update({ where: { program_id: id }, data });
  }

  async delete(id) {
    return this.prisma.program.delete({ where: { program_id: id } });
  }
}

module.exports = ProgramModel;