
/* ======================================
   POPER — FIREBASE CONNECTION
   Firebase Web SDK
====================================== */

import { initializeApp } from
  "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  signOut
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

/* CONFIG */

const firebaseConfig = {
  apiKey: "ISI_API_KEY_KAMU",
  authDomain: "ISI_AUTH_DOMAIN_KAMU",
  projectId: "poperweb",
  storageBucket: "ISI_STORAGE_BUCKET_KAMU",
  messagingSenderId: "ISI_MESSAGING_SENDER_ID",
  appId: "ISI_APP_ID_KAMU"
};

/* INITIALIZE */

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/* EXPORT */

export {
  app,
  auth,
  db,
  onAuthStateChanged,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  signOut,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp
};
