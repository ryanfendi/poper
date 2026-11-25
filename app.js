
import "./firebase.js";

const $ = id => document.getElementById(id);
const auth = window.POPER.auth;

let confirmation = null;
let links = [];

/* =========================================
   PHONE OCR VARIABLES
========================================= */

let phoneCameraStream = null;
let phoneOCRWorker = null;
let phoneOCRBusy = false;
let phoneOCRActive = false;
let phoneOCRTimer = null;
let lastDetectedPhone = "";

let cameraStream = null;
let cameraActive = false;
let cameraFrame = null;
let scannedQRValue = "";

/* =========================================
   UTILITIES
========================================= */

function status(id, text, color) {
  const el = $(id);
  if (!el) return;

  el.textContent = text;

  if (color) el.style.color = color;
}

function safeURL(url) {
  try {
    const u = new URL(url);

    if (u.protocol === "https:" || u.protocol === "http:") {
      return u.href;
    }
  } catch {}

  return "";
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);
}

function phoneKey(phone) {
  return window.POPER.normalizePhone(phone)
    .replace(/\D/g, "");
}

function currentUser() {
  return auth?.currentUser || null;
}

/* =========================================
   NAVIGATION
========================================= */

function showSection(name) {
  const target = name === "scanner" ? "phoneScanner" : name;

  document.querySelectorAll(".section").forEach(section => {
    section.classList.toggle("active", section.id === target);
  });

  document.querySelectorAll(".nav-btn").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.tab === (name === "scanner" ? "scan" : name)
    );
  });

  if (name !== "scanner") {
    stopPhoneScanner();
  }

  if (name !== "qr") {
    stopCameraScanner();
  }

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

document.querySelectorAll("[data-tab]").forEach(button => {
  button.addEventListener("click", () => {
    showSection(button.dataset.tab);
  });
});

document.querySelectorAll("[data-open-tab]").forEach(button => {
  button.addEventListener("click", () => {
    showSection(button.dataset.openTab);
  });
});

$("mainScanButton")?.addEventListener("click", () => {
  showSection("scanner");
});

$("mainScanButton")?.addEventListener("click", () => {
  startPhoneScanner();
});

$("backFromScanner")?.addEventListener("click", () => {
  stopPhoneScanner();
  showSection("scan");
});

$("mainScanButton")?.addEventListener("click", async () => {
  showSection("scanner");
  await startPhoneScanner();
});

/* =========================================
   AUTH UI
========================================= */

function loginUI(user) {
  const loginPanel = $("loginPanel");
  const dashboard = $("dashboard");
  const logoutBtn = $("logoutBtn");
  const bottomNav = $("appBottomNav");

  if (!user) {
    if (loginPanel) loginPanel.hidden = false;
    if (dashboard) dashboard.hidden = true;
    if (logoutBtn) logoutBtn.hidden = true;
    if (bottomNav) bottomNav.hidden = true;

    stopPhoneScanner();
    stopCameraScanner();

    return;
  }

  if (loginPanel) loginPanel.hidden = true;
  if (dashboard) dashboard.hidden = false;
  if (logoutBtn) logoutBtn.hidden = false;
  if (bottomNav) bottomNav.hidden = false;

  if ($("welcome")) {
    $("welcome").textContent = "Halo, pengguna POPER!";
  }

  if ($("myPhone")) {
    $("myPhone").textContent = user.phoneNumber || "";
  }

  showSection("scan");
  loadAll();
}

$("sendOtpBtn")?.addEventListener("click", async () => {
  const phone = $("phoneInput")?.value.trim();

  if (!phone) {
    status("authStatus", "Masukkan nomor HP terlebih dahulu.");
    return;
  }

  try {
    status("authStatus", "Mengirim kode OTP...");

    confirmation = await window.POPER.sendOTP(phone);

    if ($("otpSection")) {
      $("otpSection").hidden = false;
    }

    status("authStatus", "OTP berhasil dikirim. Periksa SMS.");
  } catch (error) {
    status("authStatus", error.message || "Gagal mengirim OTP.");

    try {
      window.POPER.resetRecaptcha();
    } catch {}
  }
});

$("verifyOtpBtn")?.addEventListener("click", async () => {
  const code = $("otpInput")?.value.trim();

  if (!confirmation || !code) {
    status("authStatus", "Masukkan kode OTP.");
    return;
  }

  try {
    status("authStatus", "Memverifikasi OTP...");

    const result = await confirmation.confirm(code);

    loginUI(result.user);

    status("authStatus", "Login berhasil!");
  } catch (error) {
    status("authStatus", error.message || "OTP salah.");
  }
});

$("logoutBtn")?.addEventListener("click", async () => {
  stopPhoneScanner();
  stopCameraScanner();

  try {
    await window.POPER.logout();
  } catch (error) {
    status("authStatus", error.message || "Gagal logout.");
  }
});

/* =========================================
   BIO LINKS
========================================= */

$("addBioLink")?.addEventListener("click", () => {
  const title = $("bioTitle")?.value.trim();
  const url = safeURL($("bioUrl")?.value.trim());

  if (!title || !url) {
    status("bioStatus", "Isi judul dan URL valid.");
    return;
  }

  links.push({ title, url });

  if ($("bioTitle")) $("bioTitle").value = "";
  if ($("bioUrl")) $("bioUrl").value = "";

  renderLinks();
});

function renderLinks() {
  const container = $("bioLinks");
  if (!container) return;

  container.innerHTML = links.map((link, i) => `
    <div class="item link-item">
      <div>
        <strong>${escapeHTML(link.title)}</strong>
        <small>${escapeHTML(link.url)}</small>
      </div>
      <button class="secondary" data-delete-link="${i}">✕</button>
    </div>
  `).join("");

  container.querySelectorAll("[data-delete-link]").forEach(button => {
    button.addEventListener("click", () => {
      links.splice(Number(button.dataset.deleteLink), 1);
      renderLinks();
    });
  });
}

$("saveBio")?.addEventListener("click", async () => {
  const user = currentUser();
  if (!user) return;

  try {
    const data = {
      name: $("bioName")?.value.trim() || "",
      description: $("bioDesc")?.value.trim() || "",
      phone: user.phoneNumber || "",
      links,
      updatedAt: Date.now()
    };

    await window.POPER.saveData(
      `users/${user.uid}/publicBio`,
      data
    );

    await window.POPER.saveData(
      `phoneLookup/${phoneKey(user.phoneNumber)}`,
      {
        uid: user.uid,
        phone: user.phoneNumber
      }
    );

    status("bioStatus", "Bio berhasil disimpan!");

  } catch (error) {
    status("bioStatus", error.message || "Gagal menyimpan Bio.");
  }
});

async function loadBio() {
  const user = currentUser();
  if (!user) return;

  try {
    const data = await window.POPER.getData(
      `users/${user.uid}/publicBio`
    );

    if (!data) {
      links = [];
      renderLinks();
      return;
    }

    if ($("bioName")) $("bioName").value = data.name || "";
    if ($("bioDesc")) $("bioDesc").value = data.description || "";

    links = Array.isArray(data.links) ? data.links : [];

    renderLinks();
  } catch (error) {
    console.error("Load Bio:", error);
  }
}

/* =========================================
   PUBLIC BIO PREVIEW
========================================= */

$("openPublicBio")?.addEventListener("click", async () => {
  const user = currentUser();
  if (!user) return;

  try {
    const bio = await window.POPER.getData(
      `users/${user.uid}/publicBio`
    );

    if (!bio) {
      status("bioStatus", "Simpan Bio terlebih dahulu.");
      return;
    }

    const bioLinks = Array.isArray(bio.links) ? bio.links : [];

    const page = `
      <!DOCTYPE html>
      <html lang="id">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <title>${escapeHTML(bio.name || "POPER Bio")}</title>
        <style>
          body{
            font-family:system-ui,sans-serif;
            background:#101323;
            color:white;
            margin:0;
            padding:25px;
          }
          .container{
            max-width:450px;
            margin:auto;
            text-align:center;
          }
          .avatar{
            width:90px;
            height:90px;
            margin:25px auto;
            display:grid;
            place-items:center;
            border-radius:28px;
            background:linear-gradient(135deg,#865cff,#4d7aff);
            font-size:40px;
          }
          h1{margin-bottom:8px}
          p{color:#adb4ce;line-height:1.6}
          a{
            display:block;
            text-decoration:none;
            color:white;
            background:#242a43;
            padding:17px;
            border-radius:15px;
            margin:12px 0;
          }
          .brand{color:#a48aff;font-weight:900;margin-top:30px}
        </style>
      </head>
      <body>
        <div class="container">
          <div class="avatar">👤</div>
          <h1>${escapeHTML(bio.name || "Pengguna POPER")}</h1>
          <p>${escapeHTML(bio.description || "")}</p>
          ${bioLinks.map(link => {
            const url = safeURL(link.url);
            if (!url) return "";
            return `<a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(link.title || url)}</a>`;
          }).join("")}
          <div class="brand">📱 POPER</div>
        </div>
      </body>
      </html>
    `;

    const blob = new Blob([page], {
      type: "text/html"
    });

    const blobURL = URL.createObjectURL(blob);
    window.open(blobURL, "_blank");

  } catch (error) {
    status("bioStatus", error.message || "Gagal membuka Bio.");
  }
});

/* =========================================
   FIND BIO
========================================= */

async function findBioByPhone(phone, resultContainerId) {
  const container = $(resultContainerId);
  if (!container) return;

  container.innerHTML = "";

  const cleaned = phone.trim();

  if (!cleaned) {
    container.textContent = "Nomor HP belum diisi.";
    return;
  }

  try {
    container.textContent = "Mencari Bio POPER...";

    const key = phoneKey(cleaned);

    const lookup = await window.POPER.getData(
      `phoneLookup/${key}`
    );

    if (!lookup?.uid) {
      container.innerHTML = `
        <div class="item">
          Nomor ini belum memiliki Bio POPER.
        </div>
      `;
      return;
    }

    const bio = await window.POPER.getData(
      `users/${lookup.uid}/publicBio`
    );

    if (!bio) {
      container.textContent = "Bio belum tersedia.";
      return;
    }

    const bioLinks = Array.isArray(bio.links) ? bio.links : [];

    container.innerHTML = `
      <div class="item">
        <h3>${escapeHTML(bio.name || "Pengguna POPER")}</h3>
        <p>${escapeHTML(bio.description || "")}</p>
        <small>${escapeHTML(bio.phone || lookup.phone || cleaned)}</small>
      </div>

      ${bioLinks.map(link => {
        const url = safeURL(link.url);
        if (!url) return "";

        return `
          <a class="item"
             href="${escapeHTML(url)}"
             target="_blank"
             rel="noopener noreferrer">
            ${escapeHTML(link.title || url)}
          </a>
        `;
      }).join("")}
    `;

  } catch (error) {
    container.textContent = error.message || "Gagal mencari Bio.";
  }
}

$("findBio")?.addEventListener("click", () => {
  findBioByPhone(
    $("findPhone")?.value || "",
    "findResult"
  );
});

$("searchScannedPhone")?.addEventListener("click", () => {
  findBioByPhone(
    $("scannedPhoneNumber")?.value || "",
    "phoneScanResult"
  );
});

/* =========================================
   QR VAULT
========================================= */

function stopCameraScanner() {
  cameraActive = false;

  if (cameraFrame) {
    cancelAnimationFrame(cameraFrame);
    cameraFrame = null;
  }

  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }

  const video = $("qrVideo");
  if (video) {
    video.srcObject = null;
  }

  if ($("qrCameraBox")) {
    $("qrCameraBox").hidden = true;
  }
}

$("startQRScanner")?.addEventListener("click", async () => {
  if (!navigator.mediaDevices?.getUserMedia) {
    status("qrScanStatus", "Kamera tidak didukung.");
    return;
  }

  stopCameraScanner();

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false
    });

    const video = $("qrVideo");

    video.srcObject = cameraStream;
    $("qrCameraBox").hidden = false;

    await video.play();

    cameraActive = true;
    scanQRFrame();

  } catch (error) {
    status("qrScanStatus", "Kamera QR gagal dibuka.");
  }
});

$("stopQRScanner")?.addEventListener("click", () => {
  stopCameraScanner();
});

function scanQRFrame() {
  if (!cameraActive) return;

  const video = $("qrVideo");

  if (video && video.readyState >= 2 && video.videoWidth) {
    const canvas = document.createElement("canvas");

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0);

    const image = ctx.getImageData(
      0, 0, canvas.width, canvas.height
    );

    const code = window.jsQR?.(
      image.data,
      image.width,
      image.height,
      { inversionAttempts: "attemptBoth" }
    );

    if (code?.data) {
      scannedQRValue = code.data;

      showQRResult(code.data);

      stopCameraScanner();

      status("qrScanStatus", "QR berhasil dibaca!");
      return;
    }
  }

  if (cameraActive) {
    cameraFrame = requestAnimationFrame(scanQRFrame);
  }
}

function showQRResult(value) {
  const resultBox = $("qrResultBox");
  const input = $("qrUrl");

  if (input) input.value = value;
  if (resultBox) resultBox.hidden = false;
}

$("qrImageInput")?.addEventListener("change", async event => {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    status("qrScanStatus", "Membaca gambar QR...");

    const img = new Image();
    const objectURL = URL.createObjectURL(file);

    img.src = objectURL;
    await img.decode();

    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);

    const image = ctx.getImageData(
      0, 0, canvas.width, canvas.height
    );

    const code = window.jsQR?.(
      image.data,
      image.width,
      image.height,
      { inversionAttempts: "attemptBoth" }
    );

    URL.revokeObjectURL(objectURL);

    if (code?.data) {
      scannedQRValue = code.data;
      showQRResult(code.data);

      status("qrScanStatus", "QR gambar berhasil dibaca!");
    } else {
      status("qrScanStatus", "QR tidak ditemukan dalam gambar.");
    }

  } catch (error) {
    status("qrScanStatus", "Gambar gagal dibaca.");
  }

  event.target.value = "";
});

$("saveQR")?.addEventListener("click", async () => {
  const user = currentUser();
  if (!user) return;

  const name = $("qrName")?.value.trim() || "QR Link";
  const url = safeURL($("qrUrl")?.value.trim());

  if (!url) {
    status("qrScanStatus", "QR harus berisi URL valid.");
    return;
  }

  try {
    await window.POPER.pushData(`qrVault/${user.uid}`, {
      name,
      url,
      createdAt: Date.now()
    });

    status("qrScanStatus", "QR berhasil disimpan!");

    if ($("qrName")) $("qrName").value = "";

    loadQR();

  } catch (error) {
    status("qrScanStatus", error.message || "Gagal menyimpan QR.");
  }
});

async function loadQR() {
  const user = currentUser();
  if (!user) return;

  try {
    const data = await window.POPER.getData(`qrVault/${user.uid}`);
    const container = $("qrList");
    if (!container) return;

    if (!data) {
      container.innerHTML = `
        <div class="qr-empty">
          Vault QR masih kosong.
        </div>
      `;
      return;
    }

    container.innerHTML = Object.entries(data).map(([key, item]) => {
      const url = safeURL(item.url);

      return `
        <div class="qr-card">
          <strong>${escapeHTML(item.name || "QR Link")}</strong>

          <div class="qr-meta">
            ${escapeHTML(url)}
          </div>

          <a class="qr-link-button"
             href="${escapeHTML(url)}"
             target="_blank"
             rel="noopener noreferrer">
             🔗 Buka Link
          </a>

          <button class="secondary danger"
            data-delete-qr="${escapeHTML(key)}">
            🗑 Hapus
          </button>
        </div>
      `;
    }).join("");

    container.querySelectorAll("[data-delete-qr]").forEach(button => {
      button.addEventListener("click", async () => {
        if (!confirm("Hapus link QR ini?")) return;

        await window.POPER.deleteData(
          `qrVault/${user.uid}/${button.dataset.deleteQr}`
        );

        loadQR();
      });
    });

  } catch (error) {
    console.error("Load QR:", error);
  }
}

/* =========================================
   NOTES
========================================= */

$("saveNote")?.addEventListener("click", async () => {
  const user = currentUser();
  if (!user) return;

  const title = $("noteTitle")?.value.trim();
  const content = $("noteContent")?.value.trim();

  if (!title || !content) {
    status("notesStatus", "Isi judul dan catatan.");
    return;
  }

  try {
    await window.POPER.pushData(`notes/${user.uid}`, {
      title,
      content,
      createdAt: Date.now()
    });

    $("noteTitle").value = "";
    $("noteContent").value = "";

    status("notesStatus", "Catatan berhasil disimpan.");

    loadNotes();

  } catch (error) {
    status("notesStatus", error.message || "Gagal menyimpan.");
  }
});

async function loadNotes() {
  const user = currentUser();
  if (!user) return;

  try {
    const data = await window.POPER.getData(`notes/${user.uid}`);
    const container = $("notesList");
    if (!container) return;

    if (!data) {
      container.innerHTML = "<p>Belum ada catatan.</p>";
      return;
    }

    container.innerHTML = Object.entries(data).map(([key, note]) => `
      <div class="item">
        <strong>${escapeHTML(note.title)}</strong>
        <p class="note-content">${escapeHTML(note.content)}</p>

        <button class="secondary danger"
          data-delete-note="${escapeHTML(key)}">
          🗑 Hapus
        </button>
      </div>
    `).join("");

    container.querySelectorAll("[data-delete-note]").forEach(button => {
      button.addEventListener("click", async () => {
        if (!confirm("Hapus catatan ini?")) return;

        await window.POPER.deleteData(
          `notes/${user.uid}/${button.dataset.deleteNote}`
        );

        loadNotes();
      });
    });

  } catch (error) {
    console.error("Load Notes:", error);
  }
}

/* =========================================
   PHONE OCR ENGINE
========================================= */

function normalizePhoneOCR(raw) {
  let digits = String(raw || "").replace(/\D/g, "");

  if (digits.startsWith("62")) {
    digits = "0" + digits.slice(2);
  }

  if (digits.startsWith("8")) {
    digits = "0" + digits;
  }

  return digits;
}

function extractPhone(text) {
  if (!text) return "";

  // Perbaiki karakter yang sering salah dibaca OCR
  const corrected = String(text)
    .replace(/[Oo]/g, "0")
    .replace(/[Il|]/g, "1")
    .replace(/[Ss]/g, "5")
    .replace(/[Bb]/g, "8")
    .replace(/[Zz]/g, "2");

  const candidates = corrected.match(
    /(?:\+?62|0)?[\d\s().-]{8,24}/g
  ) || [];

  for (const candidate of candidates) {
    let digits = candidate.replace(/\D/g, "");

    if (digits.startsWith("62")) {
      digits = "0" + digits.slice(2);
    }

    if (
      digits.startsWith("0") &&
      digits.length >= 10 &&
      digits.length <= 13
    ) {
      return digits;
    }

    if (
      digits.startsWith("8") &&
      digits.length >= 9 &&
      digits.length <= 12
    ) {
      return "0" + digits;
    }
  }

  // Fallback: coba seluruh teks sebagai kumpulan angka
  let compact = corrected.replace(/\D/g, "");

  if (compact.startsWith("62")) {
    compact = "0" + compact.slice(2);
  }

  if (
    compact.startsWith("0") &&
    compact.length >= 10 &&
    compact.length <= 13
  ) {
    return compact;
  }

  return "";
}

/* =========================================
   CAMERA START
========================================= */

async function startPhoneScanner() {
  const video = $("phoneScanVideo");

  if (!video) {
    status("phoneScanStatus", "Elemen kamera tidak ditemukan.");
    return;
  }

  // Jika kamera sudah hidup, jangan membuka stream kedua
  if (phoneOCRActive && phoneCameraStream) return;

  stopPhoneScanner(false);

  if (!navigator.mediaDevices?.getUserMedia) {
    status("phoneScanStatus", "Browser tidak mendukung kamera.");
    return;
  }

  try {
    status("phoneScanStatus", "Meminta izin kamera...");

    phoneCameraStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      }
    });

    video.srcObject = phoneCameraStream;
    await video.play();

    phoneOCRActive = true;
    lastDetectedPhone = "";

    status(
      "phoneScanStatus",
      "Kamera aktif. Arahkan ke nomor HP."
    );

    await startPhoneOCR();

  } catch (error) {
    stopPhoneScanner(false);

    status(
      "phoneScanStatus",
      error.message || "Kamera gagal diakses. Periksa izin kamera."
    );
  }
}

/* =========================================
   OCR WORKER
========================================= */

async function startPhoneOCR() {
  if (phoneOCRBusy || !phoneOCRActive) return;

  phoneOCRBusy = true;

  try {
    if (!window.Tesseract) {
      throw new Error("Library Tesseract belum dimuat.");
    }

    if (!phoneOCRWorker) {
      status("phoneScanStatus", "Mengunduh mesin OCR pertama kali...");

      phoneOCRWorker = await Tesseract.createWorker("eng");

      await phoneOCRWorker.setParameters({
        tessedit_char_whitelist: "0123456789+",
        tessedit_pageseg_mode: "11",
        preserve_interword_spaces: "1"
      });
    }

    status(
      "phoneScanStatus",
      "OCR siap. Arahkan kamera ke nomor."
    );

  } catch (error) {
    console.error("OCR Worker:", error);

    status(
      "phoneScanStatus",
      error.message || "Mesin OCR gagal."
    );

    phoneOCRBusy = false;
    return;
  }

  phoneOCRBusy = false;
  runPhoneOCR();
}

/* =========================================
   PREPROCESS IMAGE
   Mode 1: grayscale + contrast
   Mode 2: threshold black & white
========================================= */

let ocrMode = 0;

function prepareOCRCanvas(video, mode = 0) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", {
    willReadFrequently: true
  });

  const width = video.videoWidth;
  const height = video.videoHeight;

  // Ambil 90% lebar dan 80% tinggi
  const cropWidth = width * 0.90;
  const cropHeight = height * 0.80;

  const cropX = (width - cropWidth) / 2;
  const cropY = (height - cropHeight) / 2;

  canvas.width = 1200;
  canvas.height = 900;

  ctx.drawImage(
    video,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    canvas.width,
    canvas.height
  );

  const imageData = ctx.getImageData(
    0, 0, canvas.width, canvas.height
  );

  const pixels = imageData.data;

  for (let i = 0; i < pixels.length; i += 4) {
    let gray =
      0.299 * pixels[i] +
      0.587 * pixels[i + 1] +
      0.114 * pixels[i + 2];

    if (mode === 0) {
      // grayscale + contrast
      gray = (gray - 128) * 1.7 + 128;
      gray = Math.max(0, Math.min(255, gray));
    } else {
      // threshold
      gray = gray > 155 ? 255 : 0;
    }

    pixels[i] = gray;
    pixels[i + 1] = gray;
    pixels[i + 2] = gray;
  }

  ctx.putImageData(imageData, 0, 0);

  return canvas;
}

/* =========================================
   OCR SCAN LOOP
========================================= */

async function runPhoneOCR() {
  if (!phoneOCRActive || phoneOCRBusy) return;

  const video = $("phoneScanVideo");

  if (
    !video ||
    video.readyState < 2 ||
    !video.videoWidth
  ) {
    phoneOCRTimer = setTimeout(runPhoneOCR, 600);
    return;
  }

  phoneOCRBusy = true;

  try {
    // Bergantian mode gambar untuk membantu tulisan tangan
    ocrMode = ocrMode === 0 ? 1 : 0;

    const canvas = prepareOCRCanvas(video, ocrMode);

    const result = await phoneOCRWorker.recognize(canvas);
    const rawText = result?.data?.text || "";
    const detected = extractPhone(rawText);

    console.log("OCR TEXT:", rawText);
    console.log("OCR PHONE:", detected);
    console.log("OCR CONFIDENCE:", result?.data?.confidence);

    if (detected && detected !== lastDetectedPhone) {
      lastDetectedPhone = detected;

      const input = $("scannedPhoneNumber");

      if (input) {
        input.value = detected;
      }

      status(
        "phoneScanStatus",
        "✓ Nomor terdeteksi! Periksa nomor lalu tekan Cari POPER."
      );

      // Kamera otomatis berhenti setelah berhasil
      stopPhoneScanner(false);
      return;
    }

    status(
      "phoneScanStatus",
      "Mencari angka... dekatkan tulisan dan pastikan cahaya cukup."
    );

  } catch (error) {
    console.error("OCR Recognition:", error);
  }

  phoneOCRBusy = false;

  if (phoneOCRActive) {
    phoneOCRTimer = setTimeout(runPhoneOCR, 1000);
  }
}

/* =========================================
   STOP PHONE SCANNER
========================================= */

function stopPhoneScanner(showMessage = true) {
  phoneOCRActive = false;

  if (phoneOCRTimer) {
    clearTimeout(phoneOCRTimer);
    phoneOCRTimer = null;
  }

  if (phoneCameraStream) {
    phoneCameraStream.getTracks().forEach(track => track.stop());
    phoneCameraStream = null;
  }

  const video = $("phoneScanVideo");

  if (video) {
    video.pause();
    video.srcObject = null;
  }

  phoneOCRBusy = false;

  if (showMessage) {
    status("phoneScanStatus", "Kamera ditutup.");
  }
}

$("startPhoneCamera")?.addEventListener("click", startPhoneScanner);

$("stopPhoneCamera")?.addEventListener("click", () => {
  stopPhoneScanner();
});

/* =========================================
   LOAD ALL
========================================= */

async function loadAll() {
  await Promise.allSettled([
    loadBio(),
    loadQR(),
    loadNotes()
  ]);
}

/* =========================================
   THEME
========================================= */

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);

  try {
    localStorage.setItem("poper-theme", theme);
  } catch {}

  document.querySelectorAll("[data-theme-choice]").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.themeChoice === theme
    );
  });
}

document.querySelectorAll("[data-theme-choice]").forEach(button => {
  button.addEventListener("click", () => {
    applyTheme(button.dataset.themeChoice);
    status("themeStatus", "Tema berhasil diubah.");
  });
});

// Terapkan status tema tombol saat halaman dimuat
applyTheme(
  document.documentElement.getAttribute("data-theme") || "dark"
);

/* =========================================
   AUTH STATE
========================================= */

window.POPER.onAuth(user => {
  loginUI(user);
});

console.log("POPER FIX: OCR, scanner, Bio, QR Vault, Notes ready.");
