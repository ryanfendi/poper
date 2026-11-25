
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

const QR_TYPES = {
  qris: "QRIS / Pembayaran",
  website: "Website / Link",
  wifi: "WiFi",
  text: "Teks / QR lainnya"
};

$("saveQR").onclick = async () => {
  const uid = currentUID();
  if (!uid) return alert("Login dahulu.");

  const name = $("qrName").value.trim();
  const value = $("qrUrl").value.trim();
  const type = $("qrType").value;

  if (!name || !value) {
    alert("Isi nama dan data QR terlebih dahulu.");
    return;
  }

  try {
    $("saveQR").disabled = true;

    await window.POPER.pushData(`qrVault/${uid}`, {
      name,
      value,
      type,
      createdAt: Date.now()
    });

    $("qrName").value = "";
    $("qrUrl").value = "";

    await loadQR();

    alert("Berhasil disimpan ke QR Vault!");

  } catch (error) {
    alert("Gagal menyimpan: " + error.message);

  } finally {
    $("saveQR").disabled = false;
  }
};

async function loadQR() {
  const uid = currentUID();
  if (!uid) return;

  const data = await window.POPER.getData(`qrVault/${uid}`);
  const container = $("qrList");

  container.innerHTML = "";

  if (!data || Object.keys(data).length === 0) {
    container.innerHTML = `
      <div class="qr-empty">
        <div style="font-size:35px">🗂️</div>
        <p>Vault masih kosong.</p>
        <small>Simpan QRIS, link, WiFi atau data QR di sini.</small>
      </div>
    `;
    return;
  }

  Object.entries(data).reverse().forEach(([id, item]) => {
    const card = document.createElement("div");
    card.className = "qr-card";

    const typeLabel = QR_TYPES[item.type] || "Data QR";
    const validURL = safeURL(item.value);

    card.innerHTML = `
      <div class="qr-card-title">${escapeHTML(item.name)}</div>
      <span class="qr-badge">${escapeHTML(typeLabel)}</span>
      <div class="qr-data">${escapeHTML(item.value)}</div>

      <div class="qr-actions">
        <button class="secondary" data-copy>Salin</button>
        ${validURL ? `<button class="secondary" data-open>Buka</button>` : ""}
        <button class="secondary" data-addbio>+ Bio</button>
        <button class="secondary danger" data-delete>Hapus</button>
      </div>
    `;

    // COPY
    card.querySelector("[data-copy]").onclick = async () => {
      try {
        await navigator.clipboard.writeText(item.value);
        alert("Data berhasil disalin!");
      } catch {
        prompt("Salin data berikut:", item.value);
      }
    };

    // OPEN URL (only valid http/https)
    const openButton = card.querySelector("[data-open]");
    if (openButton && validURL) {
      openButton.onclick = () => {
        window.open(validURL, "_blank", "noopener,noreferrer");
      };
    }

    // ADD TO BIO
    card.querySelector("[data-addbio]").onclick = () => {
      const url = safeURL(item.value);

      if (!url) {
        alert(
          "Data ini bukan URL website. " +
          "Data QR tetap tersimpan di Vault, " +
          "tetapi tidak bisa dijadikan link Bio secara langsung."
        );
        return;
      }

      const alreadyExists = links.some(link => link.url === url);

      if (alreadyExists) {
        alert("Link tersebut sudah ada di Bio.");
        return;
      }

      links.push({
        title: item.name,
        url
      });

      renderLinks();

      alert("Ditambahkan ke Bio. Tekan Simpan Bio Online untuk menyimpan perubahan.");
    };

    // DELETE
    card.querySelector("[data-delete]").onclick = async () => {
      if (!confirm(`Hapus "${item.name}" dari Vault?`)) return;

      try {
        await window.POPER.deleteData(`qrVault/${uid}/${id}`);
        await loadQR();
      } catch (error) {
        alert("Gagal menghapus: " + error.message);
      }
    };

    container.appendChild(card);
  });
}

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
