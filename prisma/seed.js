const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  // Ensure a Program exists
  let program = await prisma.program.findFirst({ where: { program_name: 'Computer Science' } });
  if (!program) {
    program = await prisma.program.create({
      data: { program_name: 'Computer Science', program_type: 'undergraduate' },
    });
  }

  // Ensure Tuition fee exists
  const tuition = await prisma.fee.findFirst({
    where: { program_id: program.program_id, fee_category: 'Tuition' },
  });
  if (!tuition) {
    await prisma.fee.create({
      data: {
        program_id: program.program_id,
        fee_category: 'Tuition',
        amount: 150000,
        session: '2024/2025',
        semester: 'First',
      },
    });
  }

  // Ensure Acceptance fee exists
  const acceptance = await prisma.fee.findFirst({
    where: { program_id: program.program_id, fee_category: 'Acceptance' },
  });
  if (!acceptance) {
    await prisma.fee.create({
      data: {
        program_id: program.program_id,
        fee_category: 'Acceptance',
        amount: 25000,
        session: '2024/2025',
        semester: 'First',
      },
    });
  }

  // Ensure Super Admin and Admin exist
  const superAdminEmail = 'superadmin@portal.local';
  const adminEmail = 'admin@portal.local';
  const superAdminPasswordPlain = 'SuperAdmin#123';
  const adminPasswordPlain = 'Admin#123';

  const existingSuperAdmin = await prisma.admin.findUnique({ where: { email: superAdminEmail } });
  if (!existingSuperAdmin) {
    const hash = await bcrypt.hash(superAdminPasswordPlain, 10);
    await prisma.admin.create({
      data: {
        name: 'Super Admin',
        email: superAdminEmail,
        password: hash,
        role: 'super_admin',
      },
    });
  }

  const existingAdmin = await prisma.admin.findUnique({ where: { email: adminEmail } });
  if (!existingAdmin) {
    const hash = await bcrypt.hash(adminPasswordPlain, 10);
    await prisma.admin.create({
      data: {
        name: 'Admin User',
        email: adminEmail,
        password: hash,
        role: 'admin',
      },
    });
  }

  console.log('Seed completed');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });