const crypto = require("crypto");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { HttpsError } = require("firebase-functions/v2/https");
const { COLLECTIONS } = require("../config/constants");
const { requireCallerRole } = require("../auth/authorization");
const { requireString, requireEmail, requireRole } = require("../utils/validators");
const { logAudit } = require("../audit/audit-service");

/**
 * Admin creates a staff account.
 * Returns a one-time link the new person uses to choose their own password;
 * the admin never sees or sets a password.
 */
async function createStaffUser(request) {
  const caller = await requireCallerRole(request, ["admin"]);

  const fullName = requireString(request.data?.fullName, "Full name");
  const email = requireEmail(request.data?.email);
  const role = requireRole(request.data?.role);

  const auth = getAuth();
  let userRecord;
  try {
    userRecord = await auth.createUser({
      email,
      displayName: fullName,
      password: crypto.randomBytes(24).toString("base64url")
    });
  } catch (err) {
    if (err.code === "auth/email-already-exists") {
      throw new HttpsError("already-exists", "An account with this email already exists.");
    }
    throw new HttpsError("internal", "Could not create the account. Try again.");
  }

  try {
    await getFirestore().collection(COLLECTIONS.USERS).doc(userRecord.uid).set({
      fullName,
      email,
      role,
      active: true,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: caller.uid
    });
  } catch (err) {
    await auth.deleteUser(userRecord.uid).catch(() => {});
    throw new HttpsError("internal", "Could not save the profile. Nothing was created. Try again.");
  }

  const setupLink = await auth.generatePasswordResetLink(email);
  await logAudit({ actor: caller, action: "staff.create", targetUid: userRecord.uid, details: { email, role } });

  return { uid: userRecord.uid, setupLink };
}

/** Admin activates or deactivates an account. Deactivation also signs the person out everywhere. */
async function setUserActive(request) {
  const caller = await requireCallerRole(request, ["admin"]);

  const uid = requireString(request.data?.uid, "User");
  if (typeof request.data?.active !== "boolean") {
    throw new HttpsError("invalid-argument", "Say whether the account should be active.");
  }
  const active = request.data.active;

  if (uid === caller.uid) {
    throw new HttpsError("failed-precondition", "You can't deactivate your own account.");
  }

  const ref = getFirestore().collection(COLLECTIONS.USERS).doc(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "That user doesn't exist.");
  }

  const auth = getAuth();
  await auth.updateUser(uid, { disabled: !active });
  if (!active) await auth.revokeRefreshTokens(uid);
  await ref.update({ active, updatedAt: FieldValue.serverTimestamp(), updatedBy: caller.uid });

  await logAudit({ actor: caller, action: active ? "staff.activate" : "staff.deactivate", targetUid: uid });
  return { uid, active };
}

module.exports = { createStaffUser, setUserActive };
