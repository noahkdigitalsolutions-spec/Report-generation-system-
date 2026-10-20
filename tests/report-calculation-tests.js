import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildClassReports, describeIssue } = require("../functions/src/reports/report-builder.js");

const SCALE = {
  id: "scale1",
  boundaries: [
    { min: 80, grade: "A", points: 1, remark: "Excellent" },
    { min: 70, grade: "B", points: 2, remark: "Very good" },
    { min: 60, grade: "C", points: 3, remark: "Good" },
    { min: 50, grade: "D", points: 4, remark: "Fair" },
    { min: 0, grade: "E", points: 5, remark: "Needs support" }
  ]
};

const student = (id, last, first, streamId, extra = {}) => ({
  id, lastName: last, firstName: first, otherNames: null, admissionNo: `ADM-${id}`, sex: "F", status: "active", streamId, combinationId: null, ...extra
});

const mark = (studentId, assessmentId, score, absent = false) => ({ studentId, assessmentId, score, absent });

/** Three O-Level students, two subjects. Expected averages: s1 82, s3 81, s2 58. */
function base(overrides = {}) {
  return {
    term: { id: "t1", name: "Term 1", academicYearId: "y1" },
    yearName: "2026",
    cls: { id: "c1", name: "S.1", level: "O-Level" },
    streams: { n: { name: "North" }, s: { name: "South" } },
    students: [
      student("s1", "Abara", "Mary", "n"),
      student("s2", "Okello", "Amy", "n"),
      student("s3", "Zed", "Okello", "s")
    ],
    subjects: [
      { id: "math", name: "Mathematics", code: "MATH", level: "Both" },
      { id: "eng", name: "English", code: "ENG", level: "Both" }
    ],
    combos: {},
    assessments: [
      { id: "bot", subjectId: "math", name: "Beginning of term", type: "BOT", maxScore: 20, weight: 40, status: "open" },
      { id: "eot", subjectId: "math", name: "End of term", type: "EOT", maxScore: 100, weight: 60, status: "open" },
      { id: "ca", subjectId: "eng", name: "Continuous", type: "CA", maxScore: 50, weight: 100, status: "locked" }
    ],
    marks: [
      mark("s1", "bot", 18), mark("s1", "eot", 80), mark("s1", "ca", 40),   // 84, 80
      mark("s2", "bot", 10), mark("s2", "eot", 60), mark("s2", "ca", 30),   // 56, 60
      mark("s3", "bot", 15), mark("s3", "eot", 70), mark("s3", "ca", 45)    // 72, 90
    ],
    scale: SCALE,
    remarkRules: [],
    absentPolicy: "zero",
    existing: {},
    ...overrides
  };
}

const get = (out, id) => out.reports.find((r) => r.studentId === id).data;

test("computes subjects, totals, average and overall grade", () => {
  const out = buildClassReports(base());
  const r = get(out, "s1");
  assert.deepEqual(r.subjects.map((s) => [s.name, s.percent, s.grade]), [["English", 80, "A"], ["Mathematics", 84, "A"]]);
  assert.equal(r.totalMarks, 164);
  assert.equal(r.totalPoints, 2);
  assert.equal(r.average, 82);
  assert.equal(r.overallGrade, "A");
  assert.equal(r.ready, true);
  assert.deepEqual(out.summary, { generated: 3, ready: 3, notReady: 0 });
});

test("class and stream positions", () => {
  const out = buildClassReports(base());
  assert.deepEqual([get(out, "s1").position, get(out, "s3").position, get(out, "s2").position], [1, 2, 3]);
  assert.equal(get(out, "s1").outOf, 3);
  assert.deepEqual([get(out, "s1").streamPosition, get(out, "s1").streamOutOf], [1, 2]);
  assert.deepEqual([get(out, "s2").streamPosition, get(out, "s2").streamOutOf], [2, 2]);
  assert.deepEqual([get(out, "s3").streamPosition, get(out, "s3").streamOutOf], [1, 1]);
  assert.equal(get(out, "s1").streamName, "North");
});

test("ties share a position", () => {
  const input = base();
  input.marks = input.marks.map((m) => (m.studentId === "s3" ? { ...m, studentId: "s3" } : m));
  // make s3 identical to s1
  input.marks = [...input.marks.filter((m) => m.studentId !== "s3"), mark("s3", "bot", 18), mark("s3", "eot", 80), mark("s3", "ca", 40)];
  const out = buildClassReports(input);
  assert.equal(get(out, "s1").position, 1);
  assert.equal(get(out, "s3").position, 1);
  assert.equal(get(out, "s2").position, 3);
});

test("a missing mark makes that student not ready, unranked, and names what is missing", () => {
  const input = base();
  input.marks = input.marks.filter((m) => !(m.studentId === "s2" && m.assessmentId === "eot"));
  const out = buildClassReports(input);
  const s2 = get(out, "s2");
  assert.equal(s2.ready, false);
  assert.equal(s2.position, null);
  assert.equal(s2.streamPosition, null);
  assert.deepEqual(s2.issues, [{ subjectId: "math", subjectName: "Mathematics", status: "incomplete", detail: ["End of term"] }]);
  assert.equal(describeIssue(s2.issues[0]), "Mathematics: marks missing (End of term)");
  // everyone else is ranked among the ready students only
  assert.deepEqual([get(out, "s1").position, get(out, "s1").outOf], [1, 2]);
  assert.deepEqual([get(out, "s3").position, get(out, "s3").outOf], [2, 2]);
  assert.deepEqual(out.summary, { generated: 3, ready: 2, notReady: 1 });
});

test("a student with no marks at all is not ready and has no average", () => {
  const input = base();
  input.students.push(student("s4", "Newcomer", "Nia", "s"));
  const out = buildClassReports(input);
  const s4 = get(out, "s4");
  assert.equal(s4.ready, false);
  assert.equal(s4.average, null);
  assert.equal(s4.overallGrade, null);
  assert.equal(s4.position, null);
  assert.equal(s4.issues.length, 2);
  assert.equal(s4.classTeacherRemark, null);
});

test("draft assessments are ignored, and half-opened subjects are flagged", () => {
  const input = base();
  input.assessments = input.assessments.map((a) => (a.id === "eot" ? { ...a, status: "draft" } : a));
  const out = buildClassReports(input);
  // Math now only has the 40% assessment live, so its weights don't total 100.
  assert.deepEqual(get(out, "s1").issues.map((i) => [i.subjectId, i.status]), [["math", "invalid-weights"]]);
  assert.equal(out.summary.ready, 0);
});

test("a subject with no open assessments is left off and reported as a warning", () => {
  const onlyDraft = base();
  onlyDraft.assessments = onlyDraft.assessments.map((a) => (a.id === "ca" ? { ...a, status: "draft" } : a));
  let out = buildClassReports(onlyDraft);
  assert.deepEqual(out.warnings, [{ subjectId: "eng", subjectName: "English", problem: "only-drafts" }]);
  assert.deepEqual(get(out, "s1").subjects.map((s) => s.name), ["Mathematics"]);
  assert.equal(get(out, "s1").average, 84);
  assert.equal(out.summary.ready, 3);

  const none = base();
  none.assessments = none.assessments.filter((a) => a.id !== "ca");
  out = buildClassReports(none);
  assert.deepEqual(out.warnings, [{ subjectId: "eng", subjectName: "English", problem: "none" }]);
});

test("A-Level: students only get subjects in their combination, compulsory ones for all", () => {
  const input = {
    ...base(),
    cls: { id: "c9", name: "S.5", level: "A-Level" },
    students: [
      student("p", "Pine", "Pia", null, { combinationId: "pcm" }),
      student("h", "Hill", "Hal", null, { combinationId: "hum" })
    ],
    subjects: [
      { id: "phy", name: "Physics", code: "PHY", level: "A-Level" },
      { id: "his", name: "History", code: "HIS", level: "A-Level" },
      { id: "gp", name: "General Paper", code: "GP", level: "Both", isCompulsory: true },
      { id: "kis", name: "Kiswahili", code: "KIS", level: "O-Level" }
    ],
    combos: { pcm: { subjectIds: ["phy"] }, hum: { subjectIds: ["his"] } },
    assessments: ["phy", "his", "gp"].map((sid) => ({ id: `a-${sid}`, subjectId: sid, name: "Exam", type: "EOT", maxScore: 100, weight: 100, status: "open" })),
    marks: [mark("p", "a-phy", 90), mark("p", "a-gp", 60), mark("h", "a-his", 70), mark("h", "a-gp", 50)]
  };
  const out = buildClassReports(input);
  assert.deepEqual(get(out, "p").subjects.map((s) => s.name), ["General Paper", "Physics"]);
  assert.deepEqual(get(out, "h").subjects.map((s) => s.name), ["General Paper", "History"]);
  assert.equal(get(out, "p").average, 75);
  assert.equal(get(out, "p").streamId, null);
  assert.equal(get(out, "p").streamPosition, null);
  assert.deepEqual(out.warnings, []);          // O-Level Kiswahili is not a class subject
  assert.equal(out.summary.ready, 2);
});

test("a subject nobody in the class takes is not a warning", () => {
  const input = {
    ...base(),
    cls: { id: "c9", name: "S.5", level: "A-Level" },
    students: [student("p", "Pine", "Pia", null, { combinationId: "pcm" })],
    subjects: [{ id: "phy", name: "Physics", code: "PHY", level: "A-Level" }, { id: "his", name: "History", code: "HIS", level: "A-Level" }],
    combos: { pcm: { subjectIds: ["phy"] } },
    assessments: [{ id: "a1", subjectId: "phy", name: "Exam", type: "EOT", maxScore: 100, weight: 100, status: "open" }],
    marks: [mark("p", "a1", 70)]
  };
  assert.deepEqual(buildClassReports(input).warnings, []);
});

test("inactive students get no report", () => {
  const input = base();
  input.students.push(student("gone", "Left", "Lee", "n", { status: "left" }));
  const out = buildClassReports(input);
  assert.equal(out.reports.some((r) => r.studentId === "gone"), false);
  assert.equal(get(out, "s1").outOf, 3);
});

test("remarks are filled from the rules by average", () => {
  const rules = [
    { type: "classTeacher", minAverage: 0, text: "Work harder." },
    { type: "classTeacher", minAverage: 80, text: "Excellent work." },
    { type: "headteacher", minAverage: 0, text: "Keep trying." }
  ];
  const out = buildClassReports(base({ remarkRules: rules }));
  assert.equal(get(out, "s1").classTeacherRemark, "Excellent work.");
  assert.equal(get(out, "s2").classTeacherRemark, "Work harder.");
  assert.equal(get(out, "s2").headteacherRemark, "Keep trying.");
  assert.deepEqual(get(out, "s1").remarkEdited, { classTeacher: false, headteacher: false });
});

test("absent policy is applied", () => {
  const input = base();
  input.marks = input.marks.map((m) => (m.studentId === "s1" && m.assessmentId === "bot" ? mark("s1", "bot", null, true) : m));
  const zero = buildClassReports({ ...input, absentPolicy: "zero" });
  const excl = buildClassReports({ ...input, absentPolicy: "exclude" });
  const pct = (out) => get(out, "s1").subjects.find((s) => s.subjectId === "math").percent;
  assert.equal(pct(zero), 48);
  assert.equal(pct(excl), 80);
  assert.equal(get(zero, "s1").absentPolicy, "zero");
});

test("absent for every assessment in a subject: shown as absent, report still ready", () => {
  const input = base();
  input.marks = input.marks.map((m) => (m.studentId === "s1" && m.assessmentId === "ca" ? mark("s1", "ca", null, true) : m));
  const r = get(buildClassReports(input), "s1");
  const eng = r.subjects.find((s) => s.subjectId === "eng");
  assert.equal(eng.status, "absent");
  assert.equal(eng.grade, null);
  assert.equal(r.ready, true);
  assert.equal(r.counted, 1);
  assert.equal(r.average, 84);
});

test("each subject lists its components with the student's scores", () => {
  const math = get(buildClassReports(base()), "s1").subjects.find((s) => s.subjectId === "math");
  assert.deepEqual(math.components, [
    { assessmentId: "bot", name: "Beginning of term", type: "BOT", maxScore: 20, weight: 40, score: 18, absent: false },
    { assessmentId: "eot", name: "End of term", type: "EOT", maxScore: 100, weight: 60, score: 80, absent: false }
  ]);
});

test("approved and published reports are skipped, not rewritten", () => {
  const existing = {
    s1: { status: "approved" },
    s2: { status: "published" }
  };
  const out = buildClassReports(base({ existing }));
  assert.deepEqual(out.skipped.map((s) => [s.studentId, s.reason]), [["s1", "approved"], ["s2", "published"]]);
  assert.deepEqual(out.reports.map((r) => r.studentId), ["s3"]);
});

test("regenerating keeps remarks a person wrote, refreshes the rest, and returns submitted reports to draft", () => {
  const rules = [{ type: "classTeacher", minAverage: 0, text: "Auto teacher" }, { type: "headteacher", minAverage: 0, text: "Auto head" }];
  const existing = {
    s1: {
      status: "submitted", submittedBy: "u1", submittedAt: "x",
      classTeacherRemark: "Mary had a wonderful term.", headteacherRemark: "old auto",
      remarkEdited: { classTeacher: true, headteacher: false }
    }
  };
  const out = buildClassReports(base({ remarkRules: rules, existing }));
  const r = get(out, "s1");
  assert.equal(r.classTeacherRemark, "Mary had a wonderful term.");
  assert.equal(r.headteacherRemark, "Auto head");
  assert.deepEqual(r.remarkEdited, { classTeacher: true, headteacher: false });
  assert.equal(r.status, "draft");
  assert.equal(r.submittedBy, null);
  assert.equal(out.reports.find((x) => x.studentId === "s1").isNew, false);
  assert.equal(out.reports.find((x) => x.studentId === "s2").isNew, true);
});

test("reports carry the snapshot details the report card needs", () => {
  const r = get(buildClassReports(base()), "s2");
  assert.equal(r.studentName, "Amy Okello");
  assert.equal(r.admissionNo, "ADM-s2");
  assert.equal(r.className, "S.1");
  assert.equal(r.termName, "Term 1");
  assert.equal(r.yearName, "2026");
  assert.equal(r.gradingScaleId, "scale1");
  assert.equal(r.status, "draft");
});

test("reports come back sorted by last name, then first name", () => {
  const out = buildClassReports(base());
  assert.deepEqual(out.reports.map((r) => r.data.studentName), ["Mary Abara", "Amy Okello", "Okello Zed"]);
});

test("a class with no students gives an empty result", () => {
  const out = buildClassReports(base({ students: [] }));
  assert.deepEqual(out.summary, { generated: 0, ready: 0, notReady: 0 });
  assert.deepEqual(out.reports, []);
});
