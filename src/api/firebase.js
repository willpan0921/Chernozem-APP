// WHAT THIS FILE DOES
// Connects the app to Firebase, the online service that stores the app's
// real data. It opens one connection to Firestore (Firebase's database) and
// shares it as "db", so every other file uses the same connection.
//
// The settings in "firebaseConfig" are not a secret. They only say which
// Firebase project to talk to, and they are meant to sit in browser code.
// What protects the data is the Rules tab of Firestore in the Firebase
// console.
//
// WHO EDITS IT
// Danny. Change it only if the app moves to a different Firebase project.
// Pages should not use this file directly: they go through a file that
// speaks for one kind of data (notes, fields...) and that file uses "db".

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Copied from the Firebase console: Project settings -> Your apps -> Web app.
const firebaseConfig = {
  apiKey: "AIzaSyCoWnw8uxTEM7kBl7-wq6sghIxhGblkyFg",
  authDomain: "chernozem-danny.firebaseapp.com",
  projectId: "chernozem-danny",
  storageBucket: "chernozem-danny.firebasestorage.app",
  messagingSenderId: "141737473069",
  appId: "1:141737473069:web:0e8f35844224f0259034a4",
  measurementId: "G-QG8YDB0K5Y",
};

const app = initializeApp(firebaseConfig);

// The database connection every data file shares.
export const db = getFirestore(app);
