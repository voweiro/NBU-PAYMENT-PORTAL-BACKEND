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
  let output = '=== DIAGNOSTIC START ===\n';
  const targetRef = 'NBUPORTAL_1773742372090';
  output += `Target Reference: "${targetRef}"\n\n`;
  
  try {
    output += 'Connecting to database...\n';
    await prisma.$connect();
    output += 'Connected.\n\n';
    
    // 1. Exact match
    const exact = await prisma.payment.findUnique({
      where: { reference: targetRef }
    });
    output += `Exact Match: ${exact ? 'FOUND' : 'NOT FOUND'}\n`;
    if (exact) output += JSON.stringify(exact, null, 2) + '\n';
    
    // 2. Case-insensitive search
    const ci = await prisma.payment.findMany({
      where: {
        reference: {
          equals: targetRef,
          mode: 'insensitive'
        }
      }
    });
    output += `Case-Insensitive Match: ${ci.length} found\n`;
    
    // 3. Partial match (starts with)
    const partial = await prisma.payment.findMany({
      where: {
        reference: {
          contains: targetRef.split('_')[0] // NBUPORTAL
        }
      },
      take: 20,
      orderBy: { createdAt: 'desc' }
    });
    output += `Recent NBUPORTAL payments: ${partial.length}\n`;
    partial.forEach(p => {
       output += `- [${p.reference}] Status: ${p.status}, CreatedAt: ${p.createdAt}\n`;
    });

    // 4. Total Count
    const count = await prisma.payment.count();
    output += `\nTotal payments in DB: ${count}\n`;

  } catch (err) {
    output += `\n!!! EXECUTION ERROR: ${err.message}\n${err.stack}\n`;
  }
  
  fs.writeFileSync('debug_results.txt', output);
  console.log('Results written to debug_results.txt');
}

main()
  .catch(e => {
    fs.appendFileSync('debug_results.txt', `FATAL ERROR: ${e.message}\n`);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
