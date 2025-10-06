const { PrismaClient } = require('@prisma/client');

class BaseModel {
  constructor(prisma) {
    this.prisma = prisma || new PrismaClient();
  }
}

module.exports = BaseModel;