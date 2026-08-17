import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { assertRequiredConfig, config } from './config.js';
import { prisma } from './lib/db.js';
import { sweepRateLimits } from './lib/rateLimit.js';
import { initWhatsapp } from './whatsapp/client.js';
import { startDeliverySweeper, flushPendingDeliveries } from './services/delivery.js';
import { startRetentionJob } from './services/retention.js';
import { authRouter } from './routes/auth.js';
import { statusRouter } from './routes/status.js';
import { groupsRouter } from './routes/groups.js';
import { applicationsRouter } from './routes/applications.js';
import { subscriptionsRouter } from './routes/subscriptions.js';
import { messagesRouter } from './routes/messages.js';
import { clientRouter } from './routes/client.js';
import { internalRouter } from './routes/internal.js';
import { settingsRouter } from './routes/settings.js';

assertRequiredConfig();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIST = path.resolve(__dirname, '..', 'web', 'dist');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

// Security headers minimal
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

// API routes
app.use('/api/auth', authRouter);
app.use('/api/groups', groupsRouter);
app.use('/api/applications', applicationsRouter);
app.use('/api/subscriptions', subscriptionsRouter);
app.use('/api/messages', messagesRouter);
app.use('/api/client', clientRouter);
app.use('/api/settings', settingsRouter);
app.use('/api', statusRouter);
app.use('/internal', internalRouter);

// Static admin SPA (jika sudah di-build)
if (fs.existsSync(WEB_DIST)) {
  app.use(express.static(WEB_DIST));
  app.get(/^\/(?!api|internal).*/, (_req, res) => {
    res.sendFile(path.join(WEB_DIST, 'index.html'));
  });
}

// Error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = err?.status || 500;
  if (status >= 500) console.error('[HTTP-ERROR]', err?.message || err);
  res.status(status).json({ error: status >= 500 ? 'internal_error' : err?.message || 'error' });
});

async function main() {
  // Cek koneksi DB
  await prisma.$queryRaw`SELECT 1`;
  console.log('[DB] Connected.');

  app.listen(config.port, () => {
    console.log(`[HTTP] WA Service listening on port ${config.port}`);
  });

  // Mulai layanan background
  initWhatsapp().catch((e) => console.error('[WA-INIT] Async init error:', e.message));
  startDeliverySweeper();
  startRetentionJob();
  setInterval(sweepRateLimits, 60_000);

  // Sweep pending delivery saat boot
  setTimeout(() => {
    flushPendingDeliveries().catch((e) =>
      console.error('[WA-DELIVERY] boot sweep error:', e.message)
    );
  }, 10_000);

  console.log('[BOOT] WA Service started.');
}

main().catch((err) => {
  console.error('[BOOT] Fatal:', err.message);
  process.exit(1);
});

// shutdown bersih
process.on('SIGINT', async () => {
  console.log('[SHUTDOWN] Stopping...');
  try {
    await prisma.$disconnect();
  } catch {}
  process.exit(0);
});
process.on('SIGTERM', async () => {
  console.log('[SHUTDOWN] Stopping...');
  try {
    await prisma.$disconnect();
  } catch {}
  process.exit(0);
});