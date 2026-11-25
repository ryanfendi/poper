
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

function normalizePhone(phone) {
  let p = String(phone || "").replace(/\D/g, "");

  if (p.startsWith("0")) {
    p = "62" + p.slice(1);
  } else if (p.startsWith("8")) {
    p = "62" + p;
  }

  return "+" + p;
}

function resetRecaptcha() {
  try {
    if (recaptchaVerifier) {
      recaptchaVerifier.clear();
    }
  } catch(e) {}

  recaptchaVerifier = null;

  const container = document.getElementById("recaptcha-container");
  if (container) container.innerHTML = "";
}

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

async function sendOTP(phone) {
  const verifier = setupRecaptcha();
  return await signInWithPhoneNumber(auth, normalizePhone(phone), verifier);
}

function listenAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

window.POPER = {
  app,
  auth,
  db,
  normalizePhone,
  setupRecaptcha,
  resetRecaptcha,
  sendOTP,
  logout: () => signOut(auth),
  onAuth: listenAuth,

  saveData: async (path, data) => set(ref(db, path), data),
  getData: async path => {
    const snapshot = await get(ref(db, path));
    return snapshot.exists() ? snapshot.val() : null;
  },
  updateData: async (path, data) => update(ref(db, path), data),
  deleteData: async path => remove(ref(db, path)),
  pushData: async (path, data) => {
    const newRef = push(ref(db, path));
    await set(newRef, data);
    return newRef.key;
  },

  get currentUser() {
    return auth.currentUser;
  }
};
