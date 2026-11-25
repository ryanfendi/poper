
import "./firebase.js";

/* ============================================
   POPER APP — FULL INTEGRATED VERSION
   Firebase helper from existing firebase.js
============================================ */

const $ = id => document.getElementById(id);

const POPER = window.POPER;

if (!POPER) {
  console.error("POPER Firebase belum dimuat. Periksa firebase.js");
}

let currentUser = null;
let otpConfirmation = null;
let currentProfile = {};
let profileEditorPhoto = "";
let selectedPhoneNumber = "";
let detectedPhoneNumbers = [];
let phoneStream = null;
let phoneOCRWorker = null;
let phoneOCRBusy = false;
let phoneLiveTimer = null;
let lastLiveOCR = 0;
let qrStream = null;
let qrFrame = null;
let qrBusy = false;
let qrRecords = {};
let noteRecords = {};
let cropImage = null;
let cropScale = 1;
let cropBaseScale = 1;
let cropOffsetX = 0;
let cropOffsetY = 0;
let cropDragging = false;
let cropStartX = 0;
let cropStartY = 0;
let cropStartOffsetX = 0;
let cropStartOffsetY = 0;
let cropImageObjectURL = null;
let publicProfileUID = null;

/* ============================================
   UTILITIES
============================================ */

function setStatus(id, message, type = "") {
  const el = $(id);
  if (!el) return;

  el.textContent = message;
  el.className = "status" + (type ? " " + type : "");
}

function cleanText(value) {
  return String(value || "").trim();
}

function normalizePhone(value) {
  let phone = String(value || "").replace(/\D/g, "");

  if (phone.startsWith("0062")) phone = phone.slice(2);
  if (phone.startsWith("62")) phone = "0" + phone.slice(2);
  if (phone.startsWith("8")) phone = "0" + phone;

  return phone;
}

function phoneKey(value) {
  return normalizePhone(value).replace(/\D/g, "");
}

function normalizePhoneForWhatsApp(value) {
  let n = normalizePhone(value);
  if (n.startsWith("0")) n = "62" + n.slice(1);
  return n;
}

function safeURL(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.href;
    }
  } catch {}
  return "";
}

function showSection(id) {
  const targetId = id === "scanner" ? "phoneScanner" : id;

  document.querySelectorAll(".section").forEach(section => {
    section.classList.remove("active");
  });

  const target = $(targetId);
  if (target) target.classList.add("active");

  const navTarget = targetId === "phoneScanner" ? "phoneScanner" : targetId;

  document.querySelectorAll(".nav-item").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.openTab === navTarget
    );
  });

  if (targetId !== "phoneScanner") stopPhoneCamera();
  if (targetId !== "qr") stopQRScanner();

  if (targetId === "identity" && currentUser) {
    renderIdentity(currentUser);
  }

  if (targetId === "profileEditor" && currentUser) {
    loadMyProfileEditor();
  }

  if (targetId === "notes" && currentUser) {
    loadNotes();
  }

  if (targetId === "qr" && currentUser) {
    loadQRVault();
  }
}

document.querySelectorAll("[data-open-tab]").forEach(button => {
  button.addEventListener("click", () => {
    showSection(button.dataset.openTab);
  });
});

/* ============================================
   THEME
============================================ */

function applyTheme(theme) {
  document.body.classList.toggle("dark", theme === "dark");
  localStorage.setItem("poper_theme", theme);

  const btn = $("themeToggle");
  if (btn) btn.textContent = theme === "dark" ? "🌙" : "☀️";
}

applyTheme(localStorage.getItem("poper_theme") || "light");

$("themeToggle")?.addEventListener("click", () => {
  const dark = document.body.classList.contains("dark");
  applyTheme(dark ? "light" : "dark");
});

/* ============================================
   AUTH OTP
============================================ */

function authStatus(message, error = false) {
  setStatus("authStatus", message, error ? "error" : "");
}

$("sendOtpBtn")?.addEventListener("click", async () => {
  const phone = cleanText($("phoneInput").value);

  if (!phone) {
    authStatus("Masukkan nomor HP terlebih dahulu.", true);
    return;
  }

  if (!POPER?.sendOTP) {
    authStatus("Fungsi OTP tidak ditemukan di firebase.js", true);
    return;
  }

  try {
    $("sendOtpBtn").disabled = true;
    authStatus("Mengirim OTP...");

    otpConfirmation = await POPER.sendOTP(phone);

    $("otpSection").classList.remove("hidden");
    authStatus("OTP berhasil dikirim. Periksa SMS.");

  } catch (error) {
    console.error(error);
    authStatus(error.message || "Gagal mengirim OTP.", true);
    POPER.resetRecaptcha?.();

  } finally {
    $("sendOtpBtn").disabled = false;
  }
});

$("verifyOtpBtn")?.addEventListener("click", async () => {
  const code = cleanText($("otpInput").value);

  if (!code || !otpConfirmation) {
    authStatus("Kirim OTP terlebih dahulu.", true);
    return;
  }

  try {
    $("verifyOtpBtn").disabled = true;
    authStatus("Memverifikasi OTP...");

    const result = await otpConfirmation.confirm(code);

    if (result?.user) {
      currentUser = result.user;
    }

    authStatus("Login berhasil.");

  } catch (error) {
    console.error(error);
    authStatus(error.message || "Kode OTP salah.", true);

  } finally {
    $("verifyOtpBtn").disabled = false;
  }
});

$("logoutBtn")?.addEventListener("click", async () => {
  try {
    await POPER.logout();
  } catch (error) {
    console.error(error);
  }
});

POPER?.onAuth?.(user => {
  currentUser = user || null;

  if (user) {
    $("loginPanel")?.classList.add("hidden");
    $("dashboard")?.classList.remove("hidden");
    $("bottomNav")?.classList.remove("hidden");

    loadBio();
    loadQRVault();
    loadNotes();
    loadMyProfileEditor();
    renderIdentity(user);

  } else {
    $("loginPanel")?.classList.remove("hidden");
    $("dashboard")?.classList.add("hidden");
    $("bottomNav")?.classList.add("hidden");

    stopPhoneCamera();
    stopQRScanner();
  }
});

/* ============================================
   BIO LINK
============================================ */

async function loadBio() {
  if (!currentUser) return;

  try {
    const profile = await POPER.getData(
      `users/${currentUser.uid}/publicBio`
    );

    currentProfile = profile || {};

    $("bioName").value = profile?.name || "";
    $("bioDesc").value = profile?.description || profile?.bio || "";
    $("bioTitle").value = profile?.title || "";
    $("bioUrl").value = profile?.url || "";

  } catch (error) {
    console.error("Load Bio:", error);
  }
}

$("saveBio")?.addEventListener("click", async () => {
  if (!currentUser) return;

  const name = cleanText($("bioName").value);
  const description = cleanText($("bioDesc").value);
  const title = cleanText($("bioTitle").value);
  const url = safeURL($("bioUrl").value);

  if (!name) {
    setStatus("bioStatus", "Nama wajib diisi.", "error");
    return;
  }

  if ($("bioUrl").value.trim() && !url) {
    setStatus("bioStatus", "URL tidak valid. Gunakan https://", "error");
    return;
  }

  try {
    setStatus("bioStatus", "Menyimpan...");

    const old = currentProfile || {};

    const profile = {
      ...old,
      uid: currentUser.uid,
      name,
      description,
      bio: old.bio || description,
      title,
      url,
      phone: currentUser.phoneNumber || old.phone || "",
      updatedAt: Date.now()
    };

    await POPER.saveData(
      `users/${currentUser.uid}/publicBio`,
      profile
    );

    currentProfile = profile;

    if (profile.phone) {
      await POPER.saveData(
        `phoneLookup/${phoneKey(profile.phone)}`,
        {
          uid: currentUser.uid,
          phone: profile.phone
        }
      );
    }

    setStatus("bioStatus", "Bio berhasil disimpan!", "success");
    renderIdentity(currentUser);

  } catch (error) {
    console.error(error);
    setStatus("bioStatus", error.message || "Gagal menyimpan Bio.", "error");
  }
});

/* ============================================
   PHONE SCANNER CAMERA
============================================ */

async function startPhoneCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus("phoneScanStatus", "Browser tidak mendukung kamera.", "error");
    return;
  }

  try {
    stopPhoneCamera();

    phoneStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });

    $("phoneScanVideo").srcObject = phoneStream;
    $("phoneScanVideo").classList.remove("hidden");
    $("phoneScanPlaceholder").classList.add("hidden");

    setStatus("phoneScanStatus", "Kamera aktif. Arahkan ke nomor HP.");

    startLiveOCR();

  } catch (error) {
    console.error(error);
    setStatus("phoneScanStatus", "Tidak dapat mengakses kamera. Periksa izin kamera.", "error");
  }
}

function stopPhoneCamera() {
  if (phoneStream) {
    phoneStream.getTracks().forEach(track => track.stop());
    phoneStream = null;
  }

  if ($("phoneScanVideo")) {
    $("phoneScanVideo").srcObject = null;
  }

  clearInterval(phoneLiveTimer);
  phoneLiveTimer = null;

  $("phoneScanPlaceholder")?.classList.remove("hidden");
}

$("startPhoneCamera")?.addEventListener("click", startPhoneCamera);
$("stopPhoneCamera")?.addEventListener("click", stopPhoneCamera);

$("backFromScanner")?.addEventListener("click", () => {
  showSection("home");
});

/* ============================================
   OCR WORKER
============================================ */

async function getPhoneOCRWorker() {
  if (phoneOCRWorker) return phoneOCRWorker;

  if (!window.Tesseract) {
    throw new Error("OCR engine belum tersedia.");
  }

  phoneOCRWorker = await Tesseract.createWorker("eng");

  await phoneOCRWorker.setParameters({
    tessedit_char_whitelist: "0123456789+()- ",
    tessedit_pageseg_mode: "6",
    preserve_interword_spaces: "1"
  });

  return phoneOCRWorker;
}

function extractPhoneCandidates(text) {
  const cleaned = String(text || "")
    .replace(/[Oo]/g, "0")
    .replace(/[Il|]/g, "1");

  const matches = cleaned.match(
    /(?:\+?62|0)\s*(?:[\d\s().-]{7,18})/g
  ) || [];

  const result = [];

  for (const match of matches) {
    let number = match.replace(/\D/g, "");

    if (number.startsWith("62")) {
      number = "0" + number.slice(2);
    }

    if (number.startsWith("8")) {
      number = "0" + number;
    }

    if (/^08\d{8,13}$/.test(number) && !result.includes(number)) {
      result.push(number);
    }
  }

  return result;
}

function mergePhoneCandidates(...arrays) {
  const all = [];

  arrays.flat().forEach(value => {
    const n = normalizePhone(value);

    if (/^08\d{8,13}$/.test(n) && !all.includes(n)) {
      all.push(n);
    }
  });

  return all;
}

function renderPhoneCandidates(numbers) {
  detectedPhoneNumbers = mergePhoneCandidates(numbers);

  const box = $("phoneCandidates");
  const list = $("candidateList");

  if (!box || !list) return;

  list.innerHTML = "";

  if (!detectedPhoneNumbers.length) {
    box.classList.add("hidden");
    return;
  }

  box.classList.remove("hidden");
  $("candidateCount").textContent = detectedPhoneNumbers.length + " nomor";

  detectedPhoneNumbers.forEach((number, index) => {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "phone-candidate";

    if (selectedPhoneNumber === number) {
      button.classList.add("selected");
    }

    const left = document.createElement("span");
    left.textContent = number;

    const right = document.createElement("strong");
    right.textContent = selectedPhoneNumber === number ? "✓" : "Pilih";

    button.append(left, right);

    button.addEventListener("click", () => {
      selectPhoneCandidate(number, true);
    });

    list.appendChild(button);
  });
}

function selectPhoneCandidate(number, autoSearch = false) {
  selectedPhoneNumber = number;
  $("scannedPhoneNumber").value = number;
  renderPhoneCandidates(detectedPhoneNumbers);

  setStatus("phoneScanStatus", "Nomor dipilih: " + number, "success");

  if (autoSearch) {
    autoFindBio(number);
  }
}

async function recognizePhone(source, live = false) {
  if (phoneOCRBusy) return [];

  phoneOCRBusy = true;

  try {
    const worker = await getPhoneOCRWorker();

    const result = await worker.recognize(source);
    const candidates = extractPhoneCandidates(result?.data?.text || "");

    if (!live) {
      renderPhoneCandidates(candidates);

      if (candidates.length === 1) {
        selectedPhoneNumber = candidates[0];
        $("scannedPhoneNumber").value = candidates[0];
      }

      setStatus(
        "phoneScanStatus",
        candidates.length
          ? `${candidates.length} nomor ditemukan. Pilih nomor atau edit.`
          : "Nomor belum terbaca. Coba crop, zoom, atau foto ulang."
      );
    }

    return candidates;

  } catch (error) {
    console.error("OCR:", error);

    if (!live) {
      setStatus("phoneScanStatus", "OCR gagal membaca gambar.", "error");
    }

    return [];

  } finally {
    phoneOCRBusy = false;
  }
}

/* ============================================
   LIVE OCR
============================================ */

function startLiveOCR() {
  clearInterval(phoneLiveTimer);

  phoneLiveTimer = setInterval(async () => {
    if (!phoneStream || phoneOCRBusy) return;

    const video = $("phoneScanVideo");

    if (!video || video.readyState < 2 || video.videoWidth === 0) return;

    const now = Date.now();

    if (now - lastLiveOCR < 3500) return;
    lastLiveOCR = now;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const candidates = await recognizePhone(canvas, true);

    if (candidates.length) {
      renderPhoneCandidates(candidates);
      setStatus("phoneScanStatus", "Nomor terdeteksi. Ketuk nomor untuk memilih.");
    }

  }, 500);
}

/* ============================================
   IMAGE UPLOAD OCR
============================================ */

async function handlePhoneImage(file) {
  if (!file || !file.type.startsWith("image/")) return;

  stopPhoneCamera();

  if (cropImageObjectURL) {
    URL.revokeObjectURL(cropImageObjectURL);
  }

  cropImageObjectURL = URL.createObjectURL(file);

  $("phoneImagePreview").src = cropImageObjectURL;
  $("phoneImagePreview").classList.remove("hidden");

  const image = new Image();

  image.onload = async () => {
    openCropEditor(image);
    await recognizePhone(image, false);
  };

  image.onerror = () => {
    setStatus("phoneScanStatus", "Gambar tidak dapat dibuka.", "error");
  };

  image.src = cropImageObjectURL;
}

$("phoneImageUpload")?.addEventListener("change", event => {
  handlePhoneImage(event.target.files?.[0]);
});

$("phoneTakePhoto")?.addEventListener("change", event => {
  handlePhoneImage(event.target.files?.[0]);
});

/* ============================================
   CROP / ZOOM EDITOR
============================================ */

function openCropEditor(image) {
  cropImage = image;

  const viewport = $("cropViewport");
  const canvas = $("cropCanvas");
  if (!viewport || !canvas) return;

  const vw = viewport.clientWidth;
  const vh = viewport.clientHeight;

  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;

  canvas.style.left = "0";
  canvas.style.top = "0";

  canvas.getContext("2d").drawImage(image, 0, 0);

  cropBaseScale = Math.min(vw / canvas.width, vh / canvas.height);
  cropScale = cropBaseScale;

  cropOffsetX = (vw - canvas.width * cropScale) / 2;
  cropOffsetY = (vh - canvas.height * cropScale) / 2;

  updateCropTransform();

  $("cropEditor").classList.remove("hidden");
  $("zoomValue").textContent = "100%";
}

function updateCropTransform() {
  const canvas = $("cropCanvas");
  if (!canvas) return;

  canvas.style.transform =
    `translate(${cropOffsetX}px,${cropOffsetY}px) scale(${cropScale})`;
}

function zoomCrop(multiplier) {
  if (!cropImage) return;

  const viewport = $("cropViewport");
  const centerX = viewport.clientWidth / 2;
  const centerY = viewport.clientHeight / 2;

  const oldScale = cropScale;
  cropScale = Math.min(cropBaseScale * 5, Math.max(cropBaseScale * .5, cropScale * multiplier));

  const ratio = cropScale / oldScale;

  cropOffsetX = centerX - (centerX - cropOffsetX) * ratio;
  cropOffsetY = centerY - (centerY - cropOffsetY) * ratio;

  updateCropTransform();

  $("zoomValue").textContent =
    Math.round((cropScale / cropBaseScale) * 100) + "%";
}

$("zoomIn")?.addEventListener("click", () => zoomCrop(1.2));
$("zoomOut")?.addEventListener("click", () => zoomCrop(.83));

$("resetCrop")?.addEventListener("click", () => {
  if (cropImage) openCropEditor(cropImage);
});

const cropViewport = $("cropViewport");

cropViewport?.addEventListener("pointerdown", event => {
  cropDragging = true;
  cropStartX = event.clientX;
  cropStartY = event.clientY;
  cropStartOffsetX = cropOffsetX;
  cropStartOffsetY = cropOffsetY;

  cropViewport.setPointerCapture(event.pointerId);
});

cropViewport?.addEventListener("pointermove", event => {
  if (!cropDragging) return;

  cropOffsetX = cropStartOffsetX + event.clientX - cropStartX;
  cropOffsetY = cropStartOffsetY + event.clientY - cropStartY;

  updateCropTransform();
});

cropViewport?.addEventListener("pointerup", () => cropDragging = false);
cropViewport?.addEventListener("pointercancel", () => cropDragging = false);

function getSelectedCropCanvas() {
  if (!cropImage) return null;

  const viewport = $("cropViewport");
  const selection = $("cropSelection");

  const vr = viewport.getBoundingClientRect();
  const sr = selection.getBoundingClientRect();

  const sx = (sr.left - vr.left - cropOffsetX) / cropScale;
  const sy = (sr.top - vr.top - cropOffsetY) / cropScale;
  const sw = sr.width / cropScale;
  const sh = sr.height / cropScale;

  const x = Math.max(0, Math.min(cropImage.width - 1, sx));
  const y = Math.max(0, Math.min(cropImage.height - 1, sy));
  const width = Math.max(1, Math.min(cropImage.width - x, sw));
  const height = Math.max(1, Math.min(cropImage.height - y, sh));

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width);
  canvas.height = Math.round(height);

  canvas.getContext("2d").drawImage(
    cropImage,
    x, y, width, height,
    0, 0, canvas.width, canvas.height
  );

  return canvas;
}

$("scanCropButton")?.addEventListener("click", async () => {
  const crop = getSelectedCropCanvas();
  if (!crop) return;

  setStatus("phoneScanStatus", "Membaca area crop...");
  await recognizePhone(crop, false);
});

/* ============================================
   FIND BIO
============================================ */

async function findBioByPhone(phone) {
  const number = normalizePhone(phone);

  if (!/^08\d{8,13}$/.test(number)) {
    setStatus("findStatus", "Nomor HP tidak valid.", "error");
    return null;
  }

  if (!currentUser) {
    setStatus("findStatus", "Silakan login terlebih dahulu.", "error");
    return null;
  }

  setStatus("findStatus", "Mencari Bio...");
  $("findResult").classList.add("hidden");
  $("contactConnect").classList.add("hidden");

  try {
    const lookup = await POPER.getData(
      `phoneLookup/${phoneKey(number)}`
    );

    if (!lookup?.uid) {
      setStatus("findStatus", "Bio belum ditemukan.", "");
      renderFindNotFound(number);
      openContactConnect(number, false);
      return null;
    }

    const profile = await POPER.getData(
      `users/${lookup.uid}/publicBio`
    );

    if (!profile) {
      setStatus("findStatus", "Profil belum tersedia.", "");
      openContactConnect(number, false);
      return null;
    }

    setStatus("findStatus", "Profil ditemukan!", "success");
    renderFindProfile(profile, lookup.uid);
    openContactConnect(number, true);

    return profile;

  } catch (error) {
    console.error("Find Bio:", error);
    setStatus("findStatus", error.message || "Pencarian gagal.", "error");
    return null;
  }
}

$("findBioButton")?.addEventListener("click", () => {
  findBioByPhone($("findPhone").value);
});

$("searchScannedPhone")?.addEventListener("click", () => {
  const number = normalizePhone($("scannedPhoneNumber").value);
  if (!number) {
    setStatus("phoneScanStatus", "Masukkan nomor HP.", "error");
    return;
  }

  $("findPhone").value = number;
  showSection("find");
  findBioByPhone(number);
});

async function autoFindBio(number) {
  $("findPhone").value = number;
  showSection("find");
  await findBioByPhone(number);
}

function renderFindNotFound(phone) {
  const result = $("findResult");
  result.classList.remove("hidden");
  result.innerHTML = "";

  const h = document.createElement("h3");
  h.textContent = "Bio belum ditemukan";

  const p = document.createElement("p");
  p.textContent = phone + " belum terdaftar di POPER.";

  result.append(h, p);
}

function renderFindProfile(profile, uid) {
  const result = $("findResult");
  result.classList.remove("hidden");
  result.innerHTML = "";

  const avatar = document.createElement("img");
  avatar.className = "profile-avatar";
  avatar.src = profile.photoURL || profile.photo || "https://placehold.co/120x120";

  const h = document.createElement("h2");
  h.textContent = profile.name || "POPER User";

  const desc = document.createElement("p");
  desc.textContent = profile.bio || profile.description || "";
  desc.className = "muted";

  const profileButton = document.createElement("button");
  profileButton.className = "primary-btn";
  profileButton.textContent = "Buka Profil";
  profileButton.addEventListener("click", () => {
    openPublicProfile(uid);
  });

  result.append(avatar, h, desc, profileButton);
}

function openPublicProfile(uid) {
  if (!uid) return;
  publicProfileUID = uid;
  showSection("publicProfile");
  loadPublicProfile(uid);
}

/* ============================================
   CONTACT CONNECT
============================================ */

function openContactConnect(phone, bioExists = false) {
  const number = normalizePhone(phone);
  if (!number) return;

  const box = $("contactConnect");
  if (!box) return;

  box.classList.remove("hidden");
  $("contactPhoneDisplay").textContent = number;
  $("contactConnectStatus").textContent = bioExists
    ? "Pengguna POPER ditemukan"
    : "Nomor belum memiliki Bio POPER";

  const wa = normalizePhoneForWhatsApp(number);

  $("contactWhatsApp").onclick = () => {
    window.open("https://wa.me/" + wa, "_blank", "noopener");
  };

  $("contactCopy").onclick = async () => {
    try {
      await navigator.clipboard.writeText(number);
      setStatus("findStatus", "Nomor berhasil disalin.", "success");
    } catch {
      prompt("Salin nomor ini:", number);
    }
  };

  $("contactSave").onclick = () => downloadVCard({
    name: "POPER Contact " + number,
    phone: number,
    url: ""
  });

  $("contactShare").onclick = async () => {
    const data = { title: "Kontak POPER", text: number };

    if (navigator.share) {
      try {
        await navigator.share(data);
      } catch (e) {
        if (e.name !== "AbortError") console.error(e);
      }
    } else {
      try {
        await navigator.clipboard.writeText(number);
        setStatus("findStatus", "Nomor disalin.", "success");
      } catch {
        prompt("Salin nomor:", number);
      }
    }
  };

  $("contactInvite").onclick = async () => {
    const text = "Yuk bergabung di POPER! https://poper.web.id";

    if (navigator.share) {
      try {
        await navigator.share({ title: "POPER", text });
      } catch (e) {
        if (e.name !== "AbortError") console.error(e);
      }
    } else {
      try {
        await navigator.clipboard.writeText(text);
        setStatus("findStatus", "Link undangan disalin.", "success");
      } catch {
        prompt("Bagikan link POPER:", text);
      }
    }
  };
}

function downloadVCard({ name, phone, url }) {
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    "FN:" + String(name || "POPER Contact").replace(/\n/g, " "),
    phone ? "TEL;TYPE=CELL:" + phone : "",
    url ? "URL:" + url : "",
    "END:VCARD"
  ].filter(Boolean);

  const blob = new Blob([lines.join("\r\n")], {
    type: "text/vcard;charset=utf-8"
  });

  const objectURL = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectURL;
  a.download = "POPER-Contact.vcf";
  a.click();

  setTimeout(() => URL.revokeObjectURL(objectURL), 1500);
}

/* ============================================
   PROFILE EDITOR
============================================ */

function fillProfileEditor(profile = {}) {
  $("editProfileName").value = profile.name || "";
  $("editUsername").value = (profile.username || "").replace(/^@/, "");
  $("editProfileBio").value = profile.bio || profile.description || "";
  $("editProfileWhatsApp").value = profile.phone || currentUser?.phoneNumber || "";

  const links = profile.links || {};

  $("editInstagram").value = links.instagram || "";
  $("editTikTok").value = links.tiktok || "";
  $("editFacebook").value = links.facebook || "";
  $("editYouTube").value = links.youtube || "";
  $("editWebsite").value = links.website || "";
  $("editTelegram").value = links.telegram || "";

  profileEditorPhoto = profile.photoURL || profile.photo || "";
  $("editProfilePhoto").src = profileEditorPhoto || "https://placehold.co/120x120";
}

async function loadMyProfileEditor() {
  if (!currentUser) return;

  try {
    const profile = await POPER.getData(
      `users/${currentUser.uid}/publicBio`
    );

    fillProfileEditor(profile || {});
  } catch (error) {
    console.error(error);
    setStatus("profileEditorStatus", "Gagal memuat profil.", "error");
  }
}

function validEditorLink(value) {
  if (!value.trim()) return "";

  const url = safeURL(value);

  if (!url) {
    throw new Error("Link tidak valid. Gunakan alamat http/https.");
  }

  return url;
}

function normalizeUsername(value) {
  return value.toLowerCase()
    .trim()
    .replace(/^@/, "")
    .replace(/[^a-z0-9._]/g, "");
}

async function saveMyProfileEditor() {
  if (!currentUser) {
    setStatus("profileEditorStatus", "Login terlebih dahulu.", "error");
    return;
  }

  const name = cleanText($("editProfileName").value);
  const username = normalizeUsername($("editUsername").value);

  if (!name) {
    setStatus("profileEditorStatus", "Nama wajib diisi.", "error");
    return;
  }

  if (username.length < 3) {
    setStatus("profileEditorStatus", "Username minimal 3 karakter.", "error");
    return;
  }

  try {
    const links = {
      instagram: validEditorLink($("editInstagram").value),
      tiktok: validEditorLink($("editTikTok").value),
      facebook: validEditorLink($("editFacebook").value),
      youtube: validEditorLink($("editYouTube").value),
      website: validEditorLink($("editWebsite").value),
      telegram: validEditorLink($("editTelegram").value)
    };

    const previous = currentProfile || {};

    const profile = {
      ...previous,
      uid: currentUser.uid,
      name,
      username,
      bio: cleanText($("editProfileBio").value),
      description: cleanText($("editProfileBio").value),
      phone: cleanText($("editProfileWhatsApp").value) || currentUser.phoneNumber || "",
      photoURL: profileEditorPhoto,
      links,
      updatedAt: Date.now()
    };

    setStatus("profileEditorStatus", "Menyimpan profil...");

    await POPER.saveData(
      `users/${currentUser.uid}/publicBio`,
      profile
    );

    currentProfile = profile;

    if (profile.phone) {
      await POPER.saveData(
        `phoneLookup/${phoneKey(profile.phone)}`,
        { uid: currentUser.uid, phone: profile.phone }
      );
    }

    renderIdentity(currentUser);
    setStatus("profileEditorStatus", "Profil berhasil disimpan!", "success");

  } catch (error) {
    console.error(error);
    setStatus("profileEditorStatus", error.message || "Gagal menyimpan.", "error");
  }
}

$("saveProfileEditor")?.addEventListener("click", saveMyProfileEditor);

$("profilePhotoUpload")?.addEventListener("change", event => {
  const file = event.target.files?.[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    setStatus("profileEditorStatus", "File bukan gambar.", "error");
    return;
  }

  if (file.size > 2 * 1024 * 1024) {
    setStatus("profileEditorStatus", "Ukuran foto maksimal 2 MB.", "error");
    return;
  }

  const reader = new FileReader();

  reader.onload = () => {
    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement("canvas");
      const max = 600;
      const scale = Math.min(1, max / Math.max(img.width, img.height));

      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);

      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);

      profileEditorPhoto = canvas.toDataURL("image/jpeg", .75);
      $("editProfilePhoto").src = profileEditorPhoto;
      setStatus("profileEditorStatus", "Foto siap disimpan.");
    };

    img.src = reader.result;
  };

  reader.readAsDataURL(file);
});

$("previewProfileEditor")?.addEventListener("click", () => {
  if (!currentUser) return;
  openPublicProfile(currentUser.uid);
});

/* ============================================
   PUBLIC PROFILE
============================================ */

async function loadPublicProfile(uid) {
  if (!uid) return;

  $("publicProfileLoading").classList.remove("hidden");
  $("publicProfileContent").classList.add("hidden");
  $("publicProfileNotFound").classList.add("hidden");

  try {
    const profile = await POPER.getData(
      `users/${uid}/publicBio`
    );

    if (!profile) {
      $("publicProfileLoading").classList.add("hidden");
      $("publicProfileNotFound").classList.remove("hidden");
      return;
    }

    const name = profile.name || "POPER User";
    const username = profile.username || "";
    const bio = profile.bio || profile.description || "";
    const photo = profile.photoURL || profile.photo || "";
    const phone = profile.phone || "";

    $("publicName").textContent = name;
    $("publicUsername").textContent = username ? "@" + username.replace(/^@/, "") : "";
    $("publicBioText").textContent = bio;
    $("publicAvatar").src = photo || "https://placehold.co/120x120";

    renderPublicLinks(profile);

    $("publicSaveContact").onclick = () => downloadVCard({
      name,
      phone,
      url: publicProfileURL(uid)
    });

    $("publicShareProfile").onclick = async () => {
      const url = publicProfileURL(uid);

      if (navigator.share) {
        try {
          await navigator.share({
            title: name + " — POPER",
            text: "Lihat profil saya",
            url
          });
        } catch (e) {
          if (e.name !== "AbortError") console.error(e);
        }
      } else {
        try {
          await navigator.clipboard.writeText(url);
          alert("Link profil disalin.");
        } catch {
          prompt("Link profil:", url);
        }
      }
    };

    $("publicProfileLoading").classList.add("hidden");
    $("publicProfileContent").classList.remove("hidden");

  } catch (error) {
    console.error("Public profile:", error);
    $("publicProfileLoading").classList.add("hidden");
    $("publicProfileNotFound").classList.remove("hidden");
  }
}

function renderPublicLinks(profile) {
  const container = $("publicLinks");
  container.innerHTML = "";

  const links = profile.links || {};
  const entries = [
    ["Bio Link", profile.url],
    ["Instagram", links.instagram],
    ["TikTok", links.tiktok],
    ["Facebook", links.facebook],
    ["YouTube", links.youtube],
    ["Website", links.website],
    ["Telegram", links.telegram]
  ];

  entries.forEach(([label, value]) => {
    const url = safeURL(value);
    if (!url) return;

    const a = document.createElement("a");
    a.className = "profile-link";
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = "↗ " + label;
    container.appendChild(a);
  });

  if (profile.phone) {
    const wa = document.createElement("a");
    wa.className = "profile-link";
    wa.href = "https://wa.me/" + normalizePhoneForWhatsApp(profile.phone);
    wa.target = "_blank";
    wa.rel = "noopener noreferrer";
    wa.textContent = "💬 WhatsApp";
    container.appendChild(wa);
  }
}

function publicProfileURL(uid) {
  return location.origin + location.pathname + "?uid=" + encodeURIComponent(uid);
}

$("publicBackHome")?.addEventListener("click", () => showSection("home"));
$("publicNotFoundHome")?.addEventListener("click", () => showSection("home"));

/* ============================================
   SMART IDENTITY QR
============================================ */

function renderIdentity(user) {
  if (!user) return;

  const link = publicProfileURL(user.uid);

  $("identityName").textContent = currentProfile.name || user.displayName || "POPER User";
  $("identityPhone").textContent = currentProfile.phone || user.phoneNumber || "Nomor tidak tersedia";
  $("identityLink").textContent = link;

  const avatar = $("identityAvatar");

  if (currentProfile.photoURL || currentProfile.photo) {
    avatar.innerHTML = "";
    const img = document.createElement("img");
    img.src = currentProfile.photoURL || currentProfile.photo;
    avatar.appendChild(img);
  } else {
    avatar.textContent = "👤";
  }

  const qr = $("identityQR");
  qr.innerHTML = "";

  if (window.QRCode) {
    new QRCode(qr, {
      text: link,
      width: 210,
      height: 210,
      colorDark: "#172b4d",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.H
    });
  }

  $("copyIdentityLink").onclick = async () => {
    try {
      await navigator.clipboard.writeText(link);
      alert("Link identitas disalin.");
    } catch {
      prompt("Salin link:", link);
    }
  };

  $("shareIdentity").onclick = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "POPER Identity",
          text: "Hubungkan denganku di POPER",
          url: link
        });
      } catch (e) {
        if (e.name !== "AbortError") console.error(e);
      }
    } else {
      try {
        await navigator.clipboard.writeText(link);
        alert("Link disalin.");
      } catch {
        prompt("Link identitas:", link);
      }
    }
  };

  $("downloadIdentityQR").onclick = () => {
    const canvas = qr.querySelector("canvas");
    const img = qr.querySelector("img");
    const src = canvas ? canvas.toDataURL("image/png") : img?.src;

    if (!src) return alert("QR belum siap.");

    const a = document.createElement("a");
    a.href = src;
    a.download = "POPER-Identity-QR.png";
    a.click();
  };
}

/* ============================================
   QR VAULT — CAMERA
============================================ */

async function startQRScanner() {
  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus("qrStatus", "Kamera tidak didukung.", "error");
    return;
  }

  try {
    stopQRScanner();

    qrStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false
    });

    $("qrVideo").srcObject = qrStream;
    $("qrVideo").classList.remove("hidden");
    $("qrPlaceholder").classList.add("hidden");

    scanQRLoop();

  } catch (error) {
    console.error(error);
    setStatus("qrStatus", "Gagal membuka kamera QR.", "error");
  }
}

function stopQRScanner() {
  if (qrStream) {
    qrStream.getTracks().forEach(track => track.stop());
    qrStream = null;
  }

  if ($("qrVideo")) {
    $("qrVideo").srcObject = null;
    $("qrVideo").classList.add("hidden");
  }

  if (qrFrame) {
    cancelAnimationFrame(qrFrame);
    qrFrame = null;
  }

  $("qrPlaceholder")?.classList.remove("hidden");
}

$("startQRScanner")?.addEventListener("click", startQRScanner);
$("stopQRScanner")?.addEventListener("click", stopQRScanner);

function scanQRLoop() {
  if (!qrStream || qrBusy) return;

  const video = $("qrVideo");

  if (video.readyState >= 2 && video.videoWidth > 0) {
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    const result = window.jsQR?.(
      imageData.data,
      imageData.width,
      imageData.height,
      { inversionAttempts: "attemptBoth" }
    );

    if (result?.data) {
      $("qrUrl").value = result.data;
      setStatus("qrStatus", "QR berhasil dipindai. Isi nama lalu simpan.", "success");
      stopQRScanner();
    }
  }

  if (qrStream) {
    qrFrame = requestAnimationFrame(scanQRLoop);
  }
}

/* ============================================
   QR IMAGE UPLOAD
============================================ */

$("qrImageInput")?.addEventListener("change", event => {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = () => {
    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;

      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);

      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);

      const result = window.jsQR?.(
        data.data,
        data.width,
        data.height,
        { inversionAttempts: "attemptBoth" }
      );

      if (result?.data) {
        $("qrUrl").value = result.data;
        setStatus("qrStatus", "QR berhasil dibaca dari gambar.", "success");
      } else {
        setStatus("qrStatus", "QR tidak terdeteksi. Coba gambar yang lebih jelas.", "error");
      }
    };

    img.src = reader.result;
  };

  reader.readAsDataURL(file);
});

/* ============================================
   QR VAULT — SAVE / LOAD / DELETE
============================================ */

$("saveQR")?.addEventListener("click", async () => {
  if (!currentUser) return;

  const name = cleanText($("qrName").value) || "QR Tanpa Nama";
  const url = cleanText($("qrUrl").value);

  if (!url) {
    setStatus("qrStatus", "Link QR masih kosong.", "error");
    return;
  }

  try {
    setStatus("qrStatus", "Menyimpan QR...");

    await POPER.pushData(`qrVault/${currentUser.uid}`, {
      name,
      url,
      createdAt: Date.now()
    });

    $("qrName").value = "";
    $("qrUrl").value = "";

    setStatus("qrStatus", "QR berhasil disimpan!", "success");
    loadQRVault();

  } catch (error) {
    console.error(error);
    setStatus("qrStatus", error.message || "Gagal menyimpan QR.", "error");
  }
});

async function loadQRVault() {
  if (!currentUser) return;

  try {
    qrRecords = await POPER.getData(`qrVault/${currentUser.uid}`) || {};
    renderQRVault();
  } catch (error) {
    console.error("Load QR vault:", error);
  }
}

function renderQRVault() {
  const container = $("qrVaultList");
  if (!container) return;

  container.innerHTML = "";

  const entries = Object.entries(qrRecords || {}).reverse();

  if (!entries.length) {
    container.innerHTML = '<p class="muted">Belum ada QR tersimpan.</p>';
    return;
  }

  entries.forEach(([key, item]) => {
    const card = document.createElement("div");
    card.className = "qr-item";

    const title = document.createElement("strong");
    title.textContent = item.name || "QR";

    const link = document.createElement("p");
    link.className = "muted";
    link.textContent = item.url || "";

    const actions = document.createElement("div");
    actions.className = "qr-item-actions";

    const open = document.createElement("button");
    open.className = "small-btn";
    open.textContent = "Buka";
    open.onclick = () => {
      const safe = safeURL(item.url);
      if (safe) window.open(safe, "_blank", "noopener");
      else prompt("Isi QR:", item.url);
    };

    const copy = document.createElement("button");
    copy.className = "small-btn";
    copy.textContent = "Salin";
    copy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(item.url);
        alert("Link disalin.");
      } catch {
        prompt("Salin link:", item.url);
      }
    };

    const del = document.createElement("button");
    del.className = "small-btn";
    del.textContent = "Hapus";
    del.onclick = async () => {
      if (!confirm("Hapus QR ini?")) return;

      await POPER.deleteData(`qrVault/${currentUser.uid}/${key}`);
      loadQRVault();
    };

    actions.append(open, copy, del);
    card.append(title, link, actions);
    container.appendChild(card);
  });
}

/* ============================================
   NOTES — SAVE / LOAD / DELETE
============================================ */

$("saveNote")?.addEventListener("click", async () => {
  if (!currentUser) return;

  const title = cleanText($("noteTitle").value);
  const text = cleanText($("noteText").value);
  const id = $("noteId").value;

  if (!title && !text) {
    setStatus("noteStatus", "Catatan masih kosong.", "error");
    return;
  }

  try {
    setStatus("noteStatus", "Menyimpan...");

    const data = {
      title,
      text,
      updatedAt: Date.now()
    };

    if (id) {
      await POPER.saveData(`notes/${currentUser.uid}/${id}`, data);
    } else {
      await POPER.pushData(`notes/${currentUser.uid}`, {
        ...data,
        createdAt: Date.now()
      });
    }

    clearNoteForm();
    setStatus("noteStatus", "Catatan tersimpan.", "success");
    loadNotes();

  } catch (error) {
    console.error(error);
    setStatus("noteStatus", error.message || "Gagal menyimpan catatan.", "error");
  }
});

function clearNoteForm() {
  $("noteId").value = "";
  $("noteTitle").value = "";
  $("noteText").value = "";
}

$("clearNote")?.addEventListener("click", clearNoteForm);

async function loadNotes() {
  if (!currentUser) return;

  try {
    noteRecords = await POPER.getData(`notes/${currentUser.uid}`) || {};
    renderNotes();
  } catch (error) {
    console.error(error);
  }
}

function renderNotes() {
  const container = $("notesList");
  container.innerHTML = "";

  const entries = Object.entries(noteRecords || {}).reverse();

  if (!entries.length) {
    container.innerHTML = '<p class="muted">Belum ada catatan.</p>';
    return;
  }

  entries.forEach(([id, note]) => {
    const card = document.createElement("div");
    card.className = "note-item";

    const h = document.createElement("h4");
    h.textContent = note.title || "Catatan";

    const p = document.createElement("p");
    p.textContent = note.text || "";

    const actions = document.createElement("div");
    actions.className = "note-actions";

    const edit = document.createElement("button");
    edit.className = "small-btn";
    edit.textContent = "Edit";
    edit.onclick = () => {
      $("noteId").value = id;
      $("noteTitle").value = note.title || "";
      $("noteText").value = note.text || "";
      showSection("notes");
      window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const del = document.createElement("button");
    del.className = "small-btn";
    del.textContent = "Hapus";
    del.onclick = async () => {
      if (!confirm("Hapus catatan ini?")) return;
      await POPER.deleteData(`notes/${currentUser.uid}/${id}`);
      loadNotes();
    };

    actions.append(edit, del);
    card.append(h, p, actions);
    container.appendChild(card);
  });
}

/* ============================================
   PUBLIC PROFILE LINK HANDLER
============================================ */

function checkPublicProfileURL() {
  const params = new URLSearchParams(location.search);
  const uid = params.get("uid");

  if (!uid) return false;

  publicProfileUID = uid;

  $("loginPanel")?.classList.add("hidden");
  $("dashboard")?.classList.remove("hidden");
  $("bottomNav")?.classList.add("hidden");

  showSection("publicProfile");
  loadPublicProfile(uid);

  return true;
}

/* ============================================
   INIT
============================================ */

function initPOPER() {
  checkPublicProfileURL();

  // Reset OCR camera resources if app leaves scanner
  window.addEventListener("pagehide", () => {
    stopPhoneCamera();
    stopQRScanner();
  });
}

initPOPER();
