# AdPod Skipper

Extension browser yang menangani hingga 10 iklan berurutan (ad pod). Satu basis kode untuk Chrome, Microsoft Edge, Mozilla Firefox, dan Safari (macOS, iOS, iPadOS).

Dokumen ini berisi panduan lengkap: membangun paket, memasang di setiap browser, menguji, sampai merilis ke store.

## Daftar isi

1. [Cara kerja](#1-cara-kerja)
2. [Isi proyek](#2-isi-proyek)
3. [Persiapan dan build](#3-persiapan-dan-build)
4. [Pasang di Google Chrome](#4-pasang-di-google-chrome)
5. [Pasang di Microsoft Edge](#5-pasang-di-microsoft-edge)
6. [Pasang di Mozilla Firefox](#6-pasang-di-mozilla-firefox)
7. [Pasang di Safari (macOS, iPhone, iPad)](#7-pasang-di-safari-macos-iphone-ipad)
8. [Uji apakah berfungsi](#8-uji-apakah-berfungsi)
9. [Rilis ke store](#9-rilis-ke-store)
10. [Memperbarui dan menyesuaikan](#10-memperbarui-dan-menyesuaikan)
11. [Pemecahan masalah](#11-pemecahan-masalah)
12. [Catatan penting](#12-catatan-penting)

---

## 1. Cara kerja

Tiga lapisan bekerja bersamaan, dari yang paling awal sampai yang paling akhir:

| Lapisan | Berkas | Fungsi |
|---|---|---|
| 1. Jaringan | `src/rules/base-*.json`, `extra-*.json`, `src/background.js` | Sekitar 124 ribu aturan `declarativeNetRequest` memblokir permintaan ke server iklan sebelum diunduh. Ditambah pengecualian situs (jeda per situs) |
| 2. Slot iklan | `src/rules/cosmetic.json`, `src/content/cosmetic.js` | Menyembunyikan banner dan kotak iklan yang lolos: sekitar 18 ribu selektor umum dan aturan khusus untuk sekitar 19 ribu situs |
| 3. Iklan video | `src/content/adapters.js`, `engine.js`, `yt-main.js` | Di YouTube, data iklan dibuang dari respons pemutar sebelum dibaca. Bila iklan tetap tampil: klik tombol lewati, atau bisukan lalu majukan iklan ke akhir |

**Sumber daftar filter**

| Daftar | Dipakai untuk | Lisensi |
|---|---|---|
| AdGuard Base (lewat paket `@adguard/dnr-rulesets`) | Jaringan dan kosmetik | GPL-3.0 |
| EasyList (ad servers dan third-party) | Jaringan | GPL-3.0+ atau CC BY-SA 3.0 |
| ABPindo (filter situs Indonesia) | Jaringan dan kosmetik | Lihat repositori sumbernya |
| Daftar kurasi sendiri | Jaringan iklan besar (Taboola, Outbrain, Criteo, dan lainnya) | Bagian dari proyek ini |

Aturan ad pod (untuk iklan video berurutan):

- Setiap iklan video baru menaikkan hitungan. Angkanya tampil di lencana ikon extension.
- Iklan ke-10 tetap ditangani. Setelah itu lencana berubah menjadi `MAX` dan iklan berikutnya dibiarkan berjalan (kendali kembali ke kamu).
- Hitungan direset saat 3 detik berlalu tanpa iklan, atau saat kamu pindah halaman.
- Satu tombol hanya diklik maksimal 3 kali (pencegah salah deteksi).
- Suara dan kecepatan video dikembalikan begitu iklan selesai.
- Pemblokiran jaringan dan penyembunyian slot **tidak** dibatasi 10. Batas ini hanya untuk penanganan iklan video.

**Batas per browser**

- Chrome dan Edge menjamin 30.000 aturan statis per extension. Sisanya memakai kuota global bersama semua extension. AdPod Skipper mengaktifkan ruleset satu per satu sesuai kuota yang tersedia, jadi pada browser yang kuotanya penuh sebagian aturan mungkin tidak aktif.
- Safari hanya menerima paket kecil (sekitar 30.000 aturan pertama). Cakupan jaringan di Safari lebih sempit, tetapi lapisan kosmetik dan video sama.

## 2. Isi proyek

```
adpod-skipper/
  package.json
  README.md
  src/                     kode sumber (satu untuk semua browser)
    manifest.json          manifest dasar (versi Chrome/Edge)
    shared.js              pengaturan dan fungsi bersama
    background.js          aturan jaringan, kosmetik, statistik, lencana
    content/
      cosmetic.js          menyembunyikan slot iklan
      engine.js            handler ad pod (iklan video berurutan)
      adapters.js          deteksi iklan video (YouTube dan pemutar umum)
      yt-main.js           membuang data iklan YouTube (dunia MAIN)
    popup/  options/  onboarding/   antarmuka
    rules/                 daftar filter hasil unduhan (dibuat oleh update-filters)
    icons/
  tools/
    build.mjs              membangun paket per browser
    update-filters.mjs     mengunduh dan mengonversi daftar filter
  test/
    manual-test.html       halaman uji manual
    e2e/                   uji otomatis di Chromium sungguhan
  dist/                    hasil build (dibuat otomatis)
```

## 3. Persiapan dan build

Kamu bisa melewati bagian ini bila memakai paket siap pakai (`adpod-skipper-chromium-v1.1.0.zip`, `adpod-skipper-firefox-v1.1.0.zip`, `adpod-skipper-safari-v1.1.0.zip`). Langsung menuju bagian browser yang kamu pakai.

**Kebutuhan**

- Node.js versi 18 atau lebih baru. Cek dengan `node -v`.
- Perintah `zip`. Cek dengan `zip -v`.
  - macOS dan Linux: biasanya sudah ada.
  - Windows: jalankan build lewat WSL atau Git Bash, atau pakai paket siap pakai.

Build tidak memerlukan `npm install`. Daftar filter sudah disertakan di `src/rules/`.

Untuk memperbarui daftar filter ke versi terbaru (opsional, butuh internet dan `tar`):

```bash
npm run update-filters
```

Perintah ini mengunduh daftar dari GitHub dan npm, lalu menulis ulang `src/rules/`. Jalankan `npm run build` sesudahnya. Disarankan memperbarui setiap beberapa minggu, karena iklan terus berubah.

**Langkah build**

1. Ekstrak `adpod-skipper-project-v1.1.0.zip` ke sebuah folder, misalnya `adpod-skipper`.
2. Buka terminal di folder itu.
3. Jalankan:

   ```bash
   npm run build
   ```

4. Bila berhasil, terminal menampilkan tiga baris (chromium, firefox, safari), dan folder `dist/` berisi:

   ```
   dist/chromium/                      folder untuk Chrome dan Edge
   dist/firefox/                       folder untuk Firefox
   dist/safari/                        folder masukan converter Safari
   dist/adpod-skipper-chromium-v1.1.0.zip
   dist/adpod-skipper-firefox-v1.1.0.zip
   dist/adpod-skipper-safari-v1.1.0.zip
   ```

Setiap browser memakai paket berbeda karena manifest-nya berbeda. Jangan memuat paket Firefox di Chrome, atau sebaliknya.

## 4. Pasang di Google Chrome

Cara ini memakai mode pengembang (Developer mode). Cocok untuk dipakai sendiri dan untuk menguji sebelum rilis.

1. Ekstrak `adpod-skipper-chromium-v1.1.0.zip` ke folder tetap, misalnya `Dokumen/adpod-skipper-chrome`. Jangan hapus atau pindahkan folder ini setelah dipasang, karena Chrome membaca langsung dari sana.
2. Pastikan file `manifest.json` berada tepat di dalam folder tersebut, bukan di dalam subfolder lagi.
3. Buka Chrome, ketik `chrome://extensions` di address bar, lalu tekan Enter.
4. Aktifkan **Developer mode** (tombol geser di kanan atas).
5. Klik **Load unpacked**.
6. Pilih folder dari langkah 1, lalu klik **Select Folder** (atau **Open**).
7. Kartu **AdPod Skipper** muncul di daftar, dan tab sambutan terbuka otomatis. Baca petunjuknya di sana.
8. Sematkan ikon: klik ikon puzzle di toolbar Chrome, lalu klik ikon pin di samping AdPod Skipper.
9. Lanjut ke [bagian 8](#8-uji-apakah-berfungsi) untuk memastikan semuanya bekerja.

Catatan:

- Di beberapa sistem, Chrome menampilkan peringatan tentang extension mode pengembang saat dibuka. Pilih untuk tetap mempertahankannya.
- Untuk pemasangan permanen yang bebas peringatan, terbitkan ke Chrome Web Store dengan visibilitas **Unlisted** (lihat [bagian 9](#9-rilis-ke-store)).
- Browser berbasis Chromium lain (Brave, Opera, Vivaldi) memakai langkah yang sama lewat halaman extensions masing-masing.

## 5. Pasang di Microsoft Edge

Edge memakai paket yang sama dengan Chrome.

1. Ekstrak `adpod-skipper-chromium-v1.1.0.zip` ke folder tetap, misalnya `Dokumen/adpod-skipper-edge`. Pastikan `manifest.json` langsung berada di dalam folder itu.
2. Buka Edge, ketik `edge://extensions` di address bar, lalu tekan Enter.
3. Aktifkan **Developer mode**. Letak tombolnya bergantung versi Edge: di panel kiri, atau di bagian bawah halaman.
4. Klik **Load unpacked**.
5. Pilih folder dari langkah 1, lalu konfirmasi.
6. Tab sambutan terbuka otomatis. Baca petunjuknya.
7. Tampilkan ikon di toolbar: klik ikon **Extensions** (puzzle) di toolbar, lalu klik ikon mata di samping AdPod Skipper.
8. Lanjut ke [bagian 8](#8-uji-apakah-berfungsi).

## 6. Pasang di Mozilla Firefox

Firefox punya satu perbedaan penting: izin akses situs bersifat opsional, jadi kamu harus memberikannya sendiri (langkah 7 di bawah).

### Firefox desktop (pemasangan sementara)

Cara ini paling cepat untuk mencoba. Extension hilang saat Firefox ditutup dan harus dimuat ulang.

1. Ekstrak `adpod-skipper-firefox-v1.1.0.zip` ke sebuah folder. Pastikan `manifest.json` langsung berada di dalam folder itu.
2. Buka Firefox, ketik `about:debugging#/runtime/this-firefox` di address bar, lalu tekan Enter.
3. Klik **Load Temporary Add-on...**
4. Pilih file `manifest.json` di dalam folder dari langkah 1.
5. AdPod Skipper muncul di daftar **Temporary Extensions**.
6. Sematkan ikon: klik ikon **Extensions** (puzzle) di toolbar, klik kanan AdPod Skipper, lalu pilih **Pin to Toolbar**.
7. Berikan izin situs, salah satu dari dua cara:
   - Buka tab sambutan atau klik ikon AdPod Skipper, lalu klik tombol **Berikan izin situs** dan setujui.
   - Atau buka `about:addons`, klik AdPod Skipper, buka tab **Permissions**, lalu aktifkan **Access your data for all websites**.
8. Lanjut ke [bagian 8](#8-uji-apakah-berfungsi).

### Firefox desktop (pemasangan permanen)

Firefox versi rilis hanya menerima extension yang sudah ditandatangani Mozilla. Caranya:

1. Buat akun di `https://addons.mozilla.org/developers/`.
2. Klik **Submit a New Add-on**.
3. Pada pilihan distribusi, pilih **On your own** (tidak tampil di katalog publik).
4. Unggah `adpod-skipper-firefox-v1.1.0.zip`. Bila diminta kode sumber, unggah `adpod-skipper-project-v1.1.0.zip`.
5. Setelah lolos pemeriksaan otomatis, unduh file `.xpi` yang sudah ditandatangani.
6. Seret file `.xpi` ke jendela Firefox, lalu klik **Add**.
7. Berikan izin situs seperti langkah 7 di atas.

Sebelum langkah ini, ganti `gecko.id` seperti dijelaskan di [bagian 9](#9-rilis-ke-store).

### Firefox untuk Android

Firefox Android hanya memasang extension dari addons.mozilla.org. Setelah paket diterbitkan di sana (lihat [bagian 9](#9-rilis-ke-store)):

1. Buka menu Firefox, lalu **Add-ons**.
2. Cari **AdPod Skipper** dan ketuk **Add to Firefox**.
3. Ketuk ikon menu, lalu **Add-ons** dan pastikan AdPod Skipper aktif.
4. Berikan izin situs bila diminta.

Untuk pengujian pengembang di perangkat Android, gunakan alat `web-ext` dengan `adb` (opsional, di luar cakupan dokumen ini).

## 7. Pasang di Safari (macOS, iPhone, iPad)

Safari memerlukan langkah tambahan: paket harus dikonversi menjadi aplikasi lewat Xcode.

**Kebutuhan**

- Mac dengan macOS terbaru.
- Xcode terpasang dari Mac App Store (buka sekali agar komponennya selesai terpasang).
- Untuk uji lokal di Mac atau simulator: akun Apple ID gratis sudah cukup.
- Untuk iPhone atau iPad fisik dan untuk App Store: Apple Developer Program (berbayar).

### A. Konversi paket menjadi proyek Xcode

1. Ekstrak `adpod-skipper-safari-v1.1.0.zip` ke folder tetap, misalnya `~/Documents/adpod-skipper-safari`.
2. Buka **Terminal**.
3. Arahkan Xcode command line tools ke Xcode (sekali saja):

   ```bash
   sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
   ```

4. Jalankan converter (ganti `namakamu` dengan nama unikmu):

   ```bash
   xcrun safari-web-extension-converter ~/Documents/adpod-skipper-safari \
     --app-name "AdPod Skipper" \
     --bundle-identifier com.namakamu.adpodskipper \
     --project-location ~/Documents/adpod-skipper-xcode \
     --swift
   ```

5. Converter membuat proyek Xcode dan membukanya otomatis. Bila ada peringatan tentang key manifest yang tidak didukung, abaikan selama proyek berhasil dibuat.

### B. Jalankan di Mac

1. Di jendela Xcode, pada bagian atas pilih scheme **AdPod Skipper (macOS)** dan tujuan **My Mac**.
2. Di panel kiri klik proyek **AdPod Skipper**, lalu untuk **kedua** target (aplikasi dan extension) buka tab **Signing & Capabilities**:
   - Centang **Automatically manage signing**.
   - Pilih **Team** (Personal Team dari Apple ID-mu cukup untuk uji lokal).
3. Klik tombol **Run** (segitiga) atau tekan `Command + R`. Aplikasi pembungkus terbuka dan menampilkan tombol untuk membuka pengaturan extension Safari.
4. Buka **Safari**, lalu:
   - Menu **Safari**, **Settings**, tab **Advanced**, centang **Show features for web developers** (di versi lama: **Show Develop menu in menu bar**).
   - Menu **Develop**, pilih **Allow Unsigned Extensions**. Opsi ini perlu dinyalakan lagi setiap kali Safari dibuka ulang saat memakai build pengembangan.
5. Buka **Safari**, **Settings**, tab **Extensions**, lalu centang **AdPod Skipper**.
6. Klik **Edit Websites...**, cari AdPod Skipper, lalu ubah **When visiting other websites** menjadi **Allow**. Tanpa ini extension tidak bisa membaca halaman.
7. Tampilkan ikon: klik kanan toolbar Safari, pilih **Customize Toolbar...**, lalu seret ikon AdPod Skipper ke toolbar.
8. Lanjut ke [bagian 8](#8-uji-apakah-berfungsi).

### C. Jalankan di iPhone atau iPad

1. Di Xcode, pilih scheme **AdPod Skipper (iOS)**.
2. Pilih tujuan:
   - **Simulator**: pilih iPhone atau iPad simulator. Tidak perlu akun berbayar.
   - **Perangkat fisik**: sambungkan perangkat dengan kabel, buka **Settings**, **Privacy & Security**, lalu aktifkan **Developer Mode** (perangkat akan restart). Setelah itu pilih perangkat di Xcode.
3. Atur **Team** untuk kedua target seperti pada langkah B.2, lalu klik **Run**.
4. Di iPhone atau iPad, aktifkan extension:
   - iOS 18 atau lebih baru: **Settings**, **Apps**, **Safari**, **Extensions**, ketuk **AdPod Skipper**, aktifkan, lalu set **All Websites** ke **Allow**.
   - iOS 17 atau lebih lama: **Settings**, **Safari**, **Extensions**, lalu langkah yang sama.
5. Di Safari iPhone, ketuk ikon **aA** di address bar, pilih **Manage Extensions**, dan pastikan AdPod Skipper aktif. Ketuk namanya di menu yang sama untuk membuka popup.
6. Buka `http://alamat-ip-komputermu:8000/test/manual-test.html` (lihat bagian 8) untuk menguji di perangkat.

Bila muncul pesan perangkat tidak mempercayai developer, buka **Settings**, **General**, **VPN & Device Management**, lalu pilih profil developer-mu dan ketuk **Trust**.

## 8. Uji apakah berfungsi

### Uji manual (semua browser)

1. Buka terminal di folder proyek, lalu jalankan server lokal:

   ```bash
   python3 -m http.server 8000
   ```

   Di Windows tanpa Python, bisa memakai `npx serve` sebagai gantinya.
2. Buka `http://localhost:8000/test/manual-test.html` di browser yang sudah terpasang extension-nya.
3. Hasil yang benar:
   - Tabel jaringan: kedelapan domain iklan berstatus **diblokir**.
   - Enam kotak kuning (slot iklan) menghilang, teks biasa tetap tampil.
4. Klik ikon AdPod Skipper. Kolom **Diblokir di sini** menampilkan jumlah permintaan yang diblokir pada tab itu (di Chrome dan Edge).
5. Matikan extension lewat popup atau aktifkan **Jeda di situs ini**, muat ulang: semua domain berstatus dimuat dan kotak kuning muncul kembali.

Uji lain yang berguna:

| Uji | Cara | Hasil yang benar |
|---|---|---|
| Situs berita | Buka situs berita yang banyak iklannya | Banner hilang, halaman tidak rusak |
| Iklan video | Putar video YouTube | Iklan pra-putar tidak muncul, atau langsung dilewati |
| Ubah batas | Pengaturan, geser batas ke 5 | Rangkaian iklan video berhenti ditangani di iklan ke-5 dan lencana menampilkan MAX |
| Jeda per situs | Popup, **Jeda di situs ini** | Situs itu tampil apa adanya |
| Situs rusak | Situs tampil aneh setelah dipasang | Jeda situs itu dan laporkan |

### Uji otomatis (Chromium)

Uji ini memuat extension ke Chromium sungguhan dan memeriksa 18 hal: pemblokiran jaringan, pengecualian situs, penyembunyian slot, penanganan rangkaian iklan video (termasuk batas 10), pembuangan data iklan YouTube, dan bebas error di popup, pengaturan, serta sambutan.

Kebutuhan: Node 18+, `xvfb` (Linux), `ffmpeg`, `openssl`, dan biner Chromium. Chrome bermerek versi 137 ke atas tidak menerima pemuatan extension lewat argumen baris perintah, jadi pakai Chromium biasa (misalnya build ungoogled-chromium atau Chromium dari distribusi Linux).

```bash
cd test/e2e
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install
mkdir -p fixtures && ffmpeg -y -f lavfi -i color=c=orange:s=320x180:d=6:r=15 -f lavfi -i sine=f=440:d=6 \
  -c:v libvpx -b:v 200k -c:a libopus fixtures/ad.webm
cd ../..
xvfb-run -a node test/e2e/e2e.mjs "$PWD/dist/chromium" /jalur/ke/chrome
```

Uji ini memakai halaman tiruan lokal, bukan situs sungguhan. Firefox dan Safari tidak ikut diuji secara otomatis.

## 9. Rilis ke store

### Persiapan umum

Lakukan sekali sebelum mengirim ke store mana pun:

1. Ubah `gecko.id` di `tools/build.mjs` dari `adpod-skipper@example.com` menjadi ID milikmu, misalnya `adpod-skipper@domainkamu.com`. ID ini tidak boleh berubah lagi setelah terbit.
2. Ganti bundle identifier Safari (`com.namakamu.adpodskipper`) dengan milikmu.
3. Naikkan `version` di `src/manifest.json` setiap kali mengirim pembaruan.
4. Jalankan `npm run build`, lalu uji ulang di keempat browser.
5. Siapkan materi berikut:
   - Tangkapan layar (disarankan 1280 x 800 piksel), minimal 1 dan idealnya 3 sampai 5. Ambil dari popup, halaman pengaturan, dan halaman uji.
   - Deskripsi singkat dan deskripsi panjang.
   - URL kebijakan privasi. Isi singkat yang benar: extension tidak mengumpulkan atau mengirim data apa pun, dan semua pengaturan serta statistik hanya tersimpan di perangkat pengguna.
   - Justifikasi izin (teks siap pakai di bawah).

**Justifikasi izin**

| Izin | Alasan |
|---|---|
| `declarativeNetRequest` | Memblokir permintaan ke server iklan |
| `storage` | Menyimpan pengaturan dan statistik di perangkat |
| `activeTab` | Membaca nama situs pada tab aktif untuk fitur jeda per situs |
| Akses semua situs (`<all_urls>`) | Mendeteksi dan menangani iklan di halaman mana pun yang dibuka pengguna |

### Chrome Web Store

1. Buka `https://chrome.google.com/webstore/devconsole` dan daftar sebagai developer. Ada biaya pendaftaran satu kali.
2. Klik **New item**, lalu unggah `adpod-skipper-chromium-v1.1.0.zip`.
3. Isi tab **Store listing**: deskripsi, kategori, tangkapan layar, dan ikon.
4. Isi tab **Privacy**: tujuan tunggal (menangani iklan berurutan), justifikasi setiap izin, pernyataan bahwa tidak ada data pengguna yang dikumpulkan, dan URL kebijakan privasi.
5. Pilih visibilitas: **Public**, **Unlisted** (hanya yang punya tautan), atau **Private**.
6. Klik **Submit for review**. Lama peninjauan bervariasi.

### Microsoft Edge Add-ons

1. Buka Partner Center untuk Edge di `https://partner.microsoft.com/dashboard/microsoftedge` dan daftar (gratis).
2. Klik **Create new extension**, lalu unggah paket yang sama: `adpod-skipper-chromium-v1.1.0.zip`.
3. Isi listing, tangkapan layar, kategori, dan kebijakan privasi.
4. Klik **Publish**, lalu tunggu hasil peninjauan.

### Firefox Add-ons (addons.mozilla.org)

1. Buka `https://addons.mozilla.org/developers/` dan masuk dengan akun Firefox.
2. Klik **Submit a New Add-on**, lalu pilih **On this site** untuk tampil di katalog publik.
3. Unggah `adpod-skipper-firefox-v1.1.0.zip`.
4. Bila diminta kode sumber, unggah `adpod-skipper-project-v1.1.0.zip` dan sertakan catatan: jalankan `npm run build`.
5. Isi listing, kategori, tangkapan layar, dan kebijakan privasi, lalu kirim.

Manifest Firefox sudah mendeklarasikan `data_collection_permissions` dengan nilai `none`, sesuai persyaratan Mozilla untuk extension yang tidak mengumpulkan data.

### Safari (App Store)

1. Daftar ke Apple Developer Program.
2. Di App Store Connect, buat aplikasi baru dengan bundle identifier yang sama dengan proyek Xcode.
3. Di Xcode, pilih tujuan **Any Mac** (atau **Any iOS Device**), lalu menu **Product**, **Archive**.
4. Di jendela Organizer, pilih arsip, klik **Distribute App**, pilih **App Store Connect**, lalu ikuti langkahnya.
5. Di App Store Connect isi deskripsi, tangkapan layar, kategori, dan URL kebijakan privasi, lalu kirim untuk ditinjau.

## 10. Memperbarui dan menyesuaikan

**Memuat ulang setelah mengubah kode**

1. Jalankan `npm run build`.
2. Muat ulang extension:
   - Chrome dan Edge: buka halaman extensions, klik ikon muat ulang pada kartu AdPod Skipper.
   - Firefox: buka `about:debugging#/runtime/this-firefox`, klik **Reload** pada AdPod Skipper.
   - Safari: jalankan ulang dari Xcode dengan `Command + R`. Bila isi `dist/safari` berubah, ulangi konversi pada bagian 7A.
3. Muat ulang halaman yang sedang diuji.

**Menyesuaikan**

| Ingin mengubah | Ubah di |
|---|---|
| Perbarui daftar filter | `npm run update-filters`, lalu build ulang |
| Tambah domain iklan besar | Daftar `CURATED` di `tools/update-filters.mjs`, lalu jalankan update-filters |
| Tambah dukungan iklan video situs tertentu | Fungsi adapter di `src/content/adapters.js` |
| Tambah slot yang lolos di satu situs | Objek `BUILTIN_D` di `src/background.js` |
| Ubah batas default | `maxChain` di `src/shared.js` |
| Ubah warna tampilan | Variabel di bagian atas `src/ui.css` |

## 11. Pemecahan masalah

| Masalah | Penyebab dan solusi |
|---|---|
| `zip: command not found` saat build | Pasang `zip` (`sudo apt install zip` di Linux), atau jalankan lewat WSL atau Git Bash di Windows, atau pakai paket siap pakai |
| Chrome: "Manifest file is missing or unreadable" | Folder yang dipilih salah. Pilih folder yang langsung berisi `manifest.json`, bukan folder induknya |
| Chrome: peringatan tentang `background.scripts` atau service worker gagal | Paket Firefox atau Safari dimuat di Chrome. Pakai paket `chromium` |
| Firefox: extension tidak bekerja di halaman | Izin situs belum diberikan. Lihat langkah 7 pada bagian 6 |
| Firefox: extension hilang setelah restart | Pemasangan sementara memang begitu. Gunakan pemasangan permanen lewat penandatanganan |
| Safari: extension tidak muncul di daftar | Jalankan aplikasi dari Xcode sekali, lalu buka Safari, Settings, Extensions. Pastikan **Allow Unsigned Extensions** menyala |
| Safari: extension aktif tapi tidak berfungsi | **Edit Websites...** belum diatur ke **Allow**. Lihat langkah B.6 |
| Xcode: "Signing requires a development team" | Pilih Team pada **Signing & Capabilities** untuk kedua target |
| Lencana tidak muncul | Normal bila belum ada iklan video yang ditangani. Pemblokiran jaringan dan penyembunyian slot berjalan tanpa lencana. Uji dengan halaman di bagian 8 |
| Iklan YouTube masih sesekali muncul | YouTube sering mengubah cara menyisipkan iklan (termasuk yang disisipkan di sisi server, tidak bisa dibuang). Perbarui extension secara berkala dan laporkan kasusnya |
| Popup menampilkan "Diblokir di sini: -" | Firefox dan Safari tidak menyediakan hitungan permintaan yang diblokir |
| Hanya sebagian ruleset aktif | Kuota aturan global browser terbatas. Tutup extension pemblokir iklan lain agar kuota bebas |
| Suara video tetap bisu | Matikan **Lewati iklan video** di Pengaturan, lalu laporkan situs dan videonya |
| Situs rusak atau tampil aneh | Aktifkan **Jeda di situs ini** di popup, atau tambahkan situs ke daftar dikecualikan |
| Popup menampilkan "Halaman ini tidak didukung" | Halaman internal browser (misalnya `chrome://`) tidak bisa dimodifikasi extension |

Untuk melihat pesan error:

- Chrome dan Edge: di kartu extension klik **service worker** (untuk background) atau **Errors**.
- Firefox: di `about:debugging`, klik **Inspect** pada AdPod Skipper.
- Safari: menu **Develop**, **Web Extension Background Content**, lalu pilih AdPod Skipper.

## 12. Catatan penting

- Beberapa situs dan platform video melarang penghindaran iklan dalam ketentuan layanannya. Tinjau ketentuan tersebut dan kebijakan store sebelum merilis.
- Tampilan iklan berubah sewaktu-waktu. Adapter situs dan selektor perlu dirawat dan diuji berkala.
- Pemblokiran jaringan sengaja tidak menyentuh SDK pemutar seperti Google IMA agar pemutar video tidak rusak. Iklan video ditangani oleh engine di sisi halaman.
- Banyak situs hidup dari iklan. Gunakan daftar situs dikecualikan untuk situs yang ingin kamu dukung.
- Semua data tersimpan lokal di perangkat. Extension tidak mengirim data ke server mana pun.
- Daftar filter yang disertakan berlisensi GPL-3.0 (AdGuard, EasyList) dan lisensi lain. Bila kamu mendistribusikan extension ini, sertakan teks lisensi, sebutkan sumber daftar, dan sediakan kode sumbernya. Periksa sendiri kewajiban lisensinya sebelum rilis.
- Peringatan `COINMINER_USAGE_DETECTED` pada `addons-linter` Firefox berasal dari nama domain penambang koin di dalam daftar blokir, bukan dari kode yang menambang. Jelaskan hal ini di catatan pengiriman ke Mozilla.
- Ukuran paket sekitar 3 MB (ruleset di dalamnya dimampatkan saat di-zip, sekitar 24 MB setelah dibuka).
