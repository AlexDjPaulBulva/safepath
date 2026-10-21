import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyDn3SJo1t-IwGnA2ahSorACuA64uucRwac",
  authDomain: "safe-path-77823.firebaseapp.com",
  projectId: "safe-path-77823",
  storageBucket: "safe-path-77823.firebasestorage.app",
  messagingSenderId: "917917105422",
  appId: "1:917917105422:web:fe11e4431af46c1e91ab5f",
  measurementId: "G-JRCBCMHXWZ"
};

export const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);
auth.useDeviceLanguage();
