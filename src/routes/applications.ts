import { Router } from 'express';
import { requireAdmin, asyncHandler } from '../lib/auth.js';
import {
  listApplications,
  createApplication,
  updateApplication,
  deleteApplication,
  rotateApplicationToken,
  testApplicationWebhook,
} from '../services/applications.js';

export const applicationsRouter = Router();
applicationsRouter.use(requireAdmin);

applicationsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(await listApplications());
  })
);

applicationsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name, webhookUrl } = req.body ?? {};
    if (typeof name !== 'string') {
      res.status(400).json({ error: 'name wajib diisi' });
      return;
    }
    const { app, token } = await createApplication(name, typeof webhookUrl === 'string' ? webhookUrl : undefined);
    // Token ditampilkan SEKALI — tidak bisa dilihat lagi
    res.status(201).json({ ...app, token });
  })
);

applicationsRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { name, enabled, webhookUrl } = req.body ?? {};
    const data: { name?: string; enabled?: boolean; webhookUrl?: string | null } = {};
    if (typeof name === 'string') data.name = name;
    if (typeof enabled === 'boolean') data.enabled = enabled;
    if ('webhookUrl' in (req.body ?? {})) data.webhookUrl = webhookUrl;
    res.json(await updateApplication(req.params.id, data));
  })
);

applicationsRouter.post(
  '/:id/rotate-token',
  asyncHandler(async (req, res) => {
    const token = await rotateApplicationToken(req.params.id);
    res.json({ token });
  })
);

applicationsRouter.post(
  '/:id/test-webhook',
  asyncHandler(async (req, res) => {
    const result = await testApplicationWebhook(req.params.id);
    res.status(result.ok ? 200 : 502).json(result);
  })
);

applicationsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await deleteApplication(req.params.id);
    res.status(204).end();
  })
);