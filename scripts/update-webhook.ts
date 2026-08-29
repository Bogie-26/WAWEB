import { prisma } from '../src/lib/db.js';

async function main() {
  await prisma.application.update({
    where: { id: '5ea451c7-431a-4495-ad6b-2c5d24ad6973' },
    data: { webhookUrl: 'http://127.0.0.1:9999/webhook' },
  });
  console.log('Webhook URL updated to http://127.0.0.1:9999/webhook');
}

main().catch(console.error).finally(() => prisma.$disconnect());
