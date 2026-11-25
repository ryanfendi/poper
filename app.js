
<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>POPER</title>
<link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js"></script>

<style>
:root {
  --bg:#f4f5fb;
  --card:#ffffff;
  --text:#20243a;
  --muted:#7d8299;
  --primary:#7357ef;
  --border:#e8e9f2;
  --input:#f7f7fb;
}
body.dark {
  --bg:#151622;
  --card:#212333;
  --text:#f4f4ff;
  --muted:#a4a6bb;
  --primary:#927aff;
  --border:#34364b;
  --input:#2a2c40;
}
*{box-sizing:border-box}
body {
  margin:0;
  background:var(--bg);
  color:var(--text);
  font-family:Inter,sans-serif;
  transition:.2s;
}
button,input,textarea,select{font:inherit}
button{cursor:pointer}
.hidden{display:none!important}
header{
  padding:16px;
  display:flex;
  justify-content:space-between;
  align-items:center;
  position:sticky;
  top:0;
  z-index:10;
  background:var(--bg);
}
.logo{
  font:800 27px "Baloo 2";
  color:var(--primary);
}
.wrap{max-width:850px;margin:auto;padding:12px 15px 100px}
.card{
  background:var(--card);
  border:1px solid var(--border);
  border-radius:20px;
  padding:17px;
  margin-bottom:15px;
}
h2{font-size:18px;margin:0 0 14px}
h3{font-size:15px}
p{line-height:1.6}
small,.muted{color:var(--muted)}
input,textarea,select{
  width:100%;
  padding:12px;
  background:var(--input);
  color:var(--text);
  border:1px solid var(--border);
  border-radius:12px;
  margin:6px 0 12px;
  outline:none;
}
textarea{min-height:100px;resize:vertical}
input[type=color]{height:45px;padding:4px}
input[type=file]{padding:9px}
.btn{
  border:0;
  border-radius:12px;
  padding:12px 16px;
  background:var(--primary);
  color:white;
  font-weight:700;
}
.btn.secondary{
  background:var(--input);
  color:var(--text);
  border:1px solid var(--border);
}
.btn.danger{background:#e84f65}
.btn.small{padding:8px 12px;font-size:12px}
.row{display:flex;gap:9px;align-items:center;flex-wrap:wrap}
.row>*{flex:1}
.tabs{
  display:flex;
  overflow:auto;
  gap:8px;
  padding:6px 0 12px;
}
.tab{
  flex-shrink:0;
  padding:10px 14px;
  border:0;
  border-radius:12px;
  background:var(--card);
  color:var(--muted);
}
.tab.active{background:var(--primary);color:white}
label{font-size:13px;font-weight:600}
.link-editor{
  border:1px solid var(--border);
  border-radius:15px;
  padding:14px;
  margin:12px 0;
  background:var(--input);
}
.link-editor img{
  width:65px;height:65px;object-fit:cover;border-radius:12px;
}
.preview-box{
  min-height:100px;
  border:1px dashed var(--border);
  border-radius:16px;
  overflow:hidden;
  padding:12px;
}
.preview-frame{
  width:100%;
  height:450px;
  border:1px solid var(--border);
  border-radius:15px;
  background:white;
}
.bio-preview{
  padding:22px 15px;
  border-radius:18px;
  text-align:center;
  min-height:250px;
  overflow:hidden;
}
.bio-preview .bio-btn{
  display:block;
  text-decoration:none;
  margin:10px auto;
  max-width:450px;
  padding:14px;
  font-weight:700;
  overflow-wrap:anywhere;
}
.bio-preview .bio-btn img{
  display:block;
  max-width:100%;
  max-height:180px;
  margin:auto;
  border-radius:12px;
  object-fit:contain;
}
.wiggle{animation:wiggle 1.6s infinite}
@keyframes wiggle{
  0%,100%{transform:rotate(0)}
  25%{transform:rotate(-2deg) scale(1.02)}
  75%{transform:rotate(2deg) scale(1.02)}
}
.page-card{
  border:1px solid var(--border);
  border-radius:14px;
  padding:12px;
  margin:10px 0;
}
#cameraVideo{
  width:100%;
  border-radius:14px;
  background:#000;
}
.bottom-nav{
  position:fixed;
  bottom:0;
  left:0;right:0;
  z-index:20;
  background:var(--card);
  border-top:1px solid var(--border);
  display:flex;
  justify-content:space-around;
  padding:8px 3px env(safe-area-inset-bottom,5px);
}
.bottom-nav button{
  border:0;background:none;
  color:var(--muted);
  font-size:11px;
  padding:8px 5px;
}
.bottom-nav button.active{color:var(--primary);font-weight:800}
.status{font-size:13px;margin:6px 0;color:var(--primary)}
#loginPanel{max-width:430px;margin:35px auto;padding:20px}
@media(min-width:650px){
  .wrap{padding-top:20px}
  .bottom-nav{max-width:850px;left:50%;transform:translateX(-50%);border-radius:18px 18px 0 0}
}
</style>
</head>

<body>

<header>
  <div class="logo">POPER</div>
  <div class="row" style="flex:0;gap:7px">
    <button class="btn secondary small" id="themeToggle">🌙</button>
    <button class="btn danger small hidden" id="logoutBtn">Keluar</button>
  </div>
</header>

<!-- LOGIN -->
<div id="loginPanel" class="card">
  <h2>Selamat datang di POPER 👋</h2>
  <p class="muted">Masuk menggunakan nomor HP.</p>
  <input id="loginPhone" placeholder="+62 81234567890" inputmode="tel">
  <div id="recaptcha-container"></div>
  <button class="btn" id="sendOtpBtn">Kirim OTP</button>
  <div id="otpArea" class="hidden">
    <input id="otpCode" placeholder="Masukkan kode OTP" inputmode="numeric">
    <button class="btn" id="verifyOtpBtn">Verifikasi OTP</button>
  </div>
  <div id="loginStatus" class="status"></div>
</div>

<!-- DASHBOARD -->
<div id="dashboard" class="hidden">
<div class="wrap">
  <div class="tabs">
    <button class="tab active" data-tab="bio">🔗 Bio Link</button>
    <button class="tab" data-tab="pages">📄 Pages</button>
    <button class="tab" data-tab="scan">📷 Scanner</button>
    <button class="tab" data-tab="find">🔎 Cari</button>
    <button class="tab" data-tab="qr">▦ QR</button>
    <button class="tab" data-tab="notes">📝 Notes</button>
  </div>

  <!-- BIO LINK -->
  <section id="tab-bio">
    <div class="card">
      <h2>Profil Bio Link</h2>
      <label>Nama profil</label>
      <input id="bioTitle" placeholder="Nama kamu">
      <label>Deskripsi</label>
      <textarea id="bioDesc" placeholder="Ceritakan tentang kamu"></textarea>

      <h3>Background</h3>
      <label>Jenis background</label>
      <select id="bioBgType">
        <option value="solid">Solid</option>
        <option value="gradient">Gradient</option>
      </select>
      <div class="row">
        <div><label>Warna 1</label><input id="bioBgColor" type="color" value="#7357ef"></div>
        <div><label>Warna 2</label><input id="bioBgColor2" type="color" value="#b8aaff"></div>
      </div>
      <div class="row">
        <div><label>Warna teks</label><input id="bioTextColor" type="color" value="#ffffff"></div>
        <div><label>Warna tombol</label><input id="bioButtonColor" type="color" value="#ffffff"></div>
      </div>
      <div class="row">
        <div><label>Warna teks tombol</label><input id="bioButtonTextColor" type="color" value="#333333"></div>
        <div>
          <label>Bentuk tombol</label>
          <select id="bioButtonShape">
            <option value="rounded">Rounded</option>
            <option value="pill">Pill</option>
            <option value="square">Square</option>
          </select>
        </div>
      </div>
    </div>

    <!-- ADD LINK -->
    <div class="card">
      <h2>Tambah Bio Link</h2>
      <label>Nama link</label>
      <input id="bioName" placeholder="Contoh: Instagram saya">
      <label>URL link</label>
      <input id="bioUrl" placeholder="https://...">
      <label>Gambar tombol (opsional)</label>
      <input id="bioImage" type="file" accept="image/*">
      <div id="bioImagePreview"></div>
      <label>Warna tombol</label>
      <input id="linkColor" type="color" value="#ffffff">
      <label>Warna tulisan</label>
      <input id="linkTextColor" type="color" value="#333333">
      <label>Animasi</label>
      <select id="bioWiggle">
        <option value="off">Diam</option>
        <option value="on">Goyang</option>
      </select>
      <div class="row">
        <button class="btn" id="addBioLink">＋ Tambah Link</button>
        <button class="btn secondary" id="clearBioImage">Hapus gambar</button>
      </div>
      <div id="bioLinks"></div>
    </div>

    <!-- PREVIEW BIO -->
    <div class="card">
      <h2>Preview Bio Link</h2>
      <div id="bioPreview" class="preview-box"></div>
      <button class="btn" id="saveBio">💾 Simpan Bio Link</button>
      <p id="bioStatus" class="status"></p>
      <button class="btn secondary" id="openMyPublicBio">🔗 Buka Bio Link Saya</button>
    </div>

    <!-- LINK PAGES IN BIO -->
    <div class="card">
      <h2>Landing Page di Bio</h2>
      <p class="muted">Pilih halaman yang ingin ditampilkan di Bio Link.</p>
      <div id="bioLandingList"></div>
    </div>
  </section>

  <!-- PAGES -->
  <section id="tab-pages" class="hidden">
    <div class="card">
      <h2>Landing Page Builder</h2>
      <label>Judul halaman</label>
      <input id="pageTitle" placeholder="Judul halaman">
      <label>Nama link / slug</label>
      <input id="pageSlug" placeholder="contoh: tentang-saya">
      <label>Mode editor</label>
      <select id="pageMode">
        <option value="visual">Editor teks</option>
        <option value="html">Editor HTML</option>
      </select>

      <div id="visualEditorArea">
        <label>Konten halaman</label>
        <div class="row">
          <button class="btn secondary small" data-format="bold"><b>B</b></button>
          <button class="btn secondary small" data-format="italic"><i>I</i></button>
          <button class="btn secondary small" data-format="insertUnorderedList">☷ List</button>
        </div>
        <div id="visualEditor" contenteditable="true" style="min-height:200px;border:1px solid var(--border);padding:12px;border-radius:12px;background:var(--input);margin:10px 0">
          <h2>Judul halaman</h2><p>Tulis konten halaman kamu di sini...</p>
        </div>
      </div>

      <div id="htmlEditorArea" class="hidden">
        <label>HTML</label>
        <textarea id="htmlEditor" style="min-height:260px;font-family:monospace" placeholder="Tulis HTML di sini..."></textarea>
      </div>

      <label>Preview halaman</label>
      <div class="row">
        <button class="btn" id="previewPage">👁 Preview</button>
        <button class="btn secondary" id="clearPageEditor">Bersihkan</button>
      </div>
      <iframe id="pagePreviewFrame" class="preview-frame" title="Preview landing page" sandbox="allow-same-origin"></iframe>

      <label style="display:flex;gap:8px;align-items:center;margin:15px 0">
        <input type="checkbox" id="pageShowInBio" style="width:auto;margin:0">
        Tampilkan link halaman di Bio
      </label>

      <button class="btn" id="savePage">💾 Simpan Landing Page</button>
      <div id="pageStatus" class="status"></div>
    </div>

    <div class="card">
      <h2>Landing Page Saya</h2>
      <div id="pagesList"></div>
    </div>
  </section>

  <!-- SCANNER -->
  <section id="tab-scan" class="hidden">
    <div class="card">
      <h2>Scanner Nomor HP</h2>
      <video id="cameraVideo" autoplay playsinline></video>
      <div class="row">
        <button class="btn" id="startCameraBtn">Buka Kamera</button>
        <button class="btn secondary" id="captureBtn">Ambil Foto</button>
        <button class="btn secondary" id="stopCameraBtn">Stop</button>
      </div>
      <input id="scanImageInput" type="file" accept="image/*">
      <button class="btn" id="uploadScanBtn">Scan Gambar</button>
      <div id="scanStatus" class="status"></div>
      <div id="ocrResults"></div>
      <input id="scanPhoneResult" placeholder="Nomor HP terdeteksi">
      <button class="btn" id="searchScannedPhone">Cari Bio</button>
    </div>
  </section>

  <!-- FIND -->
  <section id="tab-find" class="hidden">
    <div class="card">
      <h2>Cari Bio berdasarkan HP</h2>
      <input id="findPhone" placeholder="Nomor HP" inputmode="tel">
      <button class="btn" id="findBio">Cari</button>
      <div id="findResult"></div>
    </div>
  </section>

  <!-- QR -->
  <section id="tab-qr" class="hidden">
    <div class="card">
      <h2>QR Vault</h2>
      <input id="qrName" placeholder="Nama QR">
      <input id="qrUrl" placeholder="URL">
      <button class="btn" id="saveQR">Simpan QR</button>
      <div id="qrScanStatus"></div>
      <div id="qrList"></div>
    </div>
  </section>

  <!-- NOTES -->
  <section id="tab-notes" class="hidden">
    <div class="card">
      <h2>Notes</h2>
      <input id="noteTitle" placeholder="Judul catatan">
      <textarea id="noteContent" placeholder="Isi catatan"></textarea>
      <button class="btn" id="saveNote">Simpan catatan</button>
      <div id="notesList"></div>
    </div>
  </section>
</div>

<!-- PUBLIC BIO -->
<div id="publicPageView" class="hidden">
  <div class="wrap">
    <button class="btn secondary" id="publicBack">← Kembali</button>
    <div id="publicPageError" class="status"></div>
    <div id="publicPageContent"></div>
  </div>
</div>

<div id="bottomNav" class="bottom-nav hidden">
  <button data-tab="bio">🔗<br>Bio</button>
  <button data-tab="pages">📄<br>Pages</button>
  <button data-tab="scan">📷<br>Scan</button>
  <button data-tab="find">🔎<br>Cari</button>
  <button data-tab="qr">▦<br>QR</button>
  <button data-tab="notes">📝<br>Notes</button>
</div>
</div>

<script type="module" src="./app.js"></script>
</body>
</html>
