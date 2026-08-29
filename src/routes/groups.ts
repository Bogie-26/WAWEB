import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { requireAdmin, asyncHandler } from '../lib/auth.js';
import { getClientInstance, getBotState } from '../whatsapp/client.js';
import { syncGroupsFromClient } from '../whatsapp/groups.js';

export const groupsRouter = Router();
groupsRouter.use(requireAdmin);

// Daftar grup — TANPA isi pesan (nur nama, ID, status, jumlah subscriber)
groupsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const groups = await prisma.whatsappGroup.findMany({ orderBy: { name: 'asc' } });
    const subCounts = await prisma.subscription.groupBy({
      by: ['groupJid'],
      where: { enabled: true },
      _count: { _all: true },
    });
    const countByJid = Object.fromEntries(
      subCounts.map((s) => [s.groupJid, s._count._all])
    );

    res.json(
      groups.map((g) => ({
        id: g.jid,
        name: g.name,
        isGroup: true,
        lastSeenAt: g.lastSeenAt,
        subscriptionCount: countByJid[g.jid] ?? 0,
      }))
    );
  })
);

// Refresh daftar grup dari client (group discovery manual)
groupsRouter.post(
  '/refresh',
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