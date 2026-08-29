import { prisma } from '../src/lib/db.js';

async function main() {
  const configs = await prisma.serviceConfig.findMany();
  console.log('=== SERVICE CONFIGS ===');
  console.log(JSON.stringify(configs, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
