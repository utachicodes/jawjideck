import { initializeApp, getApps, getApp } from "firebase/app"
import { getAuth } from "firebase/auth"

// Same Firebase project as jawji-gcs (lib/firebase.ts there) so a
// signInWithCustomToken here produces a session for the same account. These
// are the public web client config values (not secrets) — set at build time
// via apps/desktop/.env, see .env.example.
export const firebaseConfigured = Boolean(
    import.meta.env.VITE_FIREBASE_API_KEY && import.meta.env.VITE_FIREBASE_PROJECT_ID
)

// initializeApp/getAuth throw immediately on an invalid (e.g. empty) API
// key - not just "auth calls will fail later". Falling back to obviously-fake
// placeholders when unconfigured (mirroring jawji-gcs's own lib/firebase.ts)
// keeps module load safe; every real usage below is already gated on
// firebaseConfigured, so these placeholders are never actually sent anywhere.
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "mock_key",
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "mock_domain",
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "mock_project_id",
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "mock_bucket",
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "mock_sender_id",
    appId: import.meta.env.VITE_FIREBASE_APP_ID || "mock_app_id",
}

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp()
export const auth = getAuth(app)
