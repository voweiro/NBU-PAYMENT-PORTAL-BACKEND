const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://postgres:ptmeBsdPidjWXElXiYqSwvbdwqPoRfeR@maglev.proxy.rlwy.net:40023/railway"
    }
  }
});

async function main() {
  let output = 'Script started\n';
  const ref = 'NBUPORTAL_1773742372090';
  output += `Searching for reference: "${ref}"\n`;
  
  try {
    await prisma.$connect();
    output += 'Connected to DB\n';
    
    const payment = await prisma.payment.findUnique({
      where: { reference: ref }
    });
    
    if (payment) {
      output += '✅ Payment found!\n';
      output += JSON.stringify(payment, null, 2) + '\n';
    } else {
      output += '❌ Payment NOT found.\n';
      
      const count = await prisma.payment.count();
      output += `Total payments: ${count}\n`;
      
      const latest = await prisma.payment.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' }
      });
      
      output += 'Latest 10 payments:\n';
      latest.forEach(p => {
        output += `Ref: ${p.reference}, Status: ${p.status}, CreatedAt: ${p.createdAt}\n`;
      });
    }
  } catch (err) {
    output += `ERROR: ${err.message}\n${err.stack}\n`;
  }
  
  fs.writeFileSync('debug-output.txt', output);
  console.log('Output written to debug-output.txt');
}

main()
  .catch(e => {
    fs.appendFileSync('debug-output.txt', `FATAL: ${e.message}\n`);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
