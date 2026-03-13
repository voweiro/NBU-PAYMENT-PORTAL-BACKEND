const { PrismaClient } = require('@prisma/client');
require('dotenv').config();
const prisma = new PrismaClient();

async function main() {
  const payments = await prisma.payment.findMany({
    where: { status: { in: ['SUCCESSFUL', 'SUCCESS', 'PAID'] } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  console.log(`Checking ${payments.length} successful payments...`);

  payments.forEach(p => {
    let items = [];
    try {
      items = p.items ? (typeof p.items === 'string' ? JSON.parse(p.items) : p.items) : [];
    } catch (e) {}

    if (items.length > 1) {
      console.log(`Payment Ref: ${p.reference}`);
      console.log(`Primary Fee ID: ${p.feeId}`);
      console.log(`Items: ${JSON.stringify(items.map(i => ({ feeId: i.feeId, name: i.name })), null, 2)}`);
      console.log('---');
    }
  });

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
