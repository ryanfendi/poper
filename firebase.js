
import { initializeApp }
  from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  signOut
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

import {
  getDatabase
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js";

// =================================
// FIREBASE CONFIG
// Ganti dengan konfigurasi project kamu
// =================================

const firebaseConfig = {
  apiKey: "AIzaSyD4eRul_asozC7eT15z2tcMaRO-gNJ7Us8",
  authDomain: "poperweb.firebaseapp.com",
  databaseURL: "https://poperweb-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "poperweb",
  storageBucket: "poperweb.firebasestorage.app",
  messagingSenderId: "91901111544",
  appId: "1:91901111544:web:a2f1c0a418e16f6ee45f0d"
};

// =================================
// INITIALIZE
// =================================

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

let recaptchaVerifier = null;
let recaptchaWidgetId = null;

function normalizePhone(phone) {
  let number = String(phone || "").replace(/\D/g, "");

  if (number.startsWith("0")) {
    number = "62" + number.slice(1);
  } else if (!number.startsWith("62")) {
    number = "62" + number;
  }

  return "+" + number;
}

function setupRecaptcha() {
  if (recaptchaVerifier) {
    return recaptchaVerifier;
  }

  recaptchaVerifier = new RecaptchaVerifier(
    auth,
    "recaptcha-container",
    {
      size: "normal",
      callback: () => {
        console.log("reCAPTCHA berhasil.");
      },
      "expired-callback": () => {
        console.log("reCAPTCHA expired, ulangi.");
      }
    }
  );

  return recaptchaVerifier;
}

async function resetRecaptcha() {
  if (recaptchaVerifier) {
    try {
      await recaptchaVerifier.clear();
    } catch (e) {
      console.warn(e);
    }
  }

  recaptchaVerifier = null;
  recaptchaWidgetId = null;

  const container =
    document.getElementById("recaptcha-container");

  if (container) {
    container.innerHTML = "";
  }
}

async function sendOTP(phone) {
  const formatted = normalizePhone(phone);

  if (!/^\+628\d{8,13}$/.test(formatted)) {
    throw new Error("Nomor HP Indonesia tidak valid.");
  }

  const verifier = setupRecaptcha();

  return await signInWithPhoneNumber(
    auth,
    formatted,
    verifier
  );
}

function logout() {
  return signOut(auth);
}

function listenAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

// =================================
// POPER GLOBAL API
// =================================


window.POPER = {
  app,
  auth,
  db,

  normalizePhone,
  setupRecaptcha,
  resetRecaptcha,
  sendOTP,
  logout,
  onAuth: listenAuth,

  // DATABASE FUNCTIONS
  saveData: async (path, data) => {
    return set(ref(db, path), data);
  },

  getData: async (path) => {
    const snapshot = await get(ref(db, path));
    return snapshot.exists() ? snapshot.val() : null;
  },

  updateData: async (path, data) => {
    return update(ref(db, path), data);
  },

  deleteData: async (path) => {
    return remove(ref(db, path));
  },

  pushData: async (path, data) => {
    const newRef = push(ref(db, path));
    await set(newRef, data);
    return newRef.key;
  },

  get currentUser() {
    return auth.currentUser;
  }
};

console.log("POPER Firebase + Database Ready");

