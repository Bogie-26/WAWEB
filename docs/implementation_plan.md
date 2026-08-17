# WA Service — Implementation Plan

Project: **WA Service** — satu layanan WhatsApp terpusat berbasis `whatsapp-web.js` yang dapat digunakan oleh banyak aplikasi lain (PLTD Monitoring, App B, App C, dst).

Referensi: project existing `rownewgit/pln-luwuk-monitoring` **hanya untuk dibaca** (read-only). Tidak ada perubahan pada repo existing.

> Status: **PLAN ONLY**
> JANGAN coding sebelum plan ini di-approve.
> JANGAN commit/push/deploy/ubah project existing.

---

## 1. Architecture overview

```
WhatsApp ──► WA Service (Node.js + whatsapp-web.js)
               │
               ├─ PostgreSQL (database WA Service — TERPISAH dari PLTD)
               ├─ Webhook delivery + retry queue
               └─ Recovery API (cursor) untuk subscriber offline
               │
               ▼
        ┌────────┬─────────┬─────────┐
        ▼        ▼         ▼         ▼
      PLTD     App B     App C    (subscriber)
```

Prinsip:

- Service **generik**: tidak berisi Gemini, parser PLTD, schema PLTD, struktur laporan PLTD.
- WA Service hanya menyediakan layanan WhatsApp generik (connect, QR, session, group, send, receive, event delivery).
- Admin web hanya operasional: tidak pernah menampilkan isi pesan WhatsApp.

---

## 2. Technology stack

| Bagian | Pilihan | Catatan |
|---|---|---|
| Runtime | Node.js 20 LTS + TypeScript | sama dengan reference |
| WhatsApp | `whatsapp-web.js` `^1.34.7` + `LocalAuth` + Puppeteer/Chromium + `qrcode` | versi terbukti jalan di reference |
| API server | **Express 4** | service murni, ringan, mudah di-container (bukan Next.js) |
| DB | PostgreSQL 15 + Prisma 5.14 | menyamai reference |
| Admin frontend | **React 18 + Vite (SPA)**, disajikan statis oleh Express | 1 container; tanpa Next.js |
| Webhook | `fetch` native + queue retry di DB | tanpa Redis di fase 1 |
| Auth | `jsonwebtoken` (admin), opaque token hashed (aplikasi), HMAC-SHA256 (webhook signature) | |
| Password | `bcryptjs` | sama dengan reference |

---

## 3. Folder structure

```
WAWEB/
├── docker-compose.yml / Dockerfile / .env.example
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── src/
│   ├── index.ts            # entry: Express + serve SPA + start WhatsApp
│   ├── config.ts
│   ├── lib/
│   │   ├── db.ts
│   │   └── auth.ts         # JWT admin, bearer aplikasi, HMAC webhook
│   ├── whatsapp/           # INFRASTRUKTUR MURNI (baseline dari reference)
│   │   ├── client.ts       # init, LocalAuth, puppeteer args, fire-and-forget
│   │   ├── lockCleaner.ts  # cleanChromiumLocks (diadopsi dari reference)
│   │   ├── groups.ts       # listClientGroups + IndexedDB fallback (dari reference)
│   │   ├── qr.ts           # qrcode.toDataURL
│   │   └── watchdog.ts     # 90s watchdog + cooldown 15s (dari reference)
│   ├── services/           # events, delivery, recovery, applications,
│   │                       # subscriptions, retention, settings
│   └── routes/             # auth, status, groups, applications,
│                           # subscriptions, messages (send saja), internal, settings
├── web/                    # SPA admin: dashboard, whatsapp, groups, applications, settings
└── test/
```

Nota:

- YANG DIADOPSI dari reference: pola init client, `LocalAuth`, puppeteer args, `cleanChromiumLocks`, state machine status, QR via `qrcode.toDataURL`, filter `@g.us` pada `message_create`, `listClientGroups` + fallback IndexedDB (`model-storage`), watchdog 90 detik, cooldown 15 detik.
- YANG TIDAK DIADOPSI: parser, Gemini, recap, audit trail, media download PLTD — semua PLTD-specific.

---

## 4. Database model

Database PostgreSQL WA Service — **terpisah** dari database PLTD. Tidak ada schema PLTD.

### Application

| Kolom | Tipe | Keterangan |
|---|---|---|
| id | uuid PK | |
| name | text | nama aplikasi client |
| token_hash | text | SHA-256 dari token aplikasi |
| webhook_url | text | URL webhook subscriber |
| enabled | boolean | aktif/nonaktif |
| created_at / updated_at | timestamptz | |

### Subscription

| Kolom | Tipe | Keterangan |
|---|---|---|
| id | uuid PK | |
| application_id | uuid FK → Application | |
| group_jid | text | JID grup (…@g.us) |
| group_name | text | snapshot nama grup |
| enabled | boolean | |
| created_at / updated_at | timestamptz | |

Unique constraint: `(application_id, group_jid)`.

Keputusan subscribe grup berada di aplikasi client; WA Service hanya menerima dan menjalankan delivery.

### WhatsappGroup

| Kolom | Tipe | Keterangan |
|---|---|---|
| jid | text PK | …@g.us |
| name | text | nama grup hasil sync |
| last_seen_at | timestamptz | |

Hasil sync dari client (termasuk IndexedDB fallback).

### MessageEvent

| Kolom | Tipe | Keterangan |
|---|---|---|
| id | uuid PK | |
| seq | bigserial UNIQUE | **cursor global** (anti message loss) |
| group_jid | text | |
| group_name | text | snapshot nama grup |
| sender_id | text | |
| sender_name | text | |
| body | text NULL | isi pesan — sementara, untuk delivery/recovery |
| has_media | boolean | v1: hanya flag, isi file tidak diproses |
| timestamp | timestamptz | waktu kirim asli |
| created_at | timestamptz | |

### EventDelivery

| Kolom | Tipe | Keterangan |
|---|---|---|
| id | uuid PK | |
| event_id | uuid FK → MessageEvent | |
| application_id | uuid FK → Application | |
| status | text | PENDING / SENT / FAILED / DELIVERED |
| attempts | int | |
| next_retry_at | timestamptz | |
| last_error | text | |
| delivered_at | timestamptz | |

Unique constraint: `(event_id, application_id)` — mencegah duplikasi delivery.

### ApplicationCursor

| Kolom | Tipe | Keterangan |
|---|---|---|
| application_id | uuid PK → Application | |
| last_seq | bigint | cursor terakhir dibaca via recovery |

### ServiceConfig

| Kolom | Tipe | Keterangan |
|---|---|---|
| key | text PK | |
| value | text | |
| updated_at | timestamptz | |

Menyimpan status WhatsApp (CONNECTING/QR_READY/CONNECTED/DISCONNECTED), QR terakhir, last connected, uptime — pola `app_config` di reference.

**Desain cursor**: satu sequence global (`seq` bigserial pada MessageEvent); per-aplikasi cursor di `ApplicationCursor`. Subscriber juga menyimpan lastSeq di sisi mereka.

---

## 5. API endpoints

### Admin (JWT)

```
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me

GET  /api/health
GET  /api/status                 # status WA, QR, jumlah grup/sub/app, uptime

GET  /api/groups                 # id, name, isGroup, jumlah subscriber per grup

GET  /api/applications
POST /api/applications           # create; token ditampilkan sekali
PATCH /api/applications/:id
POST /api/applications/:id/rotate-token
POST /api/applications/:id/test-webhook

GET  /api/subscriptions
POST /api/subscriptions
DELETE /api/subscriptions/:id

POST /api/messages/send          # kirim ke nomor (jika diperlukan)
POST /api/messages/send-group    # kirim ke grup
```

### Aplikasi subscriber (Bearer token aplikasi)

```
POST /api/messages/send-group    # hanya ke grup yang di-subscribe app tsb
GET  /internal/events?after=<seq>&limit=100   # recovery; hanya event grup subscribe app tsb
```

### LARANGAN (sesuai requirement)

TIDAK ADA:

- `GET /api/messages`
- inbox / chat viewer / message history
- endpoint admin apa pun yang membaca body pesan

---

## 6. Webhook / event architecture

Alur realtime:

```
WhatsApp → whatsapp-web.js → WA Service
  → persist MessageEvent (+seq)
  → cocokkan subscription aktif → buat EventDelivery PENDING
  → POST webhook_url (timeout 10s)
  → 2xx = DELIVERED; gagal = retry eksponensial
```

Detail:

1. Event `message_create` (pola reference: `msg.fromMe ? msg.to : msg.from`).
2. Hanya grup (`@g.us`) + group discovery bila JID belum dikenal (pola reference: auto-register + resolve nama via `msg.getChat()`).
3. Payload webhook (format sesuai rencana):

```json
{
  "event": "message",
  "eventId": "uuid",
  "messageId": "...",
  "groupId": "...",
  "groupName": "...",
  "senderId": "...",
  "senderName": "...",
  "timestamp": 0,
  "body": "..."
}
```

4. Header webhook: `X-WA-Event-Id`, `X-WA-Timestamp`, `X-WA-Signature` (HMAC-SHA256 raw body, secret = token aplikasi).
5. Retry eksponensial: `1m → 5m → 15m → 1h → 6h → 24h` (maks 24 jam), lalu FAILED (gap ditutup recovery).
6. **At-least-once**: subscriber wajib dedupe via `eventId` (idempotency).

Body hanya dikirim ke subscriber — tidak pernah ke frontend admin / dashboard / log.

---

## 7. Recovery strategy (anti message loss)

- Mekanisme utama: **webhook** (bukan polling).
- Subscriber yang sempat offline memanggil:

```
GET /internal/events?after=<lastSeq>&limit=100
```

### Semantik cursor (approved)

- `seq` adalah **global sequence / high-water mark** (bigserial pada `MessageEvent`) — satu urutan untuk semua grup.
- Subscriber **hanya menerima event dari grup yang di-subscribe**; event grup lain **tetap dilewati** (skipped) saat recovery — tetapi tetap dihitung sebagai posisi yang diperiksa.
- Response berisi:
  - `events`: hanya event subscribe dalam window `(after, lastExaminedSeq]`
  - `next_cursor`: **global seq terakhir yang diperiksa** (last examined), bukan seq event terakhir yang dikirim
- Aturan window: query mengambil `limit` baris pertama (`seq > after` asc). Semua event subscribe dalam window TERSERTA di response → tidak ada event subscribe yang terlewat di dalam window.
- Jika `limit` baris habis (masih ada baris setelahnya): `next_cursor = seq baris terakhir yang diperiksa` (boleh dari grup non-subscribe), subscriber meneruskan `after=next_cursor` — baris yang sudah diperiksa tidak diulang, dan tidak ada gap.
- Jika jumlah baris < `limit`: tidak ada lagi baris → `next_cursor = null`, subscriber menyimpan cursor.
- Subscriber **hanya menyimpan cursor setelah seluruh batch berhasil diproses**.
- `ApplicationCursor` (server-side) ikut di-update ke last examined sebagai catatan; cursor otoritatif ada di subscriber.
- Gap hanya terjadi bila offline > retensi (dokumentasikan).

---

## 8. Event retention

- **Opsi A (terbatas)**: body pesan disimpan sementara karena diperlukan untuk recovery, dengan retensi `EVENT_RETENTION_HOURS` (default **72 jam**).
- Job cleanup tiap 12 jam: hapus MessageEvent + EventDelivery selesai yang lebih tua dari retensi.
- Tidak ada chat archive permanen — WA Service bukan database arsip WhatsApp.
- Subscriber yang tertinggal > 72 jam menerima gap yang terdokumentasi.
- Body tidak pernah:
  - ditampilkan di frontend WA Service
  - masuk dashboard
  - dimasukkan ke log aplikasi

---

## 9. Authentication strategy

### Web admin

- 1 user dari env: `ADMIN_USERNAME` + `ADMIN_PASSWORD_HASH` (bcrypt).
- Login → JWT (12 jam), httpOnly cookie / Authorization header.
- Rate limit login 5/menit.

### Aplikasi client

- Token opaque acak 32 byte, ditampilkan **sekali** saat create.
- Disimpan sebagai SHA-256 hash.
- Bearer token pada semua endpoint aplikasi.
- Rotasi token: `POST /api/applications/:id/rotate-token`.

### Webhook

- Signature `X-WA-Signature` = HMAC-SHA256(token aplikasi, raw body).
- Timestamp window 5 menit (anti replay).
- Validasi `webhook_url` saat create + sebelum webhook test dikirim.
- Tidak ada token/log body yang bocor; log di-censor.

### SSRF protection (approved)

- **Production (default)**: URL webhook yang mengarah ke alamat `private / internal / loopback` **DIBLOKIR** — `WEBHOOK_ALLOW_PRIVATE_IP=false` (default).
- **Development**: boleh diizinkan hanya lewat flag eksplisit `WEBHOOK_ALLOW_PRIVATE_IP=true`.
- Validasi dilakukan:
  - sebelum URL disimpan (create/PATCH aplikasi),
  - sebelum webhook test dikirim,
  - sebelum setiap delivery dikirim (re-check DNS per attempt, mitigasi DNS rebinding).
- Cek mencakup: protokol http/https saja, tanpa credential dalam URL, tanpa fragment, DNS resolve → blokir `10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, 100.64/10, 0/8, 224/4, 240/4` dan IPv6 `::1, ::, fc00::/7, fe80::/10, ::ffff:*`.

---

## 10. Docker architecture

```
compose services (network internal wa-net):
├── wa-service-db
│   ├── image: postgres:15-alpine
│   ├── NO host port mapping (internal saja)
│   ├── volume: wa_db_data
│   └── healthcheck: pg_isready
└── wa-service-web
    ├── build: multi-stage (compile TS + build SPA → runtime)
    ├── deps Chromium diinstall di image
    ├── ports: "3006:3006"
    ├── volume: .wwebjs_auth (sesi WhatsApp — pola reference)
    ├── depends_on: db healthy
    └── command: prisma migrate deploy && node dist/index.js
```

- PostgreSQL production: tidak public, tanpa host port.
- Sesi WhatsApp bertahan di volume (pola `pln_luwuk_wa_session` reference).
- Untuk dev lokal: `docker compose up db` + jalankan web langsung; `prisma studio` untuk inspeksi.

---

## 11. Web admin structure

SPA React + Vite, menu final:

```
WA SERVICE
├── Dashboard      # status WA, uptime, jumlah grup/sub/aplikasi — TANPA pesan
├── WhatsApp       # status, QR (dari event whatsapp-web.js), session, info library
├── Groups         # nama, ID, status, jumlah subscriber — TANPA isi pesan
├── Applications   # CRUD, token rotate, webhook test, jumlah subscription
└── Settings       # config service, webhook/config API, runtime — credential tidak plaintext
```

TIDAK ADA: Messages, Inbox, Chats, Message History, Conversation, Message Viewer, message search.

QR berasal dari event whatsapp-web.js (via `qrcode.toDataURL`) — tidak membuat QR sendiri.

---

## 12. Security considerations

- Body pesan hanya di tabel internal; **tidak ada** route admin yang membacanya.
- DB di internal Docker network saja.
- Sesi `.wwebjs_auth` di volume private; tidak diexpose.
- bcrypt untuk admin; token aplikasi di-hash SHA-256; JWT secret via env.
- Token rotation tersedia.
- Rate limit login & send.
- `helmet`; tanpa CORS terbuka (SPA same-origin).
- Tidak log token/body; error log tanpa body.
- Webhook signature + timestamp window (anti spoof/replay).

---

## 13. Migration phases

Project existing PLTD **TIDAK diubah** pada tahap ini.

1. **PHASE 1** — WA Service standalone: client, QR/connect, sync grup, send/receive.
2. **PHASE 2** — Uji webhook + recovery dengan dummy subscriber.
3. **PHASE 3** — Dokumentasi API provider remote untuk PLTD (tanpa ubah PLTD).
4. **PHASE 4** — PLTD menyiapkan `WHATSAPP_PROVIDER=local|remote` (di repo PLTD sendiri, di luar lingkup ini).
5. **PHASE 5** — Setelah stabil, evaluasi pengurangan dependency WhatsApp lokal.

---

## 14. Risiko & mitigasi

| Risiko | Mitigasi |
|---|---|
| Update WA Web mematahkan API (kasus `getChats()` di build 2.3000.x) | IndexedDB fallback (dari reference) + watchdog |
| Chromium crash / lock file basi | `lockCleaner` + watchdog 90s + restart policy |
| Ban/restrict WhatsApp | rate limit send, monitor `disconnected`, jangan spam |
| Duplicate delivery | `eventId` + idempotency di subscriber |
| Subscriber offline > retensi | gap terdokumentasi; retry 24 jam |
| Multipel instance client aktif | dokumentasi single instance; (opsional) advisory lock DB |
| Webhook spoof | HMAC signature + timestamp window |

---

## 15. Hal yang perlu di-approve

1. **Stack**: Express + React/Vite SPA (bukan Next.js) untuk WA Service.
2. **Port** `3006`; service `wa-service-web` / `wa-service-db`.
3. **Token aplikasi**: opaque 32-byte hashed (bukan JWT).
4. **Admin**: single user dari env (v1).
5. **Retensi body**: 72 jam (ubah via `EVENT_RETENTION_HOURS`).
6. **Recovery**: seq global + per-app cursor, stateless `?after=`.
7. **Media/attachment**: v1 hanya flag `has_media`; isi file tidak diproses.
8. **Webhook signature**: wajib HMAC (default).
9. **Webhook URL SSRF**: production blokir private/internal/loopback secara default; dev hanya via flag eksplisit `WEBHOOK_ALLOW_PRIVATE_IP=true` (bukan "default allowed").

---

## Addendum — revisions after review (baca.txt)

- **Recovery cursor**: semantik high-water mark dipertegas (lihat §7) — next_cursor = global seq terakhir diperiksa; tidak ada gap akibat filtering subscription; subscriber menyimpan cursor hanya setelah batch selesai diproses.
- **SSRF**: private IP diblokir default di production; hanya diizinkan eksplisit di dev (lihat §9).