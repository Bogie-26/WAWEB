import { useEffect, useState } from 'react';
import { api } from '../api';

interface StatusData {
  service: {
    serviceName: string;
    serviceVersion: string;
    retentionHours: number;
    startedAt: string;
    nodeVersion: string;
  };
  uptimeSeconds: number;
  startedAt: string;
  whatsapp: {
    status: string;
    qr: string;
    connectedAt: string | null;
    uptimeSeconds: number;
    lastConnected: string | null;
    library: string;
  };
  counts: { groups: number; applications: number; subscriptions: number };
  health: string;
}

function statusBadge(status: string) {
  if (status === 'CONNECTED') return <span className="badge ok">CONNECTED</span>;
  if (status === 'QR_READY') return <span className="badge warn">QR_READY</span>;
  if (status === 'CONNECTING') return <span className="badge info">INITIALIZING</span>;
  return <span className="badge err">DISCONNECTED</span>;
}

function fmtDur(sec: number): string {
  if (!sec || sec <= 0) return '-';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

export default function DashboardPage() {
  const [data, setData] = useState<StatusData | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    const load = () =>
      api<StatusData>('/api/status')
        .then((d) => alive && setData(d))
        .catch((e) => alive && setErr(e?.message || 'Gagal memuat status'));
    load();
    const t = setInterval(load, 10000); // auto-refresh status
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (!data) return err ? <div className="msg error">{err}</div> : <p>Memuat...</p>;

  return (
    <>
      <h1>Dashboard</h1>
      <p className="page-sub">Status umum layanan WhatsApp Service</p>

      <div className="grid">
        <div className="stat">
          <div className="label">WhatsApp Status</div>
          <div className="value">{statusBadge(data.whatsapp.status)}</div>
        </div>
        <div className="stat">
          <div className="label">Groups</div>
          <div className="value">{data.counts.groups}</div>
        </div>
        <div className="stat">
          <div className="label">Applications</div>
          <div className="value">{data.counts.applications}</div>
        </div>
        <div className="stat">
          <div className="label">Subscriptions</div>
          <div className="value">{data.counts.subscriptions}</div>
        </div>
        <div className="stat">
          <div className="label">Service Uptime</div>
          <div className="value" style={{ fontSize: 18 }}>{fmtDur(data.uptimeSeconds)}</div>
        </div>
        <div className="stat">
          <div className="label">Health</div>
          <div className="value" style={{ fontSize: 16 }}>{data.health}</div>
        </div>
      </div>

      {data.whatsapp.status === 'QR_READY' && data.whatsapp.qr && (
        <div className="card mb">
          <h3 style={{ marginTop: 0 }}>Scan QR untuk menghubungkan WhatsApp</h3>
          <div className="qr-box">
            <img src={data.whatsapp.qr} alt="WhatsApp QR Code" />
          </div>
        </div>
      )}

      <div className="card">
        <table>
          <tbody>
            <tr>
              <th>WhatsApp session</th>
              <td>
                {data.whatsapp.status}
                {data.whatsapp.lastConnected ? ` — terakhir terkoneksi ${new Date(data.whatsapp.lastConnected).toLocaleString('id-ID')}` : ''}
              </td>
            </tr>
            <tr>
              <th>Service version</th>
              <td>{data.service.serviceName} v{data.service.serviceVersion} (Node {data.service.nodeVersion})</td>
            </tr>
            <tr>
              <th>Event retention</th>
              <td>{data.service.retentionHours} jam (body pesan untuk recovery — tidak tampil di sini)</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}