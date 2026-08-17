import { prisma } from '../lib/db.js';

/**
 * Group discovery & sync — dipindahkan dari reference (src/lib/whatsapp.ts)
 * dan dibuat generik (tanpa tipe_grup / status_aktif / business logic PLTD).
 */

export interface GroupInfo {
  jid: string;
  name: string;
}

// WA Web build 2.3000.x menghapus window.Store/window.mR sehingga
// client.getChats() gagal internal; fallback ke IndexedDB 'model-storage'
// (store 'chat' + 'group-metadata') yang terisi penuh saat sync.
export async function listClientGroups(client: any): Promise<GroupInfo[]> {
  try {
    const chats: any[] = await client.getChats();
    const mapped = chats
      .filter((c: any) => (typeof c.isGroup === 'function' ? c.isGroup() : c.isGroup))
      .map((c: any) => {
        const jid = c.id ? c.id._serialized || c.id.$1 || '' : '';
        return { jid, name: (c.name || '').toString() };
      })
      .filter((g: GroupInfo) => g.jid);
    if (mapped.length > 0) {
      console.log(`[WA-SYNC] Resolved ${mapped.length} groups via client.getChats().`);
      return mapped;
    }
  } catch (err: any) {
    console.warn('[WA-SYNC] client.getChats() unavailable, switching to IndexedDB scan...');
  }

  return client.pupPage.evaluate(async () => {
    const idb = indexedDB as any;
    const open = await new Promise<any>((resolve, reject) => {
      const req = idb.open('model-storage');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const getAll = (storeName: string) =>
      new Promise<any[]>((resolve, reject) => {
        const req = (open as any).transaction(storeName).objectStore(storeName).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    const [records, groupMeta] = await Promise.all([getAll('chat'), getAll('group-metadata')]);
    (open as any).close();

    const subjectByJid: Record<string, string> = {};
    const extractJid = (v: any): string => {
      if (typeof v === 'string') return v;
      if (v && typeof v._serialized === 'string') return v._serialized;
      if (v && typeof v.$1 === 'string') return v.$1;
      return '';
    };
    for (const m of groupMeta) {
      if (!m) continue;
      const jid = extractJid(m.id);
      const rawName = m.subjectName || m.subject || m.name || m.formattedTitle;
      if (jid && jid.endsWith('@g.us') && rawName) {
        const n = rawName.toString();
        if (!/^group\*|^Grup WhatsApp Baru$/i.test(n)) {
          subjectByJid[jid] = n;
        }
      }
    }

    return records
      .filter((r: any) => r && typeof r.id === 'string' && r.id.endsWith('@g.us'))
      .map((r: any) => {
        const fromMeta = subjectByJid[r.id];
        const fallback = r.name || r.subject || r.formattedTitle || 'Grup WhatsApp Baru';
        return { jid: r.id, name: (fromMeta || fallback).toString() };
      })
      .filter((g: GroupInfo) => g.jid);
  });
}

/** Upsert daftar grup dari client ke database lokal. */
export async function syncGroupsFromClient(client: any): Promise<GroupInfo[]> {
  const groups = await listClientGroups(client);
  let updated = 0;
  for (const g of groups) {
    const result = await prisma.whatsappGroup.upsert({
      where: { jid: g.jid },
      update: { name: g.name, lastSeenAt: new Date() },
      create: { jid: g.jid, name: g.name },
    });
    if (result.name === g.name) updated++;
  }
  console.log(`[WA-SYNC] Retrieved ${groups.length} groups via client API. Upserted ${updated}.`);
  return groups;
}

/** Nama grup dari client saat discovery (msg.getChat()). */
export async function resolveGroupNameFromChat(msg: any, fallback: string): Promise<string> {
  try {
    const chat = await msg.getChat();
    if (chat && chat.name) return chat.name.toString();
  } catch {
    // abaikan — gunakan fallback
  }
  return fallback;
}