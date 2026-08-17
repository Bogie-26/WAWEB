# AGENTS.md

## 1. WORKING PRINCIPLES

- Pahami tujuan task sebelum mengubah kode.
- Kerjakan hanya sesuai scope yang diminta.
- Utamakan perubahan minimal dan terarah.
- Jangan melakukan refactor besar tanpa alasan teknis yang jelas.
- Jangan mengubah behavior yang sudah berjalan tanpa alasan yang dapat dijelaskan.
- Jika menemukan masalah di luar scope, laporkan terlebih dahulu.
- Jika task hanya meminta review/inspection, jangan mengubah kode.

## 2. CODEBASE UNDERSTANDING

Sebelum melakukan perubahan yang signifikan:

1. Baca dokumentasi project yang relevan.
2. Periksa Graphify/codebase graph jika tersedia.
3. Telusuri dependency dan hubungan module yang terdampak.
4. Baca source code terkait sebelum mengambil keputusan.

Graphify digunakan sebagai alat bantu memahami codebase, bukan pengganti source code dan dokumentasi.

Jangan menebak arsitektur hanya berdasarkan nama file.

## 3. IMPLEMENTATION WORKFLOW

Untuk perubahan code:

1. Inspect.
2. Rencanakan perubahan.
3. Implementasi perubahan minimal.
4. Typecheck.
5. Build.
6. Jalankan test/runtime verification jika relevan.
7. Periksa dokumentasi.
8. Update dokumentasi jika implementasi memang berubah.
9. Review git diff.
10. Review git status.
11. Laporkan hasil.

Jangan menyatakan task selesai jika verifikasi yang relevan belum dilakukan.

## 4. DOCUMENTATION

Dokumentasi teknis berada di `docs/`.

`AGENTS.md` berisi aturan kerja agent, bukan detail architecture aplikasi.

Setelah perubahan code dan build berhasil:

- Periksa dokumentasi yang relevan.
- Update jika behavior, API, configuration, architecture, deployment, atau workflow berubah.
- Jangan mengubah dokumentasi jika tidak diperlukan.

Dokumentasi harus menggambarkan implementasi aktual.

Jika tidak ada perubahan dokumentasi yang diperlukan, laporkan:

`Documentation: no update required.`

## 5. GRAPHIFY

Jika perubahan menyentuh module atau flow yang sudah ada:

- gunakan Graphify untuk memahami dependency dan code flow jika tersedia.
- gunakan hasil Graphify untuk menentukan area yang terdampak.
- tetap verifikasi dengan membaca source code.

Setelah perubahan selesai, Graphify boleh digunakan kembali untuk memastikan perubahan tidak menimbulkan dependency yang tidak diinginkan.

## 6. GIT

Branch pengembangan utama:

`develop`

Aturan:

- Jangan commit tanpa instruksi.
- Jangan push tanpa instruksi.
- Jangan merge tanpa instruksi.
- Jangan force push.
- Jangan mengubah `main` tanpa instruksi.
- Jangan menggunakan `git add -A` tanpa memeriksa file yang akan di-stage.

Sebelum commit:

```bash
git status
git diff
git diff --cached