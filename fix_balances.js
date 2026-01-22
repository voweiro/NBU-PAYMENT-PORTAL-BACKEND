const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Scanning for balance payments with incorrect balance_due...');
  
  // Find count first just to see
  const count = await prisma.payment.count({
    where: {
      is_balance_payment: true,
      balance_due: {
        gt: 0
      }
    }
  });

  console.log(`Found ${count} records to fix.`);

  if (count > 0) {
    const result = await prisma.payment.updateMany({
      where: {
        is_balance_payment: true,
        balance_due: {
          gt: 0
        }
      },
      data: {
        balance_due: 0
      }
    });
    console.log(`Successfully updated ${result.count} payment records.`);
  } else {
    console.log('No records needed fixing.');
  }
}

main()
  .catch((e) => {
    console.error('Error fixing records:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
