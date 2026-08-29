import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { requireApplication, asyncHandler, httpError, AuthenticatedRequest } from '../lib/auth.js';
import { prisma } from '../lib/db.js';
import { getBotState, getClientInstance, downloadMediaCustom } from '../whatsapp/client.js';
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

/** Download media/attachment by WhatsApp message ID. */
clientRouter.get(
  '/messages/:messageId/media',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { messageId } = req.params;

    // Check local cache first
    const cachePath = path.join('/app/media-cache', `${messageId}.json`);
    if (fs.existsSync(cachePath)) {
      try {
        const cachedData = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        console.log(`[WA-MEDIA] Serving media from local cache for ${messageId}`);
        res.json(cachedData);
        return;
      } catch (e: any) {
        console.error(`[WA-MEDIA] Error reading cached media for ${messageId}:`, e.message);
      }
    }

    const client = getClientInstance();
    if (!client || getBotState().status !== 'CONNECTED') {
      res.status(503).json({ error: 'WhatsApp belum terhubung' });
      return;
    }
    try {
      const media = await downloadMediaCustom(client, messageId);
      if (!media) {
        res.status(404).json({ error: 'Media tidak ditemukan atau gagal didownload' });
        return;
      }
      res.json({
        mimetype: media.mimetype,
        data: media.data, // base64 string
        filename: media.filename || null,
      });
    } catch (err: any) {
      console.error(`[WA-MEDIA] Gagal mengambil media untuk ${messageId}:`, err.message);
      res.status(500).json({ error: err.message });
    }
  })
);