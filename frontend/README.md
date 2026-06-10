# Berau Coal DAARS — Ringkasan Modul & Alur Proses

Dokumen ini merangkum **modul dan alur proses bisnis** yang sudah tersedia di aplikasi frontend DAARS (*Digital Attendance, Approval & Reporting System*). Fokus pada **siapa melakukan apa, langkah demi langkah**, sebagai landasan perencanaan implementasi AI.

---

## Gambaran Umum

DAARS menggantikan proses absensi manual dengan alur digital berbasis peran. Alur besar sistem:

```
LS (karyawan) → LS Supervisor (persetujuan harian)
     ↓
Vendor (rekap & penagihan bulanan) → LS HR (verifikasi) → SSU (finalisasi & pembayaran)
```

Di samping itu, **LS HR** mengelola master data karyawan dan impor log absensi mesin.

---

## Peran Pengguna

| Peran | Peran dalam proses |
|-------|-------------------|
| **LS** | Mencatat absensi harian, mengajukan cuti/izin/sakit dan lembur, memantau status pengajuan sendiri |
| **LS Supervisor** | Menyetujui/menolak absensi tim, lembur, dan cuti; melihat rekap bulanan tim |
| **Vendor** | Melihat rekap absensi bulanan seluruh LS di bawah vendor, mengajukan BAST & invoice ke LS HR |
| **LS HR** | Mengelola master karyawan, impor log absensi, reset password, menyetujui/menolak pengajuan bulanan vendor |
| **SSU** | Pemeriksaan dokumen akhir vendor, persetujuan invoice, penandaan status bayar |

---

## Modul yang Sudah Ada

### 1. Login & Onboarding Akun

**Siapa:** Semua peran

**Alur:**
1. Pengguna masuk dengan **SID** dan password.
2. Jika akun baru (misalnya dari master karyawan), sistem meminta **ganti password wajib** sebelum masuk dashboard.
3. Setelah login, pengguna diarahkan ke halaman utama sesuai perannya.

---

### 2. Absensi Harian (LS)

**Siapa:** LS

**Alur pengajuan absensi:**
1. LS memilih jenis: **Clock In** atau **Clock Out**.
2. Mengisi tanggal (maks. 10 hari ke belakang) dan jam.
3. Lokasi **otomatis** diambil dari perangkat (geotag).
4. NPK diisi otomatis dari profil karyawan.
5. Pengajuan masuk status **pending** menunggu supervisor.

**Alur pantau riwayat:**
1. LS membuka daftar absensi harian.
2. Melihat ringkasan: total hari, approved/pending/rejected, jam lembur, hari cuti/izin/sakit.
3. Bisa filter periode dan lihat detail per baris.

**Catatan proses:** Clock Out hanya bisa setelah Clock In pada hari yang sama; urutan in/out harus konsisten.

---

### 3. Persetujuan Absensi (LS Supervisor)

**Siapa:** LS Supervisor

**Alur:**
1. Supervisor melihat daftar anggota tim (sidebar per karyawan LS).
2. Memilih karyawan → muncul absensi harian karyawan tersebut.
3. Filter status (pending/approved/rejected) dan rentang tanggal.
4. **Approve** atau **Reject** per baris, atau **bulk approval** untuk beberapa baris sekaligus.
5. Statistik bulan berjalan (total, pending, approved, rejected) tampil di atas halaman.

---

### 4. Rekap Absensi Bulanan Tim (LS Supervisor)

**Siapa:** LS Supervisor

**Alur:**
1. Pilih bulan dan tahun.
2. Sistem menampilkan rekap per karyawan LS: hari clock-in, jumlah record, status absensi, serta agregat cuti/izin/sakit.
3. Supervisor bisa expand baris untuk melihat detail pengajuan cuti per karyawan.

---

### 5. Cuti / Izin / Sakit

**Siapa:** LS (pengajuan) · LS Supervisor (persetujuan)

**Alur pengajuan (LS):**
1. Pilih jenis: **Cuti**, **Izin**, atau **Sakit**.
2. Isi tanggal mulai–selesai dan keterangan (wajib untuk izin/sakit).
3. Ajukan → status **pending**.
4. LS memantau daftar pengajuan sendiri (filter tipe & status).

**Alur persetujuan (Supervisor):**
1. Supervisor melihat antrian pengajuan cuti tim (layout split: daftar karyawan + detail).
2. **Approve** atau **Reject** dengan catatan.
3. Badge notifikasi di menu menampilkan jumlah pending.

**Status yang mungkin:** pending, approved, rejected, cancelled, withdrawn.

---

### 6. Lembur (Overtime)

**Siapa:** LS (pengajuan) · LS Supervisor (persetujuan)

**Alur pengajuan (LS):**
1. Isi tanggal, jam mulai–selesai, dan keterangan (opsional).
2. Ajukan → status **pending**.
3. LS memantau daftar pengajuan lembur sendiri.

**Alur persetujuan (Supervisor):**
1. Supervisor melihat antrian lembur tim.
2. **Approve** atau **Reject** (persetujuan lembur terkait dengan absensi approved terkait).
3. Badge notifikasi di menu menampilkan jumlah pending.

**Catatan proses:** Lembur terpisah dari absensi harian; keduanya punya alur approval sendiri.

---

### 7. Laporan Bulanan & BAST (Vendor)

**Siapa:** Vendor

**Alur lihat rekap:**
1. Vendor memilih tahun → melihat 12 bulan.
2. Per bulan: jumlah LS, baris absensi, baris approved, dan status workflow pengajuan.

**Alur submit BAST & invoice:**
1. Buka detail bulan → lihat absensi seluruh LS vendor (per karyawan, per hari).
2. Isi data invoice: nomor, tanggal, jatuh tempo, line item (deskripsi + nominal), PPh, total.
3. Unggah dokumen: BAST, invoice, rekap gaji, pajak, kwitansi, dan dokumen pendukung lain.
4. **Submit ke LS HR** → status menjadi *With LS HR*.
5. Jika ditolak LS HR, vendor bisa revisi dan submit ulang.
6. Periode terkunci selama sedang diproses LS HR/SSU atau sudah selesai.

---

### 8. Antrian Persetujuan Vendor (LS HR & SSU)

**Siapa:** LS HR · SSU

**Alur LS HR:**
1. Melihat daftar pengajuan bulanan vendor (filter bulan, tahun, nama vendor, status).
2. Unduh lampiran (ZIP) atau PDF timesheet.
3. **Approve** → diteruskan ke SSU · **Reject** → kembali ke vendor dengan catatan.
4. Status tampil: Request Approval, Rejected, Approved (sudah ke SSU).

**Alur SSU:**
1. Melihat pengajuan yang sudah disetujui LS HR.
2. **Approve** → status *Invoice On Process* · **Reject** → kembali ke LS HR.
3. **Mark as Paid** untuk pengajuan yang sudah *Invoice On Process*.

**Alur status workflow pengajuan vendor:**

```
Belum submit (Vendor)
    ↓ submit
With LS HR (pending_ls_hr)
    ↓ approve LS HR          ↓ reject LS HR
With SSU (pending_ssu)    Rejected → Vendor revisi
    ↓ approve SSU           ↓ reject SSU
Invoice On Process        Kembali ke LS HR
    ↓ mark paid
Paid
```

---

### 9. Master Data Karyawan (LS HR)

**Siapa:** LS HR

**Alur kelola manual:**
1. Lihat daftar karyawan (filter nama/NPK, supervisor, site, vendor, status aktif).
2. **Create** karyawan baru atau **Edit** data existing.
3. Data dipakai untuk pencocokan NIK/NPK saat absensi dan verifikasi BAST.

**Alur upload massal:**
1. Pilih site (MTL / BC).
2. Unggah Excel template (*NIK, NAMA, JABATAN, DEPARTEMEN, SITE, PERUSAHAAN, NIK ATASAN, NAMA ATASAN*).
3. Sistem memproses: insert baru, update existing, skip baris bermasalah.
4. Akun LS bisa otomatis terbentuk dengan password default → login pertama wajib ganti password.

---

### 10. Impor Log Absensi Mesin (Glog Upload)

**Siapa:** LS HR (dan route tersedia untuk Supervisor)

**Alur:**
1. Unggah file log mesin (.csv / .txt) dengan format: NIK, Nama, Tanggal, Jam, Nama Mesin.
2. **Preview & Upload** → sistem menampilkan preview dan baris bermasalah.
3. **Proses & Sinkronisasi** → agregasi per NIK per hari (jam masuk/keluar).
4. **Submit ke Attendance** → data masuk ke modul absensi (status pending, menunggu supervisor).
5. Baris yang NIK-nya tidak cocok master karyawan atau sudah approved/rejected dilewati.

**Catatan proses:** Selain upload file, backend juga mendukung sync otomatis dari database FTM dan Fingerspot — belum tersedia sebagai alur UI terpisah di frontend.

---

### 11. Reset Password (LS HR)

**Siapa:** LS HR

**Alur:**
1. Masukkan SID akun yang akan direset.
2. Isi password baru dan konfirmasi (minimal 8 karakter).
3. Password akun target diperbarui; pengguna bisa login dengan password baru.

---

## Alur End-to-End (Siklus Bulan Kerja)

```
┌─────────────────────────────────────────────────────────────────┐
│  HARIAN                                                         │
│  LS absen (manual/geotag atau dari log mesin)                   │
│       → Supervisor approve/reject absensi                       │
│  LS ajukan cuti/izin/sakit & lembur                             │
│       → Supervisor approve/reject                               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  BULANAN                                                        │
│  Vendor lihat rekap absensi approved                            │
│       → Submit BAST + invoice + dokumen                         │
│       → LS HR review & approve/reject                           │
│       → SSU final check & approve/reject                        │
│       → SSU tandai Paid                                         │
└─────────────────────────────────────────────────────────────────┘
                              ↑
┌─────────────────────────────────────────────────────────────────┐
│  MASTER DATA (LS HR, berkala)                                   │
│  Upload/kelola karyawan → impor log absensi mesin               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Ringkasan Modul per Peran

| Peran | Modul / Menu |
|-------|----------------|
| LS | Create Attendance, Attendance List, Overtime, Leave |
| LS Supervisor | Approval List, Monthly Attendance Recap, Overtime, Leave |
| Vendor | Report List (detail + submit BAST) |
| LS HR | Approval List, Employee List, Upload Data Karyawan, Upload Attendance Log, Reset Password |
| SSU | Approval List |

---

## Catatan untuk Perencanaan AI

Bagian ini memetakan peluang AI berdasarkan modul dan alur proses yang **sudah ada**. Implementasi AI sebaiknya **menempel pada titik keputusan yang sudah berjalan** (approve/reject, submit, upload) — bukan membuat alur baru.

### Jenis Kemampuan AI yang Relevan

| Jenis | Fungsi dalam DAARS | Contoh output ke user |
|-------|-------------------|------------------------|
| **AI Recommendation** | Menyarankan tindakan berikutnya berdasarkan konteks | "Approve dengan catatan", "Minta revisi vendor", "Ajukan clock-out hari ini" |
| **AI Prediction** | Memprediksi outcome atau risiko sebelum kejadian | "Kemungkinan ditolak 78%", "Perkiraan backlog approval akhir bulan" |
| **AI Detection** | Mendeteksi anomali, inkonsistensi, atau pelanggaran pola | "Lokasi clock-in menyimpang dari site", "Invoice melebihi pola bulan lalu" |
| **AI Assistance** | Membantu input, review, atau navigasi tanpa mengambil keputusan | Ringkasan harian, draft catatan reject, penjelasan error upload |

---

### AI per Modul Proses

#### 1. Login & Onboarding

| | Insight |
|---|--------|
| **Recommendation** | Saran langkah pertama setelah login pertama (mis. "Lengkapi absensi kemarin" jika ada gap, atau "Hubungi supervisor jika NPK belum tertaut"). |
| **Prediction** | Prediksi karyawan yang belum pernah login setelah akun dibuat dari upload master → daftar follow-up LS HR. |
| **Detection** | Pola login tidak wajar (banyak gagal, akses dari lokasi tidak biasa) — flag untuk audit keamanan. |

---

#### 2. Absensi Harian (LS)

| | Insight |
|---|--------|
| **Recommendation** | • Reminder proaktif: "Anda belum clock-out kemarin" / "Clock-in hari ini belum tercatat".<br>• Saran waktu submit optimal agar tidak melewati batas 10 hari ke belakang.<br>• Saran koreksi sebelum submit jika jam masuk/keluar tidak masuk akal. |
| **Prediction** | • Prediksi hari yang berisiko **pending lama** (mis. hari Jumat/minggu libur, pola supervisor lambat approve).<br>• Prediksi karyawan yang cenderung **terlambat clock-in** berdasarkan riwayat 30–90 hari.<br>• Prediksi mismatch antara absensi manual vs log mesin (jika karyawan punya kedua sumber). |
| **Detection** | • Geotag jauh dari site/dept yang tercatat di master karyawan.<br>• Durasi shift terlalu pendek/panjang vs pola normal tim.<br>• Clock-in/out di hari yang sama sudah ada record approved dari log mesin. |
| **Assistance** | Ringkasan mingguan personal: hari hadir, pending, rejected, dan jam lembur terkait. |

---

#### 3. Persetujuan Absensi (Supervisor)

| | Insight |
|---|--------|
| **Recommendation** | • **Prioritas review**: urutkan pending berdasarkan risiko (anomali lokasi, shift pendek, mendekati batas akhir bulan).<br>• Saran bulk approve untuk baris "low risk" (pola normal, geotag valid, match log mesin).<br>• Template catatan reject yang spesifik ("Jam keluar tidak sesuai shift", "Lokasi di luar site"). |
| **Prediction** | • Prediksi **backlog approval** supervisor di akhir bulan (berapa hari lagi jika tempo approve tetap).<br>• Prediksi karyawan mana yang akan memicu dispute vendor (banyak rejected/pending mendekati closing).<br>• Skor kepercayaan per baris: tinggi = aman approve, rendah = perlu review manual. |
| **Detection** | • Pola favoritisme atau inkonsistensi approve/reject antar karyawan dengan kondisi serupa.<br>• Supervisor yang selalu approve tanpa review di hari libur/night shift. |
| **Assistance** | Executive summary tim harian: "12 pending, 3 anomali, 2 mendekati deadline vendor". |

---

#### 4. Rekap Absensi Bulanan (Supervisor)

| | Insight |
|---|--------|
| **Recommendation** | • Saran fokus review sebelum vendor submit: karyawan dengan gap absensi, cuti panjang, atau rejected tinggi.<br>• Rekomendasi "clear backlog" checklist per minggu terakhir bulan. |
| **Prediction** | • Prediksi **headcount efektif** vs kontrak vendor (berapa LS aktif vs deactive).<br>• Prediksi varians jam kerja vs bulan sebelumnya per site/vendor. |
| **Detection** | • Outlier: karyawan dengan cuti/izin/sakit jauh di atas rata-rata tim.<br>• Ketidakselarasan rekap supervisor vs data mentah absensi. |

---

#### 5. Cuti / Izin / Sakit

| | Insight |
|---|--------|
| **Recommendation** | • LS: saran tipe pengajuan ("Tanggal ini overlap cuti approved — pertimbangkan izin").<br>• Supervisor: daftar pending cuti urut urgensi (sakit mendadak, durasi panjang, overlap shift kritis).<br>• Saran kelengkapan alasan sebelum submit (wajib untuk izin/sakit). |
| **Prediction** | • Prediksi **peak leave period** per site (musim libur, pola historis).<br>• Prediksi dampak staffing: "3 LS cuti bersamaan → risiko under-staffing site X".<br>• Prediksi probabilitas approve berdasarkan tipe, durasi, dan riwayat supervisor. |
| **Detection** | • Pola cuti/izin berulang di hari Senin/Jumat (potensi abuse).<br>• Sakit tanpa keterangan berulang.<br>• Overlap cuti dengan hari yang sudah ada absensi clock-in. |
| **Assistance** | Kalender tim visual dengan highlight konflik dan saran redistribusi beban (informasi saja, keputusan tetap supervisor). |

---

#### 6. Lembur (Overtime)

| | Insight |
|---|--------|
| **Recommendation** | • LS: peringatan jika lembur diajukan tanpa absensi approved di hari yang sama.<br>• Supervisor: prioritas OT dengan durasi ekstrem atau frekuensi tinggi per karyawan.<br>• Saran tolak/approve dengan referensi kebijakan jam maksimum. |
| **Prediction** | • Prediksi total jam lembur vendor/site di akhir bulan (untuk estimasi biaya invoice).<br>• Prediksi karyawan dengan risiko **overtime spike** vs rata-rata 3 bulan.<br>• Prediksi OT yang kemungkinan ditolak karena tidak ada absensi terkait. |
| **Detection** | • OT di hari libur/cuti approved.<br>• Pola OT konsisten di luar jam operasional normal.<br>• Duplikasi OT dan absensi yang tidak selaras. |

---

#### 7. Laporan Bulanan & BAST (Vendor)

| | Insight |
|---|--------|
| **Recommendation** | • Checklist sebelum submit: dokumen wajib, line item kosong, selisih nominal vs rekap.<br>• Saran revisi jika LS HR/SSU pernah reject dengan pola serupa bulan lalu.<br>• Rekomendasi nominal line item berdasarkan pola invoice historis vendor (banding, bukan auto-fill). |
| **Prediction** | • Prediksi **kemungkinan reject LS HR** sebelum submit (skor risiko dokumen + data absensi).<br>• Prediksi waktu siklus approval sampai paid berdasarkan historis vendor.<br>• Prediksi selisih headcount invoice vs LS approved di rekap. |
| **Detection** | • Invoice melebihi/threshold di bawah pola 3–6 bulan terakhir.<br>• BAST vs absensi: jumlah hari kerja tidak cocok.<br>• Dokumen duplikat, expired, atau tidak sesuai periode. |
| **Assistance** | Ringkasan otomatis per bulan: "X LS, Y approved rows, Z pending — siap submit / perlu tindak lanjut supervisor dulu". |

---

#### 8. Antrian Persetujuan Vendor (LS HR & SSU)

| | Insight |
|---|--------|
| **Recommendation** | • LS HR: urutan review vendor berisiko tinggi dulu; saran approve/reject dengan bullet point evidence.<br>• SSU: prioritas invoice mendekati due date; flag vendor dengan histori reject bolak-balik.<br>• Saran "return to vendor" vs "escalate internal" berdasarkan jenis mismatch. |
| **Prediction** | • Prediksi **cashflow timing**: kapan invoice akan masuk status paid jika tempo approve normal.<br>• Prediksi vendor mana yang akan submit terlambat (berdasarkan pola bulan sebelumnya + backlog absensi tim).<br>• Prediksi probabilitas SSU reject setelah LS HR approve (second-pass risk). |
| **Detection** | • Cross-vendor anomaly: vendor A tagihan naik drastis tanpa penambahan headcount.<br>• Inkonsistensi PPh/subtotal/total invoice.<br>• Dokumen BAST tidak match periode laporan. |
| **Assistance** | One-page review pack per submission: ringkasan absensi, invoice, anomaly flags, dan rekomendasi tindakan — tanpa mengganti keputusan manusia. |

---

#### 9. Master Data Karyawan (LS HR)

| | Insight |
|---|--------|
| **Recommendation** | • Saran perbaikan baris upload: "NIK ATASAN tidak ditemukan — gunakan NIK X".<br>• Rekomendasi supervisor mapping berdasarkan departemen/site.<br>• Flag karyawan deactive yang masih punya absensi pending. |
| **Prediction** | • Prediksi karyawan baru dari upload yang **belum pernah login** dalam N hari → daftar onboarding.<br>• Prediksi churn/deactive berdasarkan pola absensi menurun + cuti panjang. |
| **Detection** | • Duplikat NIK/NPK hampir sama, vendor mismatch, site tidak valid.<br>• Karyawan tanpa supervisor padahal site/dept wajib punya atasan. |
| **Assistance** | Penjelasan human-readable untuk setiap baris skip/error upload (bukan hanya kode error). |

---

#### 10. Impor Log Absensi Mesin (Glog)

| | Insight |
|---|--------|
| **Recommendation** | • Saran urutan proses: upload → proses → submit, dengan estimasi baris yang akan masuk pending.<br>• Rekomendasi `create_employees` jika banyak NIK unmatched tapi valid secara format.<br>• Saran rentang tanggal sync optimal (hindari overlap batch duplikat). |
| **Prediction** | • Prediksi jumlah record **insert vs update vs skip** sebelum submit ke attendance.<br>• Prediksi shift pendek (<6 jam) yang akan diskip (khusus sumber Fingerspot).<br>• Prediksi konflik manual vs log mesin per NIK/tanggal. |
| **Detection** | • Tap ganda, timestamp tidak valid, NIK tidak ada di master.<br>• Lonjakan tap abnormal (mesin error vs fraud pattern). |
| **Assistance** | Dashboard hasil batch: "85% siap submit, 12% perlu mapping NIK, 3% error format". |

---

#### 11. Reset Password (LS HR)

| | Insight |
|---|--------|
| **Recommendation** | • Saran follow-up ke user setelah reset (channel komunikasi standar).<br>• Deteksi permintaan reset berulang → rekomendasi cek onboarding/training. |
| **Prediction** | • Prediksi akun yang akan kembali minta reset (politik password lemah / user belum training). |
| **Detection** | • Pola reset password tidak wajar (volume tinggi, SID sama berulang). |

---

### AI per Peran (Ringkasan Touchpoint)

| Peran | Recommendation utama | Prediction utama |
|-------|---------------------|------------------|
| **LS** | Reminder absen, saran koreksi sebelum submit, checklist cuti/OT | Risiko pending/reject, prediksi keterlambatan clock-in |
| **LS Supervisor** | Prioritas antrian, bulk approve aman, template catatan | Backlog akhir bulan, skor risiko per baris, staffing impact cuti |
| **Vendor** | Checklist submit BAST, saran revisi pre-submit | Risiko reject HR, estimasi siklus sampai paid, varians biaya |
| **LS HR** | Urutan review vendor, perbaikan upload karyawan/log | Vendor terlambat submit, akun belum login, anomaly cross-vendor |
| **SSU** | Prioritas due date, second-pass risk | Timing cashflow paid, probabilitas reject pasca-HR |

---

### Data yang Mendukung AI (Sudah Tersedia di Alur)

AI dapat memanfaatkan sinyal dari proses yang sudah jalan — tanpa alur baru:

- **Absensi**: tanggal, jam in/out, status, geotag, sumber (manual vs log mesin).
- **Cuti/OT**: tipe, rentang tanggal, status, catatan, relasi ke absensi approved.
- **Vendor workflow**: status (`pending_ls_hr` → `paid`), invoice, dokumen, historis reject.
- **Master karyawan**: site, vendor, supervisor, NIK/NPK, status aktif/deactive.
- **Glog batch**: staging error, agregasi harian, statistik insert/update/skip.

Semakin konsisten data historis 3–6 bulan, semakin reliable **prediction**; **recommendation** bisa dimulai lebih cepat dengan rule + AI ringan.

---

### Prioritas Implementasi (Saran)

| Fase | Fokus | Mengapa |
|------|-------|---------|
| **Fase 1 — Quick win** | Detection anomali absensi + recommendation prioritas supervisor | Langsung mengurangi beban review harian; data sudah padat |
| **Fase 2 — Vendor cycle** | Prediction risiko reject BAST + cross-check invoice vs absensi | Impact finansial tinggi; menyentuh LS HR & SSU |
| **Fase 3 — Workforce** | Prediction staffing/cuti + churn absensi | Butuh histori lebih panjang; nilai strategis untuk planning |
| **Fase 4 — Proaktif** | Reminder & prediksi personal untuk LS, onboarding login | Meningkatkan adoption dan mengurangi error input |

---

### Prinsip Implementasi

1. **Human-in-the-loop** — AI merekomendasikan dan memprediksi; approve/reject/submit tetap manusia.
2. **Transparansi** — Setiap rekomendasi disertai alasan singkat ("karena geotag X km dari site").
3. **Ikuti status existing** — Prediksi dan saran merujuk status yang sudah ada (pending, approved, `pending_ls_hr`, dll.), bukan status baru.
4. **Role-aware** — LS tidak melihat insight finansial vendor; SSU tidak melihat rekomendasi geotag detail LS kecuali relevan audit.
5. **Audit trail** — Log kapan AI memberi saran dan apakah user mengikuti/mengabaikan (untuk evaluasi model).

---

Alur modul di atas adalah baseline proses yang **sudah berjalan** di frontend. Bagian AI ini dirancang sebagai **peta peluang**, bukan spesifikasi teknis — detail integrasi (model, API, UI widget) diturunkan setelah prioritas bisnis disepakati.
