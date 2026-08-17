import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';

interface Application {
  id: string;
  name: string;
  webhookUrl: string | null;
  enabled: boolean;
  subscriptionCount: number;
  createdAt: string;
  updatedAt: string;
  token?: string;
}

export default function ApplicationsPage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState<{ name: string; token: string } | null>(null);

  const [name, setName] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');

  const load = useCallback(() => {
    api<Application[]>('/api/applications')
      .then(setApps)
      .catch((e) => setErr(e?.message || 'Gagal memuat aplikasi'));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setErr('');
    try {
      const created = await api<Application & { token: string }>('/api/applications', {
        method: 'POST',
        body: JSON.stringify({ name, webhookUrl: webhookUrl.trim() || undefined }),
      });
      setNewToken({ name: created.name, token: created.token });
      setName('');
      setWebhookUrl('');
      setCreating(false);
      load();
    } catch (e2: any) {
      setErr(e2?.message || 'Gagal membuat aplikasi');
    }
  }

  async function toggle(app: Application) {
    try {
      await api(`/api/applications/${app.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: !app.enabled }),
      });
      load();
    } catch (e: any) {
      setErr(e?.message || 'Gagal mengubah status');
    }
  }

  async function rotate(app: Application) {
    if (!window.confirm(`Rotate token untuk "${app.name}"? Token lama tidak berlaku lagi.`)) return;
    try {
      const r = await api<{ token: string }>(`/api/applications/${app.id}/rotate-token`, {
        method: 'POST',
      });
      setNewToken({ name: app.name, token: r.token });
    } catch (e: any) {
      setErr(e?.message || 'Gagal rotate token');
    }
  }

  async function testWebhook(app: Application) {
    setNotice('');
    try {
      const r = await api<{ ok: boolean; status?: number; error?: string }>(
        `/api/applications/${app.id}/test-webhook`,
        { method: 'POST' }
      );
      setNotice(
        r.ok
          ? `Webhook "${app.name}" OK (HTTP ${r.status}).`
          : `Webhook "${app.name}" gagal: ${r.error || r.status || ''}`
      );
    } catch (e: any) {
      setNotice(`Webhook "${app.name}" gagal: ${e?.message || ''}`);
    }
  }

  async function remove(app: Application) {
    if (!window.confirm(`Hapus aplikasi "${app.name}" beserta subscription-nya?`)) return;
    try {
      await api(`/api/applications/${app.id}`, { method: 'DELETE' });
      load();
    } catch (e: any) {
      setErr(e?.message || 'Gagal menghapus');
    }
  }

  return (
    <>
      <h1>Applications</h1>
      <p className="page-sub">Aplikasi client yang berlangganan WhatsApp — autentikasi per aplikasi</p>

      {err && <div className="msg error">{err}</div>}
      {notice && <div className="msg info">{notice}</div>}

      {newToken && (
        <div className="card mb">
          <h3 style={{ marginTop: 0 }}>Token dibuat — simpan sekarang!</h3>
          <p className="page-sub">Token hanya ditampilkan sekali dan tidak bisa dilihat lagi.</p>
          <div className="token-box">{newToken.token}</div>
          <p className="page-sub">
            Aplikasi <b>{newToken.name}</b>: gunakan <span className="mono">Authorization: Bearer {newToken.token.substring(0, 8)}…</span>
          </p>
          <button onClick={() => setNewToken(null)}>Tutup</button>
        </div>
      )}

      <div className="card mb">
        <h3 style={{ marginTop: 0 }}>Tambah Aplikasi</h3>
        {creating ? (
          <form onSubmit={onCreate}>
            <div className="form-row">
              <label>Nama aplikasi</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Contoh: PLTD Monitoring" />
            </div>
            <div className="form-row">
              <label>Webhook URL (opsional — tujuan delivery event)</label>
              <input value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://app.example.com/webhook/wa" />
            </div>
            <div className="row-flex">
              <button className="primary" type="submit">Buat</button>
              <button type="button" onClick={() => setCreating(false)}>Batal</button>
            </div>
          </form>
        ) : (
          <button className="primary" onClick={() => setCreating(true)}>+ Tambah aplikasi</button>
        )}
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Nama</th>
              <th>Status</th>
              <th>Webhook</th>
              <th>Subscriptions</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {apps.length === 0 && (
              <tr>
                <td colSpan={5}>Belum ada aplikasi.</td>
              </tr>
            )}
            {apps.map((a) => (
              <tr key={a.id}>
                <td>{a.name}</td>
                <td>
                  {a.enabled ? <span className="badge ok">enabled</span> : <span className="badge muted">disabled</span>}
                </td>
                <td>
                  {a.webhookUrl ? (
                    <span className="mono">{a.webhookUrl}</span>
                  ) : (
                    <span className="badge warn">belum diisi</span>
                  )}
                </td>
                <td>{a.subscriptionCount}</td>
                <td>
                  <div className="row-flex">
                    <button onClick={() => toggle(a)}>{a.enabled ? 'Disable' : 'Enable'}</button>
                    <button onClick={() => rotate(a)}>Rotate token</button>
                    <button onClick={() => testWebhook(a)}>Test webhook</button>
                    <button className="danger" onClick={() => remove(a)}>Hapus</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}