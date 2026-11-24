
/* =========================================
   POPER FIREBASE CORE
   Firebase SDK CDN — No npm required
========================================= */

import { initializeApp } from
  "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  signOut
} from
  "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

import {
  getFirestore,
  doc,
  getDoc,
  setDoc
} from
  "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

/* FIREBASE CONFIG */

const firebaseConfig = {
  apiKey: "AIzaSyD4eRul_asozC7eT15z2tcMaRO-gNJ7Us8",
  authDomain: "poperweb.firebaseapp.com",
  projectId: "poperweb",
  storageBucket: "poperweb.firebasestorage.app",
  messagingSenderId: "91901111544",
  appId: "1:91901111544:web:a2f1c0a418e16f6ee45f0d"
};

/* INITIALIZE FIREBASE */

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
  setDoc
};
