
import "./firebase.js";

/* =========================
   HELPERS
========================= */

const $ = id => document.getElementById(id);

const safeText = value => String(value ?? "");

function escapeHTML(value) {
  return safeText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  const toast = $("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2600);
}

function setBusy(button, busy, text = "Memproses...") {
  if (!button) return;

  if (busy) {
    button.dataset.oldText = button.innerHTML;
    button.innerHTML = text;
    button.disabled = true;
  } else {
    button.innerHTML = button.dataset.oldText || button.innerHTML;
    button.disabled = false;
  }
}

function randomId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function safeURL(url) {
  try {
    const u = new URL(url);
    return ["https:", "http:"].includes(u.protocol) ? u.href : "";
  } catch {
    return "";
  }
}

function currentUser() {
  return window.POPER?.currentUser || null;
}

function userPath(path) {
  const user = currentUser();
  if (!user) throw new Error("Kamu belum login.");
  return `users/${user.uid}/${path}`;
}

async function dbGet(path) {
  return window.POPER.getData(userPath(path));
}

async function dbSave(path, data) {
  return window.POPER.saveData(userPath(path), data);
}

async function dbPush(path, data) {
  return window.POPER.pushData(userPath(path), data);
}

async function dbDelete(path) {
  return window.POPER.deleteData(userPath(path));
}

/* =========================
   STATE
========================= */

let bioLinksDraft = [];
let cameraStream = null;
let scannerLoop = false;
let toastTimer = null;

/* =========================
   THEME
========================= */

function setTheme(theme) {
  const light = theme === "light";
  document.body.classList.toggle("light", light);

  const themeButton = $("themeToggle");
  if (themeButton) themeButton.textContent = light ? "🌙" : "☀️";

  try {
    localStorage.setItem("poper-theme", theme);
  } catch {}
}

function initTheme() {
  let theme = "dark";

  try {
    theme = localStorage.getItem("poper-theme") || "dark";
  } catch {}

  setTheme(theme);
}

function toggleTheme() {
  setTheme(document.body.classList.contains("light") ? "dark" : "light");
}

/* =========================
   NAVIGATION
========================= */

function showPage(pageId) {
  document.querySelectorAll(".page").forEach(page => {
    page.classList.toggle("active", page.id === pageId);
  });

  document.querySelectorAll(".nav-item").forEach(button => {
    button.classList.toggle("active", button.dataset.page === pageId);
  });

  if (pageId !== "scannerPage") stopCamera();

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showAuth() {
  $("authScreen")?.classList.remove("hidden");
  $("mainScreen")?.classList.add("hidden");
  $("bottomNav")?.classList.add("hidden");
  stopCamera();
}

function showMain() {
  $("authScreen")?.classList.add("hidden");
  $("mainScreen")?.classList.remove("hidden");
  $("bottomNav")?.classList.remove("hidden");

  const user = currentUser();

  if ($("profilePhone")) {
    $("profilePhone").textContent = user?.phoneNumber || "-";
  }

  if ($("userGreeting")) {
    const phone = user?.phoneNumber || "teman";
    $("userGreeting").textContent = phone.length > 5 ? phone.slice(-4) : phone;
  }

  showPage("homePage");
  refreshAll();
}

/* =========================
   AUTH
========================= */

async function sendOtpHandler() {
  const button = $("sendOtpBtn");
  const phone = $("phoneInput")?.value.trim();

  if (!phone) {
    showToast("Masukkan nomor HP terlebih dahulu.");
    return;
  }

  setBusy(button, true, "Mengirim OTP...");

  try {
    await window.POPER.sendOTP(phone);
    $("otpSection")?.classList.remove("hidden");
    showToast("OTP terkirim. Periksa SMS kamu.");
    $("otpInput")?.focus();
  } catch (error) {
    console.error(error);
    window.POPER.resetRecaptcha();
    showToast(error.message || "Gagal mengirim OTP.");
  } finally {
    setBusy(button, false);
  }
}

async function verifyOtpHandler() {
  const button = $("verifyOtpBtn");
  const code = $("otpInput")?.value.trim();

  if (!code) {
    showToast("Masukkan kode OTP.");
    return;
  }

  setBusy(button, true, "Verifikasi...");

  try {
    await window.POPER.verifyOTP(code);
    showToast("Login berhasil.");
  } catch (error) {
    console.error(error);
    showToast(error.message || "OTP salah atau kedaluwarsa.");
  } finally {
    setBusy(button, false);
  }
}

async function logoutHandler() {
  const yes = confirm("Keluar dari akun POPER?");
  if (!yes) return;

  try {
    await window.POPER.logout();
    showToast("Berhasil logout.");
  } catch (error) {
    console.error(error);
    showToast("Gagal logout.");
  }
}

/* =========================
   BIO LINK
========================= */

function addBioDraftLink() {
  const label = $("bioLinkLabel")?.value.trim();
  const url = safeURL($("bioLinkUrl")?.value.trim());

  if (!label || !url) {
    showToast("Isi nama link dan URL yang valid.");
    return;
  }

  bioLinksDraft.push({
    id: randomId(),
    label,
    url
  });

  $("bioLinkLabel").value = "";
  $("bioLinkUrl").value = "";

  renderBioDraftLinks();
}

function renderBioDraftLinks() {
  const container = $("bioDraftLinks");
  if (!container) return;

  if (!bioLinksDraft.length) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = bioLinksDraft.map(link => `
    <div class="list-item">
      <div class="list-item-main">
        <strong>${escapeHTML(link.label)}</strong>
        <small>${escapeHTML(link.url)}</small>
      </div>
      <div class="list-actions">
        <button class="mini-btn delete" data-draft-delete="${escapeHTML(link.id)}">Hapus</button>
      </div>
    </div>
  `).join("");
}

function bioDataFromForm() {
  return {
    title: $("bioTitle")?.value.trim() || "Bio Saya",
    slug: ($("bioSlug")?.value.trim() || "").toLowerCase().replace(/[^a-z0-9-]/g, ""),
    description: $("bioDescription")?.value.trim() || "",
    bgColor: $("bioBgColor")?.value || "#17152b",
    buttonColor: $("bioButtonColor")?.value || "#7c5cff",
    links: bioLinksDraft,
    updatedAt: Date.now()
  };
}

function previewBio() {
  const data = bioDataFromForm();
  const preview = $("bioPreview");

  if (!preview) return;

  preview.classList.remove("hidden");
  preview.style.background = data.bgColor;
  preview.style.color = "#fff";

  preview.innerHTML = `
    <h2>${escapeHTML(data.title)}</h2>
    <p>${escapeHTML(data.description)}</p>
    ${data.links.map(link => `
      <a class="preview-link" href="${escapeHTML(link.url)}"
         target="_blank" rel="noopener noreferrer"
         style="background:${escapeHTML(data.buttonColor)}">
         ${escapeHTML(link.label)}
      </a>
    `).join("")}
  `;

  preview.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function saveBioHandler() {
  const button = $("saveBioBtn");
  const data = bioDataFromForm();

  if (!data.title) {
    showToast("Nama bio wajib diisi.");
    return;
  }

  setBusy(button, true, "Menyimpan...");

  try {
    const id = randomId();

    await dbSave(`bios/${id}`, {
      ...data,
      createdAt: Date.now()
    });

    showToast("Bio berhasil disimpan.");
    bioLinksDraft = [];
    renderBioDraftLinks();

    $("bioTitle").value = "";
    $("bioSlug").value = "";
    $("bioDescription").value = "";
    $("bioPreview").classList.add("hidden");

    await renderBios();
    await renderHomeBios();
  } catch (error) {
    console.error(error);
    showToast(error.message || "Gagal menyimpan bio.");
  } finally {
    setBusy(button, false);
  }
}

async function renderBios() {
  const container = $("bioList");
  if (!container) return;

  try {
    const bios = await dbGet("bios") || {};
    const entries = Object.entries(bios);

    if (!entries.length) {
      container.innerHTML = `
        <div class="empty-state">
          <span>🔗</span><p>Belum ada bio link.</p>
        </div>`;
      return;
    }

    container.innerHTML = entries.map(([id, bio]) => `
      <div class="list-item">
        <div class="list-item-main">
          <strong>${escapeHTML(bio.title || "Bio")}</strong>
          <small>${escapeHTML(bio.description || "Bio personal")}</small>
          <small>${(bio.links || []).length} link</small>
        </div>
        <div class="list-actions">
          <button class="mini-btn" data-bio-preview="${escapeHTML(id)}">Preview</button>
          <button class="mini-btn delete" data-bio-delete="${escapeHTML(id)}">Hapus</button>
        </div>
      </div>
    `).join("");
  } catch (error) {
    console.error(error);
    container.innerHTML = `<div class="empty-state">Gagal memuat bio.</div>`;
  }
}

async function renderHomeBios() {
  const container = $("homeBioList");
  if (!container) return;

  try {
    const bios = await dbGet("bios") || {};
    const entries = Object.entries(bios);

    if (!entries.length) {
      container.innerHTML = `
        <div class="empty-state">
          <span>🔗</span><p>Bio link kamu akan muncul di sini.</p>
        </div>`;
      return;
    }

    container.innerHTML = entries.slice(0, 3).map(([id, bio]) => `
      <div class="list-item">
        <div class="list-item-main">
          <strong>${escapeHTML(bio.title || "Bio")}</strong>
          <small>${(bio.links || []).length} link tersimpan</small>
        </div>
        <button class="mini-btn" data-bio-preview="${escapeHTML(id)}">Preview</button>
      </div>
    `).join("");
  } catch (error) {
    console.error(error);
  }
}

async function previewSavedBio(id) {
  try {
    const bio = await dbGet(`bios/${id}`);
    if (!bio) return showToast("Bio tidak ditemukan.");

    const preview = $("bioPreview");
    preview.classList.remove("hidden");
    preview.style.background = bio.bgColor || "#17152b";
    preview.style.color = "#fff";

    preview.innerHTML = `
      <h2>${escapeHTML(bio.title || "Bio")}</h2>
      <p>${escapeHTML(bio.description || "")}</p>
      ${(bio.links || []).map(link => `
        <a class="preview-link"
           href="${escapeHTML(safeURL(link.url))}"
           target="_blank" rel="noopener noreferrer"
           style="background:${escapeHTML(bio.buttonColor || "#7c5cff")}">
           ${escapeHTML(link.label)}
        </a>
      `).join("")}`;

    showPage("bioPage");
    preview.scrollIntoView({ behavior: "smooth" });
  } catch (error) {
    console.error(error);
    showToast("Gagal membuka preview.");
  }
}

async function deleteBio(id) {
  if (!confirm("Hapus bio link ini?")) return;

  try {
    await dbDelete(`bios/${id}`);
    await renderBios();
    await renderHomeBios();
    showToast("Bio dihapus.");
  } catch (error) {
    console.error(error);
    showToast("Gagal menghapus bio.");
  }
}

/* =========================
   QR VAULT
========================= */

async function saveVaultHandler() {
  const title = $("vaultTitle")?.value.trim();
  const url = safeURL($("vaultUrl")?.value.trim());

  if (!title || !url) {
    showToast("Isi nama dan URL yang valid.");
    return;
  }

  try {
    await dbPush("vault", {
      title,
      url,
      createdAt: Date.now()
    });

    $("vaultTitle").value = "";
    $("vaultUrl").value = "";

    showToast("Berhasil disimpan ke Vault.");
    await renderVault();
  } catch (error) {
    console.error(error);
    showToast("Gagal menyimpan Vault.");
  }
}

async function renderVault() {
  const container = $("vaultList");
  if (!container) return;

  try {
    const data = await dbGet("vault") || {};
    const entries = Object.entries(data);

    if (!entries.length) {
      container.innerHTML = `<div class="empty-state"><span>🔐</span><p>Vault masih kosong.</p></div>`;
      return;
    }

    container.innerHTML = entries.map(([id, item]) => `
      <div class="list-item">
        <div class="list-item-main">
          <strong>${escapeHTML(item.title)}</strong>
          <small>${escapeHTML(item.url)}</small>
        </div>
        <div class="list-actions">
          <button class="mini-btn" data-vault-open="${escapeHTML(id)}">Buka</button>
          <button class="mini-btn" data-vault-copy="${escapeHTML(id)}">Salin</button>
          <button class="mini-btn delete" data-vault-delete="${escapeHTML(id)}">Hapus</button>
        </div>
      </div>
    `).join("");
  } catch (error) {
    console.error(error);
    container.innerHTML = `<div class="empty-state">Gagal memuat Vault.</div>`;
  }
}

async function vaultAction(id, action) {
  const item = await dbGet(`vault/${id}`);
  if (!item) return;

  if (action === "open") {
    const url = safeURL(item.url);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  if (action === "copy") {
    await copyText(item.url);
  }

  if (action === "delete") {
    if (!confirm("Hapus item Vault?")) return;
    await dbDelete(`vault/${id}`);
    await renderVault();
    showToast("Item dihapus.");
  }
}

/* =========================
   NOTES
========================= */

async function saveNoteHandler() {
  const title = $("noteTitle")?.value.trim();
  const content = $("noteContent")?.value.trim();

  if (!title || !content) {
    showToast("Isi judul dan catatan.");
    return;
  }

  try {
    await dbPush("notes", {
      title,
      content,
      createdAt: Date.now()
    });

    $("noteTitle").value = "";
    $("noteContent").value = "";

    showToast("Catatan tersimpan.");
    await renderNotes();
  } catch (error) {
    console.error(error);
    showToast("Gagal menyimpan catatan.");
  }
}

async function renderNotes() {
  const container = $("notesList");
  if (!container) return;

  try {
    const notes = await dbGet("notes") || {};
    const entries = Object.entries(notes);

    if (!entries.length) {
      container.innerHTML = `<div class="empty-state"><span>📝</span><p>Belum ada catatan.</p></div>`;
      return;
    }

    container.innerHTML = entries.map(([id, note]) => `
      <div class="list-item">
        <div class="list-item-main">
          <strong>${escapeHTML(note.title)}</strong>
          <small>${escapeHTML(note.content)}</small>
        </div>
        <div class="list-actions">
          <button class="mini-btn delete" data-note-delete="${escapeHTML(id)}">Hapus</button>
        </div>
      </div>
    `).join("");
  } catch (error) {
    console.error(error);
    container.innerHTML = `<div class="empty-state">Gagal memuat catatan.</div>`;
  }
}

async function deleteNote(id) {
  if (!confirm("Hapus catatan ini?")) return;

  try {
    await dbDelete(`notes/${id}`);
    await renderNotes();
    showToast("Catatan dihapus.");
  } catch (error) {
    console.error(error);
    showToast("Gagal menghapus.");
  }
}

/* =========================
   SCANNER CAMERA / OCR
========================= */

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    showToast("Browser tidak mendukung kamera.");
    return;
  }

  try {
    stopCamera();

    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" }
      },
      audio: false
    });

    const video = $("scannerVideo");
    video.srcObject = cameraStream;
    video.classList.add("live");

    $("cameraPlaceholder").classList.add("hidden");
    $("cameraArea")?.classList.add("video-active");

    await video.play();
    scannerLoop = true;

    scanCameraFrame();
    showToast("Kamera aktif.");
  } catch (error) {
    console.error(error);
    showToast("Kamera gagal dibuka. Izinkan akses kamera.");
  }
}

function stopCamera() {
  scannerLoop = false;

  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }

  const video = $("scannerVideo");

  if (video) {
    video.srcObject = null;
    video.classList.remove("live");
  }

  const area = document.querySelector(".camera-area");
  area?.classList.remove("video-active");

  $("cameraPlaceholder")?.classList.remove("hidden");
}

async function scanCameraFrame() {
  const video = $("scannerVideo");

  while (scannerLoop && cameraStream) {
    if (video && video.readyState >= 2 && video.videoWidth > 0) {
      try {
        // QR detection when supported
        if ("BarcodeDetector" in window) {
          const detector = new BarcodeDetector({
            formats: ["qr_code"]
          });

          const codes = await detector.detect(video);

          if (codes.length) {
            const code = codes[0].rawValue || "";
            const phone = extractPhone(code);

            if (phone) {
              $("scanResult").value = phone;
              showToast("Nomor terdeteksi!");
              stopCamera();
              break;
            }
          }
        }
      } catch (e) {
        // Browser may not support detector; keep camera alive
      }
    }

    await new Promise(resolve => setTimeout(resolve, 600));
  }
}

function extractPhone(text) {
  const matches = String(text || "").match(/(?:\+?62|0)?8\d{8,12}/g);
  if (!matches || !matches.length) return "";

  let phone = matches[0].replace(/[^\d+]/g, "");

  if (phone.startsWith("08")) phone = "+62" + phone.slice(1);
  else if (phone.startsWith("8")) phone = "+62" + phone;
  else if (phone.startsWith("62")) phone = "+" + phone;

  return phone;
}

async function scanImageHandler(file) {
  if (!file) return;

  showToast("Memproses gambar...");

  try {
    // OCR engine loaded only when needed
    const Tesseract = await import(
      "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.esm.min.js"
    );

    const worker = await Tesseract.createWorker("eng");
    const result = await worker.recognize(file);
    await worker.terminate();

    const phone = extractPhone(result.data.text);

    if (phone) {
      $("scanResult").value = phone;
      showToast("Nomor berhasil ditemukan.");
    } else {
      showToast("Nomor HP tidak ditemukan pada gambar.");
    }
  } catch (error) {
    console.error(error);
    showToast("OCR gagal. Coba gambar lebih jelas.");
  }
}

async function saveScanHandler() {
  const phone = $("scanResult")?.value.trim();

  if (!phone) {
    showToast("Masukkan nomor HP.");
    return;
  }

  try {
    await dbPush("scanHistory", {
      phone,
      createdAt: Date.now()
    });

    showToast("Nomor berhasil disimpan.");
    await renderScanHistory();
  } catch (error) {
    console.error(error);
    showToast("Gagal menyimpan nomor.");
  }
}

async function renderScanHistory() {
  const container = $("scanHistoryList");
  if (!container) return;

  try {
    const data = await dbGet("scanHistory") || {};
    const entries = Object.entries(data).reverse();

    if (!entries.length) {
      container.innerHTML = `<div class="empty-state"><p>Riwayat scan kosong.</p></div>`;
      return;
    }

    container.innerHTML = entries.slice(0, 30).map(([id, item]) => `
      <div class="list-item">
        <div class="list-item-main">
          <strong>${escapeHTML(item.phone)}</strong>
          <small>${new Date(item.createdAt || 0).toLocaleString("id-ID")}</small>
        </div>
        <div class="list-actions">
          <button class="mini-btn" data-scan-copy="${escapeHTML(id)}">Salin</button>
          <button class="mini-btn delete" data-scan-delete="${escapeHTML(id)}">Hapus</button>
        </div>
      </div>
    `).join("");
  } catch (error) {
    console.error(error);
    container.innerHTML = `<div class="empty-state">Gagal memuat riwayat.</div>`;
  }
}

async function deleteScanHistory(id) {
  try {
    await dbDelete(`scanHistory/${id}`);
    await renderScanHistory();
    showToast("Riwayat dihapus.");
  } catch (error) {
    console.error(error);
    showToast("Gagal menghapus.");
  }
}

async function clearScanHistory() {
  if (!confirm("Hapus semua riwayat scan?")) return;

  try {
    await dbDelete("scanHistory");
    await renderScanHistory();
    showToast("Riwayat scan dibersihkan.");
  } catch (error) {
    console.error(error);
    showToast("Gagal membersihkan.");
  }
}

/* =========================
   CLIPBOARD
========================= */

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast("Berhasil disalin.");
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
    showToast("Berhasil disalin.");
  }
}

/* =========================
   EVENT LISTENERS
========================= */

function bindEvents() {
  $("sendOtpBtn")?.addEventListener("click", sendOtpHandler);
  $("verifyOtpBtn")?.addEventListener("click", verifyOtpHandler);
  $("logoutBtn")?.addEventListener("click", logoutHandler);

  $("themeToggle")?.addEventListener("click", toggleTheme);
  $("profileThemeBtn")?.addEventListener("click", toggleTheme);
  $("profileButton")?.addEventListener("click", () => showPage("profilePage"));
  $("profileHomeBtn")?.addEventListener("click", () => showPage("homePage"));
  $("brandHome")?.addEventListener("click", e => {
    e.preventDefault();
    if (currentUser()) showPage("homePage");
  });

  $("heroScanBtn")?.addEventListener("click", () => showPage("scannerPage"));

  $("addBioLinkBtn")?.addEventListener("click", addBioDraftLink);
  $("previewBioBtn")?.addEventListener("click", previewBio);
  $("saveBioBtn")?.addEventListener("click", saveBioHandler);

  $("saveVaultBtn")?.addEventListener("click", saveVaultHandler);
  $("saveNoteBtn")?.addEventListener("click", saveNoteHandler);

  $("startCameraBtn")?.addEventListener("click", startCamera);
  $("stopCameraBtn")?.addEventListener("click", stopCamera);

  $("imageScanInput")?.addEventListener("change", event => {
    scanImageHandler(event.target.files?.[0]);
    event.target.value = "";
  });

  $("saveScanBtn")?.addEventListener("click", saveScanHandler);
  $("copyScanBtn")?.addEventListener("click", () => {
    copyText($("scanResult")?.value || "");
  });

  $("callScanBtn")?.addEventListener("click", () => {
    const phone = $("scanResult")?.value.trim();
    if (phone) location.href = "tel:" + phone;
    else showToast("Nomor HP belum tersedia.");
  });

  $("clearScanHistoryBtn")?.addEventListener("click", clearScanHistory);

  $("otpInput")?.addEventListener("input", event => {
    event.target.value = event.target.value.replace(/\D/g, "").slice(0, 6);
  });

  document.addEventListener("click", async event => {
    const target = event.target.closest("[data-page]");
    if (target) {
      showPage(target.dataset.page);
    }

    const draftDelete = event.target.closest("[data-draft-delete]");
    if (draftDelete) {
      bioLinksDraft = bioLinksDraft.filter(link => link.id !== draftDelete.dataset.draftDelete);
      renderBioDraftLinks();
    }

    const bioPreviewBtn = event.target.closest("[data-bio-preview]");
    if (bioPreviewBtn) previewSavedBio(bioPreviewBtn.dataset.bioPreview);

    const bioDeleteBtn = event.target.closest("[data-bio-delete]");
    if (bioDeleteBtn) deleteBio(bioDeleteBtn.dataset.bioDelete);

    const vaultOpen = event.target.closest("[data-vault-open]");
    if (vaultOpen) vaultAction(vaultOpen.dataset.vaultOpen, "open");

    const vaultCopy = event.target.closest("[data-vault-copy]");
    if (vaultCopy) vaultAction(vaultCopy.dataset.vaultCopy, "copy");

    const vaultDelete = event.target.closest("[data-vault-delete]");
    if (vaultDelete) vaultAction(vaultDelete.dataset.vaultDelete, "delete");

    const noteDeleteBtn = event.target.closest("[data-note-delete]");
    if (noteDeleteBtn) deleteNote(noteDeleteBtn.dataset.noteDelete);

    const scanCopy = event.target.closest("[data-scan-copy]");
    if (scanCopy) {
      const history = await dbGet("scanHistory") || {};
      const item = history[scanCopy.dataset.scanCopy];
      if (item) copyText(item.phone);
    }

    const scanDelete = event.target.closest("[data-scan-delete]");
    if (scanDelete) deleteScanHistory(scanDelete.dataset.scanDelete);
  });
}

/* =========================
   REFRESH
========================= */

async function refreshAll() {
  await Promise.allSettled([
    renderBios(),
    renderHomeBios(),
    renderVault(),
    renderNotes(),
    renderScanHistory()
  ]);
}

/* =========================
   INIT
========================= */

function init() {
  initTheme();
  bindEvents();

  // Auth watcher
  window.POPER.onAuth(user => {
    if (user) {
      showMain();
    } else {
      showAuth();
    }
  });

  console.log("POPER app initialized");
}

try {
  init();
} catch (error) {
  console.error("POPER initialization failed:", error);
  showToast("Aplikasi gagal diinisialisasi. Refresh halaman.");
}
