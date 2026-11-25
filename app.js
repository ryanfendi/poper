
import "./firebase.js";

const $ = id => document.getElementById(id);
const auth = window.POPER.auth;

let confirmation = null;
let links = [];

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

/* =====================================
   UTILITIES
===================================== */

function status(id, text, color) {
  const el = $(id);
  if (!el) return;

  el.textContent = text;

  if (color) el.style.color = color;
}

function safeURL(url) {
  try {
    const u = new URL(String(url || "").trim());

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

function currentUID() {
  return auth.currentUser?.uid || null;
}

function phoneKey(phone) {
  return window.POPER.normalizePhone(phone)
    .replace(/\D/g, "");
}

/* =====================================
   NAVIGATION
===================================== */

function showSection(name) {
  const target = name === "scanner"
    ? "phoneScanner"
    : name;

  document.querySelectorAll(".section").forEach(section => {
    section.classList.toggle("active", section.id === target);
  });

  document.querySelectorAll(".nav-btn").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.tab === name
    );
  });

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

  if (target !== "phoneScanner") {
    stopPhoneScanner();
  }

  if (target !== "qr") {
    stopCameraScanner();
  }
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
  showSection("phoneScanner");
});

$("backFromScanner")?.addEventListener("click", () => {
  showSection("scan");
});

/* =====================================
   AUTH UI
===================================== */

function loginUI(user) {
  const loginPanel = $("loginPanel");
  const dashboard = $("dashboard");
  const logoutBtn = $("logoutBtn");
  const bottomNav = $("appBottomNav");

  if (!user) {
    if (loginPanel) {
      loginPanel.hidden = false;
      loginPanel.style.display = "";
    }

    if (dashboard) {
      dashboard.hidden = true;
      dashboard.style.display = "none";
    }

    if (logoutBtn) logoutBtn.hidden = true;
    if (bottomNav) bottomNav.hidden = true;

    stopPhoneScanner();
    stopCameraScanner();
    return;
  }

  if (loginPanel) {
    loginPanel.hidden = true;
    loginPanel.style.display = "none";
  }

  if (dashboard) {
    dashboard.hidden = false;
    dashboard.style.display = "";
  }

  if (logoutBtn) {
    logoutBtn.hidden = false;
  }

  if (bottomNav) {
    bottomNav.hidden = false;
  }

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

    status("authStatus", "OTP berhasil dikirim. Periksa SMS kamu.");
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
    status("authStatus", error.message || "OTP salah atau kedaluwarsa.");
  }
});

$("logoutBtn")?.addEventListener("click", async () => {
  stopPhoneScanner();
  stopCameraScanner();

  try {
    await window.POPER.logout();
  } catch (error) {
    status("authStatus", error.message || "Logout gagal.");
  }
});

/* =====================================
   BIO LINKS
===================================== */

$("addBioLink")?.addEventListener("click", () => {
  const title = $("bioTitle")?.value.trim();
  const url = safeURL($("bioUrl")?.value.trim());

  if (!title || !url) {
    status("bioStatus", "Isi judul dan URL yang valid.");
    return;
  }

  links.push({ title, url });

  $("bioTitle").value = "";
  $("bioUrl").value = "";

  renderLinks();
});

function renderLinks() {
  const container = $("bioLinks");
  if (!container) return;

  container.innerHTML = links.map((link, i) => `
    <div class="item">
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
  const user = auth.currentUser;
  if (!user) {
    status("bioStatus", "Silakan login terlebih dahulu.");
    return;
  }

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
  const user = auth.currentUser;
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

/* =====================================
   FIND BIO
===================================== */

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

/* =====================================
   QR VAULT
===================================== */

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

  if ($("qrVideo")) {
    $("qrVideo").srcObject = null;
  }

  if ($("qrCameraBox")) {
    $("qrCameraBox").hidden = true;
  }
}

$("startQRScanner")?.addEventListener("click", async () => {
  if (!navigator.mediaDevices?.getUserMedia) {
    status("qrScanStatus", "Kamera tidak didukung browser.");
    return;
  }

  try {
    stopCameraScanner();

    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false
    });

    $("qrVideo").srcObject = cameraStream;
    $("qrCameraBox").hidden = false;

    await $("qrVideo").play();

    cameraActive = true;
    scanQRFrame();
  } catch (error) {
    status("qrScanStatus", "Kamera gagal dibuka. Periksa izin kamera.");
  }
});

$("stopQRScanner")?.addEventListener("click", stopCameraScanner);

function scanQRFrame() {
  if (!cameraActive) return;

  const video = $("qrVideo");

  if (video.readyState >= 2 && video.videoWidth) {
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
      image.height
    );

    if (code?.data) {
      scannedQRValue = code.data;

      if ($("qrUrl")) {
        $("qrUrl").value = code.data;
      }

      $("qrResultBox").hidden = false;

      stopCameraScanner();

      status("qrScanStatus", "QR berhasil dibaca!");
    }
  }

  if (cameraActive) {
    cameraFrame = requestAnimationFrame(scanQRFrame);
  }
}

/* QR IMAGE UPLOAD */

$("qrImageInput")?.addEventListener("change", async event => {
  const file = event.target.files?.[0];
  if (!file) return;

  status("qrScanStatus", "Membaca gambar QR...");

  try {
    const objectURL = URL.createObjectURL(file);
    const img = new Image();

    img.src = objectURL;
    await img.decode();

    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);

    const image = ctx.getImageData(
      0, 0, canvas.width, canvas.height
    );

    const code = window.jsQR?.(
      image.data,
      image.width,
      image.height
    );

    URL.revokeObjectURL(objectURL);

    if (code?.data) {
      scannedQRValue = code.data;

      $("qrUrl").value = code.data;
      $("qrResultBox").hidden = false;

      status("qrScanStatus", "QR gambar berhasil dibaca.");
    } else {
      status("qrScanStatus", "QR tidak ditemukan dalam gambar.");
    }
  } catch (error) {
    status("qrScanStatus", "Gagal membaca gambar QR.");
  }

  event.target.value = "";
});

/* SAVE QR */

$("saveQR")?.addEventListener("click", async () => {
  const user = auth.currentUser;

  if (!user) {
    status("qrScanStatus", "Login terlebih dahulu.");
    return;
  }

  const name = $("qrName")?.value.trim() || "QR Link";
  const raw = $("qrUrl")?.value.trim();
  const url = safeURL(raw);

  if (!url) {
    status("qrScanStatus", "QR harus berisi URL HTTP/HTTPS yang valid.");
    return;
  }

  try {
    await window.POPER.pushData(`qrVault/${user.uid}`, {
      name,
      url,
      createdAt: Date.now()
    });

    status("qrScanStatus", "QR berhasil disimpan!");

    $("qrName").value = "";
    $("qrUrl").value = "";
    $("qrResultBox").hidden = true;

    loadQR();
  } catch (error) {
    status("qrScanStatus", error.message || "Gagal menyimpan QR.");
  }
});

async function loadQR() {
  const user = auth.currentUser;
  if (!user) return;

  try {
    const data = await window.POPER.getData(`qrVault/${user.uid}`);
    const container = $("qrList");

    if (!container) return;

    if (!data) {
      container.innerHTML = `
        <div class="qr-empty">Vault QR masih kosong.</div>
      `;
      return;
    }

    container.innerHTML = Object.entries(data).map(([key, item]) => {
      const safeLink = safeURL(item.url);

      return `
        <div class="qr-link-card">
          <strong>${escapeHTML(item.name || "QR Link")}</strong>
          <div class="qr-link-meta">${escapeHTML(safeLink)}</div>

          ${safeLink ? `
            <a class="qr-link-button"
               href="${escapeHTML(safeLink)}"
               target="_blank"
               rel="noopener noreferrer">
               🔗 Buka Link
            </a>
          ` : ""}

          <button class="secondary danger" data-delete-qr="${escapeHTML(key)}">
            🗑 Hapus
          </button>
        </div>
      `;
    }).join("");

    container.querySelectorAll("[data-delete-qr]").forEach(button => {
      button.addEventListener("click", async () => {
        try {
          await window.POPER.deleteData(
            `qrVault/${user.uid}/${button.dataset.deleteQr}`
          );

          loadQR();
        } catch (error) {
          status("qrScanStatus", "Gagal menghapus QR.");
        }
      });
    });
  } catch (error) {
    console.error("Load QR:", error);
  }
}

/* =====================================
   NOTES
===================================== */

$("saveNote")?.addEventListener("click", async () => {
  const user = auth.currentUser;
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

    loadNotes();
  } catch (error) {
    console.error(error);
  }
});

async function loadNotes() {
  const user = auth.currentUser;
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
      <div class="item note-card">
        <strong>${escapeHTML(note.title)}</strong>
        <p>${escapeHTML(note.content)}</p>
        <button class="secondary danger" data-delete-note="${escapeHTML(key)}">
          🗑 Hapus
        </button>
      </div>
    `).join("");

    container.querySelectorAll("[data-delete-note]").forEach(button => {
      button.addEventListener("click", async () => {
        try {
          await window.POPER.deleteData(
            `notes/${user.uid}/${button.dataset.deleteNote}`
          );

          loadNotes();
        } catch (error) {
          console.error(error);
        }
      });
    });
  } catch (error) {
    console.error("Load Notes:", error);
  }
}

/* =====================================
   PHONE OCR SCANNER
===================================== */

function formatDetectedPhone(raw) {
  let digits = String(raw).replace(/\D/g, "");

  if (digits.startsWith("62")) {
    return "+" + digits;
  }

  if (digits.startsWith("8")) {
    return "0" + digits;
  }

  return digits;
}

function extractPhone(text) {
  const matches = text.match(/\+?\d[\d\s().-]{7,}\d/g) || [];

  for (const match of matches) {
    const digits = match.replace(/\D/g, "");

    if (digits.length >= 10 && digits.length <= 15) {
      if (
        digits.startsWith("08") ||
        digits.startsWith("8") ||
        digits.startsWith("62")
      ) {
        return formatDetectedPhone(digits);
      }
    }
  }

  const compact = text.replace(/\D/g, "");

  if (
    compact.length >= 10 &&
    compact.length <= 15 &&
    (
      compact.startsWith("08") ||
      compact.startsWith("8") ||
      compact.startsWith("62")
    )
  ) {
    return formatDetectedPhone(compact);
  }

  return "";
}

async function startPhoneScanner() {
  const video = $("phoneScanVideo");

  if (!video) return;

  if (!navigator.mediaDevices?.getUserMedia) {
    status("phoneScanStatus", "Browser tidak mendukung kamera.");
    return;
  }

  try {
    stopPhoneScanner();

    status("phoneScanStatus", "Meminta izin kamera...");

    phoneCameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });

    video.srcObject = phoneCameraStream;
    await video.play();

    phoneOCRActive = true;

    status(
      "phoneScanStatus",
      "Kamera aktif. Arahkan ke nomor HP."
    );

    startPhoneOCR();
  } catch (error) {
    status(
      "phoneScanStatus",
      error.message || "Kamera tidak dapat diakses."
    );
  }
}

async function startPhoneOCR() {
  if (phoneOCRBusy || !phoneOCRActive) return;

  phoneOCRBusy = true;

  try {
    if (!window.Tesseract) {
      throw new Error("Library OCR belum dimuat. Refresh halaman.");
    }

    if (!phoneOCRWorker) {
      status("phoneScanStatus", "Memuat mesin OCR...");

      phoneOCRWorker = await Tesseract.createWorker("eng");

      await phoneOCRWorker.setParameters({
        tessedit_char_whitelist: "0123456789+-() ",
        tessedit_pageseg_mode: "7"
      });
    }

    phoneOCRBusy = false;
    runPhoneOCR();
  } catch (error) {
    phoneOCRBusy = false;

    status(
      "phoneScanStatus",
      error.message || "OCR gagal dimulai."
    );
  }
}

async function runPhoneOCR() {
  if (!phoneOCRActive || phoneOCRBusy) return;

  const video = $("phoneScanVideo");

  if (!video || video.readyState < 2 || !video.videoWidth) {
    phoneOCRTimer = setTimeout(runPhoneOCR, 1000);
    return;
  }

  phoneOCRBusy = true;

  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    const width = video.videoWidth;
    const height = video.videoHeight;

    const cropY = Math.floor(height * 0.35);
    const cropHeight = Math.floor(height * 0.30);

    canvas.width = 900;
    canvas.height = Math.floor(900 * cropHeight / width);

    ctx.filter = "grayscale(1) contrast(1.6)";

    ctx.drawImage(
      video,
      0,
      cropY,
      width,
      cropHeight,
      0,
      0,
      canvas.width,
      canvas.height
    );

    const result = await phoneOCRWorker.recognize(canvas);
    const detected = extractPhone(result.data.text || "");

    if (detected && detected !== lastDetectedPhone) {
      lastDetectedPhone = detected;

      if ($("scannedPhoneNumber")) {
        $("scannedPhoneNumber").value = detected;
      }

      status(
        "phoneScanStatus",
        "Nomor terdeteksi! Periksa lalu tekan Cari POPER."
      );
    }
  } catch (error) {
    console.error("OCR error:", error);
  }

  phoneOCRBusy = false;

  if (phoneOCRActive) {
    phoneOCRTimer = setTimeout(runPhoneOCR, 1200);
  }
}

function stopPhoneScanner() {
  phoneOCRActive = false;

  if (phoneOCRTimer) {
    clearTimeout(phoneOCRTimer);
    phoneOCRTimer = null;
  }

  if (phoneCameraStream) {
    phoneCameraStream.getTracks().forEach(track => track.stop());
    phoneCameraStream = null;
  }

  if ($("phoneScanVideo")) {
    $("phoneScanVideo").srcObject = null;
  }

  phoneOCRBusy = false;
  lastDetectedPhone = "";

  if ($("phoneScanStatus")) {
    status("phoneScanStatus", "Kamera ditutup.");
  }
}

$("startPhoneCamera")?.addEventListener("click", startPhoneScanner);
$("stopPhoneCamera")?.addEventListener("click", stopPhoneScanner);

/* =====================================
   THEME
===================================== */

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

/* =====================================
   LOAD ALL
===================================== */

async function loadAll() {
  await Promise.allSettled([
    loadBio(),
    loadQR(),
    loadNotes()
  ]);
}

/* =====================================
   OPEN PUBLIC BIO
===================================== */

$("openPublicBio")?.addEventListener("click", () => {
  const user = auth.currentUser;

  if (!user) return;

  const url = `${location.origin}/?bio=${encodeURIComponent(user.uid)}`;

  window.open(url, "_blank");
});

/* =====================================
   AUTH STATE
===================================== */

window.POPER.onAuth(user => {
  loginUI(user);
});

console.log("POPER App berhasil dimuat.");
