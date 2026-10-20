"use strict";
/**
 * Builds the report cards for one class and term from plain data.
 * No Firebase in here, so it can be tested with node (see tests/report-calculation-tests.js).
 */
const { subjectResult, studentResult, rankStudents, remarkFor } = require("../grading/grade-calculator");

const LOCKED = new Set(["approved", "published"]);

/** A-Level students only sit subjects in their combination (plus compulsory ones). */
function takesSubject(student, classLevel, subject, combos) {
  if (classLevel !== "A-Level" || subject.isCompulsory) return true;
  const combo = combos?.[student.combinationId];
  return !!combo && (combo.subjectIds || []).includes(subject.id);
}

const fullName = (s) => [s.firstName, s.otherNames, s.lastName].filter(Boolean).join(" ");
const byName = (a, b) => a.name.localeCompare(b.name);

/**
 * @param {object} p
 *  term {id,name,academicYearId}, yearName, cls {id,name,level}, streams {id:{name}},
 *  students [{id,firstName,lastName,otherNames,admissionNo,sex,status,streamId,combinationId}],
 *  subjects [{id,name,code,level,isCompulsory}], combos {id:{subjectIds}},
 *  assessments [{id,subjectId,name,type,maxScore,weight,status}],
 *  marks [{studentId,assessmentId,score,absent}], scale {id,boundaries},
 *  remarkRules [{type,minAverage,text}], absentPolicy, existing {studentId: reportDoc}
 */
function buildClassReports(p) {
  const { term, yearName, cls, streams = {}, subjects, combos = {}, assessments, marks, scale, remarkRules = [], absentPolicy = "zero", existing = {} } = p;

  const classSubjects = subjects.filter((s) => s.level === "Both" || s.level === cls.level).sort(byName);
  const students = p.students.filter((s) => s.status === "active");

  // Draft assessments have never been opened for marks, so they don't count.
  const live = new Map();
  for (const a of assessments.filter((x) => x.status !== "draft")) {
    if (!live.has(a.subjectId)) live.set(a.subjectId, []);
    live.get(a.subjectId).push(a);
  }
  const draftSubjects = new Set(assessments.filter((a) => a.status === "draft").map((a) => a.subjectId));

  const warnings = [];
  for (const subj of classSubjects) {
    if (live.has(subj.id)) continue;
    if (!students.some((st) => takesSubject(st, cls.level, subj, combos))) continue;
    warnings.push({ subjectId: subj.id, subjectName: subj.name, problem: draftSubjects.has(subj.id) ? "only-drafts" : "none" });
  }

  const marksByStudent = {};
  for (const m of marks) {
    (marksByStudent[m.studentId] ||= {})[m.assessmentId] = { score: m.score ?? null, absent: !!m.absent };
  }

  const skipped = [];
  const built = [];

  for (const student of students) {
    const prior = existing[student.id];
    if (prior && LOCKED.has(prior.status)) {
      skipped.push({ studentId: student.id, name: fullName(student), reason: prior.status });
      continue;
    }

    const myMarks = marksByStudent[student.id] || {};
    const entries = [];
    const forEngine = [];
    const issues = [];

    for (const subj of classSubjects) {
      const asm = live.get(subj.id);
      if (!asm || !takesSubject(student, cls.level, subj, combos)) continue;

      const result = subjectResult({
        assessments: asm.map(({ id, maxScore, weight }) => ({ id, maxScore, weight })),
        marks: myMarks,
        scale: scale.boundaries,
        absentPolicy
      });
      forEngine.push({ subjectId: subj.id, result });
      entries.push({
        subjectId: subj.id,
        name: subj.name,
        code: subj.code,
        status: result.status,
        percent: result.rounded,
        grade: result.grade,
        points: result.points,
        remark: result.remark,
        components: asm.map((a) => ({
          assessmentId: a.id, name: a.name, type: a.type, maxScore: a.maxScore, weight: a.weight,
          score: myMarks[a.id]?.score ?? null, absent: !!myMarks[a.id]?.absent
        }))
      });
      if (["incomplete", "invalid-weights", "invalid-marks", "no-assessments"].includes(result.status)) {
        issues.push({
          subjectId: subj.id,
          subjectName: subj.name,
          status: result.status,
          detail: result.status === "incomplete" ? asm.filter((a) => result.missing.includes(a.id)).map((a) => a.name) : []
        });
      }
    }

    const summary = studentResult({ subjects: forEngine, scale: scale.boundaries });
    built.push({ student, entries, issues, summary });
  }

  // Positions only count students whose results are complete.
  const rankItems = built.map((b) => ({ studentId: b.student.id, average: b.summary.ready ? b.summary.average : null, streamId: b.student.streamId ?? null }));
  const classRanks = rankStudents(rankItems);
  const streamRanks = {};
  for (const sid of new Set(rankItems.map((r) => r.streamId).filter(Boolean))) {
    Object.assign(streamRanks, rankStudents(rankItems.filter((r) => r.streamId === sid)));
  }

  // Same order as every student list: last name, then first name.
  built.sort((a, b) => a.student.lastName.localeCompare(b.student.lastName) || a.student.firstName.localeCompare(b.student.firstName));

  const reports = built.map(({ student, entries, issues, summary }) => {
    const prior = existing[student.id];
    const edited = { classTeacher: !!prior?.remarkEdited?.classTeacher, headteacher: !!prior?.remarkEdited?.headteacher };
    const auto = (type) => remarkFor(summary.average, type, remarkRules);
    const rank = classRanks[student.id];
    const srank = streamRanks[student.id];

    return {
      studentId: student.id,
      isNew: !prior,
      data: {
        termId: term.id,
        termName: term.name,
        academicYearId: term.academicYearId,
        yearName,
        classId: cls.id,
        className: cls.name,
        streamId: student.streamId ?? null,
        streamName: student.streamId ? streams[student.streamId]?.name ?? null : null,
        studentId: student.id,
        studentName: fullName(student),
        admissionNo: student.admissionNo,
        sex: student.sex ?? null,
        gradingScaleId: scale.id,
        absentPolicy,
        subjects: entries,
        totalMarks: summary.totalMarks,
        totalPoints: summary.totalPoints,
        counted: summary.counted,
        average: summary.average,
        overallGrade: summary.overallGrade,
        position: rank ? rank.position : null,
        outOf: rank ? rank.outOf : null,
        streamPosition: srank ? srank.position : null,
        streamOutOf: srank ? srank.outOf : null,
        issues,
        ready: summary.ready,
        classTeacherRemark: edited.classTeacher ? prior.classTeacherRemark ?? null : auto("classTeacher"),
        headteacherRemark: edited.headteacher ? prior.headteacherRemark ?? null : auto("headteacher"),
        remarkEdited: edited,
        status: "draft",
        submittedBy: null,
        submittedAt: null,
        approvedBy: null,
        approvedAt: null
      }
    };
  });

  return {
    reports,
    skipped,
    warnings,
    summary: { generated: reports.length, ready: reports.filter((r) => r.data.ready).length, notReady: reports.filter((r) => !r.data.ready).length }
  };
}

const ISSUE_TEXT = {
  incomplete: "marks missing",
  "invalid-weights": "assessment weights don't total 100%",
  "invalid-marks": "a mark or assessment is invalid",
  "no-assessments": "no assessments"
};

function describeIssue(issue) {
  const extra = issue.detail && issue.detail.length ? ` (${issue.detail.join(", ")})` : "";
  return `${issue.subjectName}: ${ISSUE_TEXT[issue.status] || issue.status}${extra}`;
}

module.exports = { buildClassReports, describeIssue, takesSubject, LOCKED };
