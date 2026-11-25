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

const firebaseConfig = {
  apiKey: "AIzaSyD4eRul_asozC7eT15z2tcMaRO-gNJ7Us8",
  authDomain: "poperweb.firebaseapp.com",
  databaseURL: "https://poperweb-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "poperweb",
  storageBucket: "poperweb.firebasestorage.app",
  messagingSenderId: "91901111544",
  appId: "1:91901111544:web:a2f1c0a418e16f6ee45f0d"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

let recaptchaVerifier = null;
let confirmationResult = null;

function normalizePhone(phone) {
  let p = String(phone || "").replace(/\D/g, "");

  if (p.startsWith("0")) {
    p = "62" + p.slice(1);
  } else if (p.startsWith("8")) {
    p = "62" + p;
  } else if (!p.startsWith("62")) {
    throw new Error("Gunakan nomor Indonesia, contoh 08123456789");
  }

  if (p.length < 10 || p.length > 15) {
    throw new Error("Nomor HP tidak valid");
  }

  return "+" + p;
}

function resetRecaptcha() {
  try {
    recaptchaVerifier?.clear();
  } catch (e) {}

  recaptchaVerifier = null;
  confirmationResult = null;

  const container = document.getElementById("recaptcha-container");
  if (container) container.innerHTML = "";
}

function setupRecaptcha() {
  if (recaptchaVerifier) return recaptchaVerifier;

  const container = document.getElementById("recaptcha-container");

  if (!container) {
    throw new Error("recaptcha-container tidak ditemukan");
  }

  container.innerHTML = "";

  recaptchaVerifier = new RecaptchaVerifier(auth, container, {
    size: "normal",
    callback: () => console.log("reCAPTCHA verified"),
    "expired-callback": () => console.log("reCAPTCHA expired")
  });

  return recaptchaVerifier;
}

async function sendOTP(phone) {
  const verifier = setupRecaptcha();

  try {
    confirmationResult = await signInWithPhoneNumber(
      auth,
      normalizePhone(phone),
      verifier
    );

    return confirmationResult;
  } catch (error) {
    resetRecaptcha();
    throw error;
  }
}

async function verifyOTP(code) {
  if (!confirmationResult) {
    throw new Error("Kirim OTP terlebih dahulu.");
  }

  const otp = String(code || "").trim();

  if (!/^\d{6}$/.test(otp)) {
    throw new Error("OTP harus 6 digit.");
  }

  const result = await confirmationResult.confirm(otp);
  confirmationResult = null;
  return result;
}

function listenAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

async function logout() {
  resetRecaptcha();
  await signOut(auth);
}

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

window.POPER = {
  app,
  auth,
  db,
  normalizePhone,
  setupRecaptcha,
  resetRecaptcha,
  sendOTP,
  verifyOTP,
  onAuth: listenAuth,
  logout,
  saveData,
  getData,
  updateData,
  deleteData,
  pushData,
  get currentUser() {
    return auth.currentUser;
  },
  get uid() {
    return auth.currentUser?.uid || null;
  }
};

console.log("POPER Firebase ready");
