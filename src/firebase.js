import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDgBtdi7hUGSoRADP02c87PB9ddq2Y9KY8",
  authDomain: "camarero-saas.firebaseapp.com",
  projectId: "camarero-saas",
  storageBucket: "camarero-saas.firebasestorage.app",
  messagingSenderId: "393404142279",
  appId: "1:393404142279:web:2f5d80efe61085406f64e2"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
