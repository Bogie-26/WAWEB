import { prisma } from '../lib/db.js';

/**
 * Recovery — anti message loss.
 *
 * Semantik cursor (approved):
 * - `seq` adalah global high-water mark (satu urutan untuk semua grup).
 * - Query mengambil `limit` baris pertama (`seq > after`, asc) dari SEMUA grup.
 * - Response hanya berisi event dari grup yang di-subscribe aplikasi tsb;
 *   event grup lain di-skip TAPI tetap dihitung sebagai posisi yang diperiksa.
 * - `next_cursor` = global seq TERAKHIR YANG DIPERIKSA (boleh dari grup
 *   non-subscribe) — sehingga pemanggilan berikutnya meneruskan dari sana.
 * - Semua event subscribe di dalam window ikut dalam response → tidak ada gap.
 * - Subscriber hanya menyimpan cursor setelah seluruh batch diproses.
 */

export interface RecoveryEvent {
  id: string;
  seq: string;
  groupId: string;
  groupName: string;
  senderId: string;
  senderName: string | null;
  timestamp: number;
  body: string | null;
  hasMedia: boolean;
}

export async function eventsAfter(
  applicationId: string,
  afterSeq: bigint,
  limit: number
): Promise<{ events: RecoveryEvent[]; nextCursor: string | null }> {
  const safeLimit = Math.min(Math.max(limit || 100, 1), 500);

  // 1. Grup yang boleh dibaca aplikasi ini (subscription aktif)
  const subs = await prisma.subscription.findMany({
    where: { applicationId, enabled: true },
    select: { groupJid: true },
  });
  const allowedGroups = new Set(subs.map((s) => s.groupJid));
  if (allowedGroups.size === 0) {
    return { events: [], nextCursor: null };
  }

  // 2. Window [after+1 .. after+limit] — global, semua grup
  const rows = await prisma.messageEvent.findMany({
    where: { seq: { gt: afterSeq } },
    orderBy: { seq: 'asc' },
    take: safeLimit,
    select: {
      id: true,
      seq: true,
      groupJid: true,
      groupName: true,
      senderId: true,
      senderName: true,
      timestamp: true,
      body: true,
      hasMedia: true,
    },
  });

  if (rows.length === 0) {
    return { events: [], nextCursor: null };
  }

  // 3. Filter subscribe — skip event grup lain
  const events: RecoveryEvent[] = rows
    .filter((r) => allowedGroups.has(r.groupJid))
    .map((r) => ({
      id: r.id,
      seq: r.seq.toString(),
      groupId: r.groupJid,
      groupName: r.groupName,
      senderId: r.senderId,
      senderName: r.senderName,
      timestamp: Math.floor(r.timestamp.getTime() / 1000),
      body: r.body,
      hasMedia: r.hasMedia,
    }));

  // 4. next_cursor = seq baris TERAKHIR YANG DIPERIKSA (termasuk yang di-skip).
  //    Jika rows habis (kurang dari limit) berarti tidak ada lagi baris → null.
  const lastExamined = rows[rows.length - 1].seq;
  const nextCursor = rows.length === safeLimit ? lastExamined.toString() : null;

  // 5. Catat posisi di ApplicationCursor (informasi; cursor otoritatif di subscriber)
  await prisma.applicationCursor
    .upsert({
      where: { applicationId },
      update: { lastSeq: lastExamined },
      create: { applicationId, lastSeq: lastExamined },
    })
    .catch(() => {});

  return { events, nextCursor };
}

export async function ackCursor(applicationId: string, seq: bigint): Promise<void> {
  await prisma.applicationCursor
    .upsert({
      where: { applicationId },
      update: { lastSeq: seq },
      create: { applicationId, lastSeq: seq },
    })
    .catch(() => {});
}