import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCTr8rxHD7PRq81swlhCKfFGPaQ6KeJ8xo",
  authDomain: "tambola-52a2e.firebaseapp.com",
  projectId: "tambola-52a2e",
  storageBucket: "tambola-52a2e.firebasestorage.app",
  messagingSenderId: "105693415908",
  appId: "1:105693415908:web:65d861800d3b7d24209ff1"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);