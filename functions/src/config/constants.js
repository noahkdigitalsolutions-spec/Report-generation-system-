"use strict";

/** Firestore collection names. Keep in sync with public/js/utils/constants.js. */
const COLLECTIONS = {
  USERS: "users",
  ACADEMIC_YEARS: "academicYears",
  TERMS: "terms",
  CLASSES: "classes",
  STREAMS: "streams",
  SUBJECTS: "subjects",
  SUBJECT_COMBINATIONS: "subjectCombinations",
  STUDENTS: "students",
  ENROLLMENTS: "enrollments",
  ADMISSION_NUMBERS: "admissionNumbers",
  TEACHER_ASSIGNMENTS: "teacherAssignments",
  ASSESSMENTS: "assessments",
  MARKS: "marks",
  GRADING_SCALES: "gradingScales",
  REMARK_RULES: "remarkRules",
  REPORTS: "reports",
  SETTINGS: "settings",
  AUDIT_LOGS: "auditLogs"
};

const ROLES = ["admin", "headteacher", "academic", "teacher"];

module.exports = { COLLECTIONS, ROLES };
