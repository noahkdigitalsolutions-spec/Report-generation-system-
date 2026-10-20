const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { HttpsError } = require("firebase-functions/v2/https");
const { COLLECTIONS } = require("../config/constants");
const { requireCallerRole } = require("../auth/authorization");
const { requireString } = require("../utils/validators");
const { logAudit } = require("../audit/audit-service");
const { buildClassReports, describeIssue } = require("./report-builder");

const rows = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

/**
 * Generate (or regenerate) draft reports for every active student in a class for a term.
 * Approved and published reports are never touched.
 */
async function generateReports(request) {
  const caller = await requireCallerRole(request, ["admin", "academic"]);
  const termId = requireString(request.data?.termId, "Term", { max: 100 });
  const classId = requireString(request.data?.classId, "Class", { max: 100 });
  const db = getFirestore();
  const col = (name) => db.collection(name);

  const [termSnap, classSnap] = await Promise.all([col(COLLECTIONS.TERMS).doc(termId).get(), col(COLLECTIONS.CLASSES).doc(classId).get()]);
  if (!termSnap.exists) throw new HttpsError("invalid-argument", "That term no longer exists.");
  if (!classSnap.exists) throw new HttpsError("invalid-argument", "That class no longer exists.");
  const term = { id: termSnap.id, ...termSnap.data() };
  const cls = { id: classSnap.id, ...classSnap.data() };

  const scaleSnap = await col(COLLECTIONS.GRADING_SCALES).where("level", "==", cls.level).where("isActive", "==", true).limit(1).get();
  if (scaleSnap.empty) {
    throw new HttpsError("failed-precondition", `There is no active grade scale for ${cls.level}. Set one up under Grading first.`);
  }
  const scale = { id: scaleSnap.docs[0].id, ...scaleSnap.docs[0].data() };

  const [yearSnap, streamSnap, studentSnap, subjectSnap, comboSnap, asmSnap, markSnap, ruleSnap, settingsSnap, existingSnap] = await Promise.all([
    col(COLLECTIONS.ACADEMIC_YEARS).doc(term.academicYearId).get(),
    col(COLLECTIONS.STREAMS).where("classId", "==", classId).get(),
    col(COLLECTIONS.STUDENTS).where("classId", "==", classId).get(),
    col(COLLECTIONS.SUBJECTS).get(),
    col(COLLECTIONS.SUBJECT_COMBINATIONS).get(),
    col(COLLECTIONS.ASSESSMENTS).where("termId", "==", termId).where("classId", "==", classId).get(),
    col(COLLECTIONS.MARKS).where("termId", "==", termId).where("classId", "==", classId).get(),
    col(COLLECTIONS.REMARK_RULES).get(),
    col(COLLECTIONS.SETTINGS).doc("report").get(),
    col(COLLECTIONS.REPORTS).where("termId", "==", termId).where("classId", "==", classId).get()
  ]);

  const toMap = (list) => Object.fromEntries(list.map((r) => [r.id, r]));
  const existing = {};
  existingSnap.docs.forEach((d) => { existing[d.data().studentId] = d.data(); });

  const result = buildClassReports({
    term,
    yearName: yearSnap.exists ? yearSnap.data().name : "",
    cls,
    streams: toMap(rows(streamSnap)),
    students: rows(studentSnap),
    subjects: rows(subjectSnap),
    combos: toMap(rows(comboSnap)),
    assessments: rows(asmSnap),
    marks: markSnap.docs.map((d) => d.data()),
    scale,
    remarkRules: rows(ruleSnap),
    absentPolicy: settingsSnap.exists && settingsSnap.data().absentPolicy === "exclude" ? "exclude" : "zero",
    existing
  });

  for (let i = 0; i < result.reports.length; i += 400) {
    const batch = db.batch();
    for (const r of result.reports.slice(i, i + 400)) {
      batch.set(
        col(COLLECTIONS.REPORTS).doc(`${termId}_${r.studentId}`),
        {
          ...r.data,
          generatedAt: FieldValue.serverTimestamp(),
          generatedBy: caller.uid,
          ...(r.isNew ? { createdAt: FieldValue.serverTimestamp() } : {})
        },
        { merge: true }
      );
    }
    await batch.commit();
  }

  await logAudit({
    actor: caller,
    action: "reports.generate",
    details: { termId, classId, ...result.summary, skipped: result.skipped.length }
  });

  return {
    ...result.summary,
    skipped: result.skipped,
    warnings: result.warnings,
    notReadyStudents: result.reports
      .filter((r) => !r.data.ready)
      .slice(0, 100)
      .map((r) => ({
        studentId: r.studentId,
        name: r.data.studentName,
        problems: r.data.issues.length ? r.data.issues.map(describeIssue) : ["Nothing to grade yet"]
      }))
  };
}

module.exports = { generateReports };
