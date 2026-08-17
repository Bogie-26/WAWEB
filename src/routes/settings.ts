import { Router } from 'express';
import { requireAdmin, asyncHandler } from '../lib/auth.js';
import { getPublicSettings, getStoredConfig, getUptimeSeconds } from '../services/settings.js';

export const settingsRouter = Router();
settingsRouter.use(requireAdmin);

settingsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const stored = await getStoredConfig();
    res.json({
      public: getPublicSettings(),
      uptimeSeconds: getUptimeSeconds(),
      stored: {
        whatsapp_status: stored.whatsapp_status || 'DISCONNECTED',
        whatsapp_last_connected: stored.whatsapp_last_connected || null,
      },
    });
  })
);