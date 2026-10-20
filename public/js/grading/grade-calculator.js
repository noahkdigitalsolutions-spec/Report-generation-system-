// GENERATED from functions/src/grading/grade-calculator.js by `npm run sync:grading`. Do not edit by hand.
/**
 * Grading engine. Pure functions only: no Firebase, no DOM.
 * This file is the source of truth. The browser copy, public/js/grading/grade-calculator.js,
 * is generated from it by `npm run sync:grading` (a test fails if they drift apart).
 *
 * Rules the school should know about:
 *  - A subject percentage is the sum of (score / out-of) x weight over its assessments. Weights must total 100.
 *  - Percentages are rounded to a whole number (halves round up) before a grade is looked up.
 *  - A grade is the boundary with the highest "from" value that is not above the percentage.
 *  - A missing mark (not entered, not absent) stops that subject from being graded.
 *  - Absent: "zero" counts the missed assessment as 0; "exclude" re-weights the assessments the student sat.
 *    A subject where the student was absent for everything is shown as absent and left out of totals.
 *  - The average is the mean of the subject percentages (each already rounded), to 1 decimal place.
 *  - Positions use ties: 1, 2, 2, 4. Only students with a complete result are ranked.
 */

/** Round half up, ignoring floating point noise (1.005 -> 1.01). */
function round(n, dp = 0) {
  const f = 10 ** dp;
  return Math.round(Number((n * f).toPrecision(12))) / f;
}

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** Returns a list of problems; an empty list means the scale is usable. */
function validateScale(boundaries) {
  const errors = [];
  if (!Array.isArray(boundaries) || boundaries.length === 0) {
    return ["Add at least one grade."];
  }
  const mins = new Set();
  const grades = new Set();
  boundaries.forEach((b, i) => {
    const row = `Row ${i + 1}`;
    if (!Number.isInteger(b.min) || b.min < 0 || b.min > 100) errors.push(`${row}: "From" must be a whole number from 0 to 100.`);
    else if (mins.has(b.min)) errors.push(`${row}: another grade already starts at ${b.min}.`);
    else mins.add(b.min);

    const grade = typeof b.grade === "string" ? b.grade.trim() : "";
    if (!grade) errors.push(`${row}: grade is required.`);
    else if (grade.length > 10) errors.push(`${row}: grade is too long.`);
    else if (grades.has(grade.toLowerCase())) errors.push(`${row}: the grade ${grade} is used twice.`);
    else grades.add(grade.toLowerCase());

    if (typeof b.points !== "number" || !Number.isFinite(b.points) || b.points < 0) errors.push(`${row}: points must be a number, 0 or more.`);
    if (b.remark != null && (typeof b.remark !== "string" || b.remark.length > 60)) errors.push(`${row}: remark is too long.`);
  });
  if (!mins.has(0)) errors.push("One grade must start at 0 so every score gets a grade.");
  return errors;
}

/** Sort high to low and work out each grade's "to" value. Does not mutate the input. */
function normalizeScale(boundaries) {
  const sorted = [...boundaries].sort((a, b) => b.min - a.min);
  return sorted.map((b, i) => ({
    min: b.min,
    max: i === 0 ? 100 : sorted[i - 1].min - 1,
    grade: String(b.grade).trim(),
    points: b.points,
    remark: b.remark ? String(b.remark).trim() : ""
  }));
}

/** The boundary a percentage falls in, or null if the scale has no grade for it. */
function gradeFor(percent, boundaries) {
  const p = clamp(round(percent), 0, 100);
  const sorted = [...boundaries].sort((a, b) => b.min - a.min);
  return sorted.find((b) => p >= b.min) || null;
}

const EMPTY_SUBJECT = { percent: null, rounded: null, grade: null, points: null, remark: null, absentCount: 0, missing: [] };

/**
 * One student's result in one subject.
 * assessments: [{ id, maxScore, weight }]; marks: { [assessmentId]: { score, absent } }
 * status: complete | incomplete | absent | no-assessments | invalid-weights | invalid-marks
 */
function subjectResult({ assessments, marks, scale, absentPolicy = "zero" }) {
  if (!assessments || assessments.length === 0) return { ...EMPTY_SUBJECT, status: "no-assessments" };

  const totalWeight = round(assessments.reduce((n, a) => n + a.weight, 0), 2);
  if (Math.abs(totalWeight - 100) > 0.01) return { ...EMPTY_SUBJECT, status: "invalid-weights" };

  let weighted = 0;
  let satWeight = 0;
  let absentCount = 0;
  const missing = [];

  for (const a of assessments) {
    if (!(a.maxScore > 0)) return { ...EMPTY_SUBJECT, status: "invalid-marks" };
    const m = marks?.[a.id];
    if (!m || (m.score == null && !m.absent)) { missing.push(a.id); continue; }
    if (m.absent) {
      absentCount++;
      if (absentPolicy === "zero") satWeight += a.weight;
      continue;
    }
    if (typeof m.score !== "number" || m.score < 0 || m.score > a.maxScore) return { ...EMPTY_SUBJECT, status: "invalid-marks" };
    weighted += (m.score / a.maxScore) * a.weight;
    satWeight += a.weight;
  }

  if (missing.length) return { ...EMPTY_SUBJECT, status: "incomplete", absentCount, missing };
  if (absentCount === assessments.length) return { ...EMPTY_SUBJECT, status: "absent", absentCount };

  const percent = (weighted / satWeight) * 100;
  const rounded = round(percent);
  const band = gradeFor(rounded, scale);
  return {
    status: "complete",
    percent,
    rounded,
    grade: band ? band.grade : null,
    points: band ? band.points : null,
    remark: band ? band.remark || null : null,
    absentCount,
    missing: []
  };
}

const PROBLEM_STATUSES = new Set(["incomplete", "no-assessments", "invalid-weights", "invalid-marks"]);

/**
 * Combine a student's subject results.
 * subjects: [{ subjectId, result }] where result comes from subjectResult.
 */
function studentResult({ subjects, scale }) {
  const complete = subjects.filter((s) => s.result.status === "complete");
  const totalMarks = complete.reduce((n, s) => n + s.result.rounded, 0);
  const totalPoints = complete.reduce((n, s) => n + (s.result.points ?? 0), 0);
  const average = complete.length ? round(totalMarks / complete.length, 1) : null;
  const band = average === null ? null : gradeFor(average, scale);
  const issues = subjects
    .filter((s) => PROBLEM_STATUSES.has(s.result.status))
    .map((s) => ({ subjectId: s.subjectId, status: s.result.status }));

  return {
    totalMarks,
    totalPoints,
    counted: complete.length,
    average,
    overallGrade: band ? band.grade : null,
    overallRemark: band ? band.remark || null : null,
    issues,
    ready: complete.length > 0 && issues.length === 0
  };
}

/**
 * Class positions. items: [{ studentId, average }]; students with a null average are not ranked.
 * Returns { [studentId]: { position, outOf } } with ties sharing a position (1, 2, 2, 4).
 */
function rankStudents(items) {
  const ranked = items.filter((i) => i.average !== null && i.average !== undefined)
    .sort((a, b) => b.average - a.average);
  const out = {};
  let position = 0;
  ranked.forEach((item, idx) => {
    if (idx === 0 || item.average !== ranked[idx - 1].average) position = idx + 1;
    out[item.studentId] = { position, outOf: ranked.length };
  });
  return out;
}

/**
 * Pick a remark for an average. rules: [{ type, minAverage, text }].
 * The rule with the highest minAverage not above the (whole-number) average wins.
 */
function remarkFor(average, type, rules) {
  if (average === null || average === undefined) return null;
  const p = clamp(round(average), 0, 100);
  const match = rules
    .filter((r) => r.type === type)
    .sort((a, b) => b.minAverage - a.minAverage)
    .find((r) => p >= r.minAverage);
  return match ? match.text : null;
}

export { round, validateScale, normalizeScale, gradeFor, subjectResult, studentResult, rankStudents, remarkFor };
