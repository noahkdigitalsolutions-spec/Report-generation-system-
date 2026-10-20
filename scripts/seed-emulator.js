// Adds a small demo school and four logins to the LOCAL emulators.  Run: npm run seed:emulator
// Refuses to run unless the emulators are configured, so it can never touch a real project.
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:9099";

const projectId = process.env.GCLOUD_PROJECT || "demo-spn";
if (!projectId.startsWith("demo-")) {
  console.error(`Refusing to seed project "${projectId}". Use an emulator-only project ID that starts with "demo-".`);
  process.exit(1);
}

initializeApp({ projectId });
const auth = getAuth();
const db = getFirestore();
const now = FieldValue.serverTimestamp();
const set = (path, data) => db.doc(path).set(data);

const PASSWORD = "password123";
const people = [
  { uid: "admin-1", email: "admin@spn.test", fullName: "Alice Admin", role: "admin" },
  { uid: "academic-1", email: "academic@spn.test", fullName: "Adam Academic", role: "academic" },
  { uid: "head-1", email: "head@spn.test", fullName: "Helen Head", role: "headteacher" },
  { uid: "teacher-1", email: "teacher@spn.test", fullName: "Tom Teacher", role: "teacher" }
];

for (const p of people) {
  await auth.deleteUser(p.uid).catch(() => {});
  await auth.createUser({ uid: p.uid, email: p.email, password: PASSWORD, displayName: p.fullName });
  await set(`users/${p.uid}`, { fullName: p.fullName, email: p.email, role: p.role, active: true, createdAt: now });
}

await set("settings/school", { name: "SPN Demo Secondary School", motto: "Learn. Lead. Serve.", address: "P.O. Box 1, Kampala", phone: "+256 700 000000", email: "info@spn.test", principalName: "Helen Head" });
await set("settings/report", { showPosition: true, absentPolicy: "zero", footerNote: "Please keep this report safe." });

await set("academicYears/y2026", { name: "2026", startDate: "2026-02-01", endDate: "2026-12-04", isCurrent: true });
await set("terms/t1", { academicYearId: "y2026", name: "Term 1", number: 1, startDate: "2026-02-01", endDate: "2026-05-01", nextTermBegins: "2026-05-25", status: "open", isCurrent: true });
await set("terms/t2", { academicYearId: "y2026", name: "Term 2", number: 2, startDate: "2026-05-25", endDate: "2026-08-21", nextTermBegins: "2026-09-14", status: "open", isCurrent: false });

await set("classes/s1", { name: "S.1", level: "O-Level", order: 1 });
await set("classes/s5", { name: "S.5", level: "A-Level", order: 5 });
await set("streams/s1-north", { classId: "s1", name: "North" });
await set("streams/s1-south", { classId: "s1", name: "South" });

const subjects = [
  ["math", "Mathematics", "MATH", "Both", true], ["eng", "English", "ENG", "Both", true],
  ["phy", "Physics", "PHY", "Both", false], ["chem", "Chemistry", "CHEM", "Both", false]
];
for (const [id, name, code, level, isCompulsory] of subjects) await set(`subjects/${id}`, { name, code, level, isCompulsory });
await set("subjectCombinations/pcm", { name: "PCM", subjectIds: ["phy", "chem", "math"] });

await set("gradingScales/o-level", {
  name: "O-Level standard", level: "O-Level", isActive: true,
  boundaries: [
    { min: 80, grade: "A", points: 1, remark: "Excellent" }, { min: 70, grade: "B", points: 2, remark: "Very good" },
    { min: 60, grade: "C", points: 3, remark: "Good" }, { min: 50, grade: "D", points: 4, remark: "Fair" },
    { min: 0, grade: "E", points: 5, remark: "Needs support" }
  ]
});
await set("gradingScales/a-level", {
  name: "A-Level standard", level: "A-Level", isActive: true,
  boundaries: [
    { min: 80, grade: "A", points: 6, remark: "Excellent" }, { min: 70, grade: "B", points: 5, remark: "Very good" },
    { min: 60, grade: "C", points: 4, remark: "Good" }, { min: 50, grade: "D", points: 3, remark: "Fair" },
    { min: 0, grade: "F", points: 0, remark: "Fail" }
  ]
});
const remarks = [
  ["classTeacher", 80, "An excellent term. Keep it up."], ["classTeacher", 60, "A good result. Aim higher."], ["classTeacher", 0, "Needs to work harder next term."],
  ["headteacher", 80, "Outstanding performance."], ["headteacher", 50, "Fair. More effort is needed."], ["headteacher", 0, "Must improve."]
];
for (const [type, minAverage, text] of remarks) await db.collection("remarkRules").add({ type, minAverage, text });

const students = [
  ["st1", "ADM-001", "Mary", "Abara", "F", "s1-north"], ["st2", "ADM-002", "John", "Bosco", "M", "s1-north"],
  ["st3", "ADM-003", "Amy", "Okello", "F", "s1-south"], ["st4", "ADM-004", "Peter", "Wasswa", "M", "s1-south"]
];
for (const [id, admissionNo, firstName, lastName, sex, streamId] of students) {
  await set(`students/${id}`, { admissionNo, firstName, lastName, otherNames: null, sex, dateOfBirth: null, guardian: { name: null, phone: null, relationship: null }, classId: "s1", streamId, combinationId: null, status: "active", createdAt: now });
  await set(`admissionNumbers/${encodeURIComponent(admissionNo.toUpperCase())}`, { studentId: id });
  await set(`enrollments/y2026_${id}`, { academicYearId: "y2026", studentId: id, classId: "s1", streamId, combinationId: null, createdAt: now });
}

await set("teacherAssignments/y2026_teacher-1_s1_all_math", { academicYearId: "y2026", teacherUid: "teacher-1", classId: "s1", streamId: null, subjectId: "math" });

console.log("Seeded the demo school. Sign in with any of these (password: " + PASSWORD + "):");
for (const p of people) console.log(`  ${p.role.padEnd(12)} ${p.email}`);
