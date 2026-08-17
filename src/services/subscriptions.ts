import { prisma } from '../lib/db.js';

export async function listSubscriptions() {
  return prisma.subscription.findMany({
    orderBy: [{ applicationId: 'asc' }, { groupJid: 'asc' }],
    include: { application: { select: { id: true, name: true, enabled: true } } },
  });
}

export async function createSubscription(applicationId: string, groupJid: string) {
  const jid = (groupJid || '').trim();
  if (!jid.endsWith('@g.us')) throw new Error('groupJid harus berupa grup WhatsApp (@g.us)');

  const app = await prisma.application.findUnique({ where: { id: applicationId } });
  if (!app) throw new Error('application tidak ditemukan');

  // Snapshot nama grup bila sudah dikenal
  let groupName = jid;
  const group = await prisma.whatsappGroup.findUnique({ where: { jid } });
  if (group) groupName = group.name;

  return prisma.subscription.create({
    data: { applicationId, groupJid: jid, groupName },
  });
}

export async function deleteSubscription(id: string) {
  await prisma.subscription.delete({ where: { id } });
}

export async function toggleSubscription(id: string, enabled: boolean) {
  return prisma.subscription.update({ where: { id }, data: { enabled } });
}