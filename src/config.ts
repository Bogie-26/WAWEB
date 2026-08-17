export const SERVICE_NAME = 'WA Service';
export const SERVICE_VERSION = '0.1.0';

function num(env: string | undefined, fallback: number): number {
  const v = Number(env);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export const config = {
  port: num(process.env.PORT, 3006),
  databaseUrl:
    process.env.DATABASE_URL ??
    'postgresql://wa_service:wa_service@localhost:5432/wa_service?schema=public',
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH || '',
  jwtSecret: process.env.JWT_SECRET || '',
  waSessionPath: process.env.WA_SESSION_PATH || './.wwebjs_auth',
  chromeBin: process.env.CHROME_BIN || '',
  webhookAllowPrivateIp: (process.env.WEBHOOK_ALLOW_PRIVATE_IP || 'false') === 'true',
  webhookTimeoutMs: num(process.env.WEBHOOK_TIMEOUT_MS, 10000),
  eventRetentionHours: num(process.env.EVENT_RETENTION_HOURS, 72),
  deliveryMaxAttempts: 6,
  deliveryBackoffMs: [60_000, 300_000, 900_000, 3_600_000, 21_600_000, 86_400_000],
};

export function assertRequiredConfig(): void {
  const missing: string[] = [];
  if (!config.jwtSecret) missing.push('JWT_SECRET');
  if (!config.adminPasswordHash) missing.push('ADMIN_PASSWORD_HASH');
  if (missing.length > 0) {
    console.error(
      `[CONFIG] Missing required environment: ${missing.join(', ')}. ` +
        'Copy .env.example to .env and set the values (admin hash via: npm run hash:password -- "<password>").'
    );
    process.exit(1);
  }
}