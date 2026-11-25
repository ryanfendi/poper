const $ = id => document.getElementById(id);

let currentUser = null;
let currentBioId = null;
let bioLinksDraft = [];
let cameraStream = null;
let editingBioId = null;

const userPath = () => `users/${currentUser.uid}`;
const bioPath = () => `${userPath()}/bios`;
const vaultPath = () => `${userPath()}/vault`;
const notesPath = () => `${userPath()}/notes`;

function showMessage(id, message, error = false) {
  const el = $(id);
  if (!el) return;
  el.textContent = message;
  el.style.color = error ? "#ef5261" : "var(--accent)";
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

// AUTH
$("sendOtpBtn").onclick = async () => {
  const phone = $("phoneInput").value.trim();

  if (!phone) {
    showMessage("authMessage", "Masukkan nomor HP terlebih dahulu.", true);
    return;
  }

  $("sendOtpBtn").disabled = true;
  showMessage("authMessage", "Mengirim OTP...");

  try {
    await POPER.sendOTP(phone);
    $("loginForm").classList.add("hidden");
    $("otpForm").classList.remove("hidden");
    showMessage("authMessage", "OTP berhasil dikirim.");
  } catch (error) {
    showMessage("authMessage", error.message, true);
  } finally {
    $("sendOtpBtn").disabled = false;
  }
};

$("verifyOtpBtn").onclick = async () => {
  try {
    $("verifyOtpBtn").disabled = true;
    await POPER.verifyOTP($("otpInput").value);
    showMessage("authMessage", "Verifikasi berhasil.");
  } catch (error) {
    showMessage("authMessage", error.message, true);
  } finally {
    $("verifyOtpBtn").disabled = false;
  }
};

$("backLoginBtn").onclick = () => {
  $("otpForm").classList.add("hidden");
  $("loginForm").classList.remove("hidden");
  POPER.resetRecaptcha();
};

POPER.onAuth(user => {
  currentUser = user;

  if (user) {
    $("authScreen").classList.add("hidden");
    $("mainScreen").classList.remove("hidden");
    $("profilePhone").textContent = user.phoneNumber || "";
    loadAll();
  } else {
    $("authScreen").classList.remove("hidden");
    $("mainScreen").classList.add("hidden");
  }
});

$("logoutBtn").onclick = async () => {
  await POPER.logout();
};

// NAVIGATION
function openPage(pageId) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  $(pageId)?.classList.add("active");

  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
  document.querySelector(`[data-page="${pageId}"]`)?.classList.add("active");

  if (pageId === "bioPage") loadBios();
  if (pageId === "vaultPage") loadVault();
  if (pageId === "notesPage") loadNotes();
}

document.querySelectorAll(".nav-item").forEach(btn => {
  btn.onclick = () => openPage(btn.dataset.page);
});

$("profileButton").onclick = () => openPage("profilePage");

// THEME
$("themeToggle").onclick = () => {
  document.body.classList.toggle("dark");
  localStorage.setItem("poperTheme",
    document.body.classList.contains("dark") ? "dark" : "light");
};

if (localStorage.getItem("poperTheme") === "dark") {
  document.body.classList.add("dark");
}

// PHONE SEARCH
$("findBioBtn").onclick = searchBio;
$("searchPhone").onkeydown = e => {
  if (e.key === "Enter") searchBio();
};

async function searchBio() {
  const phone = POPER.normalizePhone($("searchPhone").value);

  $("searchResult").innerHTML = "";
  showMessage("scanStatus", "Mencari Bio...");

  try {
    const users = await POPER.getData("publicPhoneIndex");
    const targetUid = users?.[phone.replace("+", "")];

    if (!targetUid) {
      showMessage("scanStatus", "Bio belum ditemukan.");
      return;
    }

    const bios = await POPER.getData(`users/${targetUid}/bios`);

    if (!bios) {
      showMessage("scanStatus", "Pengguna belum membuat Bio.");
      return;
    }

    const entries = Object.entries(bios).filter(([, bio]) => bio.published !== false);

    if (!entries.length) {
      showMessage("scanStatus", "Tidak ada Bio yang dipublikasikan.");
      return;
    }

    $("searchResult").innerHTML = entries.map(([id, bio]) => `
      <div class="result-card">
        <h3>${escapeHTML(bio.title || "Bio")}</h3>
        <p>${escapeHTML(bio.description || "")}</p>
        <button class="primary-btn" data-open-bio="${escapeHTML(id)}" data-owner="${escapeHTML(targetUid)}">Lihat Bio ↗</button>
      </div>
    `).join("");

    $("searchResult").querySelectorAll("[data-open-bio]").forEach(btn => {
      btn.onclick = () => showPublicBio(targetUid, btn.dataset.openBio);
    });

    showMessage("scanStatus", "Bio ditemukan.");
  } catch (error) {
    showMessage("scanStatus", error.message, true);
  }
}

// SCANNER CAMERA
$("cameraScanBtn").onclick = startCamera;
$("closeScannerBtn").onclick = stopCamera;
$("captureBtn").onclick = captureAndOCR;

async function startCamera() {
  try {
    $("scannerArea").classList.remove("hidden");
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false
    });
    $("scannerVideo").srcObject = cameraStream;
  } catch (error) {
    showMessage("scanStatus", "Kamera tidak dapat diakses.", true);
  }
}

function stopCamera() {
  cameraStream?.getTracks().forEach(track => track.stop());
  cameraStream = null;
  $("scannerVideo").srcObject = null;
  $("scannerArea").classList.add("hidden");
}

async function captureAndOCR() {
  const video = $("scannerVideo");

  if (!video.videoWidth) {
    showMessage("scanStatus", "Kamera belum siap.", true);
    return;
  }

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0);

  await processOCR(canvas);
}

$("uploadScanBtn").onclick = () => $("imageScanInput").click();

$("imageScanInput").onchange = async e => {
  const file = e.target.files[0];
  if (!file) return;

  const img = new Image();
  img.onload = async () => {
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    canvas.getContext("2d").drawImage(img, 0, 0);
    await processOCR(canvas);
    URL.revokeObjectURL(img.src);
  };
  img.src = URL.createObjectURL(file);
};

async function processOCR(canvas) {
  showMessage("scanStatus", "Membaca gambar...");

  try {
    const result = await Tesseract.recognize(canvas, "eng");
    const text = result.data.text;
    const matches = text.match(/(?:\+?62|0)\s*[\d\s\-()]{7,}/g) || [];

    if (!matches.length) {
      showMessage("scanStatus", "Nomor HP tidak terdeteksi. Coba gambar lebih jelas.", true);
      return;
    }

    const phone = matches[0].replace(/[^\d+]/g, "");
    $("searchPhone").value = phone;
    $("scanStatus").textContent = "Nomor terdeteksi: " + phone;
    stopCamera();
    await searchBio();
  } catch (error) {
    showMessage("scanStatus", "OCR gagal membaca gambar.", true);
  }
}

// BIO
$("createBioBtn").onclick = () => openBioEditor();
$("cancelBioBtn").onclick = closeBioEditor;
$("addBioLinkBtn").onclick = () => addBioLinkRow();
$("saveBioBtn").onclick = saveBio;

function openBioEditor(bio = null, id = null) {
  editingBioId = id;
  bioLinksDraft = bio?.links ? Object.values(bio.links) : [];
  $("bioEditorTitle").textContent = bio ? "Edit Bio" : "Buat Bio Baru";
  $("bioTitle").value = bio?.title || "";
  $("bioDescription").value = bio?.description || "";
  $("bioBackground").value = bio?.background || "#17152a";
  $("bioButtonColor").value = bio?.buttonColor || "#7457ff";
  $("bioAvatar").value = bio?.avatar || "";
  renderBioLinkRows();
  $("bioEditor").classList.remove("hidden");
  $("bioEditor").scrollIntoView({ behavior: "smooth" });
}

function closeBioEditor() {
  $("bioEditor").classList.add("hidden");
  editingBioId = null;
  bioLinksDraft = [];
}

function addBioLinkRow() {
  bioLinksDraft.push({ title: "", url: "" });
  renderBioLinkRows();
}

function renderBioLinkRows() {
  $("bioLinksEditor").innerHTML = bioLinksDraft.map((link, i) => `
    <div class="link-editor-row">
      <input data-link-title="${i}" placeholder="Nama tombol" value="${escapeHTML(link.title || "")}">
      <input data-link-url="${i}" placeholder="https://..." value="${escapeHTML(link.url || "")}">
      <button data-remove-link="${i}">×</button>
    </div>
  `).join("");

  $("bioLinksEditor").querySelectorAll("[data-link-title]").forEach(input => {
    input.oninput = () => bioLinksDraft[input.dataset.linkTitle].title = input.value;
  });

  $("bioLinksEditor").querySelectorAll("[data-link-url]").forEach(input => {
    input.oninput = () => bioLinksDraft[input.dataset.linkUrl].url = input.value;
  });

  $("bioLinksEditor").querySelectorAll("[data-remove-link]").forEach(button => {
    button.onclick = () => {
      bioLinksDraft.splice(button.dataset.removeLink, 1);
      renderBioLinkRows();
    };
  });
}

async function saveBio() {
  if (!currentUser) return;

  const title = $("bioTitle").value.trim();

  if (!title) {
    alert("Nama Bio wajib diisi.");
    return;
  }

  const links = bioLinksDraft.filter(link => link.title.trim() && link.url.trim());

  const data = {
    title,
    description: $("bioDescription").value.trim(),
    background: $("bioBackground").value,
    buttonColor: $("bioButtonColor").value,
    avatar: $("bioAvatar").value.trim(),
    links,
    published: true,
    updatedAt: Date.now()
  };

  try {
    if (editingBioId) {
      await POPER.updateData(`${bioPath()}/${editingBioId}`, data);
    } else {
      data.createdAt = Date.now();
      await POPER.pushData(bioPath(), data);
    }

    closeBioEditor();
    await loadBios();
  } catch (error) {
    alert("Gagal menyimpan Bio: " + error.message);
  }
}

async function loadBios() {
  const bios = await POPER.getData(bioPath());

  if (!bios) {
    $("bioList").innerHTML = `<div class="empty-state">Belum ada Bio. Buat Bio pertama kamu.</div>`;
    return;
  }

  $("bioList").innerHTML = Object.entries(bios).map(([id, bio]) => `
    <div class="bio-card">
      <h3>${escapeHTML(bio.title)}</h3>
      <p>${escapeHTML(bio.description || "")}</p>
      <div class="card-actions">
        <button data-preview="${escapeHTML(id)}">Preview</button>
        <button data-edit="${escapeHTML(id)}">Edit</button>
        <button data-delete="${escapeHTML(id)}">Hapus</button>
        <button data-copy="${escapeHTML(id)}">Salin Link</button>
      </div>
    </div>
  `).join("");

  $("bioList").querySelectorAll("[data-preview]").forEach(btn => {
    btn.onclick = () => showPublicBio(currentUser.uid, btn.dataset.preview);
  });

  $("bioList").querySelectorAll("[data-edit]").forEach(btn => {
    btn.onclick = () => openBioEditor(bios[btn.dataset.edit], btn.dataset.edit);
  });

  $("bioList").querySelectorAll("[data-delete]").forEach(btn => {
    btn.onclick = async () => {
      if (confirm("Hapus Bio ini?")) {
        await POPER.deleteData(`${bioPath()}/${btn.dataset.delete}`);
        loadBios();
      }
    };
  });

  $("bioList").querySelectorAll("[data-copy]").forEach(btn => {
    btn.onclick = async () => {
      const url = location.origin + location.pathname + "?bio=" + currentUser.uid + "_" + btn.dataset.copy;
      await navigator.clipboard.writeText(url);
      alert("Link Bio disalin!");
    };
  });
}

// PUBLIC BIO
async function showPublicBio(uid, bioId) {
  const bio = await POPER.getData(`users/${uid}/bios/${bioId}`);

  if (!bio) {
    alert("Bio tidak ditemukan.");
    return;
  }

  $("mainScreen").classList.add("hidden");
  $("publicBioScreen").classList.remove("hidden");

  const links = Object.values(bio.links || {});

  $("publicBioContent").innerHTML = `
    <div class="public-bio" style="background:${escapeHTML(bio.background || "#17152a")};color:white">
      ${bio.avatar ? `<img src="${escapeHTML(bio.avatar)}" alt="Avatar">` : ""}
      <h1>${escapeHTML(bio.title || "")}</h1>
      <p>${escapeHTML(bio.description || "")}</p>
      ${links.map(link => `
        <a class="public-link" style="background:${escapeHTML(bio.buttonColor || "#7457ff")}"
           href="${escapeHTML(link.url)}" target="_blank" rel="noopener">
          ${escapeHTML(link.title)}
        </a>
      `).join("")}
      <div style="margin-top:30px;opacity:.6">Made with POPER</div>
    </div>
  `;
}

$("closePublicBioBtn").onclick = () => {
  $("publicBioScreen").classList.add("hidden");
  $("mainScreen").classList.remove("hidden");
};

// VAULT
$("saveVaultBtn").onclick = saveVault;

async function saveVault() {
  const title = $("vaultTitle").value.trim();
  const url = $("vaultUrl").value.trim();

  if (!title || !url) {
    alert("Isi nama dan link terlebih dahulu.");
    return;
  }

  try {
    await POPER.pushData(vaultPath(), {
      title,
      url,
      createdAt: Date.now()
    });

    $("vaultTitle").value = "";
    $("vaultUrl").value = "";
    loadVault();
  } catch (error) {
    alert("Gagal menyimpan Vault: " + error.message);
  }
}

async function loadVault() {
  const data = await POPER.getData(vaultPath());

  if (!data) {
    $("vaultList").innerHTML = `<div class="empty-state">Vault masih kosong.</div>`;
    return;
  }

  $("vaultList").innerHTML = Object.entries(data).map(([id, item]) => `
    <div class="vault-card">
      <h3>${escapeHTML(item.title)}</h3>
      <p>${escapeHTML(item.url)}</p>
      <div class="card-actions">
        <button data-vault-open="${escapeHTML(id)}">Buka</button>
        <button data-vault-delete="${escapeHTML(id)}">Hapus</button>
      </div>
    </div>
  `).join("");

  $("vaultList").querySelectorAll("[data-vault-open]").forEach(btn => {
    btn.onclick = () => {
      const item = data[btn.dataset.vaultOpen];
      window.open(item.url, "_blank", "noopener");
    };
  });

  $("vaultList").querySelectorAll("[data-vault-delete]").forEach(btn => {
    btn.onclick = async () => {
      await POPER.deleteData(`${vaultPath()}/${btn.dataset.vaultDelete}`);
      loadVault();
    };
  });
}

// NOTES
$("saveNoteBtn").onclick = saveNote;

async function saveNote() {
  const title = $("noteTitle").value.trim();
  const content = $("noteContent").value.trim();

  if (!title || !content) {
    alert("Isi judul dan catatan.");
    return;
  }

  await POPER.pushData(notesPath(), {
    title,
    content,
    createdAt: Date.now()
  });

  $("noteTitle").value = "";
  $("noteContent").value = "";
  loadNotes();
}

async function loadNotes() {
  const notes = await POPER.getData(notesPath());

  if (!notes) {
    $("notesList").innerHTML = `<div class="empty-state">Belum ada catatan.</div>`;
    return;
  }

  $("notesList").innerHTML = Object.entries(notes).map(([id, note]) => `
    <div class="note-card">
      <h3>${escapeHTML(note.title)}</h3>
      <p>${escapeHTML(note.content).replace(/\n/g, "<br>")}</p>
      <div class="card-actions">
        <button data-note-delete="${escapeHTML(id)}">Hapus</button>
      </div>
    </div>
  `).join("");

  $("notesList").querySelectorAll("[data-note-delete]").forEach(btn => {
    btn.onclick = async () => {
      await POPER.deleteData(`${notesPath()}/${btn.dataset.noteDelete}`);
      loadNotes();
    };
  });
}

// LOAD
async function loadAll() {
  if (!currentUser) return;

  loadBios();
  loadVault();
  loadNotes();

  // Buat index pencarian nomor HP.
  // Index public harus diizinkan melalui Firebase Rules.
  try {
    const phone = currentUser.phoneNumber;
    if (phone) {
      const key = phone.replace("+", "");
      await POPER.updateData("publicPhoneIndex", {
        [key]: currentUser.uid
      });
    }
  } catch (error) {
    console.warn("Phone index:", error.message);
  }
}

// URL PUBLIC BIO
const query = new URLSearchParams(location.search);
const bioParam = query.get("bio");

if (bioParam && bioParam.includes("_")) {
  const [uid, id] = bioParam.split("_");

  POPER.onAuth(user => {
    if (!user) {
      // Bio publik dapat dibuka tanpa login
      openDirectBio(uid, id);
    }
  });
}

async function openDirectBio(uid, id) {
  try {
    const bio = await POPER.getData(`users/${uid}/bios/${id}`);
    if (!bio) return;

    $("authScreen").classList.add("hidden");
    $("mainScreen").classList.add("hidden");
    $("publicBioScreen").classList.remove("hidden");

    const links = Object.values(bio.links || {});

    $("publicBioContent").innerHTML = `
      <div class="public-bio" style="background:${escapeHTML(bio.background || "#17152a")};color:white">
        ${bio.avatar ? `<img src="${escapeHTML(bio.avatar)}" alt="Avatar">` : ""}
        <h1>${escapeHTML(bio.title || "")}</h1>
        <p>${escapeHTML(bio.description || "")}</p>
        ${links.map(link => `
          <a class="public-link" style="background:${escapeHTML(bio.buttonColor || "#7457ff")}"
          href="${escapeHTML(link.url)}" target="_blank" rel="noopener">${escapeHTML(link.title)}</a>
        `).join("")}
        <div style="margin-top:30px;opacity:.6">Made with POPER</div>
      </div>
    `;
  } catch (error) {
    console.error(error);
  }
}
