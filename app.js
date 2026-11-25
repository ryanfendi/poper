
import "./firebase.js";

const $ = id => document.getElementById(id);

const auth = window.POPER.auth;

let confirmation = null;
let links = [];

/* =========================
   UTILITIES
========================= */

function phoneKey(phone) {
  return window.POPER.normalizePhone(phone).replace(/\D/g, "");
}

function status(id, message) {
  const el = $(id);
  if (el) el.textContent = message;
}

function safeURL(value) {
  try {
    const url = new URL(value.trim());
    if (["http:", "https:"].includes(url.protocol)) {
      return url.href;
    }
    return null;
  } catch {
    return null;
  }
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

function currentUID() {
  return auth.currentUser?.uid;
}

/* =========================
   LOGIN OTP
========================= */

function loginUI(user) {
  $("loginPanel").hidden = !!user;
  $("dashboard").hidden = !user;
  $("logoutBtn").hidden = !user;

  if (user) {
    $("myPhone").textContent = user.phoneNumber || "";
    $("welcome").textContent = "Selamat datang di POPER";
    loadAll();
  }
}

$("sendOtpBtn").onclick = async () => {
  try {
    const phone = $("phoneInput").value.trim();

    if (!phone) {
      status("authStatus", "Masukkan nomor HP.");
      return;
    }

    $("sendOtpBtn").disabled = true;

    confirmation = await window.POPER.sendOTP(phone);

    $("otpSection").hidden = false;
    status("authStatus", "OTP terkirim. Periksa SMS.");

  } catch (error) {
    status("authStatus", error.message);
    await window.POPER.resetRecaptcha();

  } finally {
    $("sendOtpBtn").disabled = false;
  }
};

$("verifyOtpBtn").onclick = async () => {
  try {
    if (!confirmation) {
      throw new Error("Kirim OTP terlebih dahulu.");
    }

    const code = $("otpInput").value.trim();

    if (!/^\d{6}$/.test(code)) {
      throw new Error("OTP harus 6 digit.");
    }

    $("verifyOtpBtn").disabled = true;

    const result = await confirmation.confirm(code);

    confirmation = null;
    loginUI(result.user);

  } catch (error) {
    status("authStatus", error.message || "Verifikasi gagal.");

  } finally {
    $("verifyOtpBtn").disabled = false;
  }
};

$("logoutBtn").onclick = async () => {
  await window.POPER.logout();
};

/* =========================
   NAVIGATION
========================= */

document.querySelectorAll(".tab").forEach(button => {
  button.onclick = () => {
    document.querySelectorAll(".tab")
      .forEach(item => item.classList.remove("active"));

    document.querySelectorAll(".section")
      .forEach(item => item.classList.remove("active"));

    button.classList.add("active");
    $(button.dataset.tab).classList.add("active");
  };
});

/* =========================
   BIO LINKS
========================= */

$("addBioLink").onclick = () => {
  const title = $("bioTitle").value.trim();
  const url = safeURL($("bioUrl").value);

  if (!title || !url) {
    alert("Isi judul dan URL yang valid.");
    return;
  }

  links.push({ title, url });

  $("bioTitle").value = "";
  $("bioUrl").value = "";

  renderLinks();
};

function renderLinks() {
  $("bioLinks").innerHTML = links.map((link, index) => `
    <div class="item">
      <b>${escapeHTML(link.title)}</b>
      <p>
        <a href="${escapeHTML(link.url)}"
           target="_blank"
           rel="noopener noreferrer">
          ${escapeHTML(link.url)}
        </a>
      </p>
      <button class="secondary"
              data-del-link="${index}">
        Hapus
      </button>
    </div>
  `).join("");

  $("bioLinks").querySelectorAll("[data-del-link]")
    .forEach(button => {
      button.onclick = () => {
        links.splice(Number(button.dataset.delLink), 1);
        renderLinks();
      };
    });
}

$("saveBio").onclick = async () => {
  const user = auth.currentUser;
  if (!user) return alert("Login dahulu.");

  try {
    const profile = {
      name: $("bioName").value.trim(),
      description: $("bioDesc").value.trim(),
      phone: user.phoneNumber,
      links,
      updatedAt: Date.now()
    };

    await window.POPER.saveData(
      `users/${user.uid}/publicBio`,
      profile
    );

    await window.POPER.saveData(
      `phoneLookup/${phoneKey(user.phoneNumber)}`,
      {
        uid: user.uid,
        phone: user.phoneNumber
      }
    );

    status("bioStatus", "Bio berhasil disimpan online!");

  } catch (error) {
    status("bioStatus", "Gagal: " + error.message);
  }
};

async function loadBio() {
  const uid = currentUID();
  if (!uid) return;

  const profile = await window.POPER.getData(
    `users/${uid}/publicBio`
  );

  if (!profile) return;

  $("bioName").value = profile.name || "";
  $("bioDesc").value = profile.description || "";

  links = Array.isArray(profile.links) ? profile.links : [];

  renderLinks();
}

/* =========================
   QR VAULT
========================= */


/* =========================================
   POPER QR VAULT - IMAGE SCAN + CAMERA
========================================= */

const qrNameInput = document.getElementById("qrName");
const qrUrlInput = document.getElementById("qrUrl");
const qrImageInput = document.getElementById("qrImageInput");
const qrPreview = document.getElementById("qrPreview");
const qrResultBox = document.getElementById("qrResultBox");
const qrList = document.getElementById("qrList");
const qrScanStatus = document.getElementById("qrScanStatus");

const qrVideo = document.getElementById("qrVideo");
const qrCameraBox = document.getElementById("qrCameraBox");

let scannedQRValue = "";
let cameraStream = null;
let cameraActive = false;
let cameraFrame = null;

/* STATUS */

function qrStatus(message) {
  if (qrScanStatus) {
    qrScanStatus.textContent = message;
  }
}

/* NORMALIZE QR CONTENT TO URL */

function qrToURL(value) {
  value = String(value || "").trim();

  // URL sudah lengkap
  try {
    const url = new URL(value);

    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.href;
    }
  } catch {}

  // URL tanpa https://
  if (/^(www\.)?[a-z0-9-]+\.[a-z]{2,}/i.test(value)) {
    try {
      return new URL("https://" + value).href;
    } catch {}
  }

  // QR bukan URL web
  return null;
}

/* IMAGE QR DECODER */

async function decodeQRImage(file) {
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    qrStatus("File harus berupa gambar.");
    return;
  }

  qrStatus("Membaca gambar QR...");

  const image = new Image();
  const imageURL = URL.createObjectURL(file);

  image.onload = () => {
    try {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", {
        willReadFrequently: true
      });

      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;

      context.drawImage(image, 0, 0);

      const imageData = context.getImageData(
        0, 0, canvas.width, canvas.height
      );

      if (!window.jsQR) {
        qrStatus("Library QR belum berhasil dimuat. Refresh halaman.");
        return;
      }

      const result = window.jsQR(
        imageData.data,
        imageData.width,
        imageData.height,
        {
          inversionAttempts: "attemptBoth"
        }
      );

      if (!result) {
        qrStatus("QR tidak ditemukan. Coba gambar yang lebih jelas.");
        qrResultBox.hidden = true;
        return;
      }

      processQRResult(result.data, file.name);

    } catch (error) {
      console.error(error);
      qrStatus("Gagal membaca gambar QR.");
    } finally {
      URL.revokeObjectURL(imageURL);
    }
  };

  image.onerror = () => {
    URL.revokeObjectURL(imageURL);
    qrStatus("Gambar tidak dapat dibuka.");
  };

  image.src = imageURL;
}

/* PROCESS RESULT */

function processQRResult(value, filename = "") {
  scannedQRValue = String(value || "").trim();

  if (!scannedQRValue) {
    qrStatus("QR kosong.");
    return;
  }

  const url = qrToURL(scannedQRValue);

  qrResultBox.hidden = false;
  qrUrlInput.value = url || scannedQRValue;

  if (!qrNameInput.value.trim()) {
    qrNameInput.value = filename
      ? filename.replace(/\.[^.]+$/, "")
      : url
        ? new URL(url).hostname
        : "QR Tersimpan";
  }

  if (url) {
    qrStatus("QR berhasil dibaca! Link siap disimpan.");
  } else {
    qrStatus(
      "QR berhasil dibaca, tetapi isinya bukan URL web. " +
      "Data tampil untuk disimpan, namun tidak bisa menjadi tombol buka website."
    );
  }
}

/* UPLOAD IMAGE */

qrImageInput?.addEventListener("change", async () => {
  const file = qrImageInput.files?.[0];

  if (!file) return;

  qrPreview.innerHTML = "";

  const previewURL = URL.createObjectURL(file);
  const img = document.createElement("img");

  img.src = previewURL;
  img.alt = "Preview QR";
  qrPreview.appendChild(img);

  await decodeQRImage(file);

  // Preview URL dipertahankan selama gambar tampil
  img.onload = () => {};
});

/* SAVE QR LINK */

document.getElementById("saveQR")?.addEventListener("click", async () => {
  const uid = currentUID();

  if (!uid) {
    alert("Login terlebih dahulu.");
    return;
  }

  const name = qrNameInput.value.trim();
  const value = qrUrlInput.value.trim();
  const url = qrToURL(value);

  if (!name || !value) {
    alert("Nama dan hasil QR harus diisi.");
    return;
  }

  if (!url) {
    alert(
      "QR ini bukan link website HTTP/HTTPS. " +
      "Silakan scan QR yang berisi link website untuk membuat tombol buka."
    );
    return;
  }

  try {
    const saveButton = document.getElementById("saveQR");
    saveButton.disabled = true;
    saveButton.textContent = "Menyimpan...";

    await window.POPER.pushData(`qrVault/${uid}`, {
      name,
      value: url,
      type: "website",
      originalQR: scannedQRValue,
      createdAt: Date.now()
    });

    qrNameInput.value = "";
    qrUrlInput.value = "";
    qrImageInput.value = "";
    qrPreview.innerHTML = "";
    qrResultBox.hidden = true;
    scannedQRValue = "";

    qrStatus("Link berhasil disimpan ke Vault!");

    await loadQR();

  } catch (error) {
    console.error(error);
    qrStatus("Gagal menyimpan link: " + error.message);

  } finally {
    const saveButton = document.getElementById("saveQR");
    saveButton.disabled = false;
    saveButton.textContent = "💾 Simpan Link ke Vault";
  }
});

/* LOAD SAVED LINKS */

async function loadQR() {
  const uid = currentUID();
  if (!uid) return;

  const data = await window.POPER.getData(`qrVault/${uid}`);

  qrList.innerHTML = "";

  if (!data || Object.keys(data).length === 0) {
    qrList.innerHTML = `
      <div class="qr-empty">
        <p>Belum ada link tersimpan.</p>
      </div>
    `;
    return;
  }

  Object.entries(data).reverse().forEach(([id, item]) => {
    const url = qrToURL(item.value);

    const card = document.createElement("div");
    card.className = "qr-link-card";

    const title = document.createElement("strong");
    title.textContent = item.name || "Link tersimpan";

    const meta = document.createElement("div");
    meta.className = "qr-link-meta";
    meta.textContent = url || item.value || "";

    card.appendChild(title);
    card.appendChild(meta);

    // OPEN LINK BUTTON
    if (url) {
      const openButton = document.createElement("a");

      openButton.className = "qr-link-button";
      openButton.textContent = "🔗 Buka " + (item.name || "Link");
      openButton.href = url;
      openButton.target = "_blank";
      openButton.rel = "noopener noreferrer";

      card.appendChild(openButton);
    }

    // COPY BUTTON
    const copyButton = document.createElement("button");
    copyButton.className = "secondary";
    copyButton.textContent = "Salin Link";

    copyButton.onclick = async () => {
      try {
        await navigator.clipboard.writeText(item.value);
        alert("Link disalin!");
      } catch {
        prompt("Salin link:", item.value);
      }
    };

    card.appendChild(copyButton);

    // ADD TO BIO
    const bioButton = document.createElement("button");
    bioButton.className = "secondary";
    bioButton.textContent = "+ Tambahkan ke Bio";

    bioButton.onclick = () => {
      if (!url) {
        alert("Data ini bukan URL website.");
        return;
      }

      if (links.some(link => link.url === url)) {
        alert("Link sudah ada di Bio.");
        return;
      }

      links.push({
        title: item.name || "Link",
        url
      });

      renderLinks();

      alert("Link masuk ke daftar Bio. Tekan Simpan Bio Online.");
    };

    card.appendChild(bioButton);

    // DELETE
    const deleteButton = document.createElement("button");
    deleteButton.className = "qr-delete-button";
    deleteButton.textContent = "Hapus";

    deleteButton.onclick = async () => {
      if (!confirm("Hapus link ini dari QR Vault?")) return;

      await window.POPER.deleteData(`qrVault/${uid}/${id}`);
      await loadQR();
    };

    card.appendChild(deleteButton);

    qrList.appendChild(card);
  });
}

/* =========================================
   CAMERA QR SCANNER
========================================= */

document.getElementById("startQRScanner")?.addEventListener("click", async () => {
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" }
      },
      audio: false
    });

    qrVideo.srcObject = cameraStream;
    qrCameraBox.hidden = false;
    cameraActive = true;

    qrStatus("Arahkan kamera ke QR Code...");
    scanCameraFrame();

  } catch (error) {
    console.error(error);
    qrStatus("Kamera tidak dapat dibuka. Periksa izin kamera dan HTTPS.");
  }
});

function scanCameraFrame() {
  if (!cameraActive) return;

  if (qrVideo.readyState >= 2 && window.jsQR) {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", {
      willReadFrequently: true
    });

    canvas.width = qrVideo.videoWidth;
    canvas.height = qrVideo.videoHeight;

    if (canvas.width && canvas.height) {
      context.drawImage(qrVideo, 0, 0, canvas.width, canvas.height);

      const imageData = context.getImageData(
        0, 0, canvas.width, canvas.height
      );

      const result = window.jsQR(
        imageData.data,
        imageData.width,
        imageData.height,
        { inversionAttempts: "attemptBoth" }
      );

      if (result) {
        processQRResult(result.data);
        stopCameraScanner();
        return;
      }
    }
  }

  cameraFrame = requestAnimationFrame(scanCameraFrame);
}

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

  if (qrVideo) {
    qrVideo.srcObject = null;
  }

  if (qrCameraBox) {
    qrCameraBox.hidden = true;
  }
}

document.getElementById("stopQRScanner")?.addEventListener("click", () => {
  stopCameraScanner();
  qrStatus("Kamera ditutup.");
});


/* =========================
   NOTES
========================= */

$("saveNote").onclick = async () => {
  const uid = currentUID();
  if (!uid) return alert("Login dahulu.");

  const title = $("noteTitle").value.trim();
  const content = $("noteContent").value.trim();

  if (!title || !content) {
    alert("Isi judul dan catatan.");
    return;
  }

  try {
    await window.POPER.pushData(`notes/${uid}`, {
      title,
      content,
      createdAt: Date.now()
    });

    $("noteTitle").value = "";
    $("noteContent").value = "";

    await loadNotes();

  } catch (error) {
    alert("Gagal menyimpan: " + error.message);
  }
};

async function loadNotes() {
  const uid = currentUID();
  if (!uid) return;

  const data = await window.POPER.getData(`notes/${uid}`);
  const container = $("notesList");

  container.innerHTML = "";

  if (!data) return;

  Object.entries(data).reverse().forEach(([id, note]) => {
    const card = document.createElement("div");
    card.className = "item";

    card.innerHTML = `
      <b>${escapeHTML(note.title)}</b>
      <p>${escapeHTML(note.content)}</p>
      <button class="secondary danger">Hapus</button>
    `;

    card.querySelector("button").onclick = async () => {
      if (!confirm("Hapus catatan ini?")) return;

      await window.POPER.deleteData(`notes/${uid}/${id}`);
      loadNotes();
    };

    container.appendChild(card);
  });
}

/* =========================
   FIND BIO BY PHONE
========================= */

$("findBio").onclick = async () => {
  const phone = $("findPhone").value.trim();
  if (!phone) return alert("Masukkan nomor HP.");

  const result = $("findResult");
  result.textContent = "Mencari Bio...";

  try {
    const lookup = await window.POPER.getData(
      `phoneLookup/${phoneKey(phone)}`
    );

    if (!lookup) {
      result.textContent = "Bio tidak ditemukan.";
      return;
    }

    const profile = await window.POPER.getData(
      `users/${lookup.uid}/publicBio`
    );

    if (!profile) {
      result.textContent = "Profil tidak tersedia.";
      return;
    }

    result.innerHTML = `
      <div class="item">
        <div class="avatar">👤</div>
        <h2>${escapeHTML(profile.name || "POPER User")}</h2>
        <p>${escapeHTML(profile.description || "")}</p>
        <small>${escapeHTML(profile.phone || "")}</small>
        ${(profile.links || []).map(link => `
          <p>
            <a href="${escapeHTML(link.url)}"
               target="_blank"
               rel="noopener noreferrer">
              ${escapeHTML(link.title)}
            </a>
          </p>
        `).join("")}
      </div>
    `;

  } catch (error) {
    result.textContent = "Gagal mencari: " + error.message;
  }
};

/* =========================
   LOAD
========================= */

async function loadAll() {
  await Promise.all([
    loadBio(),
    loadQR(),
    loadNotes()
  ]);
}

window.POPER.onAuth(user => {
  loginUI(user);
});

console.log("POPER QR Vault v2 siap.");


document.getElementById("openPublicBio")?.addEventListener("click", () => {
  const user = window.POPER.auth.currentUser;

  if (!user || !user.phoneNumber) {
    alert("Login terlebih dahulu.");
    return;
  }

  const phone = encodeURIComponent(user.phoneNumber);

  window.open(
    `bio.html?phone=${phone}`,
    "_blank"
  );
});
