import { Router } from 'express';
import { requireAdmin, requireApplication, asyncHandler, AuthenticatedRequest } from '../lib/auth.js';
import { prisma } from '../lib/db.js';
import { getBotState, sendWhatsappMessage } from '../whatsapp/client.js';
import { rateLimit } from '../lib/rateLimit.js';

export const messagesRouter = Router();

function validateMessageReq(body: any): { jid: string; message: string } | null {
  const { groupId, to, message } = body ?? {};
  const jid: string = groupId ?? to;
  if (typeof jid !== 'string' || !jid) return null;
  if (typeof message !== 'string' || !message.trim()) return null;
  return { jid: jid.trim(), message: message.trim() };
}

messagesRouter.post('/send-group', rateLimit(20, 60_000, 'send'), requireApplication, asyncHandler(
  async (req: AuthenticatedRequest, res) => {
    const v = validateMessageReq(req.body);
    if (!v) {
      res.status(400).json({ error: 'groupId dan message wajib' });
      return;
    }
    if (!v.jid.endsWith('@g.us')) {
      res.status(400).json({ error: 'groupId harus @g.us' });
      return;
    }

    // Aplikasi hanya boleh kirim ke grup yang di-subscribe
    const sub = await prisma.subscription.findUnique({
      where: { applicationId_groupJid: { applicationId: req.application.id, groupJid: v.jid } },
    });
    if (!sub || !sub.enabled) {
      res.status(403).json({ error: 'Aplikasi tidak subscribe ke grup ini' });
      return;
    }

    if (getBotState().status !== 'CONNECTED') {
      res.status(503).json({ error: 'WhatsApp belum terhubung' });
      return;
    }
    const ok = await sendWhatsappMessage(v.jid, v.message);
    if (!ok) {
      res.status(502).json({ error: 'Gagal mengirim pesan' });
      return;
    }
    res.json({ ok: true });
  }
));

messagesRouter.post('/send', rateLimit(20, 60_000, 'send'), requireAdmin, asyncHandler(
  async (req, res) => {
    const v = validateMessageReq(req.body);
    if (!v) {
      res.status(400).json({ error: 'to dan message wajib' });
      return;
    }
    if (getBotState().status !== 'CONNECTED') {
      res.status(503).json({ error: 'WhatsApp belum terhubung' });
      return;
    }
    const ok = await sendWhatsappMessage(v.jid, v.message);
    if (!ok) {
      res.status(502).json({ error: 'Gagal mengirim pesan' });
      return;
    }
    res.json({ ok: true });
  }
));