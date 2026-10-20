// Run with: npm run test:rules   (starts the Firestore emulator for you)
import { describe, it, before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, getDocs, collection, query, where, serverTimestamp
} from "firebase/firestore";

let env;
const as = (uid) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-spn",
    firestore: { rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8") }
  });
});
after(async () => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const put = (path, data) => setDoc(doc(db, path), data);
    const user = (id, role, active = true) => put(`users/${id}`, { fullName: id, email: `${id}@x.test`, role, active });

    await Promise.all([
      user("admin1", "admin"), user("academic1", "academic"), user("head1", "headteacher"),
      user("teacher1", "teacher"), user("teacher2", "teacher"), user("gone1", "teacher", false),

      put("classes/c1", { name: "S.1", level: "O-Level", order: 1 }),
      put("streams/n", { classId: "c1", name: "North" }),
      put("streams/s", { classId: "c1", name: "South" }),
      put("subjects/math", { name: "Mathematics", code: "MATH", level: "Both" }),
      put("subjects/eng", { name: "English", code: "ENG", level: "Both" }),
      put("students/s1", { classId: "c1", streamId: "n", firstName: "Mary", lastName: "Abara", status: "active" }),
      put("students/s2", { classId: "c1", streamId: "s", firstName: "Amy", lastName: "Okello", status: "active" }),

      ...[["a-math", "open", "math"], ["a-eng", "open", "eng"], ["a-draft", "draft", "math"], ["a-locked", "locked", "math"]].map(([id, status, subjectId]) =>
        put(`assessments/${id}`, { academicYearId: "y1", termId: "t1", classId: "c1", subjectId, name: id, type: "EOT", maxScore: 100, weight: 100, status })),

      put("teacherAssignments/y1_teacher1_c1_all_math", { academicYearId: "y1", teacherUid: "teacher1", classId: "c1", streamId: null, subjectId: "math" }),
      put("teacherAssignments/y1_teacher2_c1_n_eng", { academicYearId: "y1", teacherUid: "teacher2", classId: "c1", streamId: "n", subjectId: "eng" }),
      put("teacherAssignments/y1_gone1_c1_all_math", { academicYearId: "y1", teacherUid: "gone1", classId: "c1", streamId: null, subjectId: "math" }),

      put("marks/a-math_s1", { assessmentId: "a-math", academicYearId: "y1", termId: "t1", classId: "c1", streamId: "n", subjectId: "math", studentId: "s1", score: 60, absent: false, enteredBy: "teacher1", updatedAt: new Date() }),
      put("marks/a-locked_s1", { assessmentId: "a-locked", academicYearId: "y1", termId: "t1", classId: "c1", streamId: "n", subjectId: "math", studentId: "s1", score: 60, absent: false, enteredBy: "teacher1", updatedAt: new Date() }),

      put("reports/t1_s1", { termId: "t1", classId: "c1", studentId: "s1", status: "draft" }),
      put("auditLogs/l1", { action: "x" }),
      put("settings/school", { name: "SPN" })
    ]);
  });
});

/** A mark that satisfies every rule, for teacher1 on the open maths assessment. */
const mk = (o = {}) => ({
  assessmentId: "a-math", academicYearId: "y1", termId: "t1", classId: "c1", streamId: "n", subjectId: "math",
  studentId: "s1", score: 75, absent: false, enteredBy: "teacher1", updatedAt: serverTimestamp(), ...o
});
const mark = (db, id) => doc(db, "marks", id);

describe("users", () => {
  it("signed-out visitors can't read profiles", async () => {
    await assertFails(getDoc(doc(anon(), "users/teacher1")));
  });
  it("people read their own profile but not others'", async () => {
    await assertSucceeds(getDoc(doc(as("teacher1"), "users/teacher1")));
    await assertFails(getDoc(doc(as("teacher1"), "users/teacher2")));
  });
  it("admin and head teacher read anyone", async () => {
    await assertSucceeds(getDoc(doc(as("admin1"), "users/teacher1")));
    await assertSucceeds(getDoc(doc(as("head1"), "users/teacher1")));
  });
  it("academic office can list teachers, but not other roles", async () => {
    const db = as("academic1");
    await assertSucceeds(getDocs(query(collection(db, "users"), where("role", "==", "teacher"))));
    await assertFails(getDoc(doc(db, "users/admin1")));
    await assertFails(getDocs(collection(db, "users")));
  });
  it("only admins write profiles, so nobody can promote themselves", async () => {
    await assertFails(updateDoc(doc(as("teacher1"), "users/teacher1"), { role: "admin" }));
    await assertFails(updateDoc(doc(as("academic1"), "users/teacher1"), { role: "admin" }));
    await assertSucceeds(updateDoc(doc(as("admin1"), "users/teacher1"), { fullName: "New name" }));
  });
});

describe("reference data", () => {
  it("any active user reads it, signed-out and deactivated users don't", async () => {
    await assertSucceeds(getDoc(doc(as("teacher1"), "classes/c1")));
    await assertFails(getDoc(doc(anon(), "classes/c1")));
    await assertFails(getDoc(doc(as("gone1"), "classes/c1")));
  });
  it("admin and academic office write it; teachers and head teacher don't", async () => {
    const data = { name: "S.2", level: "O-Level", order: 2 };
    await assertSucceeds(setDoc(doc(as("academic1"), "classes/c2"), data));
    await assertSucceeds(setDoc(doc(as("admin1"), "classes/c3"), data));
    await assertFails(setDoc(doc(as("teacher1"), "classes/c4"), data));
    await assertFails(setDoc(doc(as("head1"), "classes/c5"), data));
  });
  it("settings can only be written by the admin", async () => {
    await assertSucceeds(setDoc(doc(as("admin1"), "settings/school"), { name: "New" }));
    await assertFails(setDoc(doc(as("academic1"), "settings/school"), { name: "New" }));
    await assertSucceeds(getDoc(doc(as("teacher1"), "settings/school")));
  });
  it("assessments are written by admin and academic office only", async () => {
    const data = { academicYearId: "y1", termId: "t1", classId: "c1", subjectId: "math", name: "New", type: "CA", maxScore: 10, weight: 10, status: "draft" };
    await assertSucceeds(setDoc(doc(as("academic1"), "assessments/new1"), data));
    await assertFails(setDoc(doc(as("teacher1"), "assessments/new2"), data));
  });
});

describe("functions-only collections", () => {
  it("students can be read by active users but never written from the browser", async () => {
    await assertSucceeds(getDoc(doc(as("teacher1"), "students/s1")));
    await assertFails(updateDoc(doc(as("admin1"), "students/s1"), { firstName: "X" }));
    await assertFails(setDoc(doc(as("academic1"), "students/new"), { classId: "c1" }));
    await assertFails(setDoc(doc(as("admin1"), "enrollments/e1"), { classId: "c1" }));
  });
  it("reports are readable by admin, head teacher and academic office, and written by nobody", async () => {
    await assertSucceeds(getDoc(doc(as("admin1"), "reports/t1_s1")));
    await assertSucceeds(getDoc(doc(as("head1"), "reports/t1_s1")));
    await assertSucceeds(getDoc(doc(as("academic1"), "reports/t1_s1")));
    await assertFails(getDoc(doc(as("teacher1"), "reports/t1_s1")));
    await assertFails(updateDoc(doc(as("admin1"), "reports/t1_s1"), { status: "approved" }));
  });
  it("the audit log is readable by admin and head teacher, and written by nobody", async () => {
    await assertSucceeds(getDoc(doc(as("admin1"), "auditLogs/l1")));
    await assertSucceeds(getDoc(doc(as("head1"), "auditLogs/l1")));
    await assertFails(getDoc(doc(as("academic1"), "auditLogs/l1")));
    await assertFails(setDoc(doc(as("admin1"), "auditLogs/l2"), { action: "y" }));
  });
  it("admission numbers and unknown collections are closed", async () => {
    await assertFails(getDoc(doc(as("admin1"), "admissionNumbers/ADM-1")));
    await assertFails(setDoc(doc(as("admin1"), "somethingElse/x"), { a: 1 }));
  });
});

describe("teacher assignments", () => {
  it("a teacher reads their own assignments with a filtered query", async () => {
    await assertSucceeds(getDocs(query(collection(as("teacher1"), "teacherAssignments"), where("academicYearId", "==", "y1"), where("teacherUid", "==", "teacher1"))));
  });
  it("a teacher can't read someone else's", async () => {
    await assertFails(getDoc(doc(as("teacher1"), "teacherAssignments/y1_teacher2_c1_n_eng")));
  });
  it("admin, head teacher and academic office read all; admin and academic write", async () => {
    await assertSucceeds(getDoc(doc(as("head1"), "teacherAssignments/y1_teacher2_c1_n_eng")));
    await assertSucceeds(setDoc(doc(as("academic1"), "teacherAssignments/new"), { teacherUid: "teacher1" }));
    await assertFails(setDoc(doc(as("head1"), "teacherAssignments/new2"), { teacherUid: "teacher1" }));
  });
});

describe("marks: writing", () => {
  it("an assigned teacher records a mark", async () => {
    await assertSucceeds(setDoc(mark(as("teacher1"), "a-math_s2"), mk({ studentId: "s2", streamId: "s" })));
  });
  it("an all-streams assignment covers every stream", async () => {
    await assertSucceeds(setDoc(mark(as("teacher1"), "a-math_s1"), mk()));
    await assertSucceeds(setDoc(mark(as("teacher1"), "a-math_s2"), mk({ studentId: "s2", streamId: "s" })));
  });
  it("a stream-specific assignment covers only that stream", async () => {
    const eng = (o) => mk({ assessmentId: "a-eng", subjectId: "eng", enteredBy: "teacher2", ...o });
    await assertSucceeds(setDoc(mark(as("teacher2"), "a-eng_s1"), eng()));
    await assertFails(setDoc(mark(as("teacher2"), "a-eng_s2"), eng({ studentId: "s2", streamId: "s" })));
  });
  it("a teacher can't mark a subject they aren't assigned", async () => {
    await assertFails(setDoc(mark(as("teacher2"), "a-math_s2"), mk({ studentId: "s2", streamId: "s", enteredBy: "teacher2" })));
  });
  it("scores must be numbers from 0 to the assessment's maximum, or empty", async () => {
    const db = as("teacher1");
    await assertSucceeds(setDoc(mark(db, "a-math_s2"), mk({ studentId: "s2", streamId: "s", score: 0 })));
    await assertSucceeds(setDoc(mark(db, "a-math_s2"), mk({ studentId: "s2", streamId: "s", score: 100 })));
    await assertSucceeds(setDoc(mark(db, "a-math_s2"), mk({ studentId: "s2", streamId: "s", score: null })));
    await assertFails(setDoc(mark(db, "a-math_s2"), mk({ studentId: "s2", streamId: "s", score: 101 })));
    await assertFails(setDoc(mark(db, "a-math_s2"), mk({ studentId: "s2", streamId: "s", score: -1 })));
    await assertFails(setDoc(mark(db, "a-math_s2"), mk({ studentId: "s2", streamId: "s", score: "75" })));
  });
  it("absent must be true or false", async () => {
    await assertSucceeds(setDoc(mark(as("teacher1"), "a-math_s2"), mk({ studentId: "s2", streamId: "s", score: null, absent: true })));
    await assertFails(setDoc(mark(as("teacher1"), "a-math_s2"), mk({ studentId: "s2", streamId: "s", absent: "yes" })));
  });
  it("the document ID must be assessmentId_studentId", async () => {
    await assertFails(setDoc(mark(as("teacher1"), "random-id"), mk({ studentId: "s2", streamId: "s" })));
  });
  it("a teacher can't record marks under someone else's name", async () => {
    await assertFails(setDoc(mark(as("teacher1"), "a-math_s2"), mk({ studentId: "s2", streamId: "s", enteredBy: "teacher2" })));
  });
  it("only open assessments accept teacher marks", async () => {
    await assertFails(setDoc(mark(as("teacher1"), "a-draft_s2"), mk({ assessmentId: "a-draft", studentId: "s2", streamId: "s" })));
    await assertFails(setDoc(mark(as("teacher1"), "a-locked_s2"), mk({ assessmentId: "a-locked", studentId: "s2", streamId: "s" })));
  });
  it("a mark must match its assessment's subject and class", async () => {
    await assertFails(setDoc(mark(as("teacher1"), "a-math_s2"), mk({ studentId: "s2", streamId: "s", subjectId: "eng" })));
    await assertFails(setDoc(mark(as("teacher1"), "a-math_s2"), mk({ studentId: "s2", streamId: "s", classId: "c9" })));
  });
  it("extra or missing fields are refused", async () => {
    await assertFails(setDoc(mark(as("teacher1"), "a-math_s2"), mk({ studentId: "s2", streamId: "s", bonus: 5 })));
    const { updatedAt, ...withoutTimestamp } = mk({ studentId: "s2", streamId: "s" });
    await assertFails(setDoc(mark(as("teacher1"), "a-math_s2"), withoutTimestamp));
  });
  it("a teacher can correct their own mark while the assessment is open", async () => {
    await assertSucceeds(updateDoc(mark(as("teacher1"), "a-math_s1"), { score: 80, updatedAt: serverTimestamp() }));
  });
  it("a mark can't be moved to another student, class or subject by editing it", async () => {
    await assertFails(updateDoc(mark(as("teacher1"), "a-math_s1"), { classId: "c9" }));
    await assertFails(updateDoc(mark(as("teacher1"), "a-math_s1"), { studentId: "s2" }));
    await assertFails(updateDoc(mark(as("teacher1"), "a-math_s1"), { subjectId: "eng" }));
  });
  it("a locked assessment can't be edited by the teacher", async () => {
    await assertFails(updateDoc(mark(as("teacher1"), "a-locked_s1"), { score: 99, updatedAt: serverTimestamp() }));
  });
  it("teachers can't delete marks, but the academic office can", async () => {
    await assertFails(deleteDoc(mark(as("teacher1"), "a-math_s1")));
    await assertSucceeds(deleteDoc(mark(as("academic1"), "a-math_s1")));
  });
  it("admin and academic office can correct marks even when locked", async () => {
    await assertSucceeds(updateDoc(mark(as("academic1"), "a-locked_s1"), { score: 70 }));
    await assertSucceeds(updateDoc(mark(as("admin1"), "a-locked_s1"), { score: 71 }));
  });
  it("the head teacher and deactivated teachers can't write marks", async () => {
    await assertFails(setDoc(mark(as("head1"), "a-math_s2"), mk({ studentId: "s2", streamId: "s", enteredBy: "head1" })));
    await assertFails(setDoc(mark(as("gone1"), "a-math_s2"), mk({ studentId: "s2", streamId: "s", enteredBy: "gone1" })));
  });
});

describe("marks: reading (the queries the marks-entry page makes)", () => {
  const base = (db, extra = []) => query(collection(db, "marks"),
    where("assessmentId", "==", "a-math"), where("academicYearId", "==", "y1"), where("classId", "==", "c1"), where("subjectId", "==", "math"), ...extra);

  it("a teacher with an all-streams assignment reads the class's marks", async () => {
    await assertSucceeds(getDocs(base(as("teacher1"))));
  });
  it("a teacher with a stream assignment must filter by stream", async () => {
    const eng = (db, extra = []) => query(collection(db, "marks"),
      where("assessmentId", "==", "a-eng"), where("academicYearId", "==", "y1"), where("classId", "==", "c1"), where("subjectId", "==", "eng"), ...extra);
    await assertSucceeds(getDocs(eng(as("teacher2"), [where("streamId", "==", "n")])));
    await assertFails(getDocs(eng(as("teacher2"))));
    await assertFails(getDocs(eng(as("teacher2"), [where("streamId", "==", "s")])));
  });
  it("a teacher can't read marks for a subject they aren't assigned", async () => {
    await assertFails(getDocs(base(as("teacher2"))));
  });
  it("an unfiltered query is refused for teachers", async () => {
    await assertFails(getDocs(query(collection(as("teacher1"), "marks"), where("assessmentId", "==", "a-math"))));
    await assertFails(getDocs(collection(as("teacher1"), "marks")));
  });
  it("admin, head teacher and academic office read marks with a simple query", async () => {
    for (const uid of ["admin1", "head1", "academic1"]) {
      await assertSucceeds(getDocs(query(collection(as(uid), "marks"), where("assessmentId", "==", "a-math"))));
    }
  });
});
