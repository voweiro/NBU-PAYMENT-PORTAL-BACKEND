console.log('Index: Starting...');
const app = require('./app');
const { verifyDriveConnection } = require('./services/receiptService');
const { startReconciliation } = require('./services/reconciliationService');
const { startCronJobs } = require('./services/cronService');
const { PrismaClient } = require('@prisma/client');

console.log('Index: Modules loaded');

const PORT = process.env.PORT;
const prisma = new PrismaClient();

async function start() {
  try {
    console.log('Index: Connecting to DB...');
    await prisma.$connect();
    console.log('✅ Connected to database');
    // Verify bucket connectivity (non-blocking for app start)
    const bucketOk = await verifyDriveConnection();
    if (bucketOk) {
      console.log('✅ Railway bucket connection verified');
    }
  } catch (err) {
    console.error('❌ Database connection failed:', err.message);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`Backend server listening on port ${PORT}`);
  });
  startReconciliation({ intervalMs: 60 * 1000 });
  startCronJobs();
}

start();
