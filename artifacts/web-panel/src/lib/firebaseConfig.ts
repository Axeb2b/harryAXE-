export interface FirebaseAppConfig {
  apiKey: string;
  authDomain: string;
  databaseURL?: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export const firebaseConfig: FirebaseAppConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: "axexodiweb.firebaseapp.com",
  databaseURL: "https://axexodiweb-default-rtdb.firebaseio.com",
  projectId: "axexodiweb",
  storageBucket: "axexodiweb.firebasestorage.app",
  messagingSenderId: "389800586861",
  appId: "1:389800586861:android:bc07658134ed77dad59964",
};

export default firebaseConfig;
