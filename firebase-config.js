// firebase-config.js
// Shared Firebase initialization for BulkChat Pro.
// Loaded as an ES module from login.html and dashboard.html.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAnalytics, isSupported as analyticsIsSupported } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc, getDoc, setDoc, updateDoc,
  collection, addDoc, getDocs, deleteDoc,
  query, orderBy, onSnapshot,
  runTransaction, serverTimestamp, increment
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getFunctions,
  httpsCallable
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

const firebaseConfig = {
  apiKey: "AIzaSyDSKMYd1aUQmordlIbyGvoPPxfTPOlfRMQ",
  authDomain: "whatsapp-assa.firebaseapp.com",
  projectId: "whatsapp-assa",
  storageBucket: "whatsapp-assa.firebasestorage.app",
  messagingSenderId: "984034423491",
  appId: "1:984034423491:web:4ae1042c57bcaed9ee6876",
  measurementId: "G-LG1KPGWDV1"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// Standard Firestore initialization with automatic connection management (WebSockets/WebChannel streaming with fallback)
export const db = getFirestore(app);
export const functions = getFunctions(app);
export const googleProvider = new GoogleAuthProvider();

// Analytics only works over http/https (not file://) and needs a real browser
// environment, so we guard it and fail silently if unsupported.
analyticsIsSupported().then((supported) => {
  if (supported) getAnalytics(app);
}).catch(() => {});

// Creates users/{uid} with a starting wallet balance of 0 the first time
// someone signs in. Safe to call on every login — it won't overwrite an
// existing balance. Safe against offline or slow network states.
export async function ensureUserProfile(user) {
  const ref = doc(db, 'users', user.uid);
  try {
    const fetchPromise = getDoc(ref);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Profile fetch timeout')), 2500)
    );
    const snap = await Promise.race([fetchPromise, timeoutPromise]);
    if (snap && !snap.exists()) {
      await setDoc(ref, {
        email: user.email || '',
        name: user.displayName || '',
        walletBalance: 0,
        createdAt: serverTimestamp()
      });
    }
  } catch (err) {
    console.warn("ensureUserProfile notice (continuing with default profile):", err);
  }
  return ref;
}

export {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  doc, getDoc, setDoc, updateDoc,
  collection, addDoc, getDocs, deleteDoc,
  query, orderBy, onSnapshot,
  runTransaction, serverTimestamp, increment,
  httpsCallable
};
