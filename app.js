
import "./firebase.js";

const $ = id => document.getElementById(id);
const auth = window.POPER.auth;

let confirmation = null;
let currentUser = null;
let links = [];
let pages = [];
let notes = [];
let qrItems = [];

let bioImageData = "";
let cameraStream = null;
let ocrBusy = false;
let loadingUser = false;
let lastLoadedUID = "";

function status(id, text, color) {
  const el = $(id);
  if (!el) return;
  el.textContent = text || "";
  if (color) el.style.color = color;
}

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",
    '"':"&quot;","'":"&#39;"
  }[c]));
}

function uid() {
  return currentUser?.uid;
}

function phone() {
  return currentUser?.phoneNumber || "";
}

function phoneKey(p) {
  return String(p || "").replace(/\D/g, "");
}

function userPath(path="") {
  return `users/${uid()}/${path}`;
}

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g,"-")
    .replace(/^-|-$/g,"");
}

function toast(id, text) {
  status(id, text);
}

/* =================================
   LOGIN
================================= */

function loginUI(user) {
  $("loginPanel").classList.toggle("hidden", !!user);
  $("dashboard").classList.toggle("hidden", !user);
  $("bottomNav").classList.toggle("hidden", !user);
  $("logoutBtn").classList.toggle("hidden", !user);

  if (user) {
    $("welcome").textContent = "👋 Selamat datang di POPER";
    $("myPhone").textContent = user.phoneNumber || "-";
  }
}

$("sendOtpBtn").onclick = async () => {
  const phoneValue = $("phoneInput").value.trim();

  if (!phoneValue) {
    status("authStatus", "Masukkan nomor HP terlebih dahulu.");
    return;
  }

  $("sendOtpBtn").disabled = true;
  status("authStatus", "Menyiapkan verifikasi...");

  try {
    window.POPER.resetRecaptcha();

    confirmation = await window.POPER.sendOTP(phoneValue);

    $("otpSection").classList.remove("hidden");
    status("authStatus", "Kode OTP telah dikirim. Periksa SMS.");
  } catch(e) {
    console.error(e);
    status("authStatus", "Gagal mengirim OTP: " + (e.message || e.code));
    window.POPER.resetRecaptcha();
  }

  $("sendOtpBtn").disabled = false;
};

$("verifyOtpBtn").onclick = async () => {
  const code = $("otpInput").value.trim();

  if (!confirmation) {
    status("authStatus", "Kirim OTP terlebih dahulu.");
    return;
  }

  if (!code) {
    status("authStatus", "Masukkan kode OTP.");
    return;
  }

  $("verifyOtpBtn").disabled = true;
  status("authStatus", "Memverifikasi kode...");

  try {
    const result = await confirmation.confirm(code);

    // Fallback: langsung pindah dashboard
    currentUser = result.user;
    loginUI(result.user);
    status("authStatus", "Login berhasil!");

    // Load data
    await loadAll();
  } catch(e) {
    console.error(e);
    status("authStatus", "OTP salah atau gagal: " + (e.message || e.code));
  }

  $("verifyOtpBtn").disabled = false;
};

$("logoutBtn").onclick = async () => {
  stopCamera();

  try {
    await window.POPER.logout();
    currentUser = null;
    lastLoadedUID = "";
    loginUI(null);
  } catch(e) {
    alert(e.message);
  }
};

window.POPER.onAuth(async user => {
  currentUser = user;
  loginUI(user);

  if (user && user.uid !== lastLoadedUID && !loadingUser) {
    loadingUser = true;
    try {
      await loadAll();
      lastLoadedUID = user.uid;
    } catch(e) {
      console.error(e);
    }
    loadingUser = false;
  }
});

/* =================================
   NAVIGATION
================================= */

function openTab(tab) {
  document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
  document.querySelectorAll("[data-tab]").forEach(x => x.classList.remove("active"));

  const target = $(tab);
  if (target) target.classList.add("active");

  document.querySelectorAll(`[data-tab="${tab}"]`).forEach(x => x.classList.add("active"));
}

document.querySelectorAll("[data-tab]").forEach(btn => {
  btn.onclick = () => openTab(btn.dataset.tab);
});

/* =================================
   LOAD DATA
================================= */

async function loadAll() {
  if (!uid()) return;

  await Promise.allSettled([
    loadBio(),
    loadPages(),
    loadNotes(),
    loadQR()
  ]);

  renderBioLinks();
  renderPages();
  renderNotes();
  renderQR();
  renderBioLandingList();
}

async function loadBio() {
  const data = await window.POPER.getData(userPath("publicBio"));

  if (!data) {
    links = [];
    $("bioTitle").value = "";
    $("bioDesc").value = "";
    renderBioLinks();
    return;
  }

  $("bioTitle").value = data.title || "";
  $("bioDesc").value = data.description || "";
  links = Array.isArray(data.links) ? data.links : [];

  renderBioLinks();
}

async function loadPages() {
  const data = await window.POPER.getData(userPath("landingPages"));
  pages = data ? Object.values(data) : [];
  renderPages();
  renderBioLandingList();
}

async function loadNotes() {
  const data = await window.POPER.getData(userPath("notes"));
  notes = data ? Object.values(data) : [];
  renderNotes();
}

async function loadQR() {
  const data = await window.POPER.getData(userPath("qrVault"));
  qrItems = data ? Object.values(data) : [];
  renderQR();
}

/* =================================
   BIO LINK
================================= */

$("bioImage").onchange = async () => {
  const file = $("bioImage").files?.[0];
  if (!file) return;

  if (file.size > 1.5 * 1024 * 1024) {
    alert("Gambar maksimal 1.5 MB agar bisa disimpan.");
    $("bioImage").value = "";
    return;
  }

  bioImageData = await fileToDataURL(file);
  $("bioImagePreview").src = bioImageData;
  $("bioImagePreview").classList.remove("hidden");
};

$("clearBioImage").onclick = () => {
  bioImageData = "";
  $("bioImage").value = "";
  $("bioImagePreview").src = "";
  $("bioImagePreview").classList.add("hidden");
};

function fileToDataURL(file) {
  return new Promise((resolve,reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

$("addBioLink").onclick = () => {
  const name = $("bioName").value.trim();
  const url = $("bioUrl").value.trim();

  if (!name || !url) {
    alert("Isi nama tombol dan URL.");
    return;
  }

  links.push({
    id: Date.now().toString(),
    name,
    url,
    image: bioImageData,
    wiggle: $("bioWiggle").value === "true"
  });

  $("bioName").value = "";
  $("bioUrl").value = "";
  bioImageData = "";
  $("bioImage").value = "";
  $("bioImagePreview").src = "";
  $("bioImagePreview").classList.add("hidden");

  renderBioLinks();
};

function renderBioLinks() {
  const container = $("bioLinks");
  if (!container) return;

  container.innerHTML = "";

  links.forEach((item,index) => {
    const div = document.createElement("div");
    div.className = "bioItem";

    if (item.image) {
      const img = document.createElement("img");
      img.src = item.image;
      div.appendChild(img);
    }

    const text = document.createElement("div");
    text.className = "itemText";
    text.innerHTML = `<strong>${esc(item.name)}</strong>
      <small>${esc(item.url)}</small>
      ${item.wiggle ? "<small>✨ Animasi goyang</small>" : ""}`;

    div.appendChild(text);

    const actions = document.createElement("div");
    actions.className = "actions";

    const del = document.createElement("button");
    del.textContent = "🗑";
    del.onclick = () => {
      links.splice(index,1);
      renderBioLinks();
    };

    actions.appendChild(del);
    div.appendChild(actions);
    container.appendChild(div);
  });
}

$("saveBio").onclick = async () => {
  if (!uid()) return;

  const data = {
    title: $("bioTitle").value.trim(),
    description: $("bioDesc").value.trim(),
    links,
    phone: phone(),
    updatedAt: Date.now()
  };

  try {
    await window.POPER.saveData(userPath("publicBio"), data);

    // Public phone lookup index
    const key = phoneKey(phone());
    await window.POPER.saveData(`phoneLookup/${key}`, uid());

    status("bioStatus", "Bio berhasil disimpan!");
  } catch(e) {
    console.error(e);
    status("bioStatus", "Gagal simpan: " + e.message);
  }
};

$("openMyPublicBio").onclick = () => {
  if (!uid()) return;
  const url = location.origin + location.pathname + "?bio=" + uid();
  window.open(url,"_blank");
};

/* =================================
   LANDING PAGE
================================= */

$("pageMode").onchange = () => {
  const isHTML = $("pageMode").value === "html";
  $("htmlEditorArea").classList.toggle("hidden", !isHTML);
  $("visualEditorArea").classList.toggle("hidden", isHTML);
};

document.querySelectorAll("[data-format]").forEach(btn => {
  btn.onclick = () => {
    document.execCommand(btn.dataset.format,false,null);
    $("visualEditor").focus();
  };
});

$("previewPage").onclick = () => {
  const html = getPageContent();
  $("pagePreviewFrame").srcdoc = html;
};

function getPageContent() {
  return $("pageMode").value === "html"
    ? $("htmlEditor").value
    : $("visualEditor").innerHTML;
}

$("savePage").onclick = async () => {
  const title = $("pageTitle").value.trim();
  let slug = slugify($("pageSlug").value || title);
  const content = getPageContent();

  if (!title || !slug || !content) {
    status("pageStatus", "Isi judul dan konten halaman.");
    return;
  }

  const id = slug;

  const page = {
    id,
    title,
    slug,
    content,
    mode: $("pageMode").value,
    showInBio: $("pageShowInBio").checked,
    owner: uid(),
    updatedAt: Date.now()
  };

  try {
    await window.POPER.saveData(userPath("landingPages/" + id), page);

    // public copy
    await window.POPER.saveData("publicPages/" + slug, {
      title,
      content,
      owner: uid(),
      published: true,
      updatedAt: Date.now()
    });

    status("pageStatus", "Landing page tersimpan!");

    await loadPages();
    renderBioLandingList();
  } catch(e) {
    console.error(e);
    status("pageStatus", "Gagal menyimpan: " + e.message);
  }
};

function renderPages() {
  const box = $("pagesList");
  if (!box) return;
  box.innerHTML = "";

  pages.forEach((p,index) => {
    const div = document.createElement("div");
    div.className = "listItem";
    div.innerHTML = `
      <div style="flex:1">
        <strong>${esc(p.title)}</strong>
        <p class="muted">/${esc(p.slug)}</p>
        <small>${p.showInBio ? "Tampil di Bio" : "Halaman mandiri"}</small>
      </div>
      <div class="actions">
        <button data-open="${index}">✏️</button>
        <button data-delete="${index}">🗑</button>
        <button data-link="${index}">🔗</button>
      </div>
    `;

    div.querySelector("[data-open]").onclick = () => {
      $("pageTitle").value = p.title;
      $("pageSlug").value = p.slug;
      $("pageMode").value = p.mode || "html";
      $("pageShowInBio").checked = !!p.showInBio;

      if (p.mode === "html") {
        $("htmlEditor").value = p.content || "";
      } else {
        $("visualEditor").innerHTML = p.content || "";
      }

      $("pageMode").dispatchEvent(new Event("change"));
      openTab("pages");
    };

    div.querySelector("[data-delete]").onclick = async () => {
      if (!confirm("Hapus landing page ini?")) return;
      await window.POPER.deleteData(userPath("landingPages/" + p.id));
      await window.POPER.deleteData("publicPages/" + p.slug);
      await loadPages();
    };

    div.querySelector("[data-link]").onclick = () => {
      const url = location.origin + location.pathname + "?page=" + encodeURIComponent(p.slug);
      window.POPER.copy(url);
      alert("Link halaman disalin.");
    };

    box.appendChild(div);
  });
}

function renderBioLandingList() {
  const box = $("bioLandingList");
  if (!box) return;

  box.innerHTML = "";
  pages.filter(p => p.showInBio).forEach(p => {
    const a = document.createElement("a");
    a.className = "bioPublicLink";
    a.textContent = "📄 " + p.title;
    a.href = location.origin + location.pathname + "?page=" + encodeURIComponent(p.slug);
    a.target = "_blank";
    box.appendChild(a);
  });
}

/* =================================
   FIND BIO
================================= */

$("findBio").onclick = async () => {
  const p = $("findPhone").value.trim();
  if (!p) {
    status("findResult", "Masukkan nomor HP.");
    return;
  }

  status("findResult", "Mencari...");

  try {
    const key = phoneKey(p);
    const ownerUID = await window.POPER.getData("phoneLookup/" + key);

    if (!ownerUID) {
      status("findResult", "Bio Link tidak ditemukan.");
      return;
    }

    const data = await window.POPER.getData("users/" + ownerUID + "/publicBio");

    if (!data) {
      status("findResult", "Bio belum tersedia.");
      return;
    }

    renderFoundBio(data);
  } catch(e) {
    status("findResult", "Error: " + e.message);
  }
};

function renderFoundBio(data) {
  const box = $("findResult");
  box.innerHTML = "";

  const div = document.createElement("div");
  div.className = "card";

  let html = `<h3>${esc(data.title || "Bio Link")}</h3>
    <p>${esc(data.description || "")}</p>`;

  (data.links || []).forEach(link => {
    html += `<a class="bioPublicLink ${link.wiggle ? "wiggle" : ""}"
      href="${esc(link.url)}" target="_blank" rel="noopener">
      ${link.image ? `<img src="${link.image}">` : ""}
      ${esc(link.name)}</a>`;
  });

  div.innerHTML = html;
  box.appendChild(div);
}

$("searchScannedPhone").onclick = () => {
  const p = $("scanPhoneResult").value.trim();
  $("findPhone").value = p;
  openTab("find");
  $("findBio").click();
};

/* =================================
   PUBLIC BIO
================================= */

async function loadPublicBio() {
  const params = new URLSearchParams(location.search);
  const publicUID = params.get("bio");
  if (!publicUID) return false;

  $("mainApp").classList.add("hidden");
  $("bottomNav").classList.add("hidden");
  $("logoutBtn").classList.add("hidden");
  $("publicPageView").classList.remove("hidden");

  try {
    const data = await window.POPER.getData(`users/${publicUID}/publicBio`);
    if (!data) {
      $("publicPageError").textContent = "Bio belum ditemukan.";
      return true;
    }

    const box = $("publicPageContent");
    box.innerHTML = "";

    const bio = document.createElement("div");
    bio.className = "publicBio";

    bio.innerHTML = `<h1>${esc(data.title || "Bio Link")}</h1>
      <p>${esc(data.description || "")}</p>`;

    (data.links || []).forEach(link => {
      const a = document.createElement("a");
      a.className = "bioPublicLink" + (link.wiggle ? " wiggle" : "");
      a.href = link.url;
      a.target = "_blank";
      a.rel = "noopener";

      if (link.image) {
        const img = document.createElement("img");
        img.src = link.image;
        a.appendChild(img);
      }

      a.appendChild(document.createTextNode(link.name));
      bio.appendChild(a);
    });

    // landing page links
    const publicPages = await window.POPER.getData(`users/${publicUID}/landingPages`);

    if (publicPages) {
      Object.values(publicPages).filter(p => p.showInBio).forEach(p => {
        const a = document.createElement("a");
        a.className = "bioPublicLink";
        a.href = "?page=" + encodeURIComponent(p.slug);
        a.textContent = "📄 " + p.title;
        bio.appendChild(a);
      });
    }

    box.appendChild(bio);
  } catch(e) {
    $("publicPageError").textContent = "Gagal membuka Bio: " + e.message;
  }

  return true;
}

/* =================================
   PUBLIC LANDING PAGE
================================= */

async function loadPublicPage() {
  const params = new URLSearchParams(location.search);
  const slug = params.get("page");
  if (!slug) return false;

  $("mainApp").classList.add("hidden");
  $("bottomNav").classList.add("hidden");
  $("logoutBtn").classList.add("hidden");
  $("publicPageView").classList.remove("hidden");

  try {
    const data = await window.POPER.getData("publicPages/" + slug);
    if (!data || !data.published) {
      $("publicPageError").textContent = "Halaman tidak ditemukan.";
      return true;
    }

    $("publicPageContent").innerHTML = "";
    const frame = document.createElement("iframe");
    frame.style.width = "100%";
    frame.style.height = "85vh";
    frame.style.border = "0";
    frame.sandbox = "";
    frame.srcdoc = data.content || "";
    $("publicPageContent").appendChild(frame);
  } catch(e) {
    $("publicPageError").textContent = "Gagal membuka halaman: " + e.message;
  }

  return true;
}

$("publicBack").onclick = () => {
  location.href = location.pathname;
};

/* =================================
   QR VAULT
================================= */

$("saveQR").onclick = async () => {
  const name = $("qrName").value.trim();
  const url = $("qrUrl").value.trim();

  if (!name || !url) {
    status("qrScanStatus", "Isi nama dan URL QR.");
    return;
  }

  try {
    await window.POPER.pushData(userPath("qrVault"), {
      name,
      url,
      createdAt: Date.now()
    });

    $("qrName").value = "";
    $("qrUrl").value = "";
    await loadQR();
    status("qrScanStatus", "QR berhasil disimpan.");
  } catch(e) {
    status("qrScanStatus", e.message);
  }
};

function renderQR() {
  const box = $("qrList");
  if (!box) return;
  box.innerHTML = "";

  qrItems.forEach(q => {
    const div = document.createElement("div");
    div.className = "listItem";
    div.innerHTML = `<div style="flex:1">
      <strong>${esc(q.name)}</strong><p>${esc(q.url)}</p></div>
      <button class="btn small" data-copy>Copy</button>
      <button class="btn danger small" data-del>🗑</button>`;

    div.querySelector("[data-copy]").onclick = () => {
      window.POPER.copy(q.url);
      alert("Link disalin.");
    };

    div.querySelector("[data-del]").onclick = async () => {
      await window.POPER.deleteData(userPath("qrVault/" + q.id));
      await loadQR();
    };

    box.appendChild(div);
  });
}

/* =================================
   NOTES
================================= */

$("saveNote").onclick = async () => {
  const title = $("noteTitle").value.trim();
  const content = $("noteContent").value.trim();

  if (!title || !content) {
    alert("Isi judul dan catatan.");
    return;
  }

  try {
    await window.POPER.pushData(userPath("notes"), {
      title,
      content,
      createdAt: Date.now()
    });

    $("noteTitle").value = "";
    $("noteContent").value = "";
    await loadNotes();
  } catch(e) {
    alert(e.message);
  }
};

function renderNotes() {
  const box = $("notesList");
  if (!box) return;
  box.innerHTML = "";

  notes.forEach(n => {
    const div = document.createElement("div");
    div.className = "listItem";
    div.innerHTML = `<div style="flex:1">
      <strong>${esc(n.title)}</strong>
      <p>${esc(n.content)}</p></div>
      <button class="btn danger small" data-del>🗑</button>`;

    div.querySelector("[data-del]").onclick = async () => {
      await window.POPER.deleteData(userPath("notes/" + n.id));
      await loadNotes();
    };

    box.appendChild(div);
  });
}

/* =================================
   CAMERA SCANNER
================================= */

$("startCameraBtn").onclick = async () => {
  try {
    stopCamera();

    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false
    });

    $("cameraVideo").srcObject = cameraStream;
    $("cameraVideo").classList.remove("hidden");
    status("scanStatus", "Kamera aktif. Arahkan ke nomor HP.");
  } catch(e) {
    status("scanStatus", "Kamera gagal dibuka. Gunakan upload gambar.");
  }
};

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }

  if ($("cameraVideo")) {
    $("cameraVideo").srcObject = null;
    $("cameraVideo").classList.add("hidden");
  }
}

$("stopCameraBtn").onclick = stopCamera;

$("captureBtn").onclick = async () => {
  const video = $("cameraVideo");

  if (!cameraStream || !video.videoWidth) {
    status("scanStatus", "Buka kamera terlebih dahulu.");
    return;
  }

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  canvas.getContext("2d").drawImage(video,0,0,canvas.width,canvas.height);

  const blob = await new Promise(resolve => canvas.toBlob(resolve,"image/jpeg",0.95));
  if (blob) await performOCR(blob);
};

$("uploadScanBtn").onclick = () => {
  $("scanImageInput").click();
};

$("scanImageInput").onchange = async () => {
  const file = $("scanImageInput").files?.[0];
  if (!file) return;

  if (file.size > 15 * 1024 * 1024) {
    status("scanStatus", "Gambar terlalu besar. Maksimal 15 MB.");
    return;
  }

  await performOCR(file);
};

async function performOCR(image) {
  if (ocrBusy) return;

  if (!window.Tesseract) {
    status("scanStatus", "OCR belum termuat. Periksa koneksi internet.");
    return;
  }

  ocrBusy = true;
  $("uploadScanBtn").disabled = true;
  $("captureBtn").disabled = true;
  status("scanStatus", "🔄 Membaca gambar... Mohon tunggu.");

  try {
    const result = await Tesseract.recognize(image,"eng",{
      logger: info => {
        if (info.status === "recognizing text") {
          status("scanStatus", "OCR: " + Math.round((info.progress || 0) * 100) + "%");
        }
      }
    });

    const text = result.data.text || "";
    const detected = extractPhones(text);

    displayOCRResults(text,detected);

    if (detected.length) {
      $("scanPhoneResult").value = detected[0];
      status("scanStatus", "✅ Ditemukan " + detected.length + " nomor. Pilih nomor yang ingin dicari.");
    } else {
      status("scanStatus", "Nomor HP belum terdeteksi. Coba foto lebih dekat, lebih terang, atau crop gambar.");
    }
  } catch(e) {
    console.error(e);
    status("scanStatus", "OCR gagal: " + e.message);
  }

  ocrBusy = false;
  $("uploadScanBtn").disabled = false;
  $("captureBtn").disabled = false;
}

function extractPhones(text) {
  // Cari berbagai format nomor Indonesia
  const candidates = text.match(/(?:\+?62|0|8)[\s\-().]*[\d\s\-().]{7,18}/g) || [];
  const output = [];

  candidates.forEach(raw => {
    let n = raw.replace(/\D/g,"");

    if (n.startsWith("62")) n = "0" + n.slice(2);
    if (n.startsWith("8")) n = "0" + n;

    // Bersihkan OCR noise di ujung
    n = n.replace(/^0+/,"0");

    if (n.length >= 9 && n.length <= 15 && n.startsWith("0")) {
      if (!output.includes(n)) output.push(n);
    }
  });

  return output;
}

function displayOCRResults(text,phones) {
  const box = $("ocrResults");
  box.innerHTML = "";

  if (phones.length) {
    phones.forEach(p => {
      const btn = document.createElement("button");
      btn.className = "btn secondary full";
      btn.textContent = "📞 " + p + " — Gunakan nomor ini";
      btn.onclick = () => {
        $("scanPhoneResult").value = p;
        $("findPhone").value = p;
      };
      box.appendChild(btn);
    });
  }

  const details = document.createElement("details");
  details.innerHTML = `<summary>Hasil teks OCR</summary>
    <pre style="white-space:pre-wrap;overflow-wrap:anywhere;color:#b8c2dc"></pre>`;
  details.querySelector("pre").textContent = text;
  box.appendChild(details);
}

/* =================================
   INIT
================================= */

async function init() {
  // Public links have priority
  if (await loadPublicPage()) return;
  if (await loadPublicBio()) return;

  // Auto refresh on sign-in listener
  if (currentUser) {
    loginUI(currentUser);
    await loadAll();
  }
}

init();
