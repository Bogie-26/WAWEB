# WA Service — Progress Documentation

Status terakhir: **Deployment production VPS berhasil (2026-08-17). WA Service berjalan di VPS pada port 3006, WhatsApp CONNECTED dengan session tersimpan di Docker volume, seluruh verifikasi runtime PASS.**

Dokumen ini mencatat hal-hal yang **benar-benar dibuat dan terbukti ada di dalam code** serta temuan runtime dari pengembangan dan deployment.

---

## 1. Ringkasan

Project **WA Service** dibangun di folder `WAWEB/` — layanan WhatsApp terpusat berbasis `whatsapp-web.js` untuk banyak aplikasi client.

- Project existing `rownewgit/pln-luwuk-monitoring` **tidak pernah diubah** (read-only, hanya dijadikan referensi untuk pola whatsapp-web.js).
- Commit pertama (`314dcf0 feat: initial wa service implementation`, branch `develop`) telah dibuat dan di-push ke `https://github.com/Bogie-26/WAWEB.git`.
- Deployment production dilakukan di VPS `187.127.98.175` (SSH port 22022, user root) di `/opt/wawweb` pada commit `314dcf0`.
- Aplikasi existing di VPS (pln_luwuk_web :3005, pohon3-app :3000, smart_expense_* :3001/:5003, cx100luwuk_monitor :5002) **tidak disentuh**.
- Berkas penunjang pengetesan ditambahkan secara lokal dalam folder `scripts/` (check-db, check-status, save-qr, update-webhook, seed-test) tanpa menyentuh source code utama — **tidak di-commit**.

Sumber keputusan: `baca.txt` (requirement) → `docs/implementation_plan.md` (plan yang di-approve dengan 2 adjustment) → implementasi Phase 1 → Runtime Test → Commit & Push → Deployment VPS.

## 2. Fakta verifikasi lingkungan (saat pekerjaan dijalankan)

| Item | Hasil |
|---|---|
| `node -v` | v24.16.0 |
| `npm -v` | 11.13.0 |
| `git --version` | 2.55.0.windows.3 |
| `docker --version` | 29.6.2 |
| `docker compose version` | v5.3.1 |
| Docker daemon (Docker Desktop) | **TIDAK berjalan** → `docker compose build` gagal dengan error: `failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine` |

## 3. File yang benar-benar ada (diverifikasi via glob)

```
WAWEB/
├── .env.example                (template env — .env dibuat langsung di VPS, TIDAK di-commit)
├── .gitignore
├── baca.txt                    (requirement asli)
├── Dockerfile
├── docker-compose.yml
├── package.json
├── package-lock.json
├── tsconfig.json
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│       ├── migration_lock.toml
│       └── 0001_init/migration.sql      (120 baris DDL, dihasilkan `prisma migrate diff`)
├── scripts/
│   └── hash-password.mjs                (tool bcrypt hash untuk ADMIN_PASSWORD_HASH)
├── src/
│   ├── index.ts                         (entry Express + scheduler background)
│   ├── config.ts
│   ├── lib/
│   │   ├── db.ts                        (PrismaClient singleton + BigInt→string JSON)
│   │   ├── auth.ts                      (JWT admin, token aplikasi sha256, HMAC, middleware)
│   │   ├── rateLimit.ts                 (rate limiter in-memory)
│   │   └── ssrf.ts                      (blokir private/loopback IP webhook)
│   ├── whatsapp/
│   │   ├── client.ts                    (init, LocalAuth, QR, state, watchdog)
│   │   ├── groups.ts                    (listClientGroups + IndexedDB fallback)
│   │   └── lockCleaner.ts               (cleanChromiumLocks)
│   ├── services/
│   │   ├── events.ts                    (handler message_create → persist + enqueue)
│   │   ├── delivery.ts                  (webhook + retry eksponensial)
│   │   ├── recovery.ts                  (eventsAfter + ackCursor)
│   │   ├── applications.ts              (CRUD + token rotate + test webhook)
│   │   ├── subscriptions.ts
│   │   ├── retention.ts                 (purge event > EVENT_RETENTION_HOURS)
│   │   └── settings.ts                  (public settings + ServiceConfig)
│   └── routes/
│       ├── auth.ts                      (/api/auth/*)
│       ├── status.ts                    (/api/status, /api/health, /api/status/groups/refresh, reconnect, stop)
│       ├── groups.ts                    (GET /api/groups)
│       ├── applications.ts              (/api/applications CRUD + rotate + test-webhook)
│       ├── subscriptions.ts             (/api/subscriptions CRUD)
│       ├── client.ts                    (/api/client/* — status, groups, subscriptions utk aplikasi subscriber, requireApplication)
│       ├── messages.ts                  (POST /api/messages/send-group, /api/messages/send)
│       ├── internal.ts                  (GET /internal/events, /internal/events/ack, /internal/subscriptions)
│       └── settings.ts                  (GET /api/settings)
├── web/                                 (admin frontend React + Vite)
│   ├── package.json / package-lock.json
│   ├── index.html
│   ├── tsconfig.json
│   ├── vite.config.ts                   (proxy /api → localhost:3006 untuk dev)
│   └── src/
│       ├── api.ts                       (fetch wrapper + token localStorage)
│       ├── auth.tsx                     (AuthContext)
│       ├── App.tsx                      (routing + guard login)
│       ├── main.tsx
│       ├── styles.css
│       └── pages/
│           ├── LoginPage.tsx
│           ├── Layout.tsx               (menu: Dashboard, WhatsApp, Groups, Applications, Settings)
│           ├── DashboardPage.tsx
│           ├── WhatsAppPage.tsx
│           ├── GroupsPage.tsx
│           ├── ApplicationsPage.tsx
│           └── SettingsPage.tsx
├── dist/                                (HASIL BUILD backend — `npm run build`)
└── web/dist/                            (HASIL BUILD frontend — `npm run web:build`)
```

**TIDAK ada** di project: halaman/endpoint Messages, Inbox, Chats, Message History, Conversation, Message Viewer — baik di `src/routes/` maupun `web/src/`.

## 4. Database (fakta dari `prisma/schema.prisma` + migration.sql)

6 model, DDL di `prisma/migrations/0001_init/migration.sql` (dihasilkan `prisma migrate diff --from-empty`; **telah dijalankan nyata di VPS via `prisma migrate deploy` pada 2026-08-17**):

| Model | Kolom kunci |
|---|---|
| `Application` | id (uuid), name, tokenHash (unique), webhookUrl?, enabled |
| `Subscription` | unique(applicationId, groupJid), groupName snapshot |
| `WhatsappGroup` | jid (PK), name, lastSeenAt |
| `MessageEvent` | seq BigInt unique autoincrement (global high-water mark), body?, hasMedia |
| `EventDelivery` | unique(eventId, applicationId), status PENDING/SENT/DELIVERED/FAILED, attempts, nextRetryAt |
| `ApplicationCursor` | applicationId (PK), lastSeq |
| `ServiceConfig` | key/value |

## 5. 2 adjustment review yang benar-benar diterapkan di code

**A. Recovery cursor** — `src/services/recovery.ts`:
- `eventsAfter(applicationId, afterSeq, limit)` membaca `limit` baris global pertama (`seq > after`, asc) dari **semua** grup.
- Response hanya memuat event dari grup yang di-subscribe (filter `allowedGroups`, dibangun dari `Subscription` enabled).
- `next_cursor` = `seq` baris **terakhir yang diperiksa** (`rows[rows.length - 1].seq`) — termasuk event grup non-subscribe yang di-skip; `null` hanya jika baris < limit (tidak ada lagi).
- `ApplicationCursor` di-upsert dengan `lastExamined` saat recovery dibaca.
- API: `GET /internal/events?after=<seq>&limit=<1..500>` + `POST /internal/events/ack` (wajib Bearer aplikasi — `requireApplication`).

**B. SSRF protection** — `src/lib/ssrf.ts`:
- `resolveSafeWebhookUrl(url, {allowPrivateIp})` melakukan: parse URL, cek protokol http/https, tolak credential/fragment, DNS lookup `dns.lookup(hostname, {all:true})`, blokir IPv4 (0/8, 10/8, 100.64/10, 127/8, 169.254/16, 172.16/12, 192.168/16, 224/4, 240/4+) dan IPv6 (::, ::1, fc00::/7, fe80::/10, ::ffff:mapped).
- Dipanggil di 3 tempat: `src/services/applications.ts` (create + update), `testApplicationWebhook`, dan `src/services/delivery.ts` (per-attempt — setiap webhook delivery sebelum `fetch`).
- Kebijakan: `WEBHOOK_ALLOW_PRIVATE_IP=false` default (dari `src/config.ts`); dev harus set `true` eksplisit.

## 6. WhatsApp layer — fakta di code

Semua pola berikut ada di `src/whatsapp/*` dan merupakan port dari `src/lib/whatsapp.ts` project reference (tanpa business logic PLTD):

| Pola | File | Keterangan |
|---|---|---|
| `LocalAuth({dataPath})` + puppeteer args (no-sandbox, disable-dev-shm-usage, disable-quic, user-agent Chrome/122, dll) | `client.ts` | `executablePath` dari `CHROME_BIN` |
| State machine DISCONNECTED/CONNECTING/QR_READY/CONNECTED + `qrcode.toDataURL` | `client.ts` | status disimpan juga di `ServiceConfig` (`whatsapp_status`, `whatsapp_qr`, `whatsapp_last_connected`) |
| `message_create` + filter `@g.us` + `msg.fromMe ? msg.to : msg.from` | `client.ts` + `services/events.ts` | |
| `cleanChromiumLocks` | `lockCleaner.ts` | SingletonLock/SingletonCookie/SingletonSocket |
| `client.getChats()` dengan fallback IndexedDB `model-storage` (`chat` + `group-metadata`) | `groups.ts` | membuktikan: WA Web build 2.3000.x mematahkan getChats → fallback |
| Watchdog 90 detik + cooldown init 15 detik | `client.ts` | |
| `initialize()` fire-and-forget | `client.ts` | |
| Group pre-population 15 detik setelah `ready` | `client.ts` | |
| `client.pupPage.on('console')` error logging | `client.ts` | |

**Penting (fakta):** login WhatsApp/QR **belum pernah diuji** di lingkungan lokal/Windows, namun **terbukti berhasil di VPS production** (2026-08-17): `DISCONNECTED → CONNECTING → QR_READY → CONNECTED` via scan QR manual oleh user; session tersimpan di volume `wa_session` (`/app/.wwebjs_auth`).

## 7. Workshop delivery & recovery — fakta di code

- `services/events.ts`: persist `MessageEvent` → query `Subscription` enabled (dengan `application.enabled=true`) → buat `EventDelivery` → `triggerDelivery`.
- `services/delivery.ts`: payload `{event, eventId, messageId, groupId, groupName, senderId, senderName, timestamp, body}`; header `X-WA-Event-Id`, `X-WA-Timestamp`, `X-WA-Signature` (HMAC-SHA256 dengan secret = `tokenHash` — subscriber bisa menghitung ulang dari token mentahnya: HMAC(sha256hex(token), body)); timeout `WEBHOOK_TIMEOUT_MS`; retry backoff `[60s,5m,15m,1h,6h,24h]` → `FAILED` setelah 6 percobaan; sweeper tiap 30 detik mengadopsi `SENT` stale (120 dtk) & mengirim `PENDING` yang jatuh tempo.
- `services/retention.ts`: `purgeExpiredEvents()` menghapus `MessageEvent` dengan `createdAt < now - EVENT_RETENTION_HOURS` (default 72); job boot + interval 12 jam.
- Body pesan hanya muncul di `MessageEvent.body` dan payload webhook — **tidak ada** route admin yang membaca body.

## 8. API yang benar-benar diregistrasi (fakta dari `src/index.ts` + routes)

Prefix `requireAdmin` (JWT Bearer) untuk semua `/api/*` kecuali `/api/auth/login|logout`. App token (sha256, `requireApplication`) untuk `/api/messages/send-group` dan `/internal/*`.

| Method + Path | File route | Catatan |
|---|---|---|
| POST `/api/auth/login` | auth.ts | rate limit 5/menit/IP |
| POST `/api/auth/logout`, GET `/api/auth/me` | auth.ts | me = requireAdmin |
| GET `/api/status` | status.ts | status WA + QR + counts + uptime |
| GET `/api/health` | status.ts | cek DB `SELECT 1` + status WA |
| POST `/api/status/groups/refresh` | status.ts | sync grup dari client (409 bila belum CONNECTED) |
| POST `/api/status/whatsapp/reconnect` | status.ts | destroy + re-init |
| POST `/api/status/whatsapp/stop` | status.ts | destroy |
| GET `/api/groups` | groups.ts | id, name, isGroup, subscriptionCount — tanpa isi pesan |
| GET/POST `/api/applications` | applications.ts | POST kembalikan token sekali |
| PATCH `/api/applications/:id` | applications.ts | name/enabled/webhookUrl (webhook divalidasi SSRF) |
| POST `/api/applications/:id/rotate-token` | applications.ts | token baru, tampil sekali |
| POST `/api/applications/:id/test-webhook` | applications.ts | POST payload `{event:'test'}` |
| DELETE `/api/applications/:id` | applications.ts | cascade subscriptions |
| GET/POST/DELETE `/api/subscriptions` + PATCH `/:id` | subscriptions.ts | validasi `@g.us` + aplikasi ada |
| GET `/api/client/status` | client.ts | requireApplication — status ringkas utk aplikasi (db + whatsapp) |
| GET `/api/client/groups` | client.ts | requireApplication — daftar grup dikenal `[{id, name}]` |
| GET `/api/client/subscriptions` | client.ts | requireApplication — subscription milik aplikasi pemanggil |
| PUT `/api/client/subscriptions` | client.ts | requireApplication — sync subscription (upsert + disable yg tak ada) |
| POST `/api/messages/send-group` | messages.ts | requireApplication + wajib subscribe grup tsb (403 bila tidak), rate limit 20/menit |
| POST `/api/messages/send` | messages.ts | requireAdmin |
| GET `/api/settings` | settings.ts | public settings + uptime + stored status |
| GET `/internal/events` | internal.ts | requireApplication — recovery |
| POST `/internal/events/ack` | internal.ts | requireApplication |
| GET `/internal/subscriptions` | internal.ts | requireApplication |

## 9. Hasil verifikasi yang benar-benar dijalankan

| Perintah | Hasil |
|---|---|
| `npm install` | ✅ 354 packages (termasuk whatsapp-web.js + Chromium puppeteer) |
| `npm --prefix web install` | ✅ 71 packages |
| `npx prisma generate` | ✅ client generated |
| `npx prisma migrate diff --from-empty ... --script` → `migration.sql` | ✅ 120 baris DDL |
| `npm run typecheck` (backend) | ✅ 0 error |
| `npm run web:typecheck` | ✅ 0 error |
| `npm run build` (backend → `dist/`) | ✅ `dist/index.js` ada |
| `npm run web:build` (vite → `web/dist/`) | ✅ `index.html` + assets (js 183.19 kB, gzip 58.11 kB) |
| `docker compose config` (dengan env test) | ✅ OK — services: `wa-service-db`, `wa-service-web` |
| `docker compose build` | ❌ GAGAL — Docker daemon tidak berjalan (`npipe:////./pipe/dockerDesktopLinuxEngine`) — **hanya di mesin lokal**; berhasil di VPS |
| `git init -b develop` | ✅ branch `develop` |
| `git add -A` + `git status` | ✅ 54 file staged, **0 commit** (`git log` → fatal: tidak ada commit) |
| Commit + push (2026-08-17) | ✅ `314dcf0 feat: initial wa service implementation` di-push ke `origin/develop` |

## 10. Deployment VPS (production, 2026-08-17)

### Target
- VPS: `187.127.98.175` (SSH port `22022`, user `root`, hostname `srv1753618`)
- Direktori deploy: `/opt/wawweb` (git clone, **detached HEAD** di commit `314dcf0`)
- Repo: `https://github.com/Bogie-26/WAWEB.git` — branch `develop`

### Docker (terisolasi dari aplikasi lain)
| Item | Nilai |
|---|---|
| Project name | `wa-service` |
| Containers | `wa_service_db` (PostgreSQL 15, internal, tanpa host port) · `wa_service_web` (port `3006:3006`) |
| Volumes | `wa-service_wa_db_data` (DB) · `wa-service_wa_session` (`/app/.wwebjs_auth` — session WhatsApp) |
| Image | `wa-service-wa-service-web:latest` (multi-stage, Chromium `/usr/bin/chromium`) |
| Restart | `unless-stopped` |

### Environment (`.env` di `/opt/wawweb`, tidak di-commit)
- `PORT=3006`, `DATABASE_URL=postgresql://wa_service:<pw>@wa-service-db:5432/wa_service?schema=public`
- `ADMIN_USERNAME=admin` + `ADMIN_PASSWORD_HASH` (bcrypt)
- `JWT_SECRET` (acak), `WEBHOOK_ALLOW_PRIVATE_IP=false` (SSRF blokir aktif), `EVENT_RETENTION_HOURS=72`
- **Temuan penting**: `ADMIN_PASSWORD_HASH` di `.env` **harus memakai `$$` (double dollar)** karena docker compose menginterpolasi nilai `.env`; `$` tunggal membuat hash rusak (variabel `KMOEZ...` dianggap tidak diset). Kebalikan dari temuan WSL (Section 11) — di sana `$$` literal mematahkan bcrypt karena dijalankan langsung via `--env-file`.
- **Temuan penting**: host DB di `DATABASE_URL` harus `wa-service-db` (nama service compose), bukan `db` seperti contoh `.env.example` — `db` menyebabkan `P1001 Can't reach database server`.

### Status runtime
- WhatsApp: `CONNECTED` (scan QR manual oleh user di Admin Web, 2026-08-17 09:04 UTC)
- Group sync: **142 grup** tersync (IndexedDB fallback aktif), 0 invalid JID, 0 duplikat
- Session persistence: restart `wa_service_web` → langsung `CONNECTED` tanpa QR baru
- HTTP: `GET /api/health` → `{"status":"ok","db":true,"whatsapp":"QR_READY"}` (sebelum pairing) / `CONNECTED` (setelah)
- Login admin: `admin` / password yang dikonfigurasi — bcrypt verified

### Test pipeline (grup test: `Monitoring Laporan Logsheet UP3 Luwuk` — `120363428720515605@g.us`)
- **Outgoing**: `POST /api/messages/send-group` `WA_SERVICE_VPS_TEST_001` → `{"ok":true}`; grup non-subscribe → **403** ✅
- **Incoming**: pesan `WA_SERVICE_VPS_TEST_001/002` dari grup subscribe → `MessageEvent` (seq) → `EventDelivery` (status `FAILED`, `webhook_url tidak dikonfigurasi` — wajar, webhook belum dipasang) ✅
- **Recovery**: `GET /internal/events?after=0` → hanya event grup subscribe (filter berjalan), `POST /internal/events/ack {"after":"34"}` → `{"ok":true}`, `ApplicationCursor.lastSeq=34` ✅

### Aplikasi test
- `VPS Test Client` (id `32b27a9b-7d57-4ed5-8c29-147e0071dd96`) — **test only**, bukan PLTD. Token ditampilkan sekali saat create; dapat di-rotate via Admin Web.
- Subscription hanya ke grup logsheet di atas.

### Resource (steady-state)
- Load average: 0.55 · RAM available: 2.6Gi
- `wa_service_web`: 1.94% CPU / ~598 MiB · `wa_service_db`: 0% / ~55 MiB

## 11. Temuan Runtime & Aktivitas Phase 5B (lokal/WSL)

Selama inisiasi runtime test Phase 5B, beberapa temuan dan penyesuaian lingkungan telah diverifikasi:

- **WSL Node & DB Runtime**: PostgreSQL berjalan sukses di WSL. Aplikasi Node.js berhasil tersambung ke database dan tabel DDL termigrasi penuh serta berhasil di-seed (1 application, 1 subscription, 1 group).
* **Pembuatan `.env`**: Berkas `.env` dibuat secara lokal dari `.env.example` untuk testing di dalam WSL.
* **Perbaikan `.env` Pass Hash**: Ditemukan bahwa nilai `ADMIN_PASSWORD_HASH` di dalam `.env` berisi `$$` (double dollar) yang awalnya untuk escaping docker-compose. Ketika dijalankan langsung dengan `--env-file` Node.js, `$$` diproses secara literal dan mematahkan verifikasi bcrypt. Telah diperbaiki menjadi `$` tunggal sehingga login admin web (`admin` / `admin123`) sukses dijalankan.
* **WhatsApp QR & Session Lifecycle**: Puppeteer meluncurkan browser Chrome dengan sukses. Status WhatsApp client berganti dari `DISCONNECTED` → `CONNECTING` → `QR_READY` di database. Berkas lock Chromium (`SingletonLock` dkk) dibersihkan secara otomatis.
* **Rate Limiter & Sesi**: Percobaan login berturut-turut memicu rate limiter in-memory (Map `buckets`). Masalah "Too many requests" atau "Sesi berakhir" berhasil diatasi dengan me-restart Express server untuk meriset map tersebut di memory.

## 12. Hal yang TIDAK dilakukan (batas lingkup)

- Tidak commit/push/merge untuk repo lain; hanya commit `314dcf0` + push `origin/develop` untuk WAWEB.
- Tidak mengubah satu pun file di `rownewgit/pln-luwuk-monitoring` dan `rownewgit/pohon3`.
- Aplikasi existing di VPS (`pln_luwuk_web`, `pohon3-app`, `smart_expense_*`, `cx100luwuk_monitor`) **tidak disentuh/restart**.
- Tidak deploy PLTD; tidak menghubungkan webhook PLTD; tidak membuat Application PLTD.
- Tidak force push, tidak menyentuh `main`, tidak mengubah reverse proxy/firewall/sshd VPS.
- Webhook delivery belum diuji dengan receiver nyata (belum ada subscriber PLTD) — hanya sampai `EventDelivery`.
- Pengujian event recovery di WSL dibatalkan sebelum WhatsApp client berhasil ditautkan penuh; **di VPS recovery sudah teruji**.

---

*Dokumen ini ditulis dari fakta code & hasil command yang benar-benar dijalankan. Jika ada bagian yang ingin diverifikasi ulang, jalankan check di Section 9 atau akses Admin Web VPS (`http://187.127.98.175:3006`).*