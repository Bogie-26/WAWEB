import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { prisma } from './db.js';
import { config } from '../config.js';

// ── Admin (JWT) ─────────────────────────────────────────────────────────

export function createAdminToken(): string {
  return jwt.sign({ sub: 'admin', role: 'admin' }, config.jwtSecret, { expiresIn: '12h' });
}

export function verifyAdminToken(token: string): boolean {
  try {
    jwt.verify(token, config.jwtSecret);
    return true;
  } catch {
    return false;
  }
}

export function verifyAdminPassword(password: string): boolean {
  if (!config.adminPasswordHash) return false;
  return bcrypt.compareSync(password, config.adminPasswordHash);
}

// ── Application tokens (opaque, hashed) ─────────────────────────────────

export function generateAppToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ── Webhook signature (HMAC-SHA256) ─────────────────────────────────────

export function webhookSignatureHex(secret: string, rawBody: string): string {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

// ── Express middleware ──────────────────────────────────────────────────

function bearerToken(req: Request): string | null {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return null;
  return h.slice(7).trim() || null;
}

/** Web admin — JWT Bearer. */
export const requireAdmin: RequestHandler = (req, res, next) => {
  const t = bearerToken(req);
  if (!t || !verifyAdminToken(t)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
};

/** Aplikasi subscriber — token aplikasi (sha256 lookup, harus enabled). */
export const requireApplication: RequestHandler = async (req, res, next) => {
  const t = bearerToken(req);
  if (!t) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const application = await prisma.application.findUnique({
      where: { tokenHash: hashToken(t) },
    });
    if (!application || !application.enabled) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    (req as unknown as { application: NonNullable<typeof application> }).application = application;
    next();
  } catch {
    res.status(500).json({ error: 'internal_error' });
  }
};

export type AuthenticatedRequest = Request & { application: NonNullable<Awaited<ReturnType<typeof prisma.application.findUnique>>> };

// ── error wrapper ───────────────────────────────────────────────────────

export function asyncHandler(
  fn: (req: any, res: Response, next: NextFunction) => Promise<void>
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

export function httpError(msg: string, status = 400) {
  const e = new Error(msg) as Error & { status?: number };
  e.status = status;
  return e;
}