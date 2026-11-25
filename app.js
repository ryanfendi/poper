const $ = id => document.getElementById(id);

const state = {
  user: null,
  confirmation: null,
  cameraStream: null,
  detectedPhone: "",
  editingBioId: null,
  editingNoteId: null,
  currentBio: null
};

const DB = () => state.user ? `users/${state.user.uid}` : null;

function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2600);
}

function setMessage(message, error = false) {
  $("authMessage").textContent = message;
  $("authMessage").style.color = error ? "#ff647c" : "";
}

function safePhone(phone) {
  return String(phone || "").replace(/[^\d+]/g, "");
}

function escapeHTML(str = "") {
  return String(str).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function showAuth() {
  $("authPage").classList.remove("hidden");
  $("mainApp").classList.add("hidden");
  $("publicBioPage").classList.add("hidden");
}

function showApp() {
  $("authPage").classList.add("hidden");
  $("mainApp").classList.remove("hidden");
  $("profilePhone").textContent = state.user.phoneNumber || "POPER Member";
  navigate("scanPage");
  loadAll();
}

function navigate(pageId) {
  document.querySelectorAll(".page").forEach(page => page.classList.remove("active"));
  $(pageId)?.classList.add("active");

  document.querySelectorAll(".nav-item").forEach(item => {
    item.classList.toggle("active", item.dataset.page === pageId);
  }

  stopCamera();
}

function setTheme(theme) {
  document.body.classList.toggle("light", theme === "light");
  localStorage.setItem("poper-theme", theme);
  $("themeToggle").innerHTML = theme === "light"
    ? '<span class="material-symbols-rounded">light_mode</span>'
    : '<span class="material-symbols-rounded">dark_mode</span>';
}

function toggleTheme() {
  setTheme(document.body.classList.contains("light") ? "dark" : "light");
}

async function loadAll() {
  await Promise.all([
    loadBios(),
    loadVault(),
    loadNotes()
  ]);
}

/* AUTH */

$("sendOtpBtn").onclick = async () => {
  const phone = $("phoneInput").value.trim();

  if (!phone || phone.replace(/\D/g, "").length < 8) {
    setMessage("Masukkan nomor HP yang valid.", true);
    return;
  }

  $("sendOtpBtn").disabled = true;
  setMessage("Mengirim OTP...");

  try {
    state.confirmation = await POPER.sendOTP(phone);
    $("phoneStep").classList.add("hidden");
    $("otpStep").classList.remove("hidden");
    setMessage("Kode OTP sudah dikirim.");
  } catch (error) {
    console.error(error);
    setMessage(error.message || "Gagal mengirim OTP.", true);
    POPER.resetRecaptcha();
  } finally {
    $("sendOtpBtn").disabled = false;
  }
};

$("verifyOtpBtn").onclick = async () => {
  const code = $("otpInput").value.trim();

  if (code.length < 6) {
    setMessage("Masukkan 6 digit OTP.", true);
    return;
  }

  try {
    $("verifyOtpBtn").disabled = true;
    setMessage("Memverifikasi...");

    await state.confirmation.confirm(code);
    state.confirmation = null;
  } catch (error) {
    console.error(error);
    setMessage("OTP salah atau sudah kedaluwarsa.", true);
  } finally {
    $("verifyOtpBtn").disabled = false;
  }
};

$("backPhoneBtn").onclick = () => {
  $("otpStep").classList.add("hidden");
  $("phoneStep").classList.remove("hidden");
  $("otpInput").value = "";
  POPER.resetRecaptcha();
  setMessage("");
};

$("logoutBtn").onclick = async () => {
  try {
    stopCamera();
    await POPER.logout();
  } catch (error) {
    toast(error.message);
  }
};

POPER.onAuth(user => {
  state.user = user;
  if (user) showApp();
  else showAuth();
});

/* NAV */

document.querySelectorAll(".nav-item").forEach(btn => {
  btn.onclick = () => navigate(btn.dataset.page);
});

$("profileButton").onclick = () => navigate("profilePage");
$("themeToggle").onclick = toggleTheme;
$("profileThemeBtn").onclick = toggleTheme;

setTheme(localStorage.getItem("poper-theme") || "dark");

/* SCANNER CAMERA */

$("startCameraBtn").onclick = async () => {
  try {
    state.cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false
    });

    $("cameraVideo").srcObject = state.cameraStream;
    $("cameraBox").classList.remove("hidden");
    $("cameraBox").scrollIntoView({ behavior: "smooth" });
  } catch (error) {
    toast("Kamera gagal dibuka. Periksa izin kamera.");
  }
};

function stopCamera() {
  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach(track => track.stop());
    state.cameraStream = null;
  }
  if ($("cameraVideo")) $("cameraVideo").srcObject = null;
}

$("closeCameraBtn").onclick = () => {
  stopCamera();
  $("cameraBox").classList.add("hidden");
};

$("captureBtn").onclick = async () => {
  const video = $("cameraVideo");
  const canvas = $("cameraCanvas");

  if (!video.videoWidth) return toast("Kamera belum siap.");

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  canvas.getContext("2d").drawImage(video, 0, 0);

  stopCamera();
  $("cameraBox").classList.add("hidden");

  await runOCR(canvas);
};

/* UPLOAD IMAGE */

$("uploadImageBtn").onclick = () => $("imageInput").click();

$("imageInput").onchange = async event => {
  const file = event.target.files[0];
  if (!file) return;

  await runOCR(file);
  event.target.value = "";
};

/* OCR */

async function runOCR(source) {
  toast("Membaca nomor dari gambar...");

  try {
    const result = await Tesseract.recognize(source, "eng");
    const text = result.data.text || "";

    const candidates = text.match(/(?:\+?62|0)?[\d\s().-]{8,18}/g) || [];

    const phones = candidates
      .map(value => value.replace(/[^\d+]/g, ""))
      .filter(value => value.replace(/\D/g, "").length >= 9);

    if (!phones.length) {
      toast("Nomor HP tidak ditemukan. Coba gambar lain.");
      return;
    }

    state.detectedPhone = phones[0];
    $("detectedNumber").textContent = state.detectedPhone;
    $("scanResultBox").classList.remove("hidden");
    $("scanResultBox").scrollIntoView({ behavior: "smooth" });
  } catch (error) {
    console.error(error);
    toast("OCR gagal membaca gambar.");
  }
}

$("copyDetectedBtn").onclick = async () => {
  await navigator.clipboard.writeText(state.detectedPhone || "");
  toast("Nomor disalin.");
};

$("findBioBtn").onclick = () => findBio(state.detectedPhone);
$("manualSearchBtn").onclick = () => findBio($("manualPhoneInput").value);

/* FIND BIO */

async function findBio(phone) {
  if (!state.user) return toast("Silakan login.");

  const normalized = POPER.normalizePhone(phone);
  toast("Mencari Bio...");

  try {
    const profiles = await POPER.getData("publicBios");

    let found = null;

    if (profiles) {
      for (const [uid, userBios] of Object.entries(profiles)) {
        if (!userBios) continue;

        for (const [bioId, bio] of Object.entries(userBios)) {
          if (bio && bio.phone === normalized) {
            found = { ...bio, id: bioId, owner: uid };
            break;
          }
        }

        if (found) break;
      }
    }

    if (!found) {
      toast("Bio tidak ditemukan untuk nomor tersebut.");
      return;
    }

    renderPublicBio(found);
  } catch (error) {
    console.error(error);
    toast("Gagal mencari Bio.");
  }
}

/* BIO */

function bioPath() {
  return `${DB()}/bios`;
}

async function loadBios() {
  if (!state.user) return;

  const bios = await POPER.getData(bioPath()) || {};
  const list = $("bioList");

  list.innerHTML = Object.entries(bios).map(([id, bio]) => `
    <div class="item-card">
      <h3>${escapeHTML(bio.title)}</h3>
      <p>@${escapeHTML(bio.username || "")}</p>
      <p>${escapeHTML(bio.description || "")}</p>
      <div class="item-actions">
        <button data-preview="${id}">Preview</button>
        <button data-edit="${id}">Edit</button>
        <button data-delete="${id}" class="delete-btn">Delete</button>
      </div>
    </div>
  `).join("");

  list.querySelectorAll("[data-preview]").forEach(btn => {
    btn.onclick = () => renderPublicBio(bios[btn.dataset.preview]);
  });

  list.querySelectorAll("[data-edit]").forEach(btn => {
    btn.onclick = () => editBio(btn.dataset.edit, bios[btn.dataset.edit]);
  });

  list.querySelectorAll("[data-delete]").forEach(btn => {
    btn.onclick = async () => {
      if (!confirm("Hapus Bio ini?")) return;

      const bio = bios[btn.dataset.delete];

      await POPER.deleteData(`${bioPath()}/${btn.dataset.delete}`);
      if (bio?.phone) {
        await POPER.deleteData(`publicBios/${state.user.uid}/${btn.dataset.delete}`);
      }

      loadBios();
      toast("Bio dihapus.");
    };
  });
}

function resetBioEditor() {
  state.editingBioId = null;
  $("bioEditorTitle").textContent = "Create Bio";
  $("bioTitle").value = "";
  $("bioUsername").value = "";
  $("bioDescription").value = "";
  $("bioImageInput").value = "";
  $("bioImageUrl").value = "";
  $("bioBackgroundColor").value = "#171323";
  $("bioButtonColor").value = "#8458f5";
  $("bioTextColor").value = "#ffffff";
  $("bioLinksContainer").innerHTML = "";
}

$("createBioBtn").onclick = () => {
  resetBioEditor();
  $("bioEditor").classList.remove("hidden");
  $("bioEditor").scrollIntoView({ behavior: "smooth" });
};

$("cancelBioBtn").onclick = () => $("bioEditor").classList.add("hidden");

$("addBioLinkBtn").onclick = () => addBioLink();

function addBioLink(title = "", url = "") {
  const row = document.createElement("div");
  row.className = "bio-link-row";

  row.innerHTML = `
    <input class="text-input link-title" placeholder="Button name">
    <input class="text-input link-url" placeholder="https://..." value="">
    <button type="button">×</button>
  `;

  row.querySelector(".link-title").value = title;
  row.querySelector(".link-url").value = url;

  row.querySelector("button").onclick = () => row.remove();
  $("bioLinksContainer").appendChild(row);
}

async function editBio(id, bio) {
  resetBioEditor();

  state.editingBioId = id;
  $("bioEditorTitle").textContent = "Edit Bio";
  $("bioTitle").value = bio.title || "";
  $("bioUsername").value = bio.username || "";
  $("bioDescription").value = bio.description || "";
  $("bioImageUrl").value = bio.avatar || "";
  $("bioBackgroundColor").value = bio.backgroundColor || "#171323";
  $("bioButtonColor").value = bio.buttonColor || "#8458f5";
  $("bioTextColor").value = bio.textColor || "#ffffff";

  (bio.links || []).forEach(link => addBioLink(link.title, link.url));

  $("bioEditor").classList.remove("hidden");
  $("bioEditor").scrollIntoView({ behavior: "smooth" });
}

async function fileToDataURL(file) {
  if (!file) return null;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

$("saveBioBtn").onclick = async () => {
  if (!state.user) return toast("Login terlebih dahulu.");

  const title = $("bioTitle").value.trim();
  if (!title) return toast("Nama Bio wajib diisi.");

  const links = [...$("bioLinksContainer").querySelectorAll(".bio-link-row")]
    .map(row => ({
      title: row.querySelector(".link-title").value.trim(),
      url: row.querySelector(".link-url").value.trim()
    }))
    .filter(link => link.title && link.url);

  const id = state.editingBioId || makeId();

  const avatarFile = $("bioImageInput").files[0];
  const backgroundFile = $("bioBackgroundImage").files[0];

  let avatar = $("bioImageUrl").value.trim();
  let backgroundImage = "";

  try {
    if (avatarFile) avatar = await fileToDataURL(avatarFile);
    if (backgroundFile) backgroundImage = await fileToDataURL(backgroundFile);
  } catch (error) {
    return toast("Gagal membaca gambar.");
  }

  const phone = state.user.phoneNumber || "";

  const bio = {
    id,
    title,
    username: $("bioUsername").value.trim(),
    description: $("bioDescription").value.trim(),
    avatar,
    phone,
    links,
    backgroundColor: $("bioBackgroundColor").value,
    backgroundImage,
    buttonColor: $("bioButtonColor").value,
    textColor: $("bioTextColor").value,
    updatedAt: Date.now()
  };

  try {
    await POPER.saveData(`${bioPath()}/${id}`, bio);

    // Public lookup index
    if (phone) {
      await POPER.saveData(`publicBios/${state.user.uid}/${id}`, bio);
    }

    $("bioEditor").classList.add("hidden");
    await loadBios();
    toast("Bio berhasil disimpan.");
  } catch (error) {
    console.error(error);
    toast("Gagal menyimpan Bio. Periksa Firebase Rules.");
  }
};

$("previewBioBtn").onclick = () => {
  const links = [...$("bioLinksContainer").querySelectorAll(".bio-link-row")]
    .map(row => ({
      title: row.querySelector(".link-title").value,
      url: row.querySelector(".link-url").value
    }));

  renderPublicBio({
    title: $("bioTitle").value || "My Bio",
    username: $("bioUsername").value,
    description: $("bioDescription").value,
    avatar: $("bioImageUrl").value,
    links,
    backgroundColor: $("bioBackgroundColor").value,
    buttonColor: $("bioButtonColor").value,
    textColor: $("bioTextColor").value
  });
};

function renderPublicBio(bio) {
  state.currentBio = bio;

  const content = $("publicBioContent");
  const background = bio.backgroundImage
    ? `url("${bio.backgroundImage}")`
    : bio.backgroundColor || "#171323";

  content.innerHTML = `
    <div class="public-bio-content" style="background-color:${escapeHTML(bio.backgroundColor || "#171323")};background-image:${bio.backgroundImage ? `url('${bio.backgroundImage}')` : "none"};color:${escapeHTML(bio.textColor || "#ffffff")}">
      ${bio.avatar ? `<img class="public-bio-avatar" src="${escapeHTML(bio.avatar)}">` : ""}
      <h1>${escapeHTML(bio.title || "")}</h1>
      <div>@${escapeHTML(bio.username || "")}</div>
      <p>${escapeHTML(bio.description || "")}</p>
      ${(bio.links || []).map(link => `
        <a class="public-bio-link" href="${escapeHTML(link.url)}" target="_blank" rel="noopener noreferrer" style="background:${escapeHTML(bio.buttonColor || "#8458f5")};color:${escapeHTML(bio.textColor || "#ffffff")}">
          ${escapeHTML(link.title)}
        </a>
      `).join("")}
      <div class="muted" style="margin-top:30px">Made with POPER</div>
    </div>
  `;

  $("mainApp").classList.add("hidden");
  $("publicBioPage").classList.remove("hidden");
}

$("closePublicBioBtn").onclick = () => {
  $("publicBioPage").classList.add("hidden");
  $("mainApp").classList.remove("hidden");
};

/* VAULT */

function vaultPath() {
  return `${DB()}/vault`;
}

$("saveVaultBtn").onclick = async () => {
  const title = $("vaultTitle").value.trim();
  const url = $("vaultUrl").value.trim();

  if (!title || !url) return toast("Isi title dan link.");

  try {
    await POPER.pushData(vaultPath(), {
      title,
      url,
      createdAt: Date.now()
    });

    $("vaultTitle").value = "";
    $("vaultUrl").value = "";
    loadVault();
    toast("Tersimpan di Vault.");
  } catch (error) {
    toast("Gagal menyimpan Vault.");
  }
};

$("addVaultBtn").onclick = () => $("vaultTitle").focus();

async function loadVault() {
  if (!state.user) return;

  const data = await POPER.getData(vaultPath()) || {};
  const list = $("vaultList");

  list.innerHTML = Object.entries(data).map(([id, item]) => `
    <div class="item-card">
      <h3>${escapeHTML(item.title)}</h3>
      <p>${escapeHTML(item.url)}</p>
      <div class="item-actions">
        <button data-open="${id}">Open</button>
        <button data-copy="${id}">Copy</button>
        <button data-delete="${id}" class="delete-btn">Delete</button>
      </div>
    </div>
  `).join("");

  list.querySelectorAll("[data-open]").forEach(btn => {
    btn.onclick = () => {
      const item = data[btn.dataset.open];
      let url = item.url;
      if (/^https?:\/\//i.test(url)) window.open(url, "_blank", "noopener");
      else toast("Konten QR: " + url);
    };
  });

  list.querySelectorAll("[data-copy]").forEach(btn => {
    btn.onclick = async () => {
      await navigator.clipboard.writeText(data[btn.dataset.copy].url);
      toast("Disalin.");
    };
  });

  list.querySelectorAll("[data-delete]").forEach(btn => {
    btn.onclick = async () => {
      await POPER.deleteData(`${vaultPath()}/${btn.dataset.delete}`);
      loadVault();
    };
  });
}

/* NOTES */

function notesPath() {
  return `${DB()}/notes`;
}

$("newNoteBtn").onclick = () => {
  state.editingNoteId = null;
  $("noteTitle").value = "";
  $("noteContent").value = "";
  $("noteEditor").classList.remove("hidden");
};

$("cancelNoteBtn").onclick = () => $("noteEditor").classList.add("hidden");

$("saveNoteBtn").onclick = async () => {
  const title = $("noteTitle").value.trim() || "Untitled";
  const content = $("noteContent").value;

  try {
    if (state.editingNoteId) {
      await POPER.updateData(`${notesPath()}/${state.editingNoteId}`, {
        title,
        content,
        updatedAt: Date.now()
      });
    } else {
      await POPER.pushData(notesPath(), {
        title,
        content,
        createdAt: Date.now()
      });
    }

    $("noteEditor").classList.add("hidden");
    loadNotes();
    toast("Note tersimpan.");
  } catch (error) {
    toast("Gagal menyimpan Note.");
  }
};

async function loadNotes() {
  if (!state.user) return;

  const notes = await POPER.getData(notesPath()) || {};
  const list = $("notesList");

  list.innerHTML = Object.entries(notes).map(([id, note]) => `
    <div class="item-card">
      <h3>${escapeHTML(note.title)}</h3>
      <p>${escapeHTML(note.content).replace(/\n/g, "<br>")}</p>
      <div class="item-actions">
        <button data-edit="${id}">Edit</button>
        <button data-delete="${id}" class="delete-btn">Delete</button>
      </div>
    </div>
  `).join("");

  list.querySelectorAll("[data-edit]").forEach(btn => {
    btn.onclick = () => {
      state.editingNoteId = btn.dataset.edit;
      const note = notes[btn.dataset.edit];
      $("noteTitle").value = note.title;
      $("noteContent").value = note.content;
      $("noteEditor").classList.remove("hidden");
    };
  });

  list.querySelectorAll("[data-delete]").forEach(btn => {
    btn.onclick = async () => {
      await POPER.deleteData(`${notesPath()}/${btn.dataset.delete}`);
      loadNotes();
    };
  });
}
