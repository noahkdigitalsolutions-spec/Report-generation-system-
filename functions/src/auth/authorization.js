"use strict";
const { getFirestore } = require("firebase-admin/firestore");
const { HttpsError } = require("firebase-functions/v2/https");
const { COLLECTIONS } = require("../config/constants");

/**
 * Confirm the caller is signed in, has an active profile, and holds one of the allowed roles.
 * Returns { uid, role, fullName, email }. Throws an HttpsError otherwise.
 * The role always comes from Firestore, never from anything the browser sends.
 */
async function requireCallerRole(request, allowedRoles) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in to continue.");

  const snap = await getFirestore().collection(COLLECTIONS.USERS).doc(uid).get();
  const profile = snap.exists ? snap.data() : null;

  if (!profile || profile.active !== true) {
    throw new HttpsError("permission-denied", "Your account is not active.");
  }
  if (!allowedRoles.includes(profile.role)) {
    throw new HttpsError("permission-denied", "You don't have permission to do this.");
  }
  return { uid, role: profile.role, fullName: profile.fullName || null, email: profile.email || null };
}

module.exports = { requireCallerRole };
