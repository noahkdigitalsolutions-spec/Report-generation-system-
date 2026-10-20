const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { HttpsError } = require("firebase-functions/v2/https");
const { COLLECTIONS } = require("../config/constants");
const { requireCallerRole } = require("../auth/authorization");
const { requireString, optionalString, requireEnum, optionalDate } = require("../utils/validators");
const { logAudit } = require("../audit/audit-service");

const STATUSES = ["active", "transferred", "left", "completed"];
const ADMISSION_RE = /^[A-Za-z0-9][A-Za-z0-9/\-_. ]{0,29}$/;

/** Document ID that reserves an admission number (case-insensitive, safe for Firestore IDs). */
function admissionKey(admissionNo) {
  return encodeURIComponent(admissionNo.toUpperCase());
}

function parseAdmissionNo(value) {
  const clean = requireString(value, "Admission number", { max: 30 }).toUpperCase();
  if (!ADMISSION_RE.test(clean)) {
    throw new HttpsError("invalid-argument", "Admission number can use letters, numbers, spaces and / - _ . only.");
  }
  return clean;
}

/** Check class, stream and combination exist and fit together. */
async function resolvePlacement(data) {
  const db = getFirestore();
  const classId = requireString(data.classId, "Class", { max: 100 });
  const classSnap = await db.collection(COLLECTIONS.CLASSES).doc(classId).get();
  if (!classSnap.exists) throw new HttpsError("invalid-argument", "That class no longer exists.");
  const cls = classSnap.data();

  const streams = await db.collection(COLLECTIONS.STREAMS).where("classId", "==", classId).get();
  let streamId = null;
  if (!streams.empty) {
    streamId = optionalString(data.streamId, "Stream", { max: 100 });
    if (!streamId) throw new HttpsError("invalid-argument", "Choose a stream.");
    if (!streams.docs.some((d) => d.id === streamId)) {
      throw new HttpsError("invalid-argument", "That stream doesn't belong to the chosen class.");
    }
  }

  let combinationId = null;
  if (cls.level === "A-Level") {
    combinationId = optionalString(data.combinationId, "Subject combination", { max: 100 });
    if (!combinationId) throw new HttpsError("invalid-argument", "Choose a subject combination.");
    const combo = await db.collection(COLLECTIONS.SUBJECT_COMBINATIONS).doc(combinationId).get();
    if (!combo.exists) throw new HttpsError("invalid-argument", "That subject combination no longer exists.");
  }

  return { classId, streamId, combinationId };
}

async function parseStudent(data) {
  return {
    admissionNo: parseAdmissionNo(data.admissionNo),
    firstName: requireString(data.firstName, "First name", { max: 60 }),
    lastName: requireString(data.lastName, "Last name", { max: 60 }),
    otherNames: optionalString(data.otherNames, "Other names", { max: 80 }),
    sex: requireEnum(data.sex, ["M", "F"], "sex"),
    dateOfBirth: optionalDate(data.dateOfBirth, "Date of birth"),
    guardian: {
      name: optionalString(data.guardian?.name, "Guardian name", { max: 100 }),
      phone: optionalString(data.guardian?.phone, "Guardian phone", { max: 30 }),
      relationship: optionalString(data.guardian?.relationship, "Relationship", { max: 40 })
    },
    ...(await resolvePlacement(data))
  };
}

async function getCurrentYear() {
  const snap = await getFirestore()
    .collection(COLLECTIONS.ACADEMIC_YEARS)
    .where("isCurrent", "==", true)
    .limit(1)
    .get();
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}

function duplicateError(admissionNo) {
  return new HttpsError("already-exists", `Admission number ${admissionNo} is already used by another student.`);
}

async function createStudent(request) {
  const caller = await requireCallerRole(request, ["admin", "academic"]);
  const data = request.data || {};
  const student = await parseStudent(data);

  const year = await getCurrentYear();
  if (!year) {
    throw new HttpsError("failed-precondition", "Set a current academic year before adding students.");
  }

  const db = getFirestore();
  const studentRef = db.collection(COLLECTIONS.STUDENTS).doc();
  const keyRef = db.collection(COLLECTIONS.ADMISSION_NUMBERS).doc(admissionKey(student.admissionNo));
  const enrollmentRef = db.collection(COLLECTIONS.ENROLLMENTS).doc(`${year.id}_${studentRef.id}`);

  await db.runTransaction(async (tx) => {
    if ((await tx.get(keyRef)).exists) throw duplicateError(student.admissionNo);

    tx.set(keyRef, { studentId: studentRef.id });
    tx.set(studentRef, {
      ...student,
      status: "active",
      createdAt: FieldValue.serverTimestamp(),
      createdBy: caller.uid
    });
    tx.set(enrollmentRef, {
      academicYearId: year.id,
      studentId: studentRef.id,
      classId: student.classId,
      streamId: student.streamId,
      combinationId: student.combinationId,
      createdAt: FieldValue.serverTimestamp()
    });
  });

  await logAudit({ actor: caller, action: "student.create", targetUid: studentRef.id, details: { admissionNo: student.admissionNo } });
  return { studentId: studentRef.id };
}

async function updateStudent(request) {
  const caller = await requireCallerRole(request, ["admin", "academic"]);
  const data = request.data || {};
  const studentId = requireString(data.studentId, "Student", { max: 100 });
  const student = await parseStudent(data);
  const status = requireEnum(data.status, STATUSES, "status");
  const year = await getCurrentYear();

  const db = getFirestore();
  const ref = db.collection(COLLECTIONS.STUDENTS).doc(studentId);
  const keyRef = (adm) => db.collection(COLLECTIONS.ADMISSION_NUMBERS).doc(admissionKey(adm));
  let moved = false;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "That student doesn't exist.");
    const old = snap.data();

    const numberChanged = admissionKey(old.admissionNo) !== admissionKey(student.admissionNo);
    if (numberChanged && (await tx.get(keyRef(student.admissionNo))).exists) {
      throw duplicateError(student.admissionNo);
    }

    moved =
      old.classId !== student.classId ||
      (old.streamId ?? null) !== student.streamId ||
      (old.combinationId ?? null) !== student.combinationId;

    if (numberChanged) {
      tx.delete(keyRef(old.admissionNo));
      tx.set(keyRef(student.admissionNo), { studentId });
    }
    tx.update(ref, { ...student, status, updatedAt: FieldValue.serverTimestamp(), updatedBy: caller.uid });

    if (year && moved) {
      tx.set(
        db.collection(COLLECTIONS.ENROLLMENTS).doc(`${year.id}_${studentId}`),
        {
          academicYearId: year.id,
          studentId,
          classId: student.classId,
          streamId: student.streamId,
          combinationId: student.combinationId,
          updatedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    }
  });

  await logAudit({ actor: caller, action: "student.update", targetUid: studentId, details: { admissionNo: student.admissionNo, status, moved } });
  return { studentId };
}

module.exports = { createStudent, updateStudent };
