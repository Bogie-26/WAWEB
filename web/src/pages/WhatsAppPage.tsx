import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';

interface StatusData {
  whatsapp: {
    status: string;
    qr: string;
    connectedAt: string | null;
    uptimeSeconds: number;
    lastConnected: string | null;
    library: string;
  };
  service: { serviceVersion: string };
}

function badge(status: string) {
  if (status === 'CONNECTED') return <span className="badge ok">CONNECTED</span>;
  if (status === 'QR_READY') return <span className="badge warn">QR_READY</span>;
  if (status === 'CONNECTING') return <span className="badge info">INITIALIZING</span>;
  return <span className="badge err">DISCONNECTED</span>;
}

export default function WhatsAppPage() {
  const [data, setData] = useState<StatusData | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(() => {
    api<StatusData>('/api/status')
      .then(setData)
      .catch((e) => setErr(e?.message || 'Gagal memuat status'));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  async function reconnect() {
    setBusy(true);
    setNotice('');
    try {
      const r = await api<{ status: string }>('/api/whatsapp/reconnect', { method: 'POST' });
      setNotice(`Reconnect dipicu (${r.status}).`);
      setTimeout(load, 3000);
    } catch (e: any) {
      setNotice(`Gagal reconnect: ${e?.message || ''}`);
    } finally {
      setBusy(false);
    }
  }

  if (!data) return err ? <div className="msg error">{err}</div> : <p>Memuat...</p>;

  return (
    <>
      <h1>WhatsApp</h1>
      <p className="page-sub">Koneksi &amp; QR client — QR berasal dari event whatsapp-web.js</p>

      {notice && <div className="msg info">{notice}</div>}

      <div className="grid">
        <div className="stat">
          <div className="label">Connection Status</div>
          <div className="value">{badge(data.whatsapp.status)}</div>
        </div>
        <div className="stat">
          <div className="label">Session Status</div>
          <div className="value" style={{ fontSize: 15 }}>
            {data.whatsapp.lastConnected
              ? `Terakhir terhubung ${new Date(data.whatsapp.lastConnected).toLocaleString('id-ID')}`
              : 'Belum pernah terhubung'}
          </div>
        </div>
        <div className="stat">
          <div className="label">Library</div>
          <div className="value" style={{ fontSize: 15 }}>{data.whatsapp.library}</div>
        </div>
      </div>

      {data.whatsapp.status === 'QR_READY' && data.whatsapp.qr && (
        <div className="card mb">
          <h3 style={{ marginTop: 0 }}>Scan QR dengan WhatsApp</h3>
          <div className="qr-box">
            <img src={data.whatsapp.qr} alt="WhatsApp QR Code" />
          </div>
          <p className="page-sub">QR baru muncul otomatis dan kadaluarsa bila tidak di-scan.</p>
        </div>
      )}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Actions</h3>
        <p className="page-sub">Restart aman: destroy client lalu inisialisasi ulang (QR baru bila sesi hilang).</p>
        <button className="primary" onClick={reconnect} disabled={busy}>
          {busy ? 'Memproses...' : 'Reconnect / restart client'}
        </button>
      </div>
    </>
  );
}