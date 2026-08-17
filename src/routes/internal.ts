import { Router } from 'express';
import { requireApplication, asyncHandler, AuthenticatedRequest } from '../lib/auth.js';
import { prisma } from '../lib/db.js';
import { eventsAfter, ackCursor } from '../services/recovery.js';

/**
 * Endpoint internal recovery — BUKAN message viewer.
 * Hanya authenticated application subscriber; tidak muncul di frontend admin.
 */
export const internalRouter = Router();

internalRouter.get(
  '/events',
  requireApplication,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const rawAfter = typeof req.query.after === 'string' ? req.query.after : '0';
    const rawLimit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 100;
    const afterSeq = /^\d+$/.test(rawAfter) ? BigInt(rawAfter) : 0n;

    const { events, nextCursor } = await eventsAfter(req.application.id, afterSeq, rawLimit);
    res.json({ events, next_cursor: nextCursor });
  })
);

internalRouter.post(
  '/events/ack',
  requireApplication,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { after } = req.body ?? {};
    if (typeof after !== 'string' || !/^\d+$/.test(after)) {
      res.status(400).json({ error: 'after wajib berupa seq (string angka)' });
      return;
    }
    await ackCursor(req.application.id, BigInt(after));
    res.json({ ok: true });
  })
);

// Info subscription milik aplikasi ini (berisi groupJid — bukan isi pesan)
internalRouter.get(
  '/subscriptions',
  requireApplication,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const subs = await prisma.subscription.findMany({
      where: { applicationId: req.application.id, enabled: true },
      select: { id: true, groupJid: true, groupName: true, createdAt: true },
    });
    res.json(subs);
  })
);