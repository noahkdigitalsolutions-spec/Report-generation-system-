/** Firestore collection names. Keep in sync with functions/src/config/constants.js. */
export const COLLECTIONS = {
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

export const ROUTES = {
  LOGIN: "/login.html"
};

export const ROLE_LABELS = {
  admin: "Administrator",
  headteacher: "Head teacher",
  academic: "Academic office",
  teacher: "Teacher"
};

export const DASHBOARD_BY_ROLE = {
  admin: "/dashboards/admin.html",
  headteacher: "/dashboards/headteacher.html",
  academic: "/dashboards/academic.html",
  teacher: "/dashboards/teacher.html"
};

export const ASSESSMENT_STATUS = { DRAFT: "draft", OPEN: "open", LOCKED: "locked" };

/** Marks are keyed assessmentId_studentId. firestore.rules enforces the same format. */
export const markId = (assessmentId, studentId) => `${assessmentId}_${studentId}`;

/** teacherAssignments are keyed year_teacher_class_stream_subject ("all" = every stream). */
export const assignmentId = (yearId, teacherUid, classId, streamId, subjectId) =>
  [yearId, teacherUid, classId, streamId || "all", subjectId].join("_");
