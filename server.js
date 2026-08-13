const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const PDFDocument = require('pdfkit');

const app = express();
const PORT = process.env.PORT || 3000;

const db = new DatabaseSync(path.join(__dirname, 'data.db'));
// (Not using WAL mode — it can misbehave on Windows folders synced by
// OneDrive/Dropbox/antivirus. Default rollback-journal mode is slower
// under heavy concurrency but far more reliable for a small single-user app.)

// node:sqlite doesn't ship a .transaction() helper like better-sqlite3 —
// this small wrapper gives the same "all-or-nothing" behavior.
function runInTransaction(fn) {
  db.exec('BEGIN');
  try {
    fn();
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY,
    nama TEXT NOT NULL,
    hp TEXT,
    email TEXT,
    tanggal_acara TEXT,
    venue TEXT,
    catatan TEXT
  );
  CREATE TABLE IF NOT EXISTS services (
    id TEXT PRIMARY KEY,
    nama TEXT NOT NULL,
    kategori TEXT,
    harga REAL DEFAULT 0,
    satuan TEXT
  );
  CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    no TEXT NOT NULL,
    client_id TEXT NOT NULL,
    tanggal_terbit TEXT,
    due_date TEXT,
    sent INTEGER DEFAULT 0,
    diskon REAL DEFAULT 0,
    pajak_persen REAL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS invoice_items (
    id TEXT PRIMARY KEY,
    invoice_id TEXT NOT NULL,
    deskripsi TEXT NOT NULL,
    qty REAL DEFAULT 1,
    harga REAL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    invoice_id TEXT NOT NULL,
    tanggal TEXT,
    jumlah REAL DEFAULT 0,
    jenis TEXT,
    metode TEXT
  );
  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    nama_usaha TEXT,
    logo_url TEXT
  );
`);

function ensureSettingsRow() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM settings').get().c;
  if (count === 0) {
    db.prepare('INSERT INTO settings (id, nama_usaha, logo_url) VALUES (1, ?, ?)').run('Nama Usaha Anda', '');
  }
}
ensureSettingsRow();

function uid() { return crypto.randomUUID(); }

/* ---------------- seed demo data on first run ---------------- */
function seedIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM clients').get().c;
  if (count > 0) return;

  const insertClient = db.prepare(`INSERT INTO clients (id,nama,hp,email,tanggal_acara,venue,catatan) VALUES (?,?,?,?,?,?,?)`);
  const insertService = db.prepare(`INSERT INTO services (id,nama,kategori,harga,satuan) VALUES (?,?,?,?,?)`);
  const insertInvoice = db.prepare(`INSERT INTO invoices (id,no,client_id,tanggal_terbit,due_date,sent,diskon,pajak_persen) VALUES (?,?,?,?,?,?,?,?)`);
  const insertItem = db.prepare(`INSERT INTO invoice_items (id,invoice_id,deskripsi,qty,harga) VALUES (?,?,?,?,?)`);
  const insertPayment = db.prepare(`INSERT INTO payments (id,invoice_id,tanggal,jumlah,jenis,metode) VALUES (?,?,?,?,?,?)`);

  runInTransaction(() => {
    insertClient.run('c1', 'Rani & Ardi', '0812-3456-7890', 'rani.ardi@email.com', '2026-09-12', 'The Grand Hall', '');
    insertClient.run('c2', 'Sinta & Dimas', '0813-2211-9087', 'sinta.dimas@email.com', '2026-09-28', 'Kebun Raya', '');
    insertClient.run('c3', 'Nadia & Fajar', '0857-6612-3345', 'nadia.fajar@email.com', '2026-10-03', 'Villa Kintamani', '');
    insertClient.run('c4', 'Putri & Wisnu', '0821-9988-1123', 'putri.wisnu@email.com', '2026-10-19', 'Balai Sarbini', '');

    insertService.run('s1', 'Dekorasi Pelaminan Klasik', 'Dekorasi', 15000000, 'paket');
    insertService.run('s2', 'Catering Premium', 'Catering', 175000, 'per pax');
    insertService.run('s3', 'MUA + Tim Rias', 'Kecantikan', 6500000, 'paket');
    insertService.run('s4', 'Dokumentasi Foto & Video', 'Dokumentasi', 12000000, 'paket');
    insertService.run('s5', 'MC & Musik Akustik', 'Hiburan', 5000000, 'paket');

    insertInvoice.run('inv1', 'INV-2026-011', 'c4', '2026-07-09', '2026-08-23', 0, 0, 0);
    insertItem.run(uid(), 'inv1', 'Dekorasi Pelaminan Klasik', 1, 15000000);
    insertItem.run(uid(), 'inv1', 'Catering Premium', 200, 175000);

    insertInvoice.run('inv2', 'INV-2026-012', 'c3', '2026-07-15', '2026-08-05', 1, 0, 0);
    insertItem.run(uid(), 'inv2', 'Dekorasi Pelaminan Klasik', 1, 15000000);
    insertItem.run(uid(), 'inv2', 'Dokumentasi Foto & Video', 1, 12000000);
    insertItem.run(uid(), 'inv2', 'MC & Musik Akustik', 1, 5000000);
    insertItem.run(uid(), 'inv2', 'Catering Premium', 34, 175000);

    insertInvoice.run('inv3', 'INV-2026-013', 'c2', '2026-07-28', '2026-09-14', 1, 1250000, 0);
    insertItem.run(uid(), 'inv3', 'Dekorasi Pelaminan Klasik', 1, 15000000);
    insertItem.run(uid(), 'inv3', 'Catering Premium', 250, 175000);
    insertItem.run(uid(), 'inv3', 'MC & Musik Akustik', 1, 5000000);
    insertPayment.run(uid(), 'inv3', '2026-08-03', 25000000, 'DP', 'Transfer BCA');

    insertInvoice.run('inv4', 'INV-2026-014', 'c1', '2026-08-02', '2026-08-20', 1, 0, 0);
    insertItem.run(uid(), 'inv4', 'Dekorasi Pelaminan Klasik', 1, 15000000);
    insertItem.run(uid(), 'inv4', 'Catering Premium', 150, 175000);
    insertItem.run(uid(), 'inv4', 'Dokumentasi Foto & Video', 1, 12000000);
    insertItem.run(uid(), 'inv4', 'MUA + Tim Rias', 1, 6500000);
    insertPayment.run(uid(), 'inv4', '2026-08-04', 20000000, 'DP', 'Transfer BCA');
    insertPayment.run(uid(), 'inv4', '2026-08-15', 39750000, 'Pelunasan', 'Transfer BCA');
  });
}
seedIfEmpty();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Wraps a route handler so any thrown/rejected error (including from the
// database, or from an async fetch like downloading a logo image) is logged
// to the terminal AND sent back as a clean JSON error message, instead of
// crashing into a generic HTML error page the frontend can't read.
function h(fn) {
  return (req, res) => {
    Promise.resolve()
      .then(() => fn(req, res))
      .catch(e => {
        console.error('--- ERROR di', req.method, req.originalUrl, '---');
        console.error(e);
        if (!res.headersSent) res.status(500).json({ error: e.message || 'Terjadi kesalahan pada server' });
      });
  };
}

/* ---------------- helpers ---------------- */
function getInvoiceWithItems(id) {
  const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
  if (!inv) return null;
  inv.items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(id);
  return inv;
}
function computeTotal(inv) {
  const subtotal = inv.items.reduce((s, it) => s + it.qty * it.harga, 0);
  const pajak = subtotal * (inv.pajak_persen || 0) / 100;
  const total = subtotal - (inv.diskon || 0) + pajak;
  return { subtotal, pajak, total };
}
function computePaid(id) {
  return db.prepare('SELECT COALESCE(SUM(jumlah),0) AS s FROM payments WHERE invoice_id = ?').get(id).s;
}
function generateInvoiceNo() {
  const year = new Date().getFullYear();
  const count = db.prepare(`SELECT COUNT(*) AS c FROM invoices WHERE no LIKE ?`).get(`INV-${year}-%`).c;
  return `INV-${year}-${String(count + 1).padStart(3, '0')}`;
}

/* ---------------- bootstrap (single call to load everything) ---------------- */
app.get('/api/bootstrap', h((req, res) => {
  const clients = db.prepare('SELECT * FROM clients ORDER BY nama').all();
  const services = db.prepare('SELECT * FROM services ORDER BY nama').all();
  const invoiceRows = db.prepare('SELECT * FROM invoices ORDER BY tanggal_terbit DESC').all();
  const itemsStmt = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?');
  const invoices = invoiceRows.map(inv => ({ ...inv, items: itemsStmt.all(inv.id) }));
  const payments = db.prepare('SELECT * FROM payments ORDER BY tanggal').all();
  const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
  res.json({ clients, services, invoices, payments, settings });
}));

/* ---------------- settings (profil usaha) ---------------- */
app.put('/api/settings', h((req, res) => {
  const { namaUsaha, logoUrl } = req.body;
  db.prepare('UPDATE settings SET nama_usaha=?, logo_url=? WHERE id=1').run(namaUsaha || '', logoUrl || '');
  res.json({ ok: true });
}));

/* ---------------- clients ---------------- */
app.post('/api/clients', h((req, res) => {
  const { nama, hp, email, tanggalAcara, venue, catatan } = req.body;
  if (!nama) return res.status(400).json({ error: 'Nama klien wajib diisi' });
  const id = uid();
  db.prepare(`INSERT INTO clients (id,nama,hp,email,tanggal_acara,venue,catatan) VALUES (?,?,?,?,?,?,?)`)
    .run(id, nama, hp || '', email || '', tanggalAcara || '', venue || '', catatan || '');
  res.status(201).json({ id });
}));
app.put('/api/clients/:id', h((req, res) => {
  const { nama, hp, email, tanggalAcara, venue, catatan } = req.body;
  const exists = db.prepare('SELECT id FROM clients WHERE id=?').get(req.params.id);
  if (!exists) return res.status(404).json({ error: 'Klien tidak ditemukan' });
  db.prepare(`UPDATE clients SET nama=?, hp=?, email=?, tanggal_acara=?, venue=?, catatan=? WHERE id=?`)
    .run(nama, hp || '', email || '', tanggalAcara || '', venue || '', catatan || '', req.params.id);
  res.json({ ok: true });
}));
app.delete('/api/clients/:id', h((req, res) => {
  const used = db.prepare('SELECT COUNT(*) c FROM invoices WHERE client_id=?').get(req.params.id).c;
  if (used > 0) return res.status(400).json({ error: 'Klien ini masih punya invoice tercatat. Hapus invoice terkait terlebih dahulu.' });
  db.prepare('DELETE FROM clients WHERE id=?').run(req.params.id);
  res.json({ ok: true });
}));

/* ---------------- services ---------------- */
app.post('/api/services', h((req, res) => {
  const { nama, kategori, harga, satuan } = req.body;
  if (!nama) return res.status(400).json({ error: 'Nama layanan wajib diisi' });
  const id = uid();
  db.prepare(`INSERT INTO services (id,nama,kategori,harga,satuan) VALUES (?,?,?,?,?)`)
    .run(id, nama, kategori || '', harga || 0, satuan || '');
  res.status(201).json({ id });
}));
app.put('/api/services/:id', h((req, res) => {
  const { nama, kategori, harga, satuan } = req.body;
  const exists = db.prepare('SELECT id FROM services WHERE id=?').get(req.params.id);
  if (!exists) return res.status(404).json({ error: 'Layanan tidak ditemukan' });
  db.prepare(`UPDATE services SET nama=?, kategori=?, harga=?, satuan=? WHERE id=?`)
    .run(nama, kategori || '', harga || 0, satuan || '', req.params.id);
  res.json({ ok: true });
}));
app.delete('/api/services/:id', h((req, res) => {
  db.prepare('DELETE FROM services WHERE id=?').run(req.params.id);
  res.json({ ok: true });
}));

/* ---------------- invoices ---------------- */
app.post('/api/invoices', h((req, res) => {
  const { clientId, tanggalTerbit, dueDate, sent, diskon, pajakPersen, items } = req.body;
  if (!clientId) return res.status(400).json({ error: 'Klien wajib dipilih' });
  if (!items || !items.length) return res.status(400).json({ error: 'Tambahkan minimal satu item layanan' });
  const id = uid();
  const no = generateInvoiceNo();
  runInTransaction(() => {
    db.prepare(`INSERT INTO invoices (id,no,client_id,tanggal_terbit,due_date,sent,diskon,pajak_persen) VALUES (?,?,?,?,?,?,?,?)`)
      .run(id, no, clientId, tanggalTerbit || '', dueDate || '', sent ? 1 : 0, diskon || 0, pajakPersen || 0);
    const insertItem = db.prepare(`INSERT INTO invoice_items (id,invoice_id,deskripsi,qty,harga) VALUES (?,?,?,?,?)`);
    items.forEach(it => insertItem.run(uid(), id, it.deskripsi, it.qty || 0, it.harga || 0));
  });
  res.status(201).json({ id, no });
}));
app.put('/api/invoices/:id', h((req, res) => {
  const { clientId, tanggalTerbit, dueDate, sent, diskon, pajakPersen, items } = req.body;
  const exists = db.prepare('SELECT id FROM invoices WHERE id=?').get(req.params.id);
  if (!exists) return res.status(404).json({ error: 'Invoice tidak ditemukan' });
  runInTransaction(() => {
    db.prepare(`UPDATE invoices SET client_id=?, tanggal_terbit=?, due_date=?, sent=?, diskon=?, pajak_persen=? WHERE id=?`)
      .run(clientId, tanggalTerbit || '', dueDate || '', sent ? 1 : 0, diskon || 0, pajakPersen || 0, req.params.id);
    db.prepare('DELETE FROM invoice_items WHERE invoice_id=?').run(req.params.id);
    const insertItem = db.prepare(`INSERT INTO invoice_items (id,invoice_id,deskripsi,qty,harga) VALUES (?,?,?,?,?)`);
    (items || []).forEach(it => insertItem.run(uid(), req.params.id, it.deskripsi, it.qty || 0, it.harga || 0));
  });
  res.json({ ok: true });
}));
app.delete('/api/invoices/:id', h((req, res) => {
  runInTransaction(() => {
    db.prepare('DELETE FROM payments WHERE invoice_id=?').run(req.params.id);
    db.prepare('DELETE FROM invoice_items WHERE invoice_id=?').run(req.params.id);
    db.prepare('DELETE FROM invoices WHERE id=?').run(req.params.id);
  });
  res.json({ ok: true });
}));

/* ---------------- payments ---------------- */
app.post('/api/invoices/:id/payments', h((req, res) => {
  const { tanggal, jumlah, jenis, metode } = req.body;
  if (!jumlah || jumlah <= 0) return res.status(400).json({ error: 'Jumlah pembayaran harus lebih dari 0' });
  const invoice = db.prepare('SELECT id FROM invoices WHERE id=?').get(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice tidak ditemukan' });
  const id = uid();
  db.prepare(`INSERT INTO payments (id,invoice_id,tanggal,jumlah,jenis,metode) VALUES (?,?,?,?,?,?)`)
    .run(id, req.params.id, tanggal, jumlah, jenis || '', metode || '');
  res.status(201).json({ id });
}));

/* ---------------- PDF (generated on the server — real file, not print-to-PDF) ---------------- */
app.get('/api/invoices/:id/pdf', h(async (req, res) => {
  const inv = getInvoiceWithItems(req.params.id);
  if (!inv) return res.status(404).send('Invoice tidak ditemukan');
  const client = db.prepare('SELECT * FROM clients WHERE id=?').get(inv.client_id);
  const settings = db.prepare('SELECT * FROM settings WHERE id=1').get();
  const namaUsaha = (settings && settings.nama_usaha) || 'Nama Usaha Anda';
  const { subtotal, pajak, total } = computeTotal(inv);
  const paid = computePaid(inv.id);
  const remaining = total - paid;

  // Coba ambil logo dari URL (kalau diisi di halaman Pengaturan). Kalau gagal
  // (URL salah, bukan gambar, situs down, dll) — abaikan saja, PDF tetap
  // dibuat tanpa logo daripada gagal total.
  let logoBuffer = null;
  if (settings && settings.logo_url) {
    try {
      const imgRes = await fetch(settings.logo_url);
      if (imgRes.ok) {
        const arrayBuf = await imgRes.arrayBuffer();
        logoBuffer = Buffer.from(arrayBuf);
      }
    } catch (e) {
      console.warn('Gagal mengambil logo dari URL:', e.message);
    }
  }

  const rp = n => 'Rp ' + Math.round(n).toLocaleString('id-ID');
  const fmtDate = iso => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '-';

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${inv.no}.pdf"`);

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.pipe(res);

  const textX = logoBuffer ? 115 : 50;
  if (logoBuffer) {
    try { doc.image(logoBuffer, 50, 45, { width: 55, height: 55, fit: [55, 55] }); }
    catch (e) { console.warn('Logo tidak bisa ditampilkan di PDF:', e.message); }
  }
  doc.fillColor('#7A2635').fontSize(20).text(namaUsaha, textX, 50, { width: 435 - (textX - 50) });
  doc.fillColor('#6B6258').fontSize(10).text(`${inv.no}  ·  diterbitkan ${fmtDate(inv.tanggal_terbit)}`, textX, doc.y);
  doc.y = Math.max(doc.y, 45 + 55) + 15;
  doc.x = 50;

  doc.fillColor('#2B2420').fontSize(11);
  doc.text(`Ditagihkan kepada: ${client ? client.nama : '-'}`);
  doc.text(`Tanggal acara: ${client ? fmtDate(client.tanggal_acara) + ' — ' + (client.venue || '-') : '-'}`);
  doc.text(`Jatuh tempo: ${fmtDate(inv.due_date)}`);
  doc.moveDown(1);

  const tableTop = doc.y;
  doc.fontSize(10).fillColor('#6B6258');
  doc.text('Deskripsi', 50, tableTop, { width: 230 });
  doc.text('Qty', 285, tableTop, { width: 50 });
  doc.text('Harga', 340, tableTop, { width: 90, align: 'right' });
  doc.text('Subtotal', 435, tableTop, { width: 100, align: 'right' });
  doc.moveTo(50, tableTop + 15).lineTo(535, tableTop + 15).strokeColor('#B08D57').stroke();

  let y = tableTop + 24;
  doc.fillColor('#2B2420').fontSize(10.5);
  inv.items.forEach(it => {
    doc.text(it.deskripsi, 50, y, { width: 230 });
    doc.text(String(it.qty), 285, y, { width: 50 });
    doc.text(it.harga.toLocaleString('id-ID'), 340, y, { width: 90, align: 'right' });
    doc.text(rp(it.qty * it.harga), 435, y, { width: 100, align: 'right' });
    y += 22;
  });

  doc.moveTo(50, y + 4).lineTo(535, y + 4).strokeColor('#EFE7DC').stroke();
  y += 16;
  doc.fontSize(10).fillColor('#2B2420');
  doc.text('Subtotal', 340, y, { width: 90, align: 'right' });
  doc.text(rp(subtotal), 435, y, { width: 100, align: 'right' });
  y += 18;
  if (inv.diskon) {
    doc.text('Diskon', 340, y, { width: 90, align: 'right' });
    doc.text('- ' + rp(inv.diskon), 435, y, { width: 100, align: 'right' });
    y += 18;
  }
  if (inv.pajak_persen) {
    doc.text(`Pajak (${inv.pajak_persen}%)`, 340, y, { width: 90, align: 'right' });
    doc.text(rp(pajak), 435, y, { width: 100, align: 'right' });
    y += 18;
  }
  doc.fontSize(13).fillColor('#7A2635').text('Total', 340, y, { width: 90, align: 'right' });
  doc.text(rp(total), 435, y, { width: 100, align: 'right' });
  y += 32;

  doc.fontSize(10).fillColor('#6B6258');
  if (remaining > 0) {
    doc.text(`Sisa tagihan: ${rp(remaining)} (jatuh tempo ${fmtDate(inv.due_date)})`, 50, y);
  } else {
    doc.text('Invoice ini sudah lunas.', 50, y);
  }

  doc.end();
}));

app.listen(PORT, () => {
  console.log(`Server berjalan di http://localhost:${PORT}`);
});
