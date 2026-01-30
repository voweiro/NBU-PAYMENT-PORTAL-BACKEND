const cron = require('node-cron');
const prisma = require('../config/prisma');
const PaymentModel = require('../models/PaymentModel');

const paymentModel = new PaymentModel(prisma);

function startCronJobs() {
  // Run every hour
  cron.schedule('0 * * * *', async () => {
    console.log('Running cron job: Checking for expired pending payments...');
    try {
      const result = await paymentModel.updateExpiredPendingPayments();
      console.log(`Cron job completed: Updated ${result.count} expired pending payments to failed.`);
    } catch (error) {
      console.error('Error running cron job for expired payments:', error);
    }
  });

  console.log('Cron jobs scheduled: Expired payment check running hourly.');
}

module.exports = { startCronJobs };
