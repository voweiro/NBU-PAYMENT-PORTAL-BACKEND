const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Script started...');
  const applicantName = 'Softwarehyuio Admin';
  console.log(`Searching for payments related to: ${applicantName}`);

  const payments = await prisma.payment.findMany({
    take: 10,
    orderBy: { createdAt: 'desc' },
    include: { fee: true }
  });

  console.log(`Found ${payments.length} payments:`);
  payments.forEach(p => {
    console.log(`- Ref: ${p.reference}, Status: ${p.status}, Amount: ${p.amount}, Fee: ${p.fee?.name}, ApplicantId: ${p.applicantId}, ApplicationId: ${p.applicationId}`);
  });
  console.log('Script finished.');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
