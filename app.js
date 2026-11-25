
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
      button.dataset.tab === (name === "scanner" ? "scan" : name)
    );
  });

  if (name !== "scanner") {
    stopPhoneScanner();
  }
}

$("mainScanButton")?.addEventListener("click", () => {
  showSection("scanner");
});

$("backFromScanner")?.addEventListener("click", () => {
  showSection("scan");
});

document.querySelectorAll("[data-open-tab]").forEach(button => {
  button.addEventListener("click", () => {
    showSection(button.dataset.openTab);
  });
});

/* =====================================
   AUTH UI
===================================== */

function loginUI(user) {
  const loginPanel = $("loginPanel");
  const dashboard = $("dashboard");
  const logoutBtn = $("logoutBtn");

  if (!user) {
    if (loginPanel) loginPanel.style.display = "";
    if (dashboard) dashboard.style.display = "none";
    if (logoutBtn) logoutBtn.style.display = "none";
    stopPhoneScanner();
    stopCameraScanner();
    return;
  }

  if (loginPanel) loginPanel.style.display = "none";
  if (dashboard) dashboard.style.display = "";
  if (logoutBtn) logoutBtn.style.display = "";

  if ($("welcome")) {
    $("welcome").textContent = "Halo, pengguna POPER!";
  }

  if ($("myPhone")) {
    $("myPhone").textContent = user.phoneNumber || "";
  }

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

    if ($("otpSection")) $("otpSection").style.display = "";

    status("authStatus", "OTP berhasil dikirim.");
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
  await window.POPER.logout();
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

  if ($("bioTitle")) $("bioTitle").value = "";
  if ($("bioUrl")) $("bioUrl").value = "";

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
      <button data-delete-link="${i}">✕</button>
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
  const user = auth.currentUser;
  if (!user) return;

  try {
    const data = await window.POPER.getData(
      `users/${user.uid}/publicBio`
    );

    if (!data) return;

    if ($("bioName")) $("bioName").value = data.name || "";
    if ($("bioDesc")) $("bioDesc").value = data.description || "";

    links = Array.isArray(data.links) ? data.links : [];
    renderLinks();
  } catch (error) {
    console.error("Load Bio:", error);
  }
}

/* =====================================
   FIND BIO - SHARED
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
        <div>
          <h3>${escapeHTML(bio.name || "Pengguna POPER")}</h3>
          <p>${escapeHTML(bio.description || "")}</p>
          <small>${escapeHTML(bio.phone || lookup.phone || cleaned)}</small>
        </div>
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
  findBioByPhone($("findPhone")?.value || "", "findResult");
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

let scannedQRValue = "";
let cameraStream = null;
let cameraActive = false;
let cameraFrame = null;

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
    $("qrCameraBox").style.display = "none";
  }
}

$("startQRScanner")?.addEventListener("click", async () => {
  if (!navigator.mediaDevices?.getUserMedia) {
    status("qrScanStatus", "Kamera tidak didukung browser.");
    return;
  }

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false
    });

    $("qrVideo").srcObject = cameraStream;
    $("qrCameraBox").style.display = "";
    await $("qrVideo").play();

    cameraActive = true;
    scanQRFrame();
  } catch (error) {
    status("qrScanStatus", "Kamera gagal dibuka.");
  }
});

$("stopQRScanner")?.addEventListener("click", stopCameraScanner);

function scanQRFrame() {
  if (!cameraActive) return;

  const video = $("qrVideo");

  if (video.readyState >= 2) {
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

      if ($("qrResultBox")) {
        $("qrResultBox").value = code.data;
      }

      stopCameraScanner();
      status("qrScanStatus", "QR berhasil dibaca!");
    }
  }

  if (cameraActive) {
    cameraFrame = requestAnimationFrame(scanQRFrame);
  }
}

$("qrImageInput")?.addEventListener("change", async event => {
  const file = event.target.files?.[0];
  if (!file) return;

  const img = new Image();
  img.src = URL.createObjectURL(file);

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
    image.data, image.width, image.height
  );

  if (code?.data) {
    scannedQRValue = code.data;
    if ($("qrResultBox")) $("qrResultBox").value = code.data;
    status("qrScanStatus", "QR gambar berhasil dibaca.");
  } else {
    status("qrScanStatus", "QR tidak ditemukan dalam gambar.");
  }

  URL.revokeObjectURL(img.src);
});

$("saveQR")?.addEventListener("click", async () => {
  const user = auth.currentUser;
  if (!user) return;

  const name = $("qrName")?.value.trim() || "QR Link";
  const url = safeURL($("qrResultBox")?.value.trim());

  if (!url) {
    status("qrScanStatus", "QR harus berisi URL yang valid.");
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
  const user = auth.currentUser;
  if (!user) return;

  try {
    const data = await window.POPER.getData(`qrVault/${user.uid}`);
    const container = $("qrList");
    if (!container) return;

    if (!data) {
      container.innerHTML = "<p>Vault QR masih kosong.</p>";
      return;
    }

    container.innerHTML = Object.entries(data).map(([key, item]) => `
      <div class="item">
        <div>
          <strong>${escapeHTML(item.name || "QR Link")}</strong>
          <a href="${escapeHTML(safeURL(item.url))}"
             target="_blank"
             rel="noopener noreferrer">
             Buka Link
          </a>
        </div>
        <button data-delete-qr="${key}">🗑</button>
      </div>
    `).join("");

    container.querySelectorAll("[data-delete-qr]").forEach(button => {
      button.onclick = async () => {
        await window.POPER.deleteData(
          `qrVault/${user.uid}/${button.dataset.deleteQr}`
        );
        loadQR();
      };
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

    if ($("noteTitle")) $("noteTitle").value = "";
    if ($("noteContent")) $("noteContent").value = "";

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
      <div class="item">
        <div>
          <strong>${escapeHTML(note.title)}</strong>
          <p>${escapeHTML(note.content)}</p>
        </div>
        <button data-delete-note="${key}">🗑</button>
      </div>
    `).join("");

    container.querySelectorAll("[data-delete-note]").forEach(button => {
      button.onclick = async () => {
        await window.POPER.deleteData(
          `notes/${user.uid}/${button.dataset.deleteNote}`
        );
        loadNotes();
      };
    });
  } catch (error) {
    console.error("Load Notes:", error);
  }
}

/* =====================================
   PHONE SCANNER - CAMERA + OCR
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
    (compact.startsWith("08") ||
      compact.startsWith("8") ||
      compact.startsWith("62"))
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

    status("phoneScanStatus", "Kamera aktif. Siapkan nomor HP di depan kamera.");

    startPhoneOCR();
  } catch (error) {
    status(
      "phoneScanStatus",
      error.message || "Tidak dapat mengakses kamera. Periksa izin."
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
      status("phoneScanStatus", "Memuat mesin OCR pertama kali...");

      phoneOCRWorker = await Tesseract.createWorker("eng");

      await phoneOCRWorker.setParameters({
        tessedit_char_whitelist: "0123456789+-() ",
        tessedit_pageseg_mode: "7"
      });
    }

    status("phoneScanStatus", "Arahkan kamera ke nomor HP...");

    phoneOCRBusy = false;
    runPhoneOCR();
  } catch (error) {
    phoneOCRBusy = false;
    status("phoneScanStatus", error.message || "OCR gagal dimulai.");
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

    // Fokus pada bagian tengah kamera
    const cropY = Math.floor(height * 0.35);
    const cropHeight = Math.floor(height * 0.30);

    canvas.width = 900;
    canvas.height = Math.floor(900 * cropHeight / width);

    ctx.filter = "grayscale(1) contrast(1.6)";
    ctx.drawImage(
      video,
      0, cropY, width, cropHeight,
      0, 0, canvas.width, canvas.height
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
        "Nomor terdeteksi! Periksa hasil sebelum mencari."
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

  status("phoneScanStatus", "Kamera ditutup.");
}

$("startPhoneCamera")?.addEventListener("click", startPhoneScanner);
$("stopPhoneCamera")?.addEventListener("click", stopPhoneScanner);

/* =====================================
   LOAD ALL DATA
===================================== */

async function loadAll() {
  await Promise.allSettled([
    loadBio(),
    loadQR(),
    loadNotes()
  ]);
}

/* =====================================
   THEME
===================================== */

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);

  localStorage.setItem("poper-theme", theme);

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
   AUTH STATE
===================================== */

window.POPER.onAuth(user => {
  loginUI(user);
});

console.log("POPER Phone Scanner OCR siap.");
