import { prisma } from '../lib/db.js';
import { config } from '../config.js';

/**
 * Event retention — body pesan disimpan hanya sementara (EVENT_RETENTION_HOURS)
 * untuk mendukung delivery webhook & recovery. Tidak ada chat archive permanen.
 */
export async function purgeExpiredEvents(): Promise<number> {
  const cutoff = new Date(Date.now() - config.eventRetentionHours * 3600_000);
  const result = await prisma.messageEvent.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  if (result.count > 0) {
    console.log(`[RETENTION] Purged ${result.count} events older than ${config.eventRetentionHours}h`);
  }
  return result.count;
}

export function startRetentionJob(): void {
  // jalankan sekali saat boot, lalu tiap 12 jam
  setTimeout(async () => {
    await purgeExpiredEvents().catch((err: any) =>
      console.error('[RETENTION] purge error:', err.message)
    );
  }, 30_000);
  setInterval(async () => {
    await purgeExpiredEvents().catch((err: any) =>
      console.error('[RETENTION] purge error:', err.message)
    );
  }, 12 * 3600_000);
}