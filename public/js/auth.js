import { auth, db } from "./firebase-init.js";
import {
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { DASHBOARD_BY_ROLE, ROUTES } from "./utils/constants.js";

/** Load the Firestore profile (users/{uid}). Returns null if missing. */
export async function getProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? { uid, ...snap.data() } : null;
}

export function dashboardFor(profile) {
  return DASHBOARD_BY_ROLE[profile.role] || ROUTES.LOGIN;
}

/** Only allow same-site relative paths as post-login redirect targets. */
function safeNext(next) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : null;
}

/**
 * Sign in, then confirm the account has an active profile with a known role.
 * Throws an Error with a user-facing message on failure.
 */
export async function signIn(email, password, next = null) {
  let cred;
  try {
    cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  } catch (err) {
    throw new Error(friendlyError(err));
  }

  const profile = await getProfile(cred.user.uid).catch(() => null);

  if (!profile || !DASHBOARD_BY_ROLE[profile.role]) {
    await signOut(auth);
    throw new Error("This account has no role assigned. Ask the administrator to finish setting it up.");
  }
  if (profile.active !== true) {
    await signOut(auth);
    throw new Error("This account is deactivated. Contact the administrator.");
  }

  window.location.replace(safeNext(next) || dashboardFor(profile));
}

export async function logout() {
  await signOut(auth);
  window.location.replace(ROUTES.LOGIN);
}

export async function sendReset(email) {
  try {
    await sendPasswordResetEmail(auth, email.trim());
  } catch (err) {
    // Don't reveal whether an address is registered.
    if (err.code === "auth/user-not-found") return;
    throw new Error(friendlyError(err));
  }
}

export function friendlyError(err) {
  switch (err.code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
    case "auth/invalid-email":
      return "Email or password is incorrect. Check both and try again.";
    case "auth/user-disabled":
      return "This account is disabled. Contact the administrator.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a few minutes, or reset your password.";
    case "auth/network-request-failed":
      return "No connection. Check your internet and try again.";
    default:
      return "Something went wrong. Try again.";
  }
}
