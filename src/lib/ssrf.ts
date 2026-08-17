import dns from 'dns/promises';

/**
 * SSRF protection untuk webhook URL.
 *
 * Kebijakan (approved):
 * - Production (default): alamat private/internal/loopback DIBLOKIR.
 * - Development: hanya bisa diizinkan lewat WEBHOOK_ALLOW_PRIVATE_IP=true.
 * Validasi dijalankan: sebelum URL disimpan, sebelum webhook test, dan
 * sebelum setiap delivery (re-check DNS per attempt — mitigasi rebinding).
 */

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return false;
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 224) return true; // multicast
  if (a >= 240) return true; // reserved
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const low = ip.toLowerCase();
  if (low === '::' || low === '::1') return true; // unspecified / loopback
  if (low.startsWith('fc') || low.startsWith('fd')) return true; // fc00::/7 ULA
  if (low.startsWith('fe80')) return true; // link-local
  if (low.startsWith('::ffff:')) return isPrivateIpv4(low.slice(7)); // IPv4-mapped
  return false;
}

export function isPrivateIp(ip: string): boolean {
  const v4 = isPrivateIpv4(ip);
  if (v4) return true;
  return isPrivateIpv6(ip);
}

interface ValidatedUrl {
  url: URL;
  ip: string;
}

/** Validate URL string + DNS resolve + kebijakan private IP. */
export async function resolveSafeWebhookUrl(
  rawUrl: string,
  opts: { allowPrivateIp: boolean }
): Promise<ValidatedUrl> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('webhook_url tidak valid');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('webhook_url harus http/https');
  }
  if (url.username || url.password) {
    throw new Error('webhook_url tidak boleh mengandung credential');
  }
  if (url.hash) {
    throw new Error('webhook_url tidak boleh mengandung fragment');
  }

  const hostname = url.hostname;
  let addresses: string[];
  try {
    addresses = (await dns.lookup(hostname, { all: true })).map((a) => a.address);
  } catch {
    throw new Error(`webhook_url tidak dapat di-resolve: ${hostname}`);
  }
  if (addresses.length === 0) {
    throw new Error('webhook_url tidak memiliki alamat IP');
  }

  const blocked = addresses.filter((ip) => isPrivateIp(ip));
  if (blocked.length > 0 && !opts.allowPrivateIp) {
    throw new Error(
      `webhook_url mengarah ke alamat private/internal (${blocked.join(', ')}). ` +
        'Aktifkan WEBHOOK_ALLOW_PRIVATE_IP=true hanya untuk development.'
    );
  }

  return { url, ip: addresses[0] };
}