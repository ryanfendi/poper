
/* =========================================
   POPER FIREBASE CONNECTION
   Firebase SDK v12
========================================= */

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged,
  RecaptchaVerifier,
  signInWithPhoneNumber,
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

/* GANTI DENGAN CONFIG FIREBASE KAMU */
const firebaseConfig = {
  apiKey: "AIzaSyD4eRul_asozC7eT15z2tcMaRO-gNJ7Us8",
  authDomain: "poperweb.firebaseapp.com",
  databaseURL: "https://poperweb-default-rtdb.asia-southeast1.firebasedatabase.app/",
  projectId: "poperweb",
  storageBucket: "poperweb.firebasestorage.app",
  messagingSenderId: "91901111544",
  appId: "1:91901111544:web:a2f1c0a418e16f6ee45f0d"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

/* =========================================
   AUTH OTP
========================================= */

let verifier = null;
let confirmation = null;

function initRecaptcha() {
  if (verifier) return verifier;

  verifier = new RecaptchaVerifier(auth, "recaptcha-container", {
    size: "invisible"
  });

  return verifier;
}

async function requestOTP(phone) {
  const verifier = initRecaptcha();

  confirmation = await signInWithPhoneNumber(
    auth,
    phone,
    verifier
  );

  return confirmation;
}

async function confirmOTP(code) {
  if (!confirmation) throw new Error("OTP belum diminta");

  const result = await confirmation.confirm(code);
  return result.user;
}

async function logout() {
  return signOut(auth);
}

/* =========================================
   DATABASE
========================================= */

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

/* =========================================
   PHONE LOOKUP
========================================= */

function normalizePhone(phone) {
  let digits = String(phone).replace(/\D/g, "");

  if (digits.startsWith("0")) {
    digits = "62" + digits.substring(1);
  } else if (!digits.startsWith("62")) {
    digits = "62" + digits;
  }

  return "+" + digits;
}

async function registerPhone(uid, phone) {
  const normalized = normalizePhone(phone);

  await saveData("phoneLookup/" + normalized.replace("+", ""), {
    uid: uid,
    phone: normalized
  });
}

async function findPhone(phone) {
  const normalized = normalizePhone(phone);
  const key = normalized.replace("+", "");

  return getData("phoneLookup/" + key);
}

/* =========================================
   USER PROFILE
========================================= */

async function saveProfile(uid, profile) {
  return updateData("users/" + uid + "/publicBio", profile);
}

async function getProfile(uid) {
  return getData("users/" + uid + "/publicBio");
}

/* =========================================
   EXPORT
========================================= */

window.POPER = {
  app,
  auth,
  db,

  requestOTP,
  confirmOTP,
  logout,

  saveData,
  getData,
  updateData,
  deleteData,
  pushData,

  normalizePhone,
  registerPhone,
  findPhone,

  saveProfile,
  getProfile,

  onAuthStateChanged
};

console.log("🔥 POPER Firebase Ready");
