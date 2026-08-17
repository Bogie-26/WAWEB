import { prisma } from '../lib/db.js';
import { getClientInstance } from '../whatsapp/client.js';
import { resolveGroupNameFromChat } from '../whatsapp/groups.js';
import { triggerDelivery } from './delivery.js';

/**
 * Pipeline event masuk — backend only.
 * Body pesan DILARANG tampil di frontend admin / dashboard / log aplikasi.
 * Body tetap dipersist untuk delivery & recovery (retensi terbatas).
 */

export async function handleIncomingMessage(msg: any): Promise<void> {
  const chatJid = msg.fromMe ? msg.to : msg.from;
  if (!chatJid || !chatJid.endsWith('@g.us')) return; // hanya grup

  try {
    const body = msg.body || '';
    const senderId = msg.author ? msg.author.split('@')[0] : msg.from?.split('@')[0] || '';
    const senderName = msg._data?.notifyName || msg.author || msg.from || '';
    const timestamp = new Date((msg.timestamp || Date.now() / 1000) * 1000);

    // 1. Upsert grup (discovery otomatis — pola reference)
    let groupName = 'Grup WhatsApp Baru';
    const existing = await prisma.whatsappGroup.findUnique({ where: { jid: chatJid } });
    if (existing) {
      groupName = existing.name;
      if (groupName === 'Grup WhatsApp Baru' || groupName !== msg._data?.chatName) {
        const resolved = await resolveGroupNameFromChat(msg, groupName);
        if (resolved !== 'Grup WhatsApp Baru') {
          groupName = resolved;
          await prisma.whatsappGroup
            .update({ where: { jid: chatJid }, data: { name: resolved, lastSeenAt: new Date() } })
            .catch(() => {});
        }
      }
    } else {
      groupName = await resolveGroupNameFromChat(msg, groupName);
      await prisma.whatsappGroup
        .upsert({
          where: { jid: chatJid },
          update: { name: groupName, lastSeenAt: new Date() },
          create: { jid: chatJid, name: groupName },
        })
        .catch(() => {});
      console.log(`[WA-DISCOVERY] New group JID discovered: ${chatJid} -> "${groupName}"`);
    }

    // 2. Persist event (seq = global high-water mark)
    const event = await prisma.messageEvent.create({
      data: {
        groupJid: chatJid,
        groupName,
        senderId,
        senderName,
        body,
        hasMedia: !!msg.hasMedia,
        timestamp,
      },
    });
    console.log(`[WA-RECV] event=${event.id} group=${groupName} len=${body.length}`);

    // 3. Cari subscription aktif untuk grup ini
    const subs = await prisma.subscription.findMany({
      where: { groupJid: chatJid, enabled: true, application: { enabled: true } },
      select: { applicationId: true, application: { select: { webhookUrl: true } } },
    });

    // 4. Buat EventDelivery untuk setiap subscriber
    for (const s of subs) {
      await prisma.eventDelivery
        .create({
          data: { eventId: event.id, applicationId: s.applicationId },
        })
        .catch((err: any) => {
          // unique(eventId, applicationId) — duplikat abaikan
          if (!String(err.message).includes('Unique')) {
            console.error('[WA-DELIVERY] Failed to enqueue:', err.message);
          }
        });
    }

    // 5. Trigger delivery asinkron
    if (subs.length > 0) {
      triggerDelivery(event).catch((err: any) =>
        console.error('[WA-DELIVERY] Trigger error:', err.message)
      );
    }
  } catch (err: any) {
    console.error('[WA] Error processing message:', err.message);
  }
}

/** Utility untuk route internal — cek apakah client aktif (pola reference). */
export function isClientReady(): boolean {
  return !!getClientInstance();
}