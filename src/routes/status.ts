import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { requireAdmin, asyncHandler } from '../lib/auth.js';
import {
  getBotState,
  initWhatsapp,
  restartWhatsapp,
  stopWhatsapp,
  getClientInstance,
} from '../whatsapp/client.js';
import { syncGroupsFromClient } from '../whatsapp/groups.js';
import { getPublicSettings, getStoredConfig, getUptimeSeconds, startedAt } from '../services/settings.js';

export const statusRouter = Router();
statusRouter.use(requireAdmin);

// Status keseluruhan service (dashboard + halaman WhatsApp)
statusRouter.get(
  '/status',
  asyncHandler(async (_req, res) => {
    // Auto-init bila belum ada instance (pola reference)
    initWhatsapp().catch((e) => console.error('[WA-API-INIT] Async init error:', e.message));

    const bot = getBotState();
    const [groupCount, appCount, subCount, storedConfig] = await Promise.all([
      prisma.whatsappGroup.count(),
      prisma.application.count(),
      prisma.subscription.count({ where: { enabled: true } }),
      getStoredConfig(),
    ]);

    res.json({
      service: getPublicSettings(),
      uptimeSeconds: getUptimeSeconds(),
      startedAt: startedAt.toISOString(),
      whatsapp: {
        status: bot.status,
        qr: bot.qr,
        connectedAt: bot.connectedAt,
        uptimeSeconds: bot.uptimeSeconds,
        lastConnected: storedConfig.whatsapp_last_connected || null,
        library: 'whatsapp-web.js',
      },
      counts: { groups: groupCount, applications: appCount, subscriptions: subCount },
      health:
        bot.status === 'CONNECTED'
          ? 'OK'
          : bot.status === 'QR_READY'
            ? 'WAITING_SCAN'
            : 'DEGRADED',
    });
  })
);

statusRouter.get(
  '/health',
  asyncHandler(async (_req, res) => {
    let db = true;
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      db = false;
    }
    const bot = getBotState();
    res.json({
      status: db && bot.status !== 'DISCONNECTED' ? 'ok' : 'degraded',
      db,
      whatsapp: bot.status,
      uptimeSeconds: getUptimeSeconds(),
    });
  })
);

// Refresh daftar grup dari client (group discovery manual)
statusRouter.post(
  '/groups/refresh',
  asyncHandler(async (_req, res) => {
    const client = getClientInstance();
    if (!client || getBotState().status !== 'CONNECTED') {
      res.status(409).json({ error: 'WhatsApp belum terhubung' });
      return;
    }
    const groups = await syncGroupsFromClient(client);
    res.json({ synced: groups.length });
  })
);

// Reconnect manual (aman: destroy + re-init saja)
statusRouter.post(
  '/whatsapp/reconnect',
  asyncHandler(async (_req, res) => {
    await restartWhatsapp();
    res.json({ ok: true, status: getBotState().status });
  })
);

statusRouter.post(
  '/whatsapp/stop',
  asyncHandler(async (_req, res) => {
    await stopWhatsapp();
    res.json({ ok: true, status: getBotState().status });
  })
);