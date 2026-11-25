
import "./firebase.js";

/* =========================================
   POPER APP — COMPLETE APP.JS
   Phone OCR + Firebase + Bio + QR Vault
========================================= */

const $ = id => document.getElementById(id);
const auth = window.POPER.auth;

let confirmation = null;
let links = [];
let phoneCameraStream = null;
let qrCameraStream = null;
let ocrWorker = null;
let ocrBusy = false;
let qrBusy = false;
let currentUser = null;
let qrAnimation = null;

/* =========================================
   UTILITIES
========================================= */

function status(id, text, type = "") {
  const el = $(id);
  if (!el) return;
  el.textContent = text;
  el.className = "status " + type;
}

function escapeHTML(str = "") {
  return String(str).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function phoneKey(value) {
  return normalizePhone(value);
}

function normalizeIndonesianPhone(value) {
  let n = normalizePhone(value);

  if (n.startsWith("62")) n = "0" + n.slice(2);
  if (n.startsWith("8")) n = "0" + n;

  return n;
}

function validPhone(value) {
  const n = normalizeIndonesianPhone(value);
  return /^08\d{8,12}$/.test(n);
}

function safeURL(value) {
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.href;
    }
  } catch {}
  return "";
}

function showSection(id) {
  document.querySelectorAll(".section").forEach(section => {
    section.classList.remove("active");
  });

  const target = $(id);
  if (target) target.classList.add("active");

  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === id);
  });

  if (id !== "scanner") stopPhoneCamera();
  if (id !== "qr") stopQRScanner();

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showHome() {
  showSection("scan");
}

/* =========================================
   NAVIGATION
========================================= */

document.querySelectorAll(".nav-item").forEach(btn => {
  btn.addEventListener("click", () => {
    showSection(btn.dataset.tab);
  });
});

document.querySelectorAll("[data-open-tab]").forEach(btn => {
  btn.addEventListener("click", () => {
    showSection(btn.dataset.openTab);
  });
});

$("backFromScanner")?.addEventListener("click", showHome);

/* =========================================
   THEME
========================================= */

function applyTheme(theme) {
  document.body.classList.toggle("dark", theme === "dark");
  localStorage.setItem("poper-theme", theme);
  $("themeToggle").textContent = theme === "dark" ? "🌙" : "☀️";
}

applyTheme(localStorage.getItem("poper-theme") || "light");

$("themeToggle")?.addEventListener("click", () => {
  applyTheme(document.body.classList.contains("dark") ? "light" : "dark");
});

/* =========================================
   FIREBASE AUTH
========================================= */

$("sendOTP")?.addEventListener("click", async () => {
  const phone = $("loginPhone").value.trim();

  if (!phone) {
    status("authStatus", "Masukkan nomor HP.", "error");
    return;
  }

  try {
    status("authStatus", "Mengirim OTP...", "loading");

    confirmation = await window.POPER.sendOTP(phone);

    status("authStatus", "OTP berhasil dikirim. Periksa SMS.", "success");
  } catch (err) {
    console.error(err);
    status("authStatus", err.message || "Gagal mengirim OTP.", "error");
  }
});

$("verifyOTP")?.addEventListener("click", async () => {
  const code = $("otpCode").value.trim();

  if (!confirmation) {
    status("authStatus", "Kirim OTP terlebih dahulu.", "error");
    return;
  }

  if (!code) {
    status("authStatus", "Masukkan kode OTP.", "error");
    return;
  }

  try {
    status("authStatus", "Memverifikasi OTP...", "loading");

    await confirmation.confirm(code);

    status("authStatus", "Login berhasil!", "success");
  } catch (err) {
    console.error(err);
    status("authStatus", err.message || "OTP salah.", "error");
  }
});

$("logoutButton")?.addEventListener("click", async () => {
  try {
    await window.POPER.logout();
    showSection("loginPanel");
  } catch (err) {
    alert(err.message);
  }
});

window.POPER.onAuth(user => {
  currentUser = user;

  if (user) {
    $("dashboard").classList.remove("active");
    $("loginPanel").classList.remove("active");
    $("bottomNav").classList.remove("hide");

    $("userInfo").textContent = user.phoneNumber || "Akun POPER";

    loadBio();
    loadQRVault();
    loadNotes();
  } else {
    $("bottomNav").classList.add("hide");

    // Pengunjung masih dapat menggunakan fitur scanner.
    $("loginPanel").classList.remove("active");
    $("dashboard").classList.remove("active");
  }
});

/* =========================================
   DATABASE WRAPPERS
========================================= */

async function saveData(path, data) {
  if (!currentUser) throw new Error("Silakan login terlebih dahulu.");
  return window.POPER.saveData(path, data);
}

async function getData(path) {
  if (!currentUser) throw new Error("Silakan login terlebih dahulu.");
  return window.POPER.getData(path);
}

async function pushData(path, data) {
  if (!currentUser) throw new Error("Silakan login terlebih dahulu.");
  return window.POPER.pushData(path, data);
}

/* =========================================
   BIO
========================================= */

async function loadBio() {
  if (!currentUser) return;

  try {
    const bio = await getData(`users/${currentUser.uid}/publicBio`);

    if (!bio) return;

    $("bioName").value = bio.name || "";
    $("bioDescription").value = bio.description || "";
    $("bioLink").value = bio.link || "";
  } catch (err) {
    console.warn("Bio:", err);
  }
}

$("saveBio")?.addEventListener("click", async () => {
  if (!currentUser) {
    status("bioStatus", "Login untuk menyimpan Bio.", "error");
    return;
  }

  const name = $("bioName").value.trim();
  const description = $("bioDescription").value.trim();
  const link = $("bioLink").value.trim();

  if (link && !safeURL(link)) {
    status("bioStatus", "Link harus menggunakan http:// atau https://", "error");
    return;
  }

  const phone = currentUser.phoneNumber || "";

  try {
    status("bioStatus", "Menyimpan...", "loading");

    const data = {
      name,
      description,
      link,
      phone,
      uid: currentUser.uid,
      updatedAt: Date.now()
    };

    await saveData(`users/${currentUser.uid}/publicBio`, data);

    if (phone) {
      await saveData(`phoneLookup/${phoneKey(phone)}`, {
        uid: currentUser.uid,
        phone,
        name,
        updatedAt: Date.now()
      });
    }

    status("bioStatus", "Bio berhasil disimpan!", "success");
  } catch (err) {
    console.error(err);
    status("bioStatus", err.message || "Gagal menyimpan.", "error");
  }
});

$("openPublicBio")?.addEventListener("click", async () => {
  if (!currentUser) {
    status("bioStatus", "Login terlebih dahulu.", "error");
    return;
  }

  try {
    const bio = await getData(`users/${currentUser.uid}/publicBio`);

    if (!bio) {
      status("bioStatus", "Bio belum disimpan.", "error");
      return;
    }

    const link = safeURL(bio.link);

    if (link) {
      window.open(link, "_blank", "noopener");
    } else {
      alert(
        `${bio.name || "POPER User"}\n\n${bio.description || "Tidak ada deskripsi."}\n\nNomor: ${bio.phone || "-"}`
      );
    }
  } catch (err) {
    status("bioStatus", err.message, "error");
  }
});

/* =========================================
   FIND BIO
========================================= */

async function findBioByPhone(value, statusId = "findBioStatus", resultId = "findBioResult") {
  const phone = normalizeIndonesianPhone(value);

  $(resultId).innerHTML = "";

  if (!validPhone(phone)) {
    status(statusId, "Nomor HP tidak valid. Periksa kembali.", "error");
    return;
  }

  try {
    status(statusId, "Mencari Bio...", "loading");

    const lookup = await window.POPER.getData(
      `phoneLookup/${phoneKey(phone)}`
    );

    if (!lookup || !lookup.uid) {
      status(statusId, "Bio untuk nomor tersebut tidak ditemukan.", "error");
      return;
    }

    const bio = await window.POPER.getData(
      `users/${lookup.uid}/publicBio`
    );

    if (!bio) {
      status(statusId, "Profil Bio belum tersedia.", "error");
      return;
    }

    status(statusId, "Bio ditemukan!", "success");

    const link = safeURL(bio.link);

    $(resultId).innerHTML = `
      <div class="card" style="margin-top:14px">
        <div style="font-size:28px;text-align:center;margin-bottom:8px">👤</div>
        <h3 style="text-align:center;margin-bottom:8px">
          ${escapeHTML(bio.name || "POPER User")}
        </h3>
        <p style="text-align:center;color:var(--muted);font-size:14px">
          ${escapeHTML(bio.description || "")}
        </p>
        <p style="text-align:center;margin-top:12px;font-size:13px">
          ${escapeHTML(bio.phone || phone)}
        </p>
        ${
          link
            ? `<a href="${escapeHTML(link)}" target="_blank" rel="noopener noreferrer"
              class="btn btn-primary" style="margin-top:14px;text-decoration:none">
              🔗 Buka Link Bio
            </a>`
            : ""
        }
      </div>
    `;
  } catch (err) {
    console.error(err);
    status(statusId, err.message || "Gagal mencari Bio.", "error");
  }
}

$("findBioButton")?.addEventListener("click", () => {
  findBioByPhone($("findPhone").value);
});

$("searchScannedPhone")?.addEventListener("click", () => {
  const phone = $("scannedPhoneNumber").value;
  $("findPhone").value = phone;
  showSection("find");
  findBioByPhone(phone);
});

/* =========================================
   PHONE OCR — TESSERACT
========================================= */

async function getOCRWorker() {
  if (ocrWorker) return ocrWorker;

  if (!window.Tesseract) {
    throw new Error("OCR gagal dimuat. Periksa koneksi internet.");
  }

  status("phoneOCRStatus", "Memuat mesin OCR...", "loading");

  ocrWorker = await Tesseract.createWorker("eng");

  await ocrWorker.setParameters({
    tessedit_char_whitelist: "0123456789+()- ",
    tessedit_pageseg_mode: "6"
  });

  return ocrWorker;
}

/* =========================================
   PHONE EXTRACTION
========================================= */

function extractPhone(text) {
  if (!text) return "";

  // Bersihkan OCR: angka dan simbol telepon
  const cleaned = text.replace(/[^\d+\s()-]/g, " ");

  // Cari potongan digit panjang yang mungkin nomor HP
  const candidates = cleaned.match(/(?:\+?\d[\d\s()-]{7,}\d)/g) || [];

  let best = "";

  for (const candidate of candidates) {
    let digits = normalizePhone(candidate);

    if (digits.startsWith("62")) digits = "0" + digits.slice(2);
    if (digits.startsWith("8")) digits = "0" + digits;

    if (/^08\d{8,12}$/.test(digits)) {
      if (digits.length > best.length) best = digits;
    }
  }

  // Fallback: cari angka panjang tanpa pemisah
  if (!best) {
    const digitRuns = text.match(/\d{9,15}/g) || [];

    for (const run of digitRuns) {
      let digits = run;

      if (digits.startsWith("62")) digits = "0" + digits.slice(2);
      if (digits.startsWith("8")) digits = "0" + digits;

      if (/^08\d{8,12}$/.test(digits)) {
        best = digits;
        break;
      }
    }
  }

  return best;
}

/* =========================================
   IMAGE PREPROCESSING
========================================= */

function createOCRVariants(source) {
  const base = document.createElement("canvas");
  const ctx = base.getContext("2d", { willReadFrequently: true });

  const width = source.videoWidth || source.naturalWidth || source.width;
  const height = source.videoHeight || source.naturalHeight || source.height;

  if (!width || !height) throw new Error("Gambar tidak valid.");

  // Ambil area tengah tetapi tetap cukup luas
  const cropWidth = Math.floor(width * 0.94);
  const cropHeight = Math.floor(height * 0.72);
  const sx = Math.floor((width - cropWidth) / 2);
  const sy = Math.floor((height - cropHeight) / 2);

  // Perbesar 2x untuk tulisan kecil
  base.width = cropWidth * 2;
  base.height = cropHeight * 2;

  ctx.drawImage(
    source,
    sx, sy, cropWidth, cropHeight,
    0, 0, base.width, base.height
  );

  const original = base;

  function makeVariant(mode) {
    const canvas = document.createElement("canvas");
    canvas.width = original.width;
    canvas.height = original.height;

    const c = canvas.getContext("2d", { willReadFrequently: true });
    c.drawImage(original, 0, 0);

    const imageData = c.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      let gray = (
        data[i] * 0.299 +
        data[i + 1] * 0.587 +
        data[i + 2] * 0.114
      );

      if (mode === "contrast") {
        gray = Math.max(0, Math.min(255, (gray - 128) * 1.7 + 128));
      }

      if (mode === "threshold") {
        gray = gray > 150 ? 255 : 0;
      }

      if (mode === "threshold2") {
        gray = gray > 185 ? 255 : 0;
      }

      data[i] = gray;
      data[i + 1] = gray;
      data[i + 2] = gray;
    }

    c.putImageData(imageData, 0, 0);
    return canvas;
  }

  return [
    original,
    makeVariant("contrast"),
    makeVariant("threshold"),
    makeVariant("threshold2")
  ];
}

/* =========================================
   OCR IMAGE
========================================= */

async function recognizePhone(source, live = false) {
  if (ocrBusy) return;

  ocrBusy = true;

  try {
    status(
      "phoneOCRStatus",
      live ? "Menganalisis kamera..." : "Memproses gambar dengan OCR...",
      "loading"
    );

    const worker = await getOCRWorker();
    const variants = createOCRVariants(source);

    let bestText = "";
    let detectedPhone = "";

    for (let i = 0; i < variants.length; i++) {
      const result = await worker.recognize(variants[i]);
      const text = result.data.text || "";

      bestText += "\n" + text;

      const phone = extractPhone(text);

      if (phone && phone.length > detectedPhone.length) {
        detectedPhone = phone;
      }

      if (detectedPhone) break;
    }

    if (detectedPhone) {
      $("scannedPhoneNumber").value = detectedPhone;
      status("phoneOCRStatus", "Nomor ditemukan: " + detectedPhone, "success");
    } else if (!live) {
      status(
        "phoneOCRStatus",
        "Nomor belum terbaca. Coba foto lebih dekat, terang, dan lurus.",
        "error"
      );
    }

    return detectedPhone;
  } catch (err) {
    console.error("OCR:", err);
    status("phoneOCRStatus", err.message || "OCR gagal.", "error");
  } finally {
    ocrBusy = false;
  }
}

/* =========================================
   PHONE CAMERA
========================================= */

async function startPhoneCamera() {
  stopPhoneCamera();

  try {
    phoneCameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });

    const video = $("phoneScanVideo");
    video.srcObject = phoneCameraStream;
    video.classList.remove("hidden");
    $("cameraPlaceholder").classList.add("hidden");

    await video.play();

    status("phoneOCRStatus", "Kamera aktif. Arahkan ke nomor HP.", "success");

    startLiveOCR();
  } catch (err) {
    console.error(err);
    status(
      "phoneOCRStatus",
      "Kamera tidak bisa dibuka. Izinkan akses kamera atau gunakan upload.",
      "error"
    );
  }
}

function stopPhoneCamera() {
  if (phoneCameraStream) {
    phoneCameraStream.getTracks().forEach(track => track.stop());
    phoneCameraStream = null;
  }

  const video = $("phoneScanVideo");
  if (video) {
    video.srcObject = null;
    video.classList.add("hidden");
  }

  $("cameraPlaceholder")?.classList.remove("hidden");
}

async function startLiveOCR() {
  const video = $("phoneScanVideo");

  async function scanLoop() {
    if (!phoneCameraStream) return;

    if (!ocrBusy && video.readyState >= 2) {
      const phone = await recognizePhone(video, true);

      if (phone) {
        stopPhoneCamera();
        return;
      }
    }

    if (phoneCameraStream) {
      qrAnimation = requestAnimationFrame(scanLoop);
    }
  }

  scanLoop();
}

$("startPhoneCamera")?.addEventListener("click", startPhoneCamera);

$("stopPhoneCamera")?.addEventListener("click", () => {
  stopPhoneCamera();
  if (qrAnimation) cancelAnimationFrame(qrAnimation);
  status("phoneOCRStatus", "Kamera dihentikan.");
});

/* =========================================
   IMAGE UPLOAD / TAKE PHOTO
========================================= */

async function handlePhoneImage(file) {
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    status("phoneOCRStatus", "File harus berupa gambar.", "error");
    return;
  }

  const preview = $("phoneImagePreview");
  preview.src = URL.createObjectURL(file);
  preview.classList.remove("hidden");

  const image = new Image();

  image.onload = async () => {
    await recognizePhone(image, false);
  };

  image.onerror = () => {
    status("phoneOCRStatus", "Gambar tidak dapat dibuka.", "error");
  };

  image.src = preview.src;
}

$("phoneImageUpload")?.addEventListener("change", e => {
  handlePhoneImage(e.target.files?.[0]);
});

$("phoneTakePhoto")?.addEventListener("change", e => {
  handlePhoneImage(e.target.files?.[0]);
});

/* =========================================
   QR VAULT
========================================= */

async function startQRScanner() {
  stopQRScanner();

  try {
    qrCameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false
    });

    const video = $("qrVideo");
    video.srcObject = qrCameraStream;
    video.classList.remove("hidden");
    $("qrPlaceholder").classList.add("hidden");

    await video.play();

    scanQRLoop();
    status("qrStatus", "Kamera QR aktif.", "success");
  } catch (err) {
    console.error(err);
    status("qrStatus", "Tidak dapat membuka kamera QR.", "error");
  }
}

function stopQRScanner() {
  if (qrCameraStream) {
    qrCameraStream.getTracks().forEach(track => track.stop());
    qrCameraStream = null;
  }

  const video = $("qrVideo");
  if (video) {
    video.srcObject = null;
    video.classList.add("hidden");
  }

  $("qrPlaceholder")?.classList.remove("hidden");
}

function scanQRLoop() {
  if (!qrCameraStream || qrBusy) return;

  const video = $("qrVideo");

  if (video.readyState >= 2) {
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    const code = window.jsQR(
      imageData.data,
      imageData.width,
      imageData.height,
      { inversionAttempts: "attemptBoth" }
    );

    if (code && code.data) {
      $("qrUrl").value = code.data;
      stopQRScanner();
      status("qrStatus", "QR berhasil terbaca!", "success");
      return;
    }
  }

  requestAnimationFrame(scanQRLoop);
}

$("startQRScanner")?.addEventListener("click", startQRScanner);
$("stopQRScanner")?.addEventListener("click", stopQRScanner);

/* =========================================
   QR IMAGE UPLOAD
========================================= */

$("qrImageInput")?.addEventListener("change", e => {
  const file = e.target.files?.[0];
  if (!file) return;

  const img = new Image();

  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);

    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);

    const code = window.jsQR(
      data.data,
      data.width,
      data.height,
      { inversionAttempts: "attemptBoth" }
    );

    if (code) {
      $("qrUrl").value = code.data;
      status("qrStatus", "QR berhasil dibaca dari gambar.", "success");
    } else {
      status("qrStatus", "QR tidak ditemukan dalam gambar.", "error");
    }
  };

  img.onerror = () => status("qrStatus", "Gambar gagal dibuka.", "error");

  img.src = URL.createObjectURL(file);
});

/* =========================================
   SAVE QR
========================================= */

$("saveQR")?.addEventListener("click", async () => {
  if (!currentUser) {
    status("qrStatus", "Login untuk menyimpan QR Vault.", "error");
    return;
  }

  const name = $("qrName").value.trim() || "QR Link";
  const url = $("qrUrl").value.trim();

  if (!url) {
    status("qrStatus", "Scan atau masukkan link QR terlebih dahulu.", "error");
    return;
  }

  try {
    status("qrStatus", "Menyimpan QR...", "loading");

    const record = {
      name,
      url,
      createdAt: Date.now()
    };

    await pushData(`qrVault/${currentUser.uid}`, record);

    $("qrName").value = "";
    $("qrUrl").value = "";

    status("qrStatus", "QR berhasil disimpan!", "success");
    loadQRVault();
  } catch (err) {
    console.error(err);
    status("qrStatus", err.message || "Gagal menyimpan QR.", "error");
  }
});

/* =========================================
   LOAD QR VAULT
========================================= */

async function loadQRVault() {
  if (!currentUser) return;

  try {
    const data = await getData(`qrVault/${currentUser.uid}`);
    const list = $("qrVaultList");

    list.innerHTML = "";

    if (!data) {
      list.innerHTML = `<p class="small-note">Belum ada QR tersimpan.</p>`;
      return;
    }

    const entries = Object.entries(data).reverse();

    for (const [key, item] of entries) {
      const validLink = safeURL(item.url);

      const div = document.createElement("div");
      div.className = "card";
      div.style.marginTop = "12px";

      div.innerHTML = `
        <strong>${escapeHTML(item.name || "QR Link")}</strong>
        <p style="font-size:12px;color:var(--muted);margin:8px 0;word-break:break-all">
          ${escapeHTML(item.url || "")}
        </p>
        <div class="button-grid">
          ${
            validLink
              ? `<a class="btn btn-primary btn-small" style="text-decoration:none"
                href="${escapeHTML(validLink)}" target="_blank" rel="noopener noreferrer">
                🔗 Buka Link
              </a>`
              : `<button class="btn btn-secondary btn-small" disabled>Link tidak valid</button>`
          }
          <button class="btn btn-danger btn-small" data-delete-qr="${escapeHTML(key)}">
            🗑️ Hapus
          </button>
        </div>
      `;

      list.appendChild(div);
    }

    list.querySelectorAll("[data-delete-qr]").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (!confirm("Hapus QR ini?")) return;

        try {
          await window.POPER.deleteData(
            `qrVault/${currentUser.uid}/${btn.dataset.deleteQr}`
          );
          loadQRVault();
        } catch (err) {
          alert(err.message);
        }
      });
    });
  } catch (err) {
    console.error(err);
  }
}

/* =========================================
   NOTES
========================================= */

async function loadNotes() {
  if (!currentUser) return;

  try {
    const data = await getData(`notes/${currentUser.uid}`);
    if (data) $("noteText").value = data.text || "";
  } catch (err) {
    console.warn(err);
  }
}

$("saveNote")?.addEventListener("click", async () => {
  if (!currentUser) {
    status("notesStatus", "Login untuk menyimpan catatan.", "error");
    return;
  }

  try {
    status("notesStatus", "Menyimpan...", "loading");

    await saveData(`notes/${currentUser.uid}`, {
      text: $("noteText").value,
      updatedAt: Date.now()
    });

    status("notesStatus", "Catatan berhasil disimpan.", "success");
  } catch (err) {
    status("notesStatus", err.message || "Gagal menyimpan catatan.", "error");
  }
});

/* =========================================
   INITIAL STATE
========================================= */

showSection("scan");

console.log("POPER App loaded successfully.");
