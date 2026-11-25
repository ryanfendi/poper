
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";

import {
  getAuth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

import {
  getDatabase,
  ref,
  get,
  set,
  update,
  remove,
  push
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js";

/* =========================================
   FIREBASE CONFIG
========================================= */

const firebaseConfig = {
  apiKey: "AIzaSyD4eRul_asozC7eT15z2tcMaRO-gNJ7Us8",
  authDomain: "poperweb.firebaseapp.com",
  databaseURL: "https://poperweb-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "poperweb",
  storageBucket: "poperweb.firebasestorage.app",
  messagingSenderId: "91901111544",
  appId: "1:91901111544:web:a2f1c0a418e16f6ee45f0d"
};

/* =========================================
   INITIALIZE FIREBASE
========================================= */

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

/* =========================================
   RECAPTCHA MANAGEMENT
========================================= */

let recaptchaVerifier = null;
let recaptchaPromise = null;

/**
 * Menghapus reCAPTCHA lama.
 */
function resetRecaptcha() {
  try {
    if (recaptchaVerifier) {
      recaptchaVerifier.clear();
    }
  } catch (error) {
    console.warn("Reset reCAPTCHA:", error);
  }

  recaptchaVerifier = null;
  recaptchaPromise = null;

  const container = document.getElementById("recaptcha-container");

  if (container) {
    container.innerHTML = "";
  }
}

/**
 * Membuat reCAPTCHA baru.
 */
async function setupRecaptcha() {
  if (recaptchaVerifier) {
    return recaptchaVerifier;
  }

  const container = document.getElementById("recaptcha-container");

  if (!container) {
    throw new Error(
      "Elemen #recaptcha-container tidak ditemukan di index.html"
    );
  }

  if (recaptchaPromise) {
    return recaptchaPromise;
  }

  container.innerHTML = "";

  recaptchaPromise = Promise.resolve().then(() => {
    const verifier = new RecaptchaVerifier(auth, container, {
      size: "normal",

      callback: () => {
        console.log("reCAPTCHA berhasil diverifikasi.");
      },

      "expired-callback": () => {
        console.warn("reCAPTCHA kedaluwarsa.");

        recaptchaVerifier = null;
        recaptchaPromise = null;
      }
    });

    recaptchaVerifier = verifier;
    return verifier;
  });

  try {
    return await recaptchaPromise;
  } catch (error) {
    recaptchaVerifier = null;
    recaptchaPromise = null;
    throw error;
  }
}

/* =========================================
   PHONE NUMBER NORMALIZATION
========================================= */

/**
 * Mengubah nomor Indonesia ke format +62.
 *
 * Contoh:
 * 08123456789   -> +628123456789
 * 8123456789    -> +628123456789
 * 628123456789  -> +628123456789
 * +628123456789 -> +628123456789
 */
function normalizePhone(phone) {
  let p = String(phone ?? "").trim();

  // Hilangkan spasi, dash, kurung, dll.
  p = p.replace(/[^\d+]/g, "");

  // Hilangkan tanda + jika berada di awal.
  if (p.startsWith("+")) {
    p = p.slice(1);
  }

  // Hilangkan leading zero Indonesia.
  if (p.startsWith("0")) {
    p = "62" + p.slice(1);
  }

  // Nomor yang dimasukkan dimulai dengan 8.
  else if (p.startsWith("8")) {
    p = "62" + p;
  }

  // Pastikan tidak ada prefix 62 ganda.
  if (p.startsWith("6262")) {
    p = p.slice(2);
  }

  return "+" + p;
}

/**
 * Validasi nomor HP.
 * Mendukung format Indonesia (+62).
 */
function isValidPhone(phone) {
  const normalized = normalizePhone(phone);

  // +62 diikuti nomor seluler Indonesia,
  // panjang total 10-15 digit.
  return /^\+62\d{8,13}$/.test(normalized);
}

/* =========================================
   AUTH: SEND OTP
========================================= */

async function sendOTP(phone) {
  if (!isValidPhone(phone)) {
    throw new Error(
      "Nomor HP tidak valid. Masukkan nomor Indonesia, misalnya 08123456789."
    );
  }

  const normalizedPhone = normalizePhone(phone);

  // Pastikan verifier tersedia.
  const verifier = await setupRecaptcha();

  try {
    const confirmation = await signInWithPhoneNumber(
      auth,
      normalizedPhone,
      verifier
    );

    return confirmation;
  } catch (error) {
    // Reset reCAPTCHA jika terjadi kegagalan.
    resetRecaptcha();

    throw error;
  }
}

/* =========================================
   AUTH: LISTENER
========================================= */

function listenAuth(callback) {
  if (typeof callback !== "function") {
    throw new Error("Callback onAuth harus berupa function.");
  }

  return onAuthStateChanged(auth, callback);
}

/* =========================================
   DATABASE HELPERS
========================================= */

/**
 * Validasi path Firebase.
 */
function validatePath(path) {
  if (typeof path !== "string" || !path.trim()) {
    throw new Error("Database path tidak valid.");
  }

  if (path.includes("[object Object]")) {
    throw new Error("Database path mengandung UID tidak valid.");
  }

  return path.trim().replace(/^\/+|\/+$/g, "");
}

/**
 * Simpan data (overwrite).
 */
async function saveData(path, data) {
  const safePath = validatePath(path);
  await set(ref(db, safePath), data);
  return true;
}

/**
 * Ambil data.
 */
async function getData(path) {
  const safePath = validatePath(path);
  const snapshot = await get(ref(db, safePath));

  return snapshot.exists() ? snapshot.val() : null;
}

/**
 * Update sebagian data.
 */
async function updateData(path, data) {
  const safePath = validatePath(path);
  await update(ref(db, safePath), data);
  return true;
}

/**
 * Hapus data.
 */
async function deleteData(path) {
  const safePath = validatePath(path);
  await remove(ref(db, safePath));
  return true;
}

/**
 * Tambahkan data baru dengan push ID.
 */
async function pushData(path, data) {
  const safePath = validatePath(path);
  const newRef = push(ref(db, safePath));

  await set(newRef, data);

  return newRef.key;
}

/* =========================================
   CURRENT USER
========================================= */

/**
 * Firebase user asli.
 * user.uid selalu string.
 */
function getCurrentUser() {
  const user = auth.currentUser;

  if (!user || typeof user.uid !== "string") {
    return null;
  }

  return user;
}

/**
 * Mengambil UID saja.
 */
function getUID() {
  return getCurrentUser()?.uid || null;
}

/* =========================================
   GLOBAL POPER API
========================================= */

window.POPER = {
  app,
  auth,
  db,

  // Phone
  normalizePhone,
  isValidPhone,

  // OTP
  setupRecaptcha,
  resetRecaptcha,
  sendOTP,

  // Authentication
  onAuth: listenAuth,
  logout: () => signOut(auth),

  // User
  get currentUser() {
    return getCurrentUser();
  },

  get uid() {
    return getUID();
  },

  // Database
  saveData,
  getData,
  updateData,
  deleteData,
  pushData
};

console.log("🔥 POPER Firebase berhasil diinisialisasi.");
