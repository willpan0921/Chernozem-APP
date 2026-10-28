// WHAT THIS FILE DOES
// Firebase Authentication on the website: the Register and Sign in pages
// (src/site/pages/RegisterPage.jsx, SignInPage.jsx) make and check
// accounts with Google or an e-mail and a password through Firebase, and
// then hand the signed token to our own server (src/api/accountApi.js).
//
//   loadFirebaseAuth()  downloads the Firebase code (only when called, so
//                       the rest of the website never fetches it), sets it
//                       up once, and gives back { auth, ...functions }:
//                       auth, GoogleAuthProvider, signInWithPopup,
//                       createUserWithEmailAndPassword,
//                       signInWithEmailAndPassword, sendPasswordResetEmail,
//                       onAuthStateChanged, getIdToken, signOut.
//   firebaseConfig      the project's web settings (below)
//
// THE WEB CONFIG IS PUBLIC BY DESIGN. These values (the project id, the
// app id, the "apiKey") only say which Firebase project the page talks to;
// they are shipped in the page to every visitor, as Firebase intends. They
// grant nothing by themselves: what a signed-in person may do is decided
// by Firebase's own rules and by our server, which checks every token with
// its private credentials (server/accounts.js). Do not confuse this key
// with the server's secrets in .env, which are never in the browser.
//
// THE EMULATOR. When the page is built with VITE_FIREBASE_AUTH_EMULATOR
// set (for example http://127.0.0.1:9099), the page talks to the local
// Firebase Auth emulator instead of Google: that is how the pages are
// tested without touching the real project. The server then runs with
// FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 so it accepts those tokens.
//
// WHO EDITS IT
// Whoever moves Chernozem to another Firebase project (copy the new web
// config from the Firebase console, Project settings > Your apps).

export const firebaseConfig = {
  apiKey: "AIzaSyCoWnw8uxTEM7kBl7-wq6sghIxhGblkyFg",
  authDomain: "chernozem-danny.firebaseapp.com",
  projectId: "chernozem-danny",
  storageBucket: "chernozem-danny.firebasestorage.app",
  messagingSenderId: "141737473069",
  appId: "1:141737473069:web:0e8f35844224f0259034a4",
};

let loading = null;

export function loadFirebaseAuth() {
  if (!loading) {
    loading = (async () => {
      // Two dynamic imports: Vite puts Firebase in its own file, downloaded
      // the first time a page calls this.
      const [{ initializeApp, getApps, getApp }, authModule] = await Promise.all([import("firebase/app"), import("firebase/auth")]);
      // Set up once; a second call (or a hot reload while developing) reuses
      // the app Firebase already has.
      const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
      const auth = authModule.getAuth(app);
      const emulator = import.meta.env.VITE_FIREBASE_AUTH_EMULATOR;
      if (emulator && !auth.emulatorConfig) {
        // disableWarnings keeps the emulator's banner out of the page; the
        // console still says the emulator is in use.
        authModule.connectAuthEmulator(auth, emulator, { disableWarnings: true });
      }
      const { GoogleAuthProvider, signInWithPopup, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, onAuthStateChanged, getIdToken, signOut } = authModule;
      return { auth, GoogleAuthProvider, signInWithPopup, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, onAuthStateChanged, getIdToken, signOut };
    })();
    // A failed download (offline) may be tried again later.
    loading.catch(() => {
      loading = null;
    });
  }
  return loading;
}
