const BaseModel = require('./BaseModel');

class FeeModel extends BaseModel {
  async getById(id) {
    return this.prisma.fee.findUnique({ where: { id: id } });
  }

  async listAll() {
    return this.prisma.fee.findMany({ 
      orderBy: [{ createdAt: 'desc' }, { name: 'asc' }] 
    });
  }

  async getByProgramId(programIds) {
    // Ensure programIds is an array
    const ids = Array.isArray(programIds) ? programIds : [programIds];
    
    return this.prisma.fee.findMany({
      where: {
        OR: [
          { programId: { in: ids } },
          { programId: null }
        ]
      },
      orderBy: { name: 'asc' },
    });
  }
  
  async getApplicable({ programId, facultyId, departmentId, sessionId, programLevelId }) {
    const clauses = [];
    const sessionFilter = sessionId ? { OR: [{ sessionId }, { sessionId: null }] } : undefined;
    const levelFilter = programLevelId ? { OR: [{ programLevelId }, { programLevelId: null }] } : undefined;
    
    if (programId) {
      let filter = { programId };
      if (sessionFilter) filter = { AND: [filter, sessionFilter] };
      if (levelFilter) filter = { AND: [filter, levelFilter] };
      clauses.push(filter);
    }
    if (facultyId) {
      let filter = { facultyId, departmentId: null, programId: null };
      if (sessionFilter) filter = { AND: [filter, sessionFilter] };
      if (levelFilter) filter = { AND: [filter, levelFilter] };
      clauses.push(filter);
    }
    if (departmentId) {
      let filter = { departmentId, programId: null };
      if (sessionFilter) filter = { AND: [filter, sessionFilter] };
      if (levelFilter) filter = { AND: [filter, levelFilter] };
      clauses.push(filter);
    }
    // Global fees (no program/faculty/department). 
    let globalFilter = { programId: null, facultyId: null, departmentId: null };
    if (sessionFilter) globalFilter = { AND: [globalFilter, sessionFilter] };
    if (levelFilter) globalFilter = { AND: [globalFilter, levelFilter] };
    clauses.push(globalFilter);
    
    return this.prisma.fee.findMany({
      where: { OR: clauses },
      orderBy: [{ createdAt: 'desc' }, { name: 'asc' }]
    });
  }

  async create(data) {
    return this.prisma.fee.create({ data });
  }

  async update(id, data) {
    return this.prisma.fee.update({ where: { id: id }, data });
  }

  async delete(id) {
    return this.prisma.fee.delete({ where: { id: id } });
  }
}

module.exports = FeeModel;
