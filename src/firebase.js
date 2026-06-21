import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDy9MH6F6TGPcMHcw1cH9UPj4kEw_8o-Fk",
  authDomain: "vilareal140-ddf4d.firebaseapp.com",
  projectId: "vilareal140-ddf4d",
  storageBucket: "vilareal140-ddf4d.firebasestorage.app",
  messagingSenderId: "192063667247",
  appId: "1:192063667247:web:63381906f193d59f7a9ada"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
