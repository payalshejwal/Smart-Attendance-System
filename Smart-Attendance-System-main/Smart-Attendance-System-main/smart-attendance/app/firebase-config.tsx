// /app/firebase-config.tsx
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDjPtoCU6rtIbTMrmYVFeE-d84ptKGi_lI",
  authDomain: "smart-attendance-system-37658.firebaseapp.com",
  projectId: "smart-attendance-system-37658",
  storageBucket: "smart-attendance-system-37658.firebasestorage.app",
  messagingSenderId: "835205279897",
  appId: "1:835205279897:web:77e2cf67aa5a7190674808",
  measurementId: "G-3ZW3YF7QT9"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);