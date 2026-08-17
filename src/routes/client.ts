import { Router } from 'express';
import { requireApplication, asyncHandler, httpError, AuthenticatedRequest } from '../lib/auth.js';
import { prisma } from '../lib/db.js';
import { getBotState } from '../whatsapp/client.js';
import { getUptimeSeconds } from '../services/settings.js';

export const clientRouter = Router();
clientRouter.use(requireApplication);

/** Status ringkas untuk aplikasi (tanpa admin JWT). */
clientRouter.get(
  '/status',
  asyncHandler(async (_req, res) => {
    const bot = getBotState();
    let db = true;
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      db = false;
    }
    res.json({
      status: db && bot.status !== 'DISCONNECTED' ? 'ok' : 'degraded',
      db,
      whatsapp: bot.status,
      uptimeSeconds: getUptimeSeconds(),
    });
  })
);

/** Daftar seluruh grup WhatsApp yang dikenal → [{ id: jid, name }]. */
clientRouter.get(
  '/groups',
  asyncHandler(async (_req, res) => {
    const groups = await prisma.whatsappGroup.findMany({ orderBy: { name: 'asc' } });
    res.json(groups.map((g) => ({ id: g.jid, name: g.name })));
  })
);

/** Subscription milik aplikasi pemanggil. */
clientRouter.get(
  '/subscriptions',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const subs = await prisma.subscription.findMany({
      where: { applicationId: req.application.id },
      orderBy: { groupJid: 'asc' },
    });
    res.json(
      subs.map((s) => ({
        id: s.id,
        groupJid: s.groupJid,
        groupName: s.groupName,
        enabled: s.enabled,
      }))
    );
  })
);

/**
 * Sinkronkan subscription aplikasi pemanggil: groupJids yang dikirim
 * di-upsert (enabled=true), subscription aplikasi ini yang tidak ada
 * dalam daftar di-disable. Berlaku hanya untuk aplikasi pemanggil.
 */
clientRouter.put(
  '/subscriptions',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { groupJids } = req.body ?? {};
    if (!Array.isArray(groupJids) || groupJids.some((j) => typeof j !== 'string')) {
      throw httpError('groupJids wajib berupa array of string', 400);
    }
    const jids = [
      ...new Set(
        (groupJids as string[]).map((j) => j.trim()).filter((j) => j.endsWith('@g.us'))
      ),
    ];
    const appId = req.application.id;

    const existing = await prisma.subscription.findMany({ where: { applicationId: appId } });
    const existingByJid = new Map(existing.map((s) => [s.groupJid, s]));

    const synced: { groupJid: string; groupName: string; created: boolean }[] = [];
    for (const jid of jids) {
      const cur = existingByJid.get(jid);
      if (cur) {
        if (!cur.enabled) {
          await prisma.subscription.update({ where: { id: cur.id }, data: { enabled: true } });
        }
        synced.push({ groupJid: jid, groupName: cur.groupName, created: false });
      } else {
        const group = await prisma.whatsappGroup.findUnique({ where: { jid } });
        const created = await prisma.subscription.create({
          data: {
            applicationId: appId,
            groupJid: jid,
            groupName: group?.name ?? jid,
          },
        });
        synced.push({ groupJid: jid, groupName: created.groupName, created: true });
      }
    }

    const disabled: { groupJid: string; groupName: string }[] = [];
    for (const s of existing) {
      if (!jids.includes(s.groupJid) && s.enabled) {
        await prisma.subscription.update({ where: { id: s.id }, data: { enabled: false } });
        disabled.push({ groupJid: s.groupJid, groupName: s.groupName });
      }
    }

    res.json({ ok: true, synced, disabled });
  })
);