
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";

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

/* =========================
   FIREBASE CONFIG
========================= */

const firebaseConfig = {
  apiKey: "AIzaSyD4eRul_asozC7eT15z2tcMaRO-gNJ7Us8",
  authDomain: "poperweb.firebaseapp.com",
  databaseURL: "https://poperweb-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "poperweb",
  storageBucket: "poperweb.firebasestorage.app",
  messagingSenderId: "91901111544",
  appId: "1:91901111544:web:a2f1c0a418e16f6ee45f0d"
};

/* =========================
   INITIALIZE
========================= */

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

let recaptchaVerifier = null;
let confirmationResult = null;

/* =========================
   PHONE
========================= */

function normalizePhone(phone) {
  let p = String(phone || "").trim().replace(/[^\d]/g, "");

  if (p.startsWith("0")) {
    p = "62" + p.slice(1);
  } else if (p.startsWith("8")) {
    p = "62" + p;
  } else if (!p.startsWith("62")) {
    p = "62" + p;
  }

  return "+" + p;
}

function validPhone(phone) {
  const p = normalizePhone(phone);
  return /^\+62\d{8,13}$/.test(p);
}

/* =========================
   RECAPTCHA
========================= */

function resetRecaptcha() {
  try {
    if (recaptchaVerifier) {
      recaptchaVerifier.clear();
    }
  } catch (e) {
    console.warn("Reset reCAPTCHA:", e);
  }

  recaptchaVerifier = null;

  const container = document.getElementById("recaptcha-container");
  if (container) container.innerHTML = "";
}

function setupRecaptcha() {
  if (recaptchaVerifier) return recaptchaVerifier;

  const container = document.getElementById("recaptcha-container");

  if (!container) {
    throw new Error("Elemen recaptcha-container tidak ditemukan.");
  }

  recaptchaVerifier = new RecaptchaVerifier(auth, container, {
    size: "normal",
    callback: () => console.log("reCAPTCHA verified"),
    "expired-callback": () => {
      console.warn("reCAPTCHA expired");
    }
  });

  return recaptchaVerifier;
}

/* =========================
   OTP
========================= */

async function sendOTP(phone) {
  const normalized = normalizePhone(phone);

  if (!validPhone(normalized)) {
    throw new Error("Format nomor HP tidak valid.");
  }

  const verifier = setupRecaptcha();

  confirmationResult = await signInWithPhoneNumber(
    auth,
    normalized,
    verifier
  );

  return confirmationResult;
}

async function verifyOTP(code) {
  if (!confirmationResult) {
    throw new Error("Silakan kirim OTP terlebih dahulu.");
  }

  const otp = String(code || "").trim();

  if (!/^\d{6}$/.test(otp)) {
    throw new Error("Masukkan kode OTP 6 digit.");
  }

  const result = await confirmationResult.confirm(otp);
  confirmationResult = null;
  return result;
}

async function logout() {
  confirmationResult = null;
  resetRecaptcha();
  return signOut(auth);
}

/* =========================
   AUTH
========================= */

function listenAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

/* =========================
   DATABASE HELPERS
========================= */

async function saveData(path, data) {
  return set(ref(db, path), data);
}

async function getData(path) {
  const snapshot = await get(ref(db, path));
  return snapshot.exists() ? snapshot.val() : null;
}

async function updateData(path, data) {
  return update(ref(db, path), data);
}

async function deleteData(path) {
  return remove(ref(db, path));
}

async function pushData(path, data) {
  const newRef = push(ref(db, path));
  await set(newRef, data);
  return newRef.key;
}

/* =========================
   GLOBAL POPER API
========================= */

window.POPER = {
  app,
  auth,
  db,

  normalizePhone,
  validPhone,

  setupRecaptcha,
  resetRecaptcha,

  sendOTP,
  verifyOTP,
  logout,
  onAuth: listenAuth,

  saveData,
  getData,
  updateData,
  deleteData,
  pushData,

  get currentUser() {
    return auth.currentUser;
  }
};

console.log("POPER Firebase initialized");
