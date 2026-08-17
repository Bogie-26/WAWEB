import { prisma } from '../lib/db.js';
import { generateAppToken, hashToken } from '../lib/auth.js';
import { resolveSafeWebhookUrl } from '../lib/ssrf.js';
import { config } from '../config.js';

export interface ApplicationWithMeta {
  id: string;
  name: string;
  webhookUrl: string | null;
  enabled: boolean;
  subscriptionCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export async function listApplications(): Promise<ApplicationWithMeta[]> {
  const apps = await prisma.application.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { subscriptions: true } } },
  });
  return apps.map((a) => ({
    id: a.id,
    name: a.name,
    webhookUrl: a.webhookUrl,
    enabled: a.enabled,
    subscriptionCount: a._count.subscriptions,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  }));
}

export async function createApplication(
  name: string,
  webhookUrl?: string
): Promise<{ app: ApplicationWithMeta; token: string }> {
  const trimmedName = (name || '').trim();
  if (!trimmedName) throw new Error('name wajib diisi');

  let url: string | null = null;
  if (webhookUrl) {
    await resolveSafeWebhookUrl(webhookUrl, { allowPrivateIp: config.webhookAllowPrivateIp });
    url = webhookUrl.trim();
  }

  const token = generateAppToken();
  const app = await prisma.application.create({
    data: { name: trimmedName, tokenHash: hashToken(token), webhookUrl: url },
  });
  return {
    app: {
      id: app.id,
      name: app.name,
      webhookUrl: app.webhookUrl,
      enabled: app.enabled,
      subscriptionCount: 0,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
    },
    token,
  };
}

export async function updateApplication(
  id: string,
  data: { name?: string; enabled?: boolean; webhookUrl?: string | null }
): Promise<ApplicationWithMeta> {
  const update: Record<string, unknown> = {};
  if (data.name !== undefined) {
    const n = data.name.trim();
    if (!n) throw new Error('name tidak boleh kosong');
    update.name = n;
  }
  if (data.enabled !== undefined) update.enabled = data.enabled;

  if (data.webhookUrl !== undefined) {
    if (data.webhookUrl === null || data.webhookUrl === '') {
      update.webhookUrl = null;
    } else {
      await resolveSafeWebhookUrl(data.webhookUrl, {
        allowPrivateIp: config.webhookAllowPrivateIp,
      });
      update.webhookUrl = data.webhookUrl.trim();
    }
  }

  const app = await prisma.application.update({ where: { id }, data: update });
  const count = await prisma.subscription.count({ where: { applicationId: id } });
  return {
    id: app.id,
    name: app.name,
    webhookUrl: app.webhookUrl,
    enabled: app.enabled,
    subscriptionCount: count,
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
  };
}

export async function rotateApplicationToken(id: string): Promise<string> {
  const token = generateAppToken();
  await prisma.application.update({ where: { id }, data: { tokenHash: hashToken(token) } });
  return token;
}

export async function deleteApplication(id: string): Promise<void> {
  await prisma.application.delete({ where: { id } });
}

export async function testApplicationWebhook(
  id: string
): Promise<{ ok: boolean; status?: number; error?: string; delivered?: boolean }> {
  const app = await prisma.application.findUnique({ where: { id } });
  if (!app) throw new Error('application tidak ditemukan');
  if (!app.webhookUrl) throw new Error('webhook_url belum dikonfigurasi');

  await resolveSafeWebhookUrl(app.webhookUrl, { allowPrivateIp: config.webhookAllowPrivateIp });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.webhookTimeoutMs);
  try {
    const res = await fetch(app.webhookUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-wa-event-id': `test-${app.id}`,
        'x-wa-timestamp': String(Math.floor(Date.now() / 1000)),
        'x-wa-signature': '',
      },
      body: JSON.stringify({ event: 'test', applicationId: app.id }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    return { ok: res.ok, status: res.status, delivered: res.ok };
  } catch (err: any) {
    clearTimeout(timer);
    return { ok: false, error: err.message || 'unknown' };
  }
}