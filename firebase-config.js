import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
const firebaseConfig={apiKey:"AIzaSyDTMJ1zqIMDNo23YWkA_CUlKhgWlD1P6bA",authDomain:"poperi.firebaseapp.com",projectId:"poperi",appId:"1:505386473466:web:8a122f2b4f73a232ea7643"};
const app=initializeApp(firebaseConfig); export const auth=getAuth(app); export const db=getFirestore(app);
