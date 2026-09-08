import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, type Auth } from "firebase/auth";
import { firebaseConfig } from "./firebaseConfig";

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

export function getFirebaseAuth(): { app: FirebaseApp; auth: Auth } {
  if (!app) {
    app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
  }
  return { app, auth: auth! };
}

export async function signInWithGoogle(): Promise<{
  uid: string;
  email: string | null;
  name: string | null;
  idToken: string;
}> {
  const { auth } = getFirebaseAuth();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  
  const result = await signInWithPopup(auth, provider);
  const user = result.user;
  const idToken = await user.getIdToken();

  return {
    uid: user.uid,
    email: user.email,
    name: user.displayName,
    idToken,
  };
}
