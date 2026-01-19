const app = require('./app');
const { verifyDriveConnection } = require('./services/receiptService');
const { startReconciliation } = require('./services/reconciliationService');
const { PrismaClient } = require('@prisma/client');

const PORT = process.env.PORT || 4000;
const prisma = new PrismaClient();

async function start() {
  try {
    await prisma.$connect();
    console.log('✅ Connected to database');
    // Verify Google Drive connectivity (non-blocking for app start)
    await verifyDriveConnection();
  } catch (err) {
    console.error('❌ Database connection failed:', err.message);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`Backend server listening on port ${PORT}`);
  });
  startReconciliation({ intervalMs: 60 * 1000 });
}

start();
