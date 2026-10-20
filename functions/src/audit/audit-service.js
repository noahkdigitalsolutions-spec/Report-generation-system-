"use strict";
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { COLLECTIONS } = require("../config/constants");

/** Append one entry to the audit log. Never throws: a logging failure must not undo the action. */
async function logAudit({ actor, action, targetUid = null, details = {} }) {
  try {
    await getFirestore().collection(COLLECTIONS.AUDIT_LOGS).add({
      action,
      actorUid: actor?.uid || null,
      actorName: actor?.fullName || null,
      actorRole: actor?.role || null,
      targetUid,
      details,
      createdAt: FieldValue.serverTimestamp()
    });
  } catch (err) {
    console.error("audit log failed", action, err);
  }
}

module.exports = { logAudit };
