import { prisma } from '../lib/db.js';
import { config } from '../config.js';
import { webhookSignatureHex } from '../lib/auth.js';
import { resolveSafeWebhookUrl } from '../lib/ssrf.js';

/**
 * Webhook delivery — at-least-once.
 * Status: PENDING (antri) | SENT (in-flight) | DELIVERED | FAILED.
 * Retry eksponensial: 1m, 5m, 15m, 1h, 6h, 24h → FAILED (recovery menutup gap).
 * SSRF: URL divalidasi ulang per attempt.
 */

const STALE_SENT_MS = 120_000; // SENT lebih lama dari ini dianggap macet (crash)

async function attemptDelivery(
  deliveryId: string,
  eventId: string,
  application: { tokenHash: string; webhookUrl: string | null; id: string; name: string },
  event: { seq: bigint; groupJid: string; groupName: string; senderId: string; senderName: string | null; body: string | null; timestamp: Date }
): Promise<void> {
  if (!application.webhookUrl) {
    await prisma.eventDelivery.update({
      where: { id: deliveryId },
      data: { status: 'FAILED', lastError: 'webhook_url tidak dikonfigurasi', nextRetryAt: null },
    });
    return;
  }

  // SSRF guard — re-check DNS per attempt (mitigasi rebinding)
  try {
    await resolveSafeWebhookUrl(application.webhookUrl, {
      allowPrivateIp: config.webhookAllowPrivateIp,
    });
  } catch (err: any) {
    console.error(`[WA-DELIVERY] SSRF block app=${application.name}:`, err.message);
    await prisma.eventDelivery.update({
      where: { id: deliveryId },
      data: { status: 'FAILED', lastError: err.message, nextRetryAt: null },
    });
    return;
  }

  const payload = {
    event: 'message',
    eventId: eventId,
    messageId: eventId,
    groupId: event.groupJid,
    groupName: event.groupName,
    senderId: event.senderId,
    senderName: event.senderName || '',
    timestamp: Math.floor(event.timestamp.getTime() / 1000),
    body: event.body || '',
  };
  const rawBody = JSON.stringify(payload);

  // Signing secret webhook = sha256(token aplikasi). Token asli tidak pernah
  // disimpan oleh WA Service; subscriber dapat menghitung ulang secret yang
  // sama dari token miliknya sendiri: HMAC-SHA256(sha256hex(rawToken), body).
  const signSecret = application.tokenHash;

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-wa-event-id': eventId,
    'x-wa-timestamp': String(Math.floor(Date.now() / 1000)),
    'x-wa-signature': webhookSignatureHex(signSecret, rawBody),
  };

  await prisma.eventDelivery.update({
    where: { id: deliveryId },
    data: { status: 'SENT', attempts: { increment: 1 }, nextRetryAt: null },
  });

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.webhookTimeoutMs);
    const res = await fetch(application.webhookUrl, {
      method: 'POST',
      headers,
      body: rawBody,
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      await prisma.eventDelivery.update({
        where: { id: deliveryId },
        data: { status: 'DELIVERED', deliveredAt: new Date(), lastError: null, nextRetryAt: null },
      });
      console.log(`[WA-DELIVERY] Delivered ${eventId} -> ${application.name} (${res.status})`);
      return;
    }
    throw new Error(`HTTP ${res.status}`);
  } catch (err: any) {
    const d = await prisma.eventDelivery.findUnique({ where: { id: deliveryId } });
    const attempts = (d?.attempts ?? 1);
    if (attempts > config.deliveryMaxAttempts) {
      await prisma.eventDelivery.update({
        where: { id: deliveryId },
        data: { status: 'FAILED', lastError: err.message || 'unknown', nextRetryAt: null },
      });
      console.error(`[WA-DELIVERY] Failed permanently ${eventId} -> ${application.name}:`, err.message);
      return;
    }
    const backoff = config.deliveryBackoffMs[Math.min(attempts - 1, config.deliveryBackoffMs.length - 1)] ?? 86_400_000;
    await prisma.eventDelivery.update({
      where: { id: deliveryId },
      data: { status: 'PENDING', lastError: err.message || 'unknown', nextRetryAt: new Date(Date.now() + backoff) },
    });
    console.warn(`[WA-DELIVERY] Retry ${attempts}/${config.deliveryMaxAttempts} ${eventId} -> ${application.name} dalam ${backoff / 1000}s`);
  }
}

/** Trigger delivery untuk 1 event (dipanggil dari events pipeline). */
export async function triggerDelivery(event: {
  id: string;
  seq: bigint;
  groupJid: string;
  groupName: string;
  senderId: string;
  senderName: string | null;
  body: string | null;
  timestamp: Date;
}): Promise<void> {
  const deliveries = await prisma.eventDelivery.findMany({
    where: { eventId: event.id, status: 'PENDING' },
    include: { application: true },
  });
  for (const d of deliveries) {
    attemptDelivery(d.id, event.id, d.application, event).catch((err: any) =>
      console.error('[WA-DELIVERY] attempt error:', err.message)
    );
  }
}

/** Sweeper retry berkala + adopsi SENT basi. */
export async function flushPendingDeliveries(): Promise<void> {
  const now = new Date();

  // Adopsi SENT yang macet (proses mati saat in-flight)
  await prisma.eventDelivery.updateMany({
    where: { status: 'SENT', updatedAt: { lt: new Date(now.getTime() - STALE_SENT_MS) } },
    data: { status: 'PENDING', nextRetryAt: new Date(Date.now() + 30_000) },
  });

  const pending = await prisma.eventDelivery.findMany({
    where: { status: 'PENDING', nextRetryAt: { lte: now } },
    include: { application: true, event: true },
    take: 50,
  });

  for (const d of pending) {
    await attemptDelivery(d.id, d.eventId, d.application, d.event).catch((err: any) =>
      console.error('[WA-DELIVERY] sweep attempt error:', err.message)
    );
  }
}

export function startDeliverySweeper(): void {
  setInterval(() => {
    flushPendingDeliveries().catch((err: any) =>
      console.error('[WA-DELIVERY] sweep error:', err.message)
    );
  }, 30_000);
}