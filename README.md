# Berkas & Berkah — Sistem Invoice WO

Backend + database untuk mencatat klien, layanan, dan invoice Wedding Organizer.
Stack: Node.js + Express + SQLite bawaan Node (`node:sqlite`) + generate PDF asli (`pdfkit`).

Pakai `node:sqlite` bawaan (bukan `better-sqlite3`) supaya **tidak perlu compile native code** —
tidak butuh Python atau Visual Studio Build Tools sama sekali. Butuh **Node.js versi 22.5 ke atas**
(cek versi kamu dengan `node -v`; kalau di bawah itu, update Node dulu di nodejs.org).
Saat pertama jalan akan muncul warning kuning "SQLite is an experimental feature" — itu normal,
bukan error, boleh diabaikan.

## Cara menjalankan (butuh Node.js — unduh di nodejs.org kalau belum ada)

1. Buka folder ini lewat terminal:
   ```
   cd wo-invoice-backend
   ```
2. Install dependensi (sekali saja):
   ```
   npm install
   ```
3. Jalankan servernya:
   ```
   npm start
   ```
4. Buka browser ke:
   ```
   http://localhost:3000
   ```

Data contoh (dummy) sudah otomatis terisi saat pertama kali dijalankan, supaya langsung kelihatan cara pakainya. Silakan hapus/ganti dengan data asli.

## Di mana data disimpan?

Semua data ada di file `data.db` (SQLite) yang otomatis dibuat di folder ini saat server pertama kali jalan. File ini yang berisi seluruh data klien, layanan, invoice, dan pembayaran — **jangan dihapus**, dan sebaiknya di-backup berkala (tinggal copy file `data.db` ke tempat lain).

## Supaya bisa diakses online / dari HP dan device lain

Saat ini server hanya bisa diakses dari komputer yang menjalankannya (`localhost`). Untuk dipakai sungguhan sehari-hari (diakses dari HP, dari mana saja, atau dipakai bareng tim), project ini perlu di-*deploy* ke hosting, misalnya:

- **Railway** (railway.app) — paling mudah untuk project Node.js + SQLite
- **Render** (render.com) — gratis untuk skala kecil
- **Fly.io** — cocok kalau butuh SQLite dengan volume persisten

Semua platform di atas biasanya tinggal hubungkan ke repo GitHub, lalu otomatis build & jalan. Kalau kamu mau, saya bisa bantu siapkan langkah deploy ke salah satunya.

## Struktur project

```
wo-invoice-backend/
├── server.js          → seluruh backend: API + koneksi database + generate PDF
├── package.json        → daftar dependensi
├── data.db              → database SQLite (otomatis dibuat, jangan dihapus)
└── public/
    └── index.html       → frontend (dashboard, klien, layanan, invoice)
```

## Ringkasan API

| Method | Endpoint | Fungsi |
|---|---|---|
| GET | /api/bootstrap | Ambil semua data sekaligus |
| POST/PUT/DELETE | /api/clients(/:id) | Kelola klien |
| POST/PUT/DELETE | /api/services(/:id) | Kelola layanan |
| POST/PUT/DELETE | /api/invoices(/:id) | Kelola invoice |
| POST | /api/invoices/:id/payments | Catat pembayaran |
| GET | /api/invoices/:id/pdf | Unduh invoice sebagai PDF |
