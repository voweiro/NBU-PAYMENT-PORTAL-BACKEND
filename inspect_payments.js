const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const successfulPayments = await prisma.payment.findMany({
    where: { status: { in: ['SUCCESSFUL', 'SUCCESS', 'PAID'] } },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      reference: true,
      status: true,
      applicationId: true,
      applicantId: true,
      feeId: true,
      amount: true,
      createdAt: true
    }
  });

  console.log('--- Successful Payments (Latest 10) ---');
  console.log(JSON.stringify(successfulPayments, null, 2));

  const applicationsWithoutId = await prisma.payment.count({
    where: {
      status: { in: ['SUCCESSFUL', 'SUCCESS', 'PAID'] },
      applicationId: null
    }
  });
  console.log(`\nPayments without applicationId: ${applicationsWithoutId}`);

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
