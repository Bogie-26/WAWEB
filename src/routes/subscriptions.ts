import { Router } from 'express';
import { requireAdmin, asyncHandler, httpError } from '../lib/auth.js';
import {
  listSubscriptions,
  createSubscription,
  deleteSubscription,
  toggleSubscription,
} from '../services/subscriptions.js';

export const subscriptionsRouter = Router();
subscriptionsRouter.use(requireAdmin);

subscriptionsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(await listSubscriptions());
  })
);

subscriptionsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { applicationId, groupJid } = req.body ?? {};
    if (typeof applicationId !== 'string' || typeof groupJid !== 'string') {
      res.status(400).json({ error: 'applicationId dan groupJid wajib' });
      return;
    }
    try {
      const sub = await createSubscription(applicationId, groupJid);
      res.status(201).json(sub);
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg.includes('Unique')) {
        throw httpError('Subscription sudah ada untuk aplikasi & grup ini', 409);
      }
      throw err;
    }
  })
);

subscriptionsRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { enabled } = req.body ?? {};
    if (typeof enabled !== 'boolean') {
      res.status(400).json({ error: 'enabled wajib boolean' });
      return;
    }
    res.json(await toggleSubscription(req.params.id, enabled));
  })
);

subscriptionsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await deleteSubscription(req.params.id);
    res.status(204).end();
  })
);