import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';

interface Group {
  id: string;
  name: string;
  isGroup: boolean;
  lastSeenAt: string;
  subscriptionCount: number;
}

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<Group[]>('/api/groups')
      .then(setGroups)
      .catch((e) => setErr(e?.message || 'Gagal memuat grup'));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function refresh() {
    setBusy(true);
    setNotice('');
    try {
      const r = await api<{ synced: number }>('/api/groups/refresh', { method: 'POST' });
      setNotice(`Sinkronisasi selesai: ${r.synced} grup dari client.`);
      load();
    } catch (e: any) {
      setNotice(`Gagal refresh: ${e?.message || ''}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>Groups</h1>
      <p className="page-sub">Daftar grup WhatsApp yang terdeteksi — tanpa isi pesan</p>

      {notice && <div className="msg info">{notice}</div>}
      {err && <div className="msg error">{err}</div>}

      <div className="card mb">
        <div className="row-flex">
          <span className="page-sub" style={{ margin: 0 }}>
            Sinkronkan daftar grup langsung dari client WhatsApp web.
          </span>
          <button onClick={refresh} disabled={busy} className="primary">
            {busy ? 'Menyinkronkan...' : 'Refresh groups'}
          </button>
        </div>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Nama Group</th>
              <th>Group ID</th>
              <th>Status</th>
              <th>Subscriber</th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 && (
              <tr>
                <td colSpan={4}>Belum ada grup terdeteksi. Hubungkan WhatsApp dulu (QR), lalu refresh.</td>
              </tr>
            )}
            {groups.map((g) => (
              <tr key={g.id}>
                <td>{g.name}</td>
                <td className="mono">{g.id}</td>
                <td>
                  <span className="badge ok">active</span>
                </td>
                <td>{g.subscriptionCount} aplikasi</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}