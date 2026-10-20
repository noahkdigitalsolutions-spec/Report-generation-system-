const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { HttpsError } = require("firebase-functions/v2/https");
const { COLLECTIONS } = require("../config/constants");
const { requireCallerRole } = require("../auth/authorization");
const { requireString } = require("../utils/validators");
const { logAudit } = require("../audit/audit-service");
const { planTransition, planRemarkEdit } = require("./report-workflow");

const ALL = ["admin", "academic", "headteacher"];

/** Move every eligible report in a class through one step: submit, approve, return, publish or reopen. */
async function changeReportStatus(request) {
  const caller = await requireCallerRole(request, ALL);
  const termId = requireString(request.data?.termId, "Term", { max: 100 });
  const classId = requireString(request.data?.classId, "Class", { max: 100 });
  const action = requireString(request.data?.action, "Action", { max: 20 });

  const db = getFirestore();
  const snap = await db.collection(COLLECTIONS.REPORTS).where("termId", "==", termId).where("classId", "==", classId).get();
  const reports = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const plan = planTransition({ action, reports, actor: caller, note: request.data?.note, now: FieldValue.serverTimestamp() });
  if (!plan.ok) throw new HttpsError(plan.code, plan.message);

  for (let i = 0; i < plan.updates.length; i += 400) {
    const batch = db.batch();
    for (const u of plan.updates.slice(i, i + 400)) batch.update(db.collection(COLLECTIONS.REPORTS).doc(u.id), u.patch);
    await batch.commit();
  }

  await logAudit({ actor: caller, action: `reports.${action}`, details: { termId, classId, changed: plan.changed, note: request.data?.note || null } });
  return { changed: plan.changed, untouched: plan.untouched };
}

/** Edit the class teacher or head teacher remark on one report. */
async function saveReportRemarks(request) {
  const caller = await requireCallerRole(request, ALL);
  const termId = requireString(request.data?.termId, "Term", { max: 100 });
  const studentId = requireString(request.data?.studentId, "Student", { max: 100 });

  const ref = getFirestore().collection(COLLECTIONS.REPORTS).doc(`${termId}_${studentId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "That report doesn't exist. Generate the reports first.");

  const plan = planRemarkEdit({
    report: snap.data(),
    actor: caller,
    classTeacherRemark: request.data?.classTeacherRemark,
    headteacherRemark: request.data?.headteacherRemark
  });
  if (!plan.ok) throw new HttpsError(plan.code, plan.message);

  await ref.update(plan.patch);
  await logAudit({ actor: caller, action: "reports.remark", targetUid: studentId, details: { termId } });
  return { ok: true };
}

module.exports = { changeReportStatus, saveReportRemarks };
