import { prisma } from '../src/lib/db.js';

async function main() {
  const cursors = await prisma.applicationCursor.findMany();
  const events = await prisma.messageEvent.findMany();
  console.log('=== CURSORS ===');
  console.log(JSON.stringify(cursors, null, 2));
  console.log('=== EVENTS ===');
  console.log(JSON.stringify(events, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
