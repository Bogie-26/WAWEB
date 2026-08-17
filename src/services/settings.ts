import { prisma } from '../lib/db.js';
import { config, SERVICE_NAME, SERVICE_VERSION } from '../config.js';

export interface PublicSettings {
  serviceName: string;
  serviceVersion: string;
  retentionHours: number;
  webhookTimeoutMs: number;
  webhookAllowPrivateIp: boolean;
  adminUsername: string;
  startedAt: string;
  nodeVersion: string;
  platform: string;
}

export const startedAt = new Date();

export function getPublicSettings(): PublicSettings {
  return {
    serviceName: SERVICE_NAME,
    serviceVersion: SERVICE_VERSION,
    retentionHours: config.eventRetentionHours,
    webhookTimeoutMs: config.webhookTimeoutMs,
    webhookAllowPrivateIp: config.webhookAllowPrivateIp,
    adminUsername: config.adminUsername,
    startedAt: startedAt.toISOString(),
    nodeVersion: process.version,
    platform: process.platform,
  };
}

/** Baca ServiceConfig (untuk dashboard/status — bukan rahasia). */
export async function getStoredConfig(): Promise<Record<string, string>> {
  const rows = await prisma.serviceConfig.findMany();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export function getUptimeSeconds(): number {
  return Math.floor((Date.now() - startedAt.getTime()) / 1000);
}