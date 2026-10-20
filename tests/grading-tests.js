import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import * as browser from "../public/js/grading/grade-calculator.js";
import { SOURCE, buildBrowserCopy } from "../scripts/sync-grade-calculator.js";

const require = createRequire(import.meta.url);
const engine = require("../functions/src/grading/grade-calculator.js");
const { round, validateScale, normalizeScale, gradeFor, subjectResult, studentResult, rankStudents, remarkFor } = engine;

// A simple scale used throughout (the real one is the school's to define).
const SCALE = [
  { min: 80, grade: "A", points: 1, remark: "Excellent" },
  { min: 70, grade: "B", points: 2, remark: "Very good" },
  { min: 60, grade: "C", points: 3, remark: "Good" },
  { min: 50, grade: "D", points: 4, remark: "Fair" },
  { min: 0, grade: "E", points: 5, remark: "Needs support" }
];

const TWO = [
  { id: "bot", maxScore: 20, weight: 40 },
  { id: "eot", maxScore: 100, weight: 60 }
];

// ---------- round ----------
test("round: halves go up and float noise is ignored", () => {
  assert.equal(round(79.5), 80);
  assert.equal(round(79.49), 79);
  assert.equal(round(0.5), 1);
  assert.equal(round(1.005, 2), 1.01);
  assert.equal(round(67.45, 1), 67.5);
  assert.equal(round(0), 0);
  assert.equal(round(100), 100);
});

// ---------- scale validation ----------
test("validateScale accepts a good scale", () => {
  assert.deepEqual(validateScale(SCALE), []);
});

test("validateScale reports each kind of mistake", () => {
  assert.match(validateScale([])[0], /at least one/);
  assert.match(validateScale(SCALE.filter((b) => b.min !== 0)).join(" "), /start at 0/);
  assert.match(validateScale([...SCALE, { min: 70, grade: "X", points: 1 }]).join(" "), /already starts at 70/);
  assert.match(validateScale([...SCALE, { min: 40, grade: "a", points: 1 }]).join(" "), /used twice/);
  assert.match(validateScale([{ min: 0.5, grade: "A", points: 1 }]).join(" "), /whole number/);
  assert.match(validateScale([{ min: 101, grade: "A", points: 1 }, { min: 0, grade: "B", points: 1 }]).join(" "), /whole number/);
  assert.match(validateScale([{ min: 0, grade: "", points: 1 }]).join(" "), /grade is required/);
  assert.match(validateScale([{ min: 0, grade: "A", points: -1 }]).join(" "), /points/);
  assert.match(validateScale([{ min: 0, grade: "A", points: "1" }]).join(" "), /points/);
});

test("normalizeScale sorts high to low, derives 'to', and does not mutate", () => {
  const shuffled = [SCALE[3], SCALE[0], SCALE[4], SCALE[2], SCALE[1]];
  const copy = JSON.parse(JSON.stringify(shuffled));
  const out = normalizeScale(shuffled);
  assert.deepEqual(out.map((b) => [b.grade, b.min, b.max]),
    [["A", 80, 100], ["B", 70, 79], ["C", 60, 69], ["D", 50, 59], ["E", 0, 49]]);
  assert.deepEqual(shuffled, copy);
});

// ---------- gradeFor ----------
test("gradeFor: edges, decimals, clamping and unsorted input", () => {
  assert.equal(gradeFor(100, SCALE).grade, "A");
  assert.equal(gradeFor(80, SCALE).grade, "A");
  assert.equal(gradeFor(79, SCALE).grade, "B");
  assert.equal(gradeFor(79.5, SCALE).grade, "A");   // rounds to 80
  assert.equal(gradeFor(79.4, SCALE).grade, "B");
  assert.equal(gradeFor(49.5, SCALE).grade, "D");   // rounds to 50
  assert.equal(gradeFor(0, SCALE).grade, "E");
  assert.equal(gradeFor(-5, SCALE).grade, "E");
  assert.equal(gradeFor(104, SCALE).grade, "A");
  assert.equal(gradeFor(65, [...SCALE].reverse()).grade, "C");
});

test("gradeFor returns null if no grade starts at 0", () => {
  assert.equal(gradeFor(10, [{ min: 50, grade: "P", points: 1 }]), null);
});

// ---------- subjectResult ----------
test("subjectResult: weighted percentage and grade", () => {
  const r = subjectResult({ assessments: TWO, marks: { bot: { score: 15 }, eot: { score: 70 } }, scale: SCALE });
  assert.equal(r.status, "complete");
  assert.equal(r.percent, 72); // 0.75*40 + 0.70*60
  assert.equal(r.rounded, 72);
  assert.equal(r.grade, "B");
  assert.equal(r.points, 2);
  assert.equal(r.remark, "Very good");
});

test("subjectResult: a mark of 0 counts as entered", () => {
  const r = subjectResult({ assessments: TWO, marks: { bot: { score: 0 }, eot: { score: 0 } }, scale: SCALE });
  assert.equal(r.status, "complete");
  assert.equal(r.rounded, 0);
  assert.equal(r.grade, "E");
});

test("subjectResult: full marks give 100", () => {
  const r = subjectResult({ assessments: TWO, marks: { bot: { score: 20 }, eot: { score: 100 } }, scale: SCALE });
  assert.equal(r.rounded, 100);
  assert.equal(r.grade, "A");
});

test("subjectResult: a missing mark means incomplete, with no grade", () => {
  const r = subjectResult({ assessments: TWO, marks: { bot: { score: 15 } }, scale: SCALE });
  assert.equal(r.status, "incomplete");
  assert.deepEqual(r.missing, ["eot"]);
  assert.equal(r.grade, null);
  assert.equal(r.percent, null);
  const blank = subjectResult({ assessments: TWO, marks: { bot: { score: null, absent: false }, eot: { score: 70 } }, scale: SCALE });
  assert.equal(blank.status, "incomplete");
});

test("subjectResult: absent counts as zero by default", () => {
  const r = subjectResult({ assessments: TWO, marks: { bot: { score: null, absent: true }, eot: { score: 70 } }, scale: SCALE });
  assert.equal(r.status, "complete");
  assert.equal(r.percent, 42);
  assert.equal(r.grade, "E");
  assert.equal(r.absentCount, 1);
});

test("subjectResult: 'exclude' policy re-weights what the student sat", () => {
  const r = subjectResult({ assessments: TWO, marks: { bot: { score: null, absent: true }, eot: { score: 70 } }, scale: SCALE, absentPolicy: "exclude" });
  assert.equal(r.percent, 70);
  assert.equal(r.grade, "B");
});

test("subjectResult: absent for everything is 'absent', not a zero", () => {
  for (const policy of ["zero", "exclude"]) {
    const r = subjectResult({ assessments: TWO, marks: { bot: { absent: true }, eot: { absent: true } }, scale: SCALE, absentPolicy: policy });
    assert.equal(r.status, "absent");
    assert.equal(r.grade, null);
  }
});

test("subjectResult: bad setups are reported, never graded", () => {
  assert.equal(subjectResult({ assessments: [], marks: {}, scale: SCALE }).status, "no-assessments");
  const light = [{ id: "a", maxScore: 100, weight: 90 }];
  assert.equal(subjectResult({ assessments: light, marks: { a: { score: 50 } }, scale: SCALE }).status, "invalid-weights");
  const over = subjectResult({ assessments: TWO, marks: { bot: { score: 21 }, eot: { score: 70 } }, scale: SCALE });
  assert.equal(over.status, "invalid-marks");
  const neg = subjectResult({ assessments: TWO, marks: { bot: { score: -1 }, eot: { score: 70 } }, scale: SCALE });
  assert.equal(neg.status, "invalid-marks");
  const zeroMax = [{ id: "a", maxScore: 0, weight: 100 }];
  assert.equal(subjectResult({ assessments: zeroMax, marks: { a: { score: 0 } }, scale: SCALE }).status, "invalid-marks");
});

test("subjectResult: weights like 33.33 + 33.33 + 33.34 are accepted", () => {
  const three = [
    { id: "a", maxScore: 10, weight: 33.33 },
    { id: "b", maxScore: 10, weight: 33.33 },
    { id: "c", maxScore: 10, weight: 33.34 }
  ];
  const r = subjectResult({ assessments: three, marks: { a: { score: 10 }, b: { score: 10 }, c: { score: 10 } }, scale: SCALE });
  assert.equal(r.status, "complete");
  assert.equal(r.rounded, 100);
});

test("subjectResult: percentage that rounds across a boundary gets the higher grade", () => {
  const one = [{ id: "a", maxScore: 200, weight: 100 }];
  assert.equal(subjectResult({ assessments: one, marks: { a: { score: 159 } }, scale: SCALE }).grade, "A"); // 79.5 -> 80
  assert.equal(subjectResult({ assessments: one, marks: { a: { score: 158 } }, scale: SCALE }).grade, "B"); // 79
});

// ---------- studentResult ----------
const done = (pct) => ({ status: "complete", percent: pct, rounded: Math.round(pct), grade: gradeFor(pct, SCALE).grade, points: gradeFor(pct, SCALE).points });

test("studentResult: totals, average and overall grade", () => {
  const out = studentResult({
    scale: SCALE,
    subjects: [
      { subjectId: "math", result: done(80) },
      { subjectId: "eng", result: done(71) },
      { subjectId: "sci", result: done(62) }
    ]
  });
  assert.equal(out.totalMarks, 213);
  assert.equal(out.average, 71);
  assert.equal(out.overallGrade, "B");
  assert.equal(out.totalPoints, 1 + 2 + 3);
  assert.equal(out.counted, 3);
  assert.equal(out.ready, true);
  assert.deepEqual(out.issues, []);
});

test("studentResult: average has one decimal", () => {
  const out = studentResult({
    scale: SCALE,
    subjects: [{ subjectId: "a", result: done(70) }, { subjectId: "b", result: done(71) }, { subjectId: "c", result: done(71) }]
  });
  assert.equal(out.average, 70.7);
});

test("studentResult: a subject with missing marks is flagged and the student is not ready", () => {
  const out = studentResult({
    scale: SCALE,
    subjects: [
      { subjectId: "math", result: done(80) },
      { subjectId: "eng", result: { status: "incomplete", missing: ["eot"] } }
    ]
  });
  assert.equal(out.ready, false);
  assert.deepEqual(out.issues, [{ subjectId: "eng", status: "incomplete" }]);
  assert.equal(out.average, 80);
});

test("studentResult: a fully absent subject is left out without blocking the report", () => {
  const out = studentResult({
    scale: SCALE,
    subjects: [{ subjectId: "math", result: done(60) }, { subjectId: "eng", result: { status: "absent" } }]
  });
  assert.equal(out.counted, 1);
  assert.equal(out.average, 60);
  assert.equal(out.ready, true);
});

test("studentResult: nothing graded means no average and not ready", () => {
  const out = studentResult({ scale: SCALE, subjects: [{ subjectId: "x", result: { status: "absent" } }] });
  assert.equal(out.average, null);
  assert.equal(out.overallGrade, null);
  assert.equal(out.ready, false);
  assert.equal(studentResult({ scale: SCALE, subjects: [] }).ready, false);
});

// ---------- rankStudents ----------
test("rankStudents: ties share a position and the next is skipped", () => {
  const out = rankStudents([
    { studentId: "d", average: 60 },
    { studentId: "a", average: 80 },
    { studentId: "b", average: 75 },
    { studentId: "c", average: 75 }
  ]);
  assert.deepEqual(out.a, { position: 1, outOf: 4 });
  assert.deepEqual(out.b, { position: 2, outOf: 4 });
  assert.deepEqual(out.c, { position: 2, outOf: 4 });
  assert.deepEqual(out.d, { position: 4, outOf: 4 });
});

test("rankStudents: students without an average are not ranked and not counted", () => {
  const out = rankStudents([
    { studentId: "a", average: 50 },
    { studentId: "b", average: null },
    { studentId: "c", average: 70 }
  ]);
  assert.equal(out.b, undefined);
  assert.deepEqual(out.c, { position: 1, outOf: 2 });
  assert.deepEqual(out.a, { position: 2, outOf: 2 });
  assert.deepEqual(rankStudents([]), {});
});

test("rankStudents: a single student is first of one", () => {
  assert.deepEqual(rankStudents([{ studentId: "x", average: 0 }]).x, { position: 1, outOf: 1 });
});

// ---------- remarkFor ----------
test("remarkFor: highest matching minimum for the right type", () => {
  const rules = [
    { type: "classTeacher", minAverage: 0, text: "Work harder." },
    { type: "classTeacher", minAverage: 50, text: "Fair effort." },
    { type: "classTeacher", minAverage: 80, text: "Excellent work." },
    { type: "headteacher", minAverage: 0, text: "Improve." }
  ];
  assert.equal(remarkFor(85, "classTeacher", rules), "Excellent work.");
  assert.equal(remarkFor(79.5, "classTeacher", rules), "Excellent work."); // rounds to 80
  assert.equal(remarkFor(79.4, "classTeacher", rules), "Fair effort.");
  assert.equal(remarkFor(10, "classTeacher", rules), "Work harder.");
  assert.equal(remarkFor(90, "headteacher", rules), "Improve.");
  assert.equal(remarkFor(null, "classTeacher", rules), null);
  assert.equal(remarkFor(50, "classTeacher", [{ type: "classTeacher", minAverage: 60, text: "x" }]), null);
});

// ---------- the browser copy must behave exactly like the server copy ----------
test("browser copy is in sync with the server source", () => {
  const expected = buildBrowserCopy(readFileSync(SOURCE, "utf8"));
  const actual = readFileSync(new URL("../public/js/grading/grade-calculator.js", import.meta.url), "utf8");
  assert.equal(actual, expected, "Run `npm run sync:grading`");
});

test("browser and server give identical answers on 500 random scenarios", () => {
  let seed = 12345;
  const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const int = (a, b) => a + Math.floor(rand() * (b - a + 1));

  for (let n = 0; n < 500; n++) {
    const count = int(1, 4);
    const weights = Array.from({ length: count }, () => int(1, 50));
    const sum = weights.reduce((a, b) => a + b, 0);
    const scaled = weights.map((w) => (w / sum) * 100);
    const assessments = scaled.map((w, i) => ({ id: `a${i}`, maxScore: int(5, 100), weight: Math.round(w * 100) / 100 }));
    const marks = {};
    for (const a of assessments) {
      const roll = rand();
      if (roll < 0.1) continue;
      if (roll < 0.2) marks[a.id] = { score: null, absent: true };
      else marks[a.id] = { score: Math.round(rand() * a.maxScore * 100) / 100, absent: false };
    }
    const policy = rand() < 0.5 ? "zero" : "exclude";
    const input = { assessments, marks, scale: SCALE, absentPolicy: policy };
    assert.deepEqual(browser.subjectResult(input), engine.subjectResult(input));

    const pct = rand() * 110 - 5;
    assert.deepEqual(browser.gradeFor(pct, SCALE), engine.gradeFor(pct, SCALE));
  }

  const items = Array.from({ length: 30 }, (_, i) => ({ studentId: `s${i}`, average: rand() < 0.1 ? null : Math.round(rand() * 400) / 10 }));
  assert.deepEqual(browser.rankStudents(items), engine.rankStudents(items));
  assert.deepEqual(browser.validateScale(SCALE), engine.validateScale(SCALE));
  assert.deepEqual(browser.normalizeScale(SCALE), engine.normalizeScale(SCALE));
});
