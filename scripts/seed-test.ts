import { prisma } from '../src/lib/db.js';

async function main() {
  console.log('Seeding test data...');
  
  // 1. Create Application
  const app = await prisma.application.upsert({
    where: { id: '5ea451c7-431a-4495-ad6b-2c5d24ad6973' },
    update: {
      name: 'WA Service Test Client',
      tokenHash: '043ca09361d39c50694f16c897b96286c2069b419ffdad029d6b2a5178dffaf5',
      enabled: true,
    },
    create: {
      id: '5ea451c7-431a-4495-ad6b-2c5d24ad6973',
      name: 'WA Service Test Client',
      tokenHash: '043ca09361d39c50694f16c897b96286c2069b419ffdad029d6b2a5178dffaf5',
      enabled: true,
    },
  });
  console.log('Application created:', app);

  // 2. Create Subscription
  const sub = await prisma.subscription.upsert({
    where: {
      applicationId_groupJid: {
        applicationId: '5ea451c7-431a-4495-ad6b-2c5d24ad6973',
        groupJid: '628114308180-1612741616@g.us',
      },
    },
    update: {
      groupName: '4DX Niaga - UP3 Luwuk',
      enabled: true,
    },
    create: {
      applicationId: '5ea451c7-431a-4495-ad6b-2c5d24ad6973',
      groupJid: '628114308180-1612741616@g.us',
      groupName: '4DX Niaga - UP3 Luwuk',
      enabled: true,
    },
  });
  console.log('Subscription created:', sub);

  // 3. Create WhatsappGroup entry
  const group = await prisma.whatsappGroup.upsert({
    where: { jid: '628114308180-1612741616@g.us' },
    update: {
      name: '4DX Niaga - UP3 Luwuk',
    },
    create: {
      jid: '628114308180-1612741616@g.us',
      name: '4DX Niaga - UP3 Luwuk',
    },
  });
  console.log('WhatsApp Group created:', group);

  console.log('Seeding done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
