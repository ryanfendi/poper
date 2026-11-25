
/* ==========================================
   POPER APP ENGINE
   OCR Phone Scanner + Bio + Vault + Notes
========================================== */

const $ = id => document.getElementById(id);

const DB = {
  get(key, fallback = []) {
    try {
      const value = localStorage.getItem("poper_" + key);
      return value ? JSON.parse(value) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    localStorage.setItem("poper_" + key, JSON.stringify(value));
  }
};

let cameraStream = null;
let currentNumber = "";
let currentPage = "homePage";

let historyData = DB.get("history", []);
let bioData = DB.get("bio", {
  name: "",
  desc: "",
  phone: "",
  links: []
});
let qrData = DB.get("vault", []);
let notesData = DB.get("notes", []);

/* ==========================================
   NAVIGATION
========================================== */

function showPage(pageId) {
  document.querySelectorAll(".page").forEach(page => {
    page.classList.remove("active");
  });

  const page = $(pageId);
  if (!page) return;

  page.classList.add("active");
  currentPage = pageId;

  const nav = $("bottomNav");
  nav.style.display = [
    "scannerPage",
    "resultPage",
    "profilePage",
    "historyPage",
    "notesPage"
  ].includes(pageId) ? "none" : "flex";

  document.querySelectorAll(".nav-item").forEach(item => {
    item.classList.remove("selected");
  });

  const navItem = document.querySelector(
    `.nav-item[data-page="${pageId}"]`
  );

  if (navItem) navItem.classList.add("selected");

  if (pageId === "homePage") renderHistory();
  if (pageId === "bioPage") renderBio();
  if (pageId === "vaultPage") renderVault();
  if (pageId === "notesPage") renderNotes();
  if (pageId === "historyPage") renderFullHistory();
}

function goHome() {
  stopCamera();
  showPage("homePage");
}

document.querySelectorAll(".nav-item[data-page]").forEach(btn => {
  btn.addEventListener("click", () => showPage(btn.dataset.page));
});

/* ==========================================
   CAMERA
========================================== */

$("openScanner").addEventListener("click", openScanner);
$("navScan").addEventListener("click", openScanner);

async function openScanner() {
  showPage("scannerPage");
  $("scanStatus").textContent = "";
  $("cameraMessage").textContent = "Memulai kamera...";

  try {
    stopCamera();

    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });

    $("camera").srcObject = cameraStream;
    $("cameraMessage").textContent =
      "Arahkan kamera ke tulisan nomor HP";
  } catch (error) {
    console.error(error);
    $("cameraMessage").textContent =
      "Kamera tidak tersedia. Gunakan scan dari gambar.";
    toast("Izin kamera diperlukan");
  }
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }

  if ($("camera")) {
    $("camera").srcObject = null;
  }
}

$("closeScanner").addEventListener("click", goHome);

/* ==========================================
   CAPTURE CAMERA & OCR
========================================== */

$("captureBtn").addEventListener("click", captureAndScan);

async function captureAndScan() {
  const video = $("camera");

  if (!video.videoWidth || !video.videoHeight) {
    toast("Kamera belum siap");
    return;
  }

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  canvas.toBlob(async blob => {
    if (blob) await scanImage(blob);
  }, "image/jpeg", 0.95);
}

/* ==========================================
   IMAGE UPLOAD OCR
========================================== */

$("uploadImageBtn").addEventListener("click", () => {
  $("imageInput").click();
});

$("imageInput").addEventListener("change", async event => {
  const file = event.target.files[0];
  if (file) await scanImage(file);
  event.target.value = "";
});

/* ==========================================
   OCR ENGINE
========================================== */

async function scanImage(image) {
  if (!window.Tesseract) {
    toast("OCR gagal dimuat. Periksa internet.");
    return;
  }

  $("scanStatus").textContent = "Membaca gambar...";
  $("captureBtn").disabled = true;
  $("captureBtn").textContent = "⏳ Processing OCR...";

  try {
    const result = await Tesseract.recognize(image, "eng", {
      logger: info => {
        if (info.status === "recognizing text") {
          const progress = Math.round((info.progress || 0) * 100);
          $("scanStatus").textContent = `Membaca teks ${progress}%`;
        }
      }
    });

    const text = result.data.text || "";
    console.log("OCR result:", text);

    const numbers = extractPhoneNumbers(text);

    if (!numbers.length) {
      $("scanStatus").textContent =
        "Nomor HP tidak ditemukan. Coba lebih dekat atau lebih jelas.";
      toast("Nomor HP tidak terdeteksi");
      return;
    }

    currentNumber = numbers[0];
    addHistory(currentNumber);
    showResult(currentNumber);

  } catch (error) {
    console.error(error);
    toast("OCR gagal membaca gambar");
  } finally {
    $("captureBtn").disabled = false;
    $("captureBtn").textContent = "◉ Scan Number";
  }
}

/* ==========================================
   PHONE NUMBER DETECTION
========================================== */

function extractPhoneNumbers(text) {
  const cleaned = text
    .replace(/[Oo]/g, "0")
    .replace(/[Il|]/g, "1");

  const matches = cleaned.match(
    /(?:\+?62|0)\s*(?:[\d\s().-]{7,18})/g
  ) || [];

  const results = [];

  matches.forEach(match => {
    let digits = match.replace(/\D/g, "");

    if (digits.startsWith("62")) {
      digits = "0" + digits.slice(2);
    }

    // Nomor Indonesia umumnya 10-14 digit
    if (
      digits.startsWith("0") &&
      digits.length >= 10 &&
      digits.length <= 14
    ) {
      if (!results.includes(digits)) {
        results.push(digits);
      }
    }
  });

  return results;
}

function normalizePhone(phone) {
  let digits = phone.replace(/\D/g, "");

  if (digits.startsWith("62")) {
    digits = "0" + digits.slice(2);
  }

  return digits;
}

/* ==========================================
   MANUAL PHONE INPUT
========================================== */

$("manualSearch").addEventListener("click", () => {
  const number = normalizePhone($("manualNumber").value);

  if (!validPhone(number)) {
    toast("Masukkan nomor HP yang valid");
    return;
  }

  currentNumber = number;
  addHistory(number);
  showResult(number);
});

$("manualNumber").addEventListener("keydown", event => {
  if (event.key === "Enter") {
    $("manualSearch").click();
  }
});

function validPhone(number) {
  return /^0\d{9,13}$/.test(number);
}

/* ==========================================
   RESULT
========================================== */

function showResult(number) {
  stopCamera();

  $("detectedNumber").textContent = formatPhone(number);
  $("resultMessage").textContent =
    "Nomor berhasil dibaca. Kamu dapat mencari profil POPER, menyimpan nomor, atau membuka WhatsApp.";

  showPage("resultPage");
}

$("resultBack").addEventListener("click", openScanner);

$("findBioBtn").addEventListener("click", findBio);

function findBio() {
  const allUsers = DB.get("users", []);
  const user = allUsers.find(
    item => normalizePhone(item.phone) === normalizePhone(currentNumber)
  );

  if (user && user.bio) {
    openPublicBio(user.bio, currentNumber);
    return;
  }

  // Versi offline belum mempunyai pencarian akun online.
  const ownBio = bioData;

  if (
    ownBio.phone &&
    normalizePhone(ownBio.phone) === normalizePhone(currentNumber)
  ) {
    openPublicBio(ownBio, currentNumber);
    return;
  }

  $("resultMessage").textContent =
    "Nomor ini belum ditemukan di database POPER. Kamu dapat menyimpan nomor atau menghubunginya lewat WhatsApp.";

  toast("Bio belum ditemukan");
}

function openPublicBio(data, phone) {
  const links = (data.links || [])
    .map(link => `
      <a class="public-link" href="${escapeHTML(link.url)}" target="_blank" rel="noopener">
        ↗ ${escapeHTML(link.title)}
      </a>
    `).join("");

  const content = `
    <div class="public-bio">
      <div class="bio-avatar">👤</div>
      <h2>${escapeHTML(data.name || "POPER User")}</h2>
      <p>${escapeHTML(data.desc || "")}</p>
      <div class="public-links">${links}</div>
      <small>${escapeHTML(formatPhone(phone))}</small>
    </div>
  `;

  const page = $("resultMessage");
  page.innerHTML = content;
  showPage("resultPage");
}

/* ==========================================
   SAVE NUMBER
========================================== */

$("saveNumberBtn").addEventListener("click", () => {
  let saved = DB.get("contacts", []);

  if (saved.some(n => normalizePhone(n) === normalizePhone(currentNumber))) {
    toast("Nomor sudah disimpan");
    return;
  }

  saved.unshift(currentNumber);
  DB.set("contacts", saved);
  toast("Nomor berhasil disimpan");
});

/* ==========================================
   WHATSAPP
========================================== */

$("whatsappBtn").addEventListener("click", () => {
  let digits = currentNumber.replace(/\D/g, "");

  if (digits.startsWith("0")) {
    digits = "62" + digits.slice(1);
  }

  window.open(
    "https://wa.me/" + digits,
    "_blank"
  );
});

/* ==========================================
   HISTORY
========================================== */

function addHistory(number) {
  historyData = historyData.filter(
    item => normalizePhone(item.number) !== normalizePhone(number)
  );

  historyData.unshift({
    number,
    time: Date.now()
  });

  historyData = historyData.slice(0, 100);
  DB.set("history", historyData);
  renderHistory();
}

function renderHistory() {
  const list = $("recentList");

  if (!historyData.length) {
    list.innerHTML = `
      <div class="empty-state">
        <span>◉</span>
        <p>Nomor yang kamu scan akan muncul di sini.</p>
      </div>
    `;
    return;
  }

  list.innerHTML = historyData.slice(0, 5).map(item => `
    <div class="recent-item">
      <div class="recent-icon">☎</div>
      <div class="recent-info">
        <strong>${escapeHTML(formatPhone(item.number))}</strong>
        <small>${formatDate(item.time)}</small>
      </div>
      <button class="text-btn" onclick="selectNumber('${escapeJS(item.number)}')">›</button>
    </div>
  `).join("");
}

function renderFullHistory() {
  const list = $("fullHistory");

  if (!historyData.length) {
    list.innerHTML = `<div class="empty-state">Belum ada history scan.</div>`;
    return;
  }

  list.innerHTML = historyData.map(item => `
    <div class="history-item">
      <div class="recent-info">
        <strong>${escapeHTML(formatPhone(item.number))}</strong>
        <small>${formatDate(item.time)}</small>
      </div>
      <button class="text-btn" onclick="selectNumber('${escapeJS(item.number)}')">Buka →</button>
    </div>
  `).join("");
}

window.selectNumber = number => {
  currentNumber = normalizePhone(number);
  showResult(currentNumber);
};

$("historyBtn").addEventListener("click", () => showPage("historyPage"));

$("clearHistory").addEventListener("click", () => {
  if (!confirm("Hapus semua history scan?")) return;
  historyData = [];
  DB.set("history", []);
  renderHistory();
  toast("History dibersihkan");
});

/* ==========================================
   BIO PROFILE
========================================== */

$("myBioBtn").addEventListener("click", () => showPage("bioPage"));
$("bioBack").addEventListener("click", goHome);
$("profileBtn").addEventListener("click", () => showPage("profilePage"));
$("profileBack").addEventListener("click", goHome);
$("editProfileBtn").addEventListener("click", () => showPage("bioPage"));

function renderBio() {
  $("bioName").value = bioData.name || "";
  $("bioDesc").value = bioData.desc || "";
  $("bioPhone").value = bioData.phone || "";

  renderBioLinks();
  updateBioPreview();
}

function updateBioPreview() {
  $("bioPreviewName").textContent = $("bioName").value || "Your Name";
  $("bioPreviewDesc").textContent =
    $("bioDesc").value || "Welcome to my POPER page";
  $("accountName").textContent = $("bioName").value || "Guest User";
}

["bioName", "bioDesc"].forEach(id => {
  $(id).addEventListener("input", updateBioPreview);
});

$("saveBio").addEventListener("click", saveBio);

function saveBio() {
  bioData.name = $("bioName").value.trim();
  bioData.desc = $("bioDesc").value.trim();
  bioData.phone = normalizePhone($("bioPhone").value);
  bioData.links = collectBioLinks();

  DB.set("bio", bioData);

  toast("Bio berhasil disimpan");
  updateBioPreview();
}

function collectBioLinks() {
  return [...document.querySelectorAll(".bio-link-row")].map(row => ({
    title: row.querySelector(".link-title").value.trim(),
    url: row.querySelector(".link-url").value.trim()
  })).filter(link => link.title && link.url);
}

function renderBioLinks() {
  const container = $("bioLinks");
  container.innerHTML = "";

  (bioData.links || []).forEach(link => {
    createBioLinkRow(link.title, link.url);
  });
}

$("addLinkBtn").addEventListener("click", () => {
  createBioLinkRow("", "");
});

function createBioLinkRow(title = "", url = "") {
  const row = document.createElement("div");
  row.className = "bio-link-row";

  row.innerHTML = `
    <input class="link-title" placeholder="Link title" value="${escapeHTML(title)}">
    <input class="link-url" placeholder="https://example.com" value="${escapeHTML(url)}">
    <button class="remove-link" type="button">×</button>
  `;

  row.querySelector(".remove-link").addEventListener("click", () => {
    row.remove();
  });

  $("bioLinks").appendChild(row);
}

$("shareBioBtn").addEventListener("click", async () => {
  saveBio();

  const url = location.origin + location.pathname +
    "?bio=" + encodeURIComponent(bioData.phone || "profile");

  try {
    await navigator.clipboard.writeText(url);
    toast("Link Bio disalin");
  } catch {
    prompt("Salin link Bio kamu:", url);
  }
});

/* ==========================================
   QR VAULT
========================================== */

$("vaultBtn").addEventListener("click", () => showPage("vaultPage"));
$("vaultBack").addEventListener("click", goHome);

$("addQrBtn").addEventListener("click", () => $("qrImageInput").click());
$("firstQrBtn").addEventListener("click", () => $("qrImageInput").click());

$("qrImageInput").addEventListener("change", async event => {
  const file = event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    toast("Pilih file gambar");
    return;
  }

  const name = prompt("Nama QR ini:", file.name.replace(/\.[^.]+$/, ""));
  if (name === null) return;

  const reader = new FileReader();

  reader.onload = () => {
    qrData.unshift({
      name: name || "QR Saved",
      image: reader.result,
      date: Date.now()
    });

    DB.set("vault", qrData);
    renderVault();
    toast("QR berhasil disimpan");
  };

  reader.readAsDataURL(file);
  event.target.value = "";
});

function renderVault() {
  const container = $("vaultList");

  if (!qrData.length) {
    container.className = "vault-empty";
    container.innerHTML = `
      <div class="empty-icon">▦</div>
      <h3>Your QR collection</h3>
      <p>QR yang kamu simpan akan muncul di sini.</p>
      <button class="secondary-btn" id="firstQrBtn">+ Save QR Image</button>
    `;

    $("firstQrBtn").addEventListener("click", () => $("qrImageInput").click());
    return;
  }

  container.className = "vault-list";

  container.innerHTML = qrData.map((item, i) => `
    <div class="qr-item">
      <h4>${escapeHTML(item.name)}</h4>
      <img src="${item.image}" alt="Saved QR">
      <p>${formatDate(item.date)}</p>
      <button class="secondary-btn" onclick="shareQr(${i})">Share</button>
      <button class="secondary-btn" onclick="deleteQr(${i})">Delete</button>
    </div>
  `).join("");
}

window.deleteQr = index => {
  if (!confirm("Hapus QR ini?")) return;
  qrData.splice(index, 1);
  DB.set("vault", qrData);
  renderVault();
};

window.shareQr = async index => {
  const item = qrData[index];
  if (!item) return;

  try {
    await navigator.clipboard.writeText(item.name);
    toast("Nama QR disalin");
  } catch {
    toast(item.name);
  }
};

/* ==========================================
   NOTES
========================================== */

$("notesBtn").addEventListener("click", () => showPage("notesPage"));
$("notesBack").addEventListener("click", goHome);

$("addNoteBtn").addEventListener("click", addNote);

function addNote() {
  const title = prompt("Judul note:");
  if (title === null) return;

  const text = prompt("Isi note:");
  if (text === null) return;

  notesData.unshift({
    id: Date.now(),
    title,
    text,
    time: Date.now()
  });

  DB.set("notes", notesData);
  renderNotes();
  toast("Note tersimpan");
}

function renderNotes() {
  const container = $("notesList");

  if (!notesData.length) {
    container.innerHTML = `<div class="empty-state">Belum ada catatan.</div>`;
    return;
  }

  container.innerHTML = notesData.map(note => `
    <div class="note-item">
      <h4>${escapeHTML(note.title)}</h4>
      <p>${escapeHTML(note.text)}</p>
      <small>${formatDate(note.time)}</small>
      <div class="note-actions">
        <button onclick="editNote(${note.id})">Edit</button>
        <button onclick="deleteNote(${note.id})">Delete</button>
      </div>
    </div>
  `).join("");
}

window.editNote = id => {
  const note = notesData.find(n => n.id === id);
  if (!note) return;

  const title = prompt("Edit judul:", note.title);
  if (title === null) return;

  const text = prompt("Edit isi:", note.text);
  if (text === null) return;

  note.title = title;
  note.text = text;
  note.time = Date.now();

  DB.set("notes", notesData);
  renderNotes();
};

window.deleteNote = id => {
  if (!confirm("Hapus note ini?")) return;
  notesData = notesData.filter(n => n.id !== id);
  DB.set("notes", notesData);
  renderNotes();
};

/* ==========================================
   UTILITIES
========================================== */

function formatPhone(number) {
  const digits = number.replace(/\D/g, "");
  if (digits.startsWith("0") && digits.length >= 10) {
    return digits;
  }
  return number;
}

function formatDate(time) {
  return new Date(time).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function escapeHTML(str) {
  return String(str || "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

function escapeJS(str) {
  return String(str || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function toast(message) {
  const old = document.querySelector(".toast");
  if (old) old.remove();

  const box = document.createElement("div");
  box.className = "toast";
  box.textContent = message;
  document.body.appendChild(box);

  setTimeout(() => box.remove(), 2600);
}

/* ==========================================
   INITIALIZATION
========================================== */

function initialize() {
  renderHistory();
  renderBio();
  renderVault();
  renderNotes();
  showPage("homePage");

  const params = new URLSearchParams(location.search);
  const requestedBio = params.get("bio");

  if (requestedBio && bioData.phone) {
    openPublicBio(bioData, bioData.phone);
  }
}

initialize();
