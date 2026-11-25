
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
  getDatabase,
  ref,
  get,
  set,
  update,
  remove,
  push
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js";

/* FIREBASE CONFIG */

const firebaseConfig = {
  apiKey: "AIzaSyD4eRul_asozC7eT15z2tcMaRO-gNJ7Us8",
  authDomain: "poperweb.firebaseapp.com",
  databaseURL: "https://poperweb-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "poperweb",
  storageBucket: "poperweb.firebasestorage.app",
  messagingSenderId: "91901111544",
  appId: "1:91901111544:web:a2f1c0a418e16f6ee45f0d"
};

/* INITIALIZE */

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

let recaptchaVerifier = null;

/* PHONE */

function normalizePhone(phone) {
  let number = String(phone || "").replace(/\D/g, "");

  if (number.startsWith("0")) {
    number = "62" + number.substring(1);
  } else if (!number.startsWith("62")) {
    number = "62" + number;
  }

  return "+" + number;
}

/* RECAPTCHA */

function setupRecaptcha() {
  if (recaptchaVerifier) return recaptchaVerifier;

  recaptchaVerifier = new RecaptchaVerifier(
    auth,
    "recaptcha-container",
    {
      size: "normal"
    }
  );

  return recaptchaVerifier;
}

async function resetRecaptcha() {
  if (recaptchaVerifier) {
    try {
      await recaptchaVerifier.clear();
    } catch (e) {
      console.warn("Reset reCAPTCHA:", e);
    }
  }

  recaptchaVerifier = null;

  const container = document.getElementById("recaptcha-container");
  if (container) container.innerHTML = "";
}

/* SEND OTP */

async function sendOTP(phone) {
  const formatted = normalizePhone(phone);

  if (!/^\+628\d{8,13}$/.test(formatted)) {
    throw new Error("Nomor HP Indonesia tidak valid.");
  }

  const verifier = setupRecaptcha();

  return signInWithPhoneNumber(
    auth,
    formatted,
    verifier
  );
}

/* AUTH */

async function logout() {
  return signOut(auth);
}

function listenAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

/* DATABASE */

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

/* GLOBAL API */

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

  saveData,
  getData,
  updateData,
  deleteData,
  pushData,

  get currentUser() {
    return auth.currentUser;
  }
};

console.log("POPER Firebase siap.");
