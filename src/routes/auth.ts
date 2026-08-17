import { Router } from 'express';
import { asyncHandler, createAdminToken, verifyAdminPassword, requireAdmin } from '../lib/auth.js';
import { rateLimit } from '../lib/rateLimit.js';
import { config } from '../config.js';

export const authRouter = Router();

// Login admin — rate limit 5 percobaan/menit per IP
authRouter.post(
  '/login',
  rateLimit(5, 60_000, 'login'),
  asyncHandler(async (req, res) => {
    const { username, password } = req.body ?? {};
    if (typeof username !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'username dan password wajib' });
      return;
    }
    if (username !== config.adminUsername || !verifyAdminPassword(password)) {
      res.status(401).json({ error: 'Username atau password salah' });
      return;
    }
    res.json({ token: createAdminToken(), username: config.adminUsername });
  })
);

authRouter.post('/logout', (_req, res) => {
  res.status(204).end();
});

authRouter.get(
  '/me',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    res.json({ username: config.adminUsername });
  })
);