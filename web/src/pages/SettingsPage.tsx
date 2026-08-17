import { useEffect, useState } from 'react';
import { api } from '../api';

interface SettingsData {
  public: {
    serviceName: string;
    serviceVersion: string;
    retentionHours: number;
    webhookTimeoutMs: number;
    webhookAllowPrivateIp: boolean;
    adminUsername: string;
    startedAt: string;
    nodeVersion: string;
    platform: string;
  };
  uptimeSeconds: number;
  stored: {
    whatsapp_status: string;
    whatsapp_last_connected: string | null;
  };
}

export default function SettingsPage() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api<SettingsData>('/api/settings')
      .then(setData)
      .catch((e) => setErr(e?.message || 'Gagal memuat settings'));
  }, []);

  if (!data) return err ? <div className="msg error">{err}</div> : <p>Memuat...</p>;

  return (
    <>
      <h1>Settings</h1>
      <p className="page-sub">Konfigurasi &amp; informasi runtime — credential tidak ditampilkan</p>

      <div className="card mb">
        <h3 style={{ marginTop: 0 }}>Service</h3>
        <table>
          <tbody>
            <tr>
              <th>Nama layanan</th>
              <td>{data.public.serviceName} v{data.public.serviceVersion}</td>
            </tr>
            <tr>
              <th>Runtime</th>
              <td>
                Node {data.public.nodeVersion} ({data.public.platform})
              </td>
            </tr>
            <tr>
              <th>Admin user</th>
              <td>{data.public.adminUsername}</td>
            </tr>
            <tr>
              <th>Started at</th>
              <td>{new Date(data.public.startedAt).toLocaleString('id-ID')}</td>
            </tr>
            <tr>
              <th>Uptime</th>
              <td>{Math.floor(data.uptimeSeconds / 3600)} jam {Math.floor((data.uptimeSeconds % 3600) / 60)} menit</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card mb">
        <h3 style={{ marginTop: 0 }}>Webhook &amp; Event</h3>
        <table>
          <tbody>
            <tr>
              <th>Event retention</th>
              <td>{data.public.retentionHours} jam (body pesan sementara untuk recovery — bukan arsip)</td>
            </tr>
            <tr>
              <th>Webhook timeout</th>
              <td>{data.public.webhookTimeoutMs} ms</td>
            </tr>
            <tr>
              <th>SSRF protection (private IP)</th>
              <td>
                {data.public.webhookAllowPrivateIp ? (
                  <span className="badge warn">diizinkan (development)</span>
                ) : (
                  <span className="badge ok">diblokir (production)</span>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>WhatsApp Session</h3>
        <table>
          <tbody>
            <tr>
              <th>Status tersimpan</th>
              <td>{data.stored.whatsapp_status}</td>
            </tr>
            <tr>
              <th>Terakhir terhubung</th>
              <td>
                {data.stored.whatsapp_last_connected
                  ? new Date(data.stored.whatsapp_last_connected).toLocaleString('id-ID')
                  : '-'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}