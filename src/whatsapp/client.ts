import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode';
import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/db.js';
import { config } from '../config.js';
import { cleanChromiumLocks } from './lockCleaner.js';
import { syncGroupsFromClient } from './groups.js';
import { handleIncomingMessage } from '../services/events.js';

export type ConnectionStatus = 'DISCONNECTED' | 'CONNECTING' | 'QR_READY' | 'CONNECTED';

let clientInstance: any = null;
let connectionStatus: ConnectionStatus = 'DISCONNECTED';
let qrCodeBase64 = '';
let connectedAt: Date | null = null;
let initCooldownUntil = 0;
const INIT_COOLDOWN_MS = 15000;
const WATCHDOG_MS = 90000;

// ── persistence status (pola app_config reference) ──────────────────────

export async function updateServiceConfig(key: string, value: string): Promise<void> {
  try {
    await prisma.serviceConfig.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  } catch (err: any) {
    console.error(`[WA-CONFIG] Failed to save config ${key}:`, err.message);
  }
}

// ── state accessors ─────────────────────────────────────────────────────

export function getBotState() {
  return {
    status: connectionStatus,
    qr: qrCodeBase64,
    connectedAt,
    uptimeSeconds: connectedAt ? Math.floor((Date.now() - connectedAt.getTime()) / 1000) : 0,
  };
}

export function getClientInstance(): any {
  return clientInstance;
}

// ── init ────────────────────────────────────────────────────────────────

export async function initWhatsapp(): Promise<any> {
  if (clientInstance) return clientInstance;
  if (Date.now() < initCooldownUntil) return null;
  initCooldownUntil = Date.now() + INIT_COOLDOWN_MS;

  try {
    cleanChromiumLocks(config.waSessionPath);
  } catch (err: any) {
    console.error('[WA-LOCKS] Error clearing lock files:', err.message);
  }

  console.log('[WA] Starting WhatsApp Client...');
  connectionStatus = 'CONNECTING';
  await updateServiceConfig('whatsapp_status', 'CONNECTING');

  // Pastikan folder session ada
  fs.mkdirSync(config.waSessionPath, { recursive: true });

  const client = new Client({
    authStrategy: new LocalAuth({
      dataPath: path.resolve(config.waSessionPath),
    }),
    webVersionCache: {
      type: 'remote',
      remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
    },
    puppeteer: {
      headless: true,
      executablePath: config.chromeBin || undefined,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--disable-gpu',
        '--disable-extensions',
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      ],
    },
  });

  client.on('qr', async (qr: string) => {
    connectionStatus = 'QR_READY';
    try {
      qrCodeBase64 = await qrcode.toDataURL(qr);
      await updateServiceConfig('whatsapp_status', 'QR_READY');
      await updateServiceConfig('whatsapp_qr', qrCodeBase64);
      console.log('[WA] New QR Code generated. Scan to login.');
    } catch (err: any) {
      console.error('[WA] Failed to generate QR Code:', err.message);
    }
  });

  client.on('loading_screen', (percent: any, message: any) => {
    console.log(`[WA-LOAD] ${percent}% ${message || ''}`);
  });

  client.on('ready', async () => {
    connectionStatus = 'CONNECTED';
    connectedAt = new Date();
    qrCodeBase64 = '';
    await updateServiceConfig('whatsapp_status', 'CONNECTED');
    await updateServiceConfig('whatsapp_qr', '');
    await updateServiceConfig('whatsapp_last_connected', new Date().toISOString());
    console.log('[WA] WhatsApp client is READY and CONNECTED.');

    if (client.pupPage) {
      client.pupPage.on('console', (msg: any) => {
        if (msg.type() === 'error') {
          console.error(`[BROWSER-CONSOLE-ERROR] ${msg.text()}`);
        }
      });
      client.on('error', (err: any) => {
        console.error('[WA-ERROR] Client error:', err);
      });
    }

    // Pre-populate groups setelah 15 detik (biar web client selesai sync)
    setTimeout(async () => {
      try {
        await syncGroupsFromClient(client);
      } catch (err: any) {
        console.error('[WA] Error loading chats on startup:', err.message);
      }
    }, 15000);
  });

  client.on('disconnected', async (reason: string) => {
    connectionStatus = 'DISCONNECTED';
    connectedAt = null;
    qrCodeBase64 = '';
    clientInstance = null; // izinkan re-init pada panggilan berikutnya
    await updateServiceConfig('whatsapp_status', 'DISCONNECTED');
    await updateServiceConfig('whatsapp_qr', '');
    console.log('[WA] WhatsApp client disconnected:', reason);
  });

  client.on('auth_failure', async (msg: string) => {
    console.error('[WA] Authentication failure:', msg);
    connectionStatus = 'DISCONNECTED';
    connectedAt = null;
    clientInstance = null;
    await updateServiceConfig('whatsapp_status', 'DISCONNECTED');
  });

  client.on('message_create', async (msg: any) => {
    await handleIncomingMessage(msg);
  });

  // Pasang instance SEBELUM initialize untuk mencegah init bersamaan dari polling
  clientInstance = client;

  // Fire-and-forget (long-running, tidak block API)
  client.initialize().catch(async (err: any) => {
    console.error('[WA] Client initialization error:', err.message);
    connectionStatus = 'DISCONNECTED';
    clientInstance = null;
    await updateServiceConfig('whatsapp_status', 'DISCONNECTED');
  });

  // WATCHDOG: jika tidak ada event QR/ready dalam 90 detik (mentok di loading),
  // hancurkan dan ulangi init (pola reference).
  const watchClient = client;
  setTimeout(() => {
    if (connectionStatus !== 'CONNECTING' || clientInstance !== watchClient) return;
    console.warn('[WA-WATCHDOG] Tidak ada event QR/ready setelah 90 detik, restart client...');
    watchClient.destroy().catch((e: any) => console.warn('[WA-WATCHDOG] Destroy error:', e.message));
    clientInstance = null;
    connectionStatus = 'DISCONNECTED';
    qrCodeBase64 = '';
    updateServiceConfig('whatsapp_status', 'DISCONNECTED').catch(() => {});
    updateServiceConfig('whatsapp_qr', '').catch(() => {});
    setTimeout(() => {
      initWhatsapp().catch((e) => console.error('[WA-WATCHDOG] Re-init error:', e.message));
    }, 5000);
  }, WATCHDOG_MS);

  return client;
}

export async function stopWhatsapp(): Promise<void> {
  if (clientInstance) {
    console.log('[WA] Stopping WhatsApp Client...');
    try {
      await clientInstance.destroy();
      clientInstance = null;
      connectionStatus = 'DISCONNECTED';
      connectedAt = null;
      await updateServiceConfig('whatsapp_status', 'DISCONNECTED');
      await updateServiceConfig('whatsapp_qr', '');
      console.log('[WA] WhatsApp client stopped successfully.');
    } catch (err: any) {
      console.error('[WA] Error stopping client:', err.message);
    }
  }
}

export async function restartWhatsapp(): Promise<void> {
  await stopWhatsapp();
  initCooldownUntil = 0;
  await initWhatsapp();
}

export async function sendWhatsappMessage(jid: string, message: string): Promise<boolean> {
  if (connectionStatus !== 'CONNECTED' || !clientInstance) {
    console.warn(`[WA] Cannot send message, bot is not connected. Status: ${connectionStatus}`);
    return false;
  }
  try {
    await clientInstance.sendMessage(jid, message);
    console.log(`[WA] Sent message to ${jid}`);
    return true;
  } catch (err: any) {
    console.error(`[WA] Failed to send message to ${jid}:`, err.message);
    return false;
  }
}

export async function downloadMediaCustom(client: any, messageId: string): Promise<any> {
  const parts = messageId.split('_');
  const uniqueId = parts[2] || messageId;

  return await client.pupPage.evaluate(async (msgId: string, uniqId: string) => {
    // 1. Try to find in model cache by unique ID
    let msg = (window as any).require('WAWebCollections').Msg.getModelsArray().find(
      (m: any) => m.id && (m.id.id === uniqId || m.id._serialized === msgId)
    );

    // 2. Try to get it by ID
    if (!msg) {
      try {
        msg = (window as any).require('WAWebCollections').Msg.get(msgId);
      } catch (e) {}
    }

    // 3. Try to get from database/server (with try-catch to prevent DataError crash)
    if (!msg) {
      try {
        const res = await (window as any).require('WAWebCollections').Msg.getMessagesById([msgId]);
        if (res && res.messages && res.messages.length) {
          msg = res.messages[0];
        }
      } catch (e) {}
    }

    if (!msg || !msg.mediaData) {
      return null;
    }

    if (msg.mediaData.mediaStage !== 'RESOLVED' && msg.mediaData.mediaStage !== 'REUPLOADING') {
      try {
        await msg.downloadMedia({
          downloadEvenIfExpensive: true,
          rmrReason: 1,
        });
      } catch (e) {}
    }

    if (msg.mediaData.mediaStage.includes('ERROR') || msg.mediaData.mediaStage === 'FETCHING') {
      return null;
    }

    try {
      const mockQpl = {
        addAnnotations: function () { return this; },
        addPoint: function () { return this; },
      };
      const decryptedMedia = await (window as any)
        .require('WAWebDownloadManager')
        .downloadManager.downloadAndMaybeDecrypt({
          directPath: msg.directPath,
          encFilehash: msg.encFilehash,
          filehash: msg.filehash,
          mediaKey: msg.mediaKey,
          mediaKeyTimestamp: msg.mediaKeyTimestamp,
          type: msg.type,
          signal: new AbortController().signal,
          downloadQpl: mockQpl,
        });

      const data = await (window as any).WWebJS.arrayBufferToBase64Async(decryptedMedia);
      return {
        data,
        mimetype: msg.mimetype,
        filename: msg.filename || null,
      };
    } catch (e) {
      return null;
    }
  }, messageId, uniqueId);
}