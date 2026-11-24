
import {
  auth,
  db,
  onAuthStateChanged,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  signOut,
  doc,
  getDoc,
  setDoc
} from "./firebase.js";

/* =========================
   POPER AUTH & APP
========================= */

const $ = (id) => document.getElementById(id);

let confirmationResult = null;
let recaptchaVerifier = null;
let currentUser = null;

const STORAGE_KEY = "poper_v1";

let data = {
  profile: {
    name: "",
    username: "",
    bio: "",
    phone: ""
  },
  links: [],
  pages: [],
  notes: []
};

/* LOCAL CACHE */

function loadLocalData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved) data = saved;
  } catch (e) {
    console.warn("Cache lokal tidak terbaca.");
  }
}

function saveLocalData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/* SCREEN */

function showLogin() {
  $("authScreen").hidden = false;
  $("mainApp").hidden = true;
}

function showApp() {
  $("authScreen").hidden = true;
  $("mainApp").hidden = false;
}

/* MESSAGE */

function message(text, error = true) {
  const el = $("authMessage");
  el.textContent = text;
  el.style.color = error ? "#ff8797" : "#64d9ff";
}

/* PHONE FORMAT */

function normalizePhone(raw) {
  let phone = raw.replace(/[^\d]/g, "");

  if (phone.startsWith("0")) {
    phone = "62" + phone.slice(1);
  } else if (phone.startsWith("8")) {
    phone = "62" + phone;
  } else if (!phone.startsWith("62")) {
    return null;
  }

  if (phone.length < 10 || phone.length > 15) {
    return null;
  }

  return "+" + phone;
}

/* RECAPTCHA */

function setupRecaptcha() {
  if (recaptchaVerifier) return;

  recaptchaVerifier = new RecaptchaVerifier(
    auth,
    "recaptcha-container",
    {
      size: "normal",
          callback: () => {
        console.log("reCAPTCHA berhasil");
      },
      "expired-callback": () => {
        message("Verifikasi kedaluwarsa. Silakan ulangi.");
      }
    }
  );

  recaptchaVerifier.render();
}

/* SEND OTP */

async function sendOTP() {
  const phone = normalizePhone($("phoneNumber").value);

  if (!phone) {
    message("Nomor HP tidak valid. Contoh: 81234567890");
    return;
  }

  $("sendOtpBtn").disabled = true;
  $("sendOtpBtn").textContent = "Mengirim OTP...";
  message("Menyiapkan verifikasi...", false);

  try {
    setupRecaptcha();

    confirmationResult = await signInWithPhoneNumber(
      auth,
      phone,
      recaptchaVerifier
    );

    $("phoneStep").hidden = true;
    $("otpStep").hidden = false;

    message("Kode OTP telah dikirim. Periksa SMS.", false);
  } catch (error) {
    console.error(error);
    message(getErrorMessage(error));

    if (recaptchaVerifier) {
      try {
        recaptchaVerifier.clear();
      } catch {}
      recaptchaVerifier = null;
    }
  } finally {
    $("sendOtpBtn").disabled = false;
    $("sendOtpBtn").textContent = "Kirim kode OTP";
  }
}

/* VERIFY OTP */

async function verifyOTP() {
  const code = $("otpCode").value.trim();

  if (!/^\d{6}$/.test(code)) {
    message("Masukkan OTP 6 digit.");
    return;
  }

  $("verifyOtpBtn").disabled = true;
  $("verifyOtpBtn").textContent = "Memverifikasi...";

  try {
    if (!confirmationResult) {
      message("Silakan kirim OTP terlebih dahulu.");
      return;
    }

    await confirmationResult.confirm(code);
    message("Verifikasi berhasil.", false);
  } catch (error) {
    console.error(error);
    message("OTP salah atau sudah kedaluwarsa.");
  } finally {
    $("verifyOtpBtn").disabled = false;
    $("verifyOtpBtn").textContent = "Verifikasi & Masuk";
  }
}

/* ERROR MESSAGES */

function getErrorMessage(error) {
  const code = error?.code || "";

  if (code.includes("invalid-phone-number"))
    return "Format nomor HP tidak valid.";

  if (code.includes("too-many-requests"))
    return "Terlalu banyak percobaan. Coba lagi nanti.";

  if (code.includes("captcha"))
    return "Verifikasi keamanan gagal. Muat ulang halaman.";

  if (code.includes("quota-exceeded"))
    return "Kuota SMS Firebase tercapai.";

  if (code.includes("operation-not-allowed"))
    return "Login Phone belum diaktifkan di Firebase.";

  return error?.message || "Gagal mengirim OTP.";
}

/* FIRESTORE USER */

async function loadUserData(user) {
  const userRef = doc(db, "users", user.uid);
  const snapshot = await getDoc(userRef);

  if (snapshot.exists()) {
    const remote = snapshot.data();

    data.profile = {
      ...data.profile,
      ...remote.profile,
      phone: user.phoneNumber || ""
    };

    data.links = remote.links || [];
    data.pages = remote.pages || [];
    data.notes = remote.notes || [];
  } else {
    data.profile.phone = user.phoneNumber || "";

    await setDoc(userRef, {
      uid: user.uid,
      phone: user.phoneNumber || "",
      profile: data.profile,
      links: [],
      pages: [],
      notes: [],
      createdAt: new Date().toISOString()
    });
  }

  saveLocalData();
  initApp();
}

/* SAVE TO CLOUD */

async function saveCloud() {
  if (!currentUser) return;

  try {
    await setDoc(doc(db, "users", currentUser.uid), {
      uid: currentUser.uid,
      phone: currentUser.phoneNumber || "",
      profile: data.profile,
      links: data.links,
      pages: data.pages,
      notes: data.notes,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (error) {
    console.error("Cloud save error:", error);
    alert("Gagal menyimpan ke cloud. Periksa koneksi internet.");
  }
}

async function saveAll() {
  saveLocalData();
  await saveCloud();
}

/* NAVIGATION */

function navigate(pageId) {
  document.querySelectorAll(".page").forEach(page => {
    page.classList.remove("active");
  });

  const target = $(pageId);
  if (target) target.classList.add("active");

  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.classList.remove("active");
  });

  const nav = document.querySelector(
    `.nav-item[onclick="navigate('${pageId}')"]`
  );

  if (nav) nav.classList.add("active");

  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* PROFILE */

async function saveProfile() {
  data.profile.name = $("nameInput").value.trim();
  data.profile.username = $("usernameInput").value.trim().replace(/^@/, "");
  data.profile.bio = $("bioInput").value.trim();
  data.profile.phone = currentUser?.phoneNumber || "";

  await saveAll();
  renderProfile();

  alert("Profil berhasil disimpan!");
}

function renderProfile() {
  $("nameInput").value = data.profile.name || "";
  $("usernameInput").value = data.profile.username || "";
  $("bioInput").value = data.profile.bio || "";

  $("displayNumber").textContent =
    currentUser?.phoneNumber ||
    data.profile.username ||
    data.profile.name ||
    "POPER ID";

  $("accountPhone").textContent =
    currentUser?.phoneNumber || "Nomor belum tersedia";
}

/* LINKS */

async function addLink() {
  const title = $("linkTitle").value.trim();
  let url = $("linkUrl").value.trim();

  if (!title || !url) {
    alert("Isi nama link dan URL.");
    return;
  }

  if (!/^https?:\/\//i.test(url)) url = "https://" + url;

  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      alert("URL tidak valid.");
      return;
    }
  } catch {
    alert("URL tidak valid.");
    return;
  }

  data.links.push({ id: Date.now(), title, url });

  $("linkTitle").value = "";
  $("linkUrl").value = "";

  await saveAll();
  renderLinks();
}

async function deleteLink(id) {
  data.links = data.links.filter(x => x.id !== id);
  await saveAll();
  renderLinks();
}

function renderLinks() {
  const container = $("linksList");
  container.innerHTML = "";

  data.links.forEach(link => {
    const item = document.createElement("div");
    item.className = "list-item";

    const title = document.createElement("h4");
    title.textContent = link.title;

    const anchor = document.createElement("a");
    anchor.href = link.url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.textContent = link.url;

    const remove = document.createElement("button");
    remove.className = "delete-btn";
    remove.textContent = "Hapus link";
    remove.onclick = () => deleteLink(link.id);

    item.append(title, anchor, remove);
    container.append(item);
  });
}

/* PAGES */

async function addPage() {
  const title = $("pageTitle").value.trim();
  const description = $("pageDescription").value.trim();

  if (!title || !description) {
    alert("Isi judul dan konten halaman.");
    return;
  }

  data.pages.push({ id: Date.now(), title, description });

  $("pageTitle").value = "";
  $("pageDescription").value = "";

  await saveAll();
  renderPages();
}

async function deletePage(id) {
  data.pages = data.pages.filter(x => x.id !== id);
  await saveAll();
  renderPages();
}

function renderPages() {
  const container = $("pagesList");
  container.innerHTML = "";

  data.pages.forEach(page => {
    const item = document.createElement("div");
    item.className = "list-item";

    const title = document.createElement("h4");
    title.textContent = page.title;

    const description = document.createElement("p");
    description.textContent = page.description;

    const remove = document.createElement("button");
    remove.className = "delete-btn";
    remove.textContent = "Hapus halaman";
    remove.onclick = () => deletePage(page.id);

    item.append(title, description, remove);
    container.append(item);
  });
}

/* NOTES */

async function addNote() {
  const title = $("noteTitle").value.trim();
  const content = $("noteContent").value.trim();

  if (!title || !content) {
    alert("Isi judul dan catatan.");
    return;
  }

  data.notes.push({
    id: Date.now(),
    title,
    content,
    date: new Date().toLocaleDateString("id-ID")
  });

  $("noteTitle").value = "";
  $("noteContent").value = "";

  await saveAll();
  renderNotes();
}

async function deleteNote(id) {
  data.notes = data.notes.filter(x => x.id !== id);
  await saveAll();
  renderNotes();
}

function renderNotes() {
  const container = $("notesList");
  container.innerHTML = "";

  data.notes.forEach(note => {
    const item = document.createElement("div");
    item.className = "list-item";

    const title = document.createElement("h4");
    title.textContent = note.title;

    const date = document.createElement("p");
    date.textContent = note.date || "";

    const content = document.createElement("p");
    content.textContent = note.content;

    const remove = document.createElement("button");
    remove.className = "delete-btn";
    remove.textContent = "Hapus catatan";
    remove.onclick = () => deleteNote(note.id);

    item.append(title, date, content, remove);
    container.append(item);
  });
}

/* LOGOUT */

async function logout() {
  try {
    await signOut(auth);
  } catch (error) {
    alert("Gagal logout.");
    console.error(error);
  }
}

/* INIT */

function initApp() {
  renderProfile();
  renderLinks();
  renderPages();
  renderNotes();
}

/* BUTTON EVENTS */

$("sendOtpBtn").addEventListener("click", sendOTP);
$("verifyOtpBtn").addEventListener("click", verifyOTP);

$("backPhoneBtn").addEventListener("click", () => {
  $("otpStep").hidden = true;
  $("phoneStep").hidden = false;
  $("otpCode").value = "";
  message("");
});

$("logoutBtn").addEventListener("click", logout);

$("profileBtn").addEventListener("click", () => navigate("profile"));

/* FIREBASE AUTH STATE */

loadLocalData();
showLogin();

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    showApp();

    try {
      await loadUserData(user);
    } catch (error) {
      console.error(error);
      alert("Gagal memuat data akun. Periksa koneksi.");
    }
  } else {
    currentUser = null;
    showLogin();
  }
});

/* GLOBAL FUNCTIONS FOR HTML BUTTONS */

window.navigate = navigate;
window.saveProfile = saveProfile;
window.addLink = addLink;
window.deleteLink = deleteLink;
window.addPage = addPage;
window.deletePage = deletePage;
window.addNote = addNote;
window.deleteNote = deleteNote;
