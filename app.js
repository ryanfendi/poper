
import "./firebase.js";

const $ = id => document.getElementById(id);
const auth = window.POPER.auth;

let confirmation = null;
let links = [];
let pages = [];
let pageBlocks = [];
let editorMode = "visual";

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

/* ===============================
   UTILITIES
================================ */

function status(id, message, color) {
  const el = $(id);
  if (!el) return;
  el.textContent = message;
  if (color) el.style.color = color;
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

function safeURL(value) {
  try {
    const u = new URL(String(value).trim());
    if (["http:", "https:"].includes(u.protocol)) return u.href;
  } catch {}
  return "";
}

function phoneKey(phone) {
  return window.POPER.normalizePhone(phone).replace(/\D/g, "");
}

function uid() {
  return auth.currentUser?.uid || "";
}

function basePath() {
  return `users/${uid()}`;
}

function animationClass(animation) {
  const allowed = ["shake", "pulse", "bounce", "glow"];
  return allowed.includes(animation) ? `anim-${animation}` : "";
}

function makeSlug(text) {
  return String(text || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9 -]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function escapeAttr(value) {
  return escapeHTML(value);
}

/* ===============================
   NAVIGATION
================================ */

function showSection(name) {
  const target = name === "scanner" ? "phoneScanner" : name;

  document.querySelectorAll(".section").forEach(section => {
    section.classList.toggle("active", section.id === target);
  });

  document.querySelectorAll(".nav-btn").forEach(button => {
    button.classList.toggle("active", button.dataset.tab === name);
  });

  if (name !== "scanner") {
    stopPhoneScanner();
  }

  if (name !== "qr") stopCameraScanner();

  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelectorAll("[data-tab]").forEach(button => {
  button.addEventListener("click", () => showSection(button.dataset.tab));
});

document.querySelectorAll("[data-open-tab]").forEach(button => {
  button.addEventListener("click", () => showSection(button.dataset.openTab));
});

$("mainScanButton")?.addEventListener("click", () => showSection("scanner"));

$("backFromScanner")?.addEventListener("click", () => showSection("scan"));

/* ===============================
   AUTH
================================ */

function loginUI(user) {
  if (!user) {
    $("loginPanel").hidden = false;
    $("dashboard").hidden = true;
    $("appBottomNav").hidden = true;
    $("logoutBtn").hidden = true;
    stopPhoneScanner();
    stopCameraScanner();
    return;
  }

  $("loginPanel").hidden = true;
  $("dashboard").hidden = false;
  $("appBottomNav").hidden = false;
  $("logoutBtn").hidden = false;

  $("welcome").textContent = "Halo, pengguna POPER!";
  $("myPhone").textContent = user.phoneNumber || "";

  loadAll();
}

$("sendOtpBtn")?.addEventListener("click", async () => {
  const phone = $("phoneInput")?.value.trim();

  if (!phone) {
    status("authStatus", "Masukkan nomor HP.");
    return;
  }

  try {
    status("authStatus", "Mengirim OTP...");
    confirmation = await window.POPER.sendOTP(phone);
    $("otpSection").hidden = false;
    status("authStatus", "OTP terkirim. Periksa SMS.");
  } catch (error) {
    status("authStatus", error.message || "Gagal mengirim OTP.");
    try { window.POPER.resetRecaptcha(); } catch {}
  }
});

$("verifyOtpBtn")?.addEventListener("click", async () => {
  const code = $("otpInput")?.value.trim();

  if (!confirmation || !code) {
    status("authStatus", "Masukkan OTP.");
    return;
  }

  try {
    status("authStatus", "Memverifikasi...");
    const result = await confirmation.confirm(code);
    loginUI(result.user);
    status("authStatus", "Login berhasil.");
  } catch (error) {
    status("authStatus", error.message || "OTP salah.");
  }
});

$("logoutBtn")?.addEventListener("click", async () => {
  stopPhoneScanner();
  stopCameraScanner();
  await window.POPER.logout();
});

/* ===============================
   BIO
================================ */

$("saveBio")?.addEventListener("click", async () => {
  if (!uid()) return;

  try {
    await window.POPER.saveData(`${basePath()}/publicBio`, {
      name: $("bioName").value.trim(),
      description: $("bioDesc").value.trim(),
      phone: auth.currentUser.phoneNumber || "",
      links,
      updatedAt: Date.now()
    });

    await window.POPER.saveData(
      `phoneLookup/${phoneKey(auth.currentUser.phoneNumber)}`,
      {
        uid: uid(),
        phone: auth.currentUser.phoneNumber
      }
    );

    status("bioStatus", "Profil berhasil disimpan!");
    renderBioLinks();
    renderBioPreview();
  } catch (error) {
    status("bioStatus", error.message || "Gagal menyimpan profil.");
  }
});

async function loadBio() {
  if (!uid()) return;

  try {
    const data = await window.POPER.getData(`${basePath()}/publicBio`);
    if (!data) return;

    $("bioName").value = data.name || "";
    $("bioDesc").value = data.description || "";

    links = Array.isArray(data.links) ? data.links : [];

    renderBioLinks();
    renderBuilderLinks();
    renderBioPreview();
  } catch (error) {
    console.error("Load bio:", error);
  }
}

$("openPublicBio")?.addEventListener("click", () => {
  renderBioPreview();
  showSection("builder");
});

/* ===============================
   LINK BUILDER
================================ */

$("addBioLink")?.addEventListener("click", () => {
  const title = $("linkTitle").value.trim();
  const url = safeURL($("linkURL").value);
  const type = $("linkType").value;
  const image = safeURL($("linkImage").value);
  const animation = $("linkAnimation").value;

  if (!title) {
    status("builderStatus", "Masukkan nama tombol.");
    return;
  }

  if (!url) {
    status("builderStatus", "URL tujuan harus valid dan menggunakan http/https.");
    return;
  }

  if (type === "image" && !image) {
    status("builderStatus", "Tombol gambar membutuhkan URL gambar.");
    return;
  }

  links.push({
    id: crypto.randomUUID(),
    title,
    url,
    type,
    image,
    animation
  });

  $("linkTitle").value = "";
  $("linkURL").value = "";
  $("linkImage").value = "";

  renderBioLinks();
  renderBuilderLinks();
  renderBioPreview();

  status("builderStatus", "Link ditambahkan. Tekan Simpan Profil untuk menyimpan online.");
});

function renderBioLinks() {
  const container = $("bioLinks");
  if (!container) return;

  if (!links.length) {
    container.innerHTML = "<p>Belum ada link.</p>";
    return;
  }

  container.innerHTML = links.map(link => `
    <div class="item">
      <strong>${escapeHTML(link.title)}</strong>
      ${link.type === "image" && safeURL(link.image)
        ? `<img src="${escapeAttr(link.image)}" alt="">`
        : ""}
      <a class="builder-link ${animationClass(link.animation)}"
         href="${escapeAttr(safeURL(link.url))}"
         target="_blank" rel="noopener noreferrer">
        ${escapeHTML(link.title)}
      </a>
    </div>
  `).join("");
}

function renderBuilderLinks() {
  const container = $("builderLinks");
  if (!container) return;

  container.innerHTML = links.map((link, index) => `
    <div class="item">
      <strong>${escapeHTML(link.title)}</strong>
      <small>${escapeHTML(link.url)}</small>
      <p>Jenis: ${escapeHTML(link.type)} · Animasi: ${escapeHTML(link.animation || "none")}</p>
      ${link.type === "image" && safeURL(link.image)
        ? `<img src="${escapeAttr(link.image)}" style="width:100%;border-radius:12px">`
        : ""}
      <div class="item-actions">
        <button class="secondary small" data-edit-link="${index}">Edit</button>
        <button class="danger small" data-delete-link="${index}">Hapus</button>
        <button class="secondary small" data-up-link="${index}">↑</button>
        <button class="secondary small" data-down-link="${index}">↓</button>
      </div>
    </div>
  `).join("");

  container.querySelectorAll("[data-delete-link]").forEach(button => {
    button.onclick = () => {
      links.splice(Number(button.dataset.deleteLink), 1);
      renderBuilderLinks();
      renderBioLinks();
      renderBioPreview();
    };
  });

  container.querySelectorAll("[data-edit-link]").forEach(button => {
    button.onclick = () => {
      const i = Number(button.dataset.editLink);
      const link = links[i];

      $("linkTitle").value = link.title || "";
      $("linkURL").value = link.url || "";
      $("linkType").value = link.type || "text";
      $("linkImage").value = link.image || "";
      $("linkAnimation").value = link.animation || "none";

      links.splice(i, 1);
      renderBuilderLinks();
      renderBioLinks();
      renderBioPreview();

      window.scrollTo({ top: 0, behavior: "smooth" });
    };
  });

  container.querySelectorAll("[data-up-link]").forEach(button => {
    button.onclick = () => {
      const i = Number(button.dataset.upLink);
      if (i <= 0) return;
      [links[i - 1], links[i]] = [links[i], links[i - 1]];
      renderBuilderLinks();
      renderBioLinks();
      renderBioPreview();
    };
  });

  container.querySelectorAll("[data-down-link]").forEach(button => {
    button.onclick = () => {
      const i = Number(button.dataset.downLink);
      if (i >= links.length - 1) return;
      [links[i + 1], links[i]] = [links[i], links[i + 1]];
      renderBuilderLinks();
      renderBioLinks();
      renderBioPreview();
    };
  });
}

function renderBioPreview() {
  const container = $("bioPreview");
  if (!container) return;

  const name = $("bioName")?.value || "Nama kamu";
  const desc = $("bioDesc")?.value || "";

  container.innerHTML = `
    <div class="preview-profile">
      <div class="preview-name">${escapeHTML(name)}</div>
      <div class="preview-desc">${escapeHTML(desc)}</div>
    </div>
    ${links.map(link => {
      const url = safeURL(link.url);
      if (!url) return "";

      if (link.type === "image" && safeURL(link.image)) {
        return `
          <a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">
            <img class="link-image ${animationClass(link.animation)}"
                 src="${escapeAttr(link.image)}"
                 alt="${escapeAttr(link.title)}">
          </a>
        `;
      }

      return `
        <a class="link-button ${animationClass(link.animation)}"
           href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">
           ${escapeHTML(link.title)}
        </a>
      `;
    }).join("")}
  `;
}

/* ===============================
   PAGE BUILDER
================================ */

function setEditorMode(mode) {
  editorMode = mode;

  $("visualEditor").hidden = mode !== "visual";
  $("textEditor").hidden = mode !== "text";
  $("htmlEditor").hidden = mode !== "html";
}

document.querySelectorAll("[data-editor-mode]").forEach(button => {
  button.addEventListener("click", () => {
    setEditorMode(button.dataset.editorMode);
  });
});

$("addPageBlock")?.addEventListener("click", () => {
  const type = $("blockType").value;
  const content = $("blockContent").value.trim();
  const extra = $("blockExtra").value.trim();

  if (!content) {
    status("pageStatus", "Isi konten blok terlebih dahulu.");
    return;
  }

  pageBlocks.push({
    id: crypto.randomUUID(),
    type,
    content,
    extra
  });

  $("blockContent").value = "";
  $("blockExtra").value = "";

  renderPageBlocks();
  previewPage();
});

function renderPageBlocks() {
  const container = $("pageBlocks");
  if (!container) return;

  container.innerHTML = pageBlocks.map((block, index) => `
    <div class="page-block">
      <strong>${escapeHTML(block.type.toUpperCase())}</strong>
      <p>${escapeHTML(block.content.slice(0, 200))}</p>
      ${block.extra ? `<small>${escapeHTML(block.extra)}</small>` : ""}
      <button class="danger small" data-delete-block="${index}">Hapus</button>
    </div>
  `).join("");

  container.querySelectorAll("[data-delete-block]").forEach(button => {
    button.onclick = () => {
      pageBlocks.splice(Number(button.dataset.deleteBlock), 1);
      renderPageBlocks();
      previewPage();
    };
  });
}

function renderBlocksHTML(blocks) {
  return blocks.map(block => {
    const content = escapeHTML(block.content);
    const extra = safeURL(block.extra);

    switch (block.type) {
      case "heading":
        return `<h2>${content}</h2>`;

      case "text":
        return `<p>${content.replace(/\n/g, "<br>")}</p>`;

      case "image":
        return extra
          ? `<img src="${escapeAttr(extra)}" alt="${content}">`
          : "";

      case "button":
        return extra
          ? `<a href="${escapeAttr(extra)}">${content}</a>`
          : "";

      case "html":
        return sanitizeHTML(block.content);

      default:
        return `<p>${content}</p>`;
    }
  }).join("");
}

/* Basic sanitization for user HTML preview/public display */
function sanitizeHTML(html) {
  const template = document.createElement("template");
  template.innerHTML = String(html || "");

  template.content.querySelectorAll(
    "script,iframe,object,embed,form,base,meta,link"
  ).forEach(el => el.remove());

  template.content.querySelectorAll("*").forEach(el => {
    [...el.attributes].forEach(attr => {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();

      if (name.startsWith("on")) el.removeAttribute(attr.name);
      if ((name === "href" || name === "src") &&
          value.startsWith("javascript:")) {
        el.removeAttribute(attr.name);
      }
    });
  });

  return template.innerHTML;
}

function currentPageContent() {
  if (editorMode === "html") {
    return {
      mode: "html",
      html: sanitizeHTML($("pageHTML").value),
      text: "",
      blocks: []
    };
  }

  if (editorMode === "text") {
    return {
      mode: "text",
      html: "",
      text: $("pageText").value,
      blocks: []
    };
  }

  return {
    mode: "visual",
    html: "",
    text: "",
    blocks: pageBlocks
  };
}

function previewPage() {
  const container = $("pagePreview");
  if (!container) return;

  const data = currentPageContent();

  let html = "";

  if (data.mode === "html") {
    html = sanitizeHTML(data.html);
  } else if (data.mode === "text") {
    html = `<div>${escapeHTML(data.text).replace(/\n/g, "<br>")}</div>`;
  } else {
    html = renderBlocksHTML(data.blocks);
  }

  container.innerHTML = html;
}

$("previewPage")?.addEventListener("click", previewPage);

function collectPage() {
  const title = $("pageTitle").value.trim();
  const slug = makeSlug($("pageSlug").value || title);
  const type = $("pageType").value;

  return {
    id: $("editingPageId")?.value || crypto.randomUUID(),
    title,
    slug,
    type,
    ...currentPageContent(),
    published: false,
    updatedAt: Date.now()
  };
}

/* Create hidden editing ID if not already present */
if (!$("editingPageId")) {
  const hidden = document.createElement("input");
  hidden.id = "editingPageId";
  hidden.type = "hidden";
  document.body.appendChild(hidden);
}

async function savePage(publish = false) {
  if (!uid()) {
    status("pageStatus", "Login terlebih dahulu.");
    return;
  }

  const page = collectPage();

  if (!page.title) {
    status("pageStatus", "Isi nama halaman.");
    return;
  }

  if (!page.slug) {
    status("pageStatus", "Slug halaman tidak valid.");
    return;
  }

  page.published = publish;
  page.updatedAt = Date.now();

  try {
    await window.POPER.saveData(
      `${basePath()}/pages/${page.id}`,
      page
    );

    const existing = pages.findIndex(p => p.id === page.id);
    if (existing >= 0) pages[existing] = page;
    else pages.push(page);

    status(
      "pageStatus",
      publish ? "Halaman berhasil dipublikasikan!" : "Draft berhasil disimpan!"
    );

    renderMyPages();
  } catch (error) {
    status("pageStatus", error.message || "Gagal menyimpan halaman.");
  }
}

$("savePage")?.addEventListener("click", () => savePage(false));
$("publishPage")?.addEventListener("click", () => savePage(true));

async function loadPages() {
  if (!uid()) return;

  try {
    const data = await window.POPER.getData(`${basePath()}/pages`);
    pages = data ? Object.values(data) : [];
    renderMyPages();
  } catch (error) {
    console.error(error);
  }
}

function renderMyPages() {
  const container = $("myPages");
  if (!container) return;

  if (!pages.length) {
    container.innerHTML = "<p>Belum ada halaman.</p>";
    return;
  }

  container.innerHTML = pages.map(page => `
    <div class="item">
      <strong>${escapeHTML(page.title)}</strong>
      <p>${escapeHTML(page.slug)} · ${page.published ? "Published" : "Draft"}</p>
      <div class="item-actions">
        <button class="secondary small" data-edit-page="${escapeAttr(page.id)}">Edit</button>
        <button class="secondary small" data-preview-page="${escapeAttr(page.id)}">Preview</button>
        <button class="danger small" data-delete-page="${escapeAttr(page.id)}">Hapus</button>
      </div>
    </div>
  `).join("");

  container.querySelectorAll("[data-edit-page]").forEach(button => {
    button.onclick = () => editPage(button.dataset.editPage);
  });

  container.querySelectorAll("[data-preview-page]").forEach(button => {
    button.onclick = () => previewSavedPage(button.dataset.previewPage);
  });

  container.querySelectorAll("[data-delete-page]").forEach(button => {
    button.onclick = async () => {
      const id = button.dataset.deletePage;
      if (!confirm("Hapus halaman ini?")) return;

      await window.POPER.deleteData(`${basePath()}/pages/${id}`);
      pages = pages.filter(p => p.id !== id);
      renderMyPages();
    };
  });
}

function editPage(id) {
  const page = pages.find(p => p.id === id);
  if (!page) return;

  $("editingPageId").value = page.id;
  $("pageTitle").value = page.title || "";
  $("pageSlug").value = page.slug || "";
  $("pageType").value = page.type || "landing";

  setEditorMode(page.mode || "visual");

  pageBlocks = Array.isArray(page.blocks) ? page.blocks : [];
  $("pageText").value = page.text || "";
  $("pageHTML").value = page.html || "";

  renderPageBlocks();
  previewPage();

  showSection("pages");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function previewSavedPage(id) {
  const page = pages.find(p => p.id === id);
  if (!page) return;

  let html = "";
  if (page.mode === "html") html = sanitizeHTML(page.html || "");
  else if (page.mode === "text") html = escapeHTML(page.text || "").replace(/\n/g, "<br>");
  else html = renderBlocksHTML(page.blocks || []);

  $("pagePreview").innerHTML = `<h2>${escapeHTML(page.title)}</h2>${html}`;
  showSection("pages");
}

/* ===============================
   FIND BIO
================================ */

async function findBioByPhone(phone, containerId) {
  const container = $(containerId);
  if (!container) return;

  container.innerHTML = "";

  if (!phone.trim()) {
    container.textContent = "Masukkan nomor HP.";
    return;
  }

  try {
    container.textContent = "Mencari...";
    const key = phoneKey(phone);
    const lookup = await window.POPER.getData(`phoneLookup/${key}`);

    if (!lookup?.uid) {
      container.textContent = "Bio POPER tidak ditemukan.";
      return;
    }

    const bio = await window.POPER.getData(
      `users/${lookup.uid}/publicBio`
    );

    if (!bio) {
      container.textContent = "Bio belum tersedia.";
      return;
    }

    container.innerHTML = `
      <div class="item">
        <h3>${escapeHTML(bio.name || "Pengguna POPER")}</h3>
        <p>${escapeHTML(bio.description || "")}</p>
        <small>${escapeHTML(bio.phone || "")}</small>
        ${Array.isArray(bio.links) ? bio.links.map(link => {
          const url = safeURL(link.url);
          if (!url) return "";
          return `<a class="link-button ${animationClass(link.animation)}"
            href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">
            ${escapeHTML(link.title || "Buka Link")}
          </a>`;
        }).join("") : ""}
      </div>
    `;
  } catch (error) {
    container.textContent = error.message || "Pencarian gagal.";
  }
}

$("findBio")?.addEventListener("click", () => {
  findBioByPhone($("findPhone").value, "findResult");
});

$("searchScannedPhone")?.addEventListener("click", () => {
  findBioByPhone($("scannedPhoneNumber").value, "phoneScanResult");
});

/* ===============================
   QR VAULT
================================ */

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

  if ($("qrVideo")) $("qrVideo").srcObject = null;
  if ($("qrCameraBox")) $("qrCameraBox").hidden = true;
}

$("startQRScanner")?.addEventListener("click", async () => {
  try {
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
    status("qrScanStatus", error.message || "Kamera gagal dibuka.");
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

    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = window.jsQR?.(image.data, image.width, image.height);

    if (code?.data) {
      scannedQRValue = code.data;
      $("qrResultBox").value = code.data;
      stopCameraScanner();
      status("qrScanStatus", "QR berhasil terbaca.");
    }
  }

  if (cameraActive) cameraFrame = requestAnimationFrame(scanQRFrame);
}

$("qrImageInput")?.addEventListener("change", async event => {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    await img.decode();

    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);

    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = window.jsQR?.(image.data, image.width, image.height);

    if (code?.data) {
      $("qrResultBox").value = code.data;
      status("qrScanStatus", "QR gambar berhasil dibaca.");
    } else {
      status("qrScanStatus", "QR tidak ditemukan.");
    }

    URL.revokeObjectURL(url);
  } catch (error) {
    status("qrScanStatus", "Gambar gagal diproses.");
  }
});

$("saveQR")?.addEventListener("click", async () => {
  if (!uid()) return;

  const name = $("qrName").value.trim() || "QR Link";
  const raw = $("qrResultBox").value.trim();
  const url = safeURL(raw);

  if (!url) {
    status("qrScanStatus", "Link QR harus URL http/https.");
    return;
  }

  try {
    await window.POPER.pushData(`qrVault/${uid()}`, {
      name,
      url,
      createdAt: Date.now()
    });

    status("qrScanStatus", "QR berhasil disimpan!");
    loadQR();
  } catch (error) {
    status("qrScanStatus", error.message || "Gagal menyimpan QR.");
  }
});

async function loadQR() {
  if (!uid()) return;

  const data = await window.POPER.getData(`qrVault/${uid()}`);
  const container = $("qrList");

  if (!data) {
    container.innerHTML = "<p>Vault kosong.</p>";
    return;
  }

  container.innerHTML = Object.entries(data).map(([key, item]) => `
    <div class="item">
      <strong>${escapeHTML(item.name)}</strong>
      <a class="link-button" href="${escapeAttr(safeURL(item.url))}"
        target="_blank" rel="noopener noreferrer">Buka Link</a>
      <button class="danger small" data-delete-qr="${escapeAttr(key)}">Hapus</button>
    </div>
  `).join("");

  container.querySelectorAll("[data-delete-qr]").forEach(button => {
    button.onclick = async () => {
      await window.POPER.deleteData(`qrVault/${uid()}/${button.dataset.deleteQr}`);
      loadQR();
    };
  });
}

/* ===============================
   NOTES
================================ */

$("saveNote")?.addEventListener("click", async () => {
  if (!uid()) return;

  const title = $("noteTitle").value.trim();
  const content = $("noteContent").value.trim();

  if (!title || !content) {
    status("notesStatus", "Isi judul dan isi catatan.");
    return;
  }

  try {
    await window.POPER.pushData(`notes/${uid()}`, {
      title,
      content,
      createdAt: Date.now()
    });

    $("noteTitle").value = "";
    $("noteContent").value = "";

    status("notesStatus", "Catatan tersimpan.");
    loadNotes();
  } catch (error) {
    status("notesStatus", error.message || "Gagal.");
  }
});

async function loadNotes() {
  if (!uid()) return;

  const data = await window.POPER.getData(`notes/${uid()}`);
  const container = $("notesList");

  if (!data) {
    container.innerHTML = "<p>Belum ada catatan.</p>";
    return;
  }

  container.innerHTML = Object.entries(data).map(([key, note]) => `
    <div class="item">
      <strong>${escapeHTML(note.title)}</strong>
      <p>${escapeHTML(note.content)}</p>
      <button class="danger small" data-delete-note="${escapeAttr(key)}">Hapus</button>
    </div>
  `).join("");

  container.querySelectorAll("[data-delete-note]").forEach(button => {
    button.onclick = async () => {
      await window.POPER.deleteData(`notes/${uid()}/${button.dataset.deleteNote}`);
      loadNotes();
    };
  });
}

/* ===============================
   PHONE OCR SCANNER
================================ */

function formatDetectedPhone(raw) {
  let digits = String(raw).replace(/\D/g, "");

  if (digits.startsWith("62")) return "+" + digits;
  if (digits.startsWith("8")) return "0" + digits;
  return digits;
}

function extractPhone(text) {
  const matches = text.match(/\+?\d[\d\s().-]{7,}\d/g) || [];

  for (const match of matches) {
    const digits = match.replace(/\D/g, "");
    if (digits.length >= 10 && digits.length <= 15 &&
        (digits.startsWith("08") || digits.startsWith("8") || digits.startsWith("62"))) {
      return formatDetectedPhone(digits);
    }
  }

  const compact = text.replace(/\D/g, "");

  if (compact.length >= 10 && compact.length <= 15 &&
      (compact.startsWith("08") || compact.startsWith("8") || compact.startsWith("62"))) {
    return formatDetectedPhone(compact);
  }

  return "";
}

async function startPhoneScanner() {
  if (!navigator.mediaDevices?.getUserMedia) {
    status("phoneScanStatus", "Browser tidak mendukung kamera.");
    return;
  }

  try {
    status("phoneScanStatus", "Meminta akses kamera...");
    phoneCameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false
    });

    $("phoneScanVideo").srcObject = phoneCameraStream;
    await $("phoneScanVideo").play();

    phoneOCRActive = true;
    status("phoneScanStatus", "Kamera aktif. Arahkan ke nomor HP.");
    startPhoneOCR();
  } catch (error) {
    status("phoneScanStatus", error.message || "Kamera tidak dapat dibuka.");
  }
}

async function startPhoneOCR() {
  if (phoneOCRBusy || !phoneOCRActive) return;
  phoneOCRBusy = true;

  try {
    if (!window.Tesseract) throw new Error("Library OCR belum tersedia.");

    if (!phoneOCRWorker) {
      status("phoneScanStatus", "Menyiapkan OCR...");

      phoneOCRWorker = await Tesseract.createWorker("eng");

      await phoneOCRWorker.setParameters({
        tessedit_char_whitelist: "0123456789+-() ",
        tessedit_pageseg_mode: "6"
      });
    }

    phoneOCRBusy = false;
    runPhoneOCR();
  } catch (error) {
    phoneOCRBusy = false;
    status("phoneScanStatus", error.message || "OCR gagal.");
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

    const w = video.videoWidth;
    const h = video.videoHeight;

    canvas.width = 1200;
    canvas.height = 300;

    ctx.filter = "grayscale(1) contrast(2)";
    ctx.drawImage(video, 0, h * .25, w, h * .5, 0, 0, canvas.width, canvas.height);

    const result = await phoneOCRWorker.recognize(canvas);
    const detected = extractPhone(result.data.text || "");

    if (detected && detected !== lastDetectedPhone) {
      lastDetectedPhone = detected;
      $("scannedPhoneNumber").value = detected;
      status("phoneScanStatus", "Nomor terdeteksi. Periksa lalu tekan Cari Bio.");
    }
  } catch (error) {
    console.warn("OCR:", error);
  }

  phoneOCRBusy = false;
  if (phoneOCRActive) phoneOCRTimer = setTimeout(runPhoneOCR, 1000);
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

  if ($("phoneScanVideo")) $("phoneScanVideo").srcObject = null;

  phoneOCRBusy = false;
  lastDetectedPhone = "";
}

$("startPhoneCamera")?.addEventListener("click", startPhoneScanner);
$("stopPhoneCamera")?.addEventListener("click", stopPhoneScanner);

/* ===============================
   THEME
================================ */

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("poper-theme", theme);

  document.querySelectorAll("[data-theme-choice]").forEach(button => {
    button.classList.toggle("active", button.dataset.themeChoice === theme);
  });
}

document.querySelectorAll("[data-theme-choice]").forEach(button => {
  button.addEventListener("click", () => {
    applyTheme(button.dataset.themeChoice);
    status("themeStatus", "Tema diubah.");
  });
});

/* ===============================
   LOAD
================================ */

async function loadAll() {
  await Promise.allSettled([
    loadBio(),
    loadQR(),
    loadNotes(),
    loadPages()
  ]);
}

window.POPER.onAuth(user => {
  loginUI(user);
});

console.log("POPER Bio Link Builder siap.");
