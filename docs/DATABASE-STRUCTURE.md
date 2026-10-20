# Database structure

Every Firestore collection, who writes it, and why. Rules live in `firestore.rules` and are tested by `npm run test:rules`.

"Functions" means a Cloud Function using the Admin SDK (rules do not apply to it). "Office" means the `admin` and `academic` roles.

| Collection | Document ID | Key fields | Written by |
|---|---|---|---|
| `users` | Auth UID | `fullName`, `email`, `role` (admin, headteacher, academic, teacher), `active` | Functions (staff creation); admin |
| `academicYears` | auto | `name`, `startDate`, `endDate`, `isCurrent` (only one true) | Office |
| `terms` | auto | `academicYearId`, `name`, `number` (1-3), `startDate`, `endDate`, `nextTermBegins`, `status`, `isCurrent` | Office |
| `classes` | auto | `name`, `level` (O-Level or A-Level), `order` | Office |
| `streams` | auto | `classId`, `name` | Office |
| `subjects` | auto | `name`, `code`, `level` (O-Level, A-Level, Both), `isCompulsory` | Office |
| `subjectCombinations` | auto | `name`, `subjectIds[]` (A-Level students only sit their combination plus compulsory subjects) | Office |
| `students` | auto | `admissionNo`, `firstName`, `lastName`, `otherNames`, `sex`, `dateOfBirth`, `guardian{}`, `classId`, `streamId`, `combinationId`, `status` | Functions only |
| `enrollments` | `{yearId}_{studentId}` | `academicYearId`, `studentId`, `classId`, `streamId`, `combinationId` | Functions only |
| `admissionNumbers` | URL-encoded upper-case number | `studentId`. Exists only to make admission numbers unique inside a transaction | Functions only; closed to browsers |
| `teacherAssignments` | `{yearId}_{teacherUid}_{classId}_{streamId or "all"}_{subjectId}` | `academicYearId`, `teacherUid`, `classId`, `streamId` (null = every stream), `subjectId` | Office |
| `assessments` | auto | `academicYearId`, `termId`, `classId`, `subjectId`, `name`, `type`, `maxScore`, `weight`, `status` (draft, open, locked). Weights per subject total 100 | Office |
| `marks` | `{assessmentId}_{studentId}` | `assessmentId`, `academicYearId`, `termId`, `classId`, `streamId`, `subjectId`, `studentId`, `score` (number or null), `absent`, `enteredBy`, `updatedAt` | Assigned teachers while the assessment is open; office any time |
| `gradingScales` | auto | `name`, `level`, `isActive` (one per level), `boundaries[{min, grade, points, remark}]` | Office |
| `remarkRules` | auto | `type` (classTeacher, headteacher), `minAverage`, `text` | Office |
| `reports` | `{termId}_{studentId}` | the whole report card: subjects, totals, average, positions, remarks, `status` (draft, submitted, approved, published) | Functions only |
| `settings` | `school`, `report` | school: `name`, `motto`, `address`, `phone`, `email`, `principalName`. report: `showPosition`, `absentPolicy` (zero or exclude), `footerNote` | Admin |
| `auditLogs` | auto | `action`, `actorUid`, `actorName`, `actorRole`, `targetUid`, `details`, `createdAt` | Functions only |

## Why some things are the way they are

- **Reports are stored whole.** A report card is a snapshot: later changes to marks or names do not alter an approved report. Approved and published reports are never regenerated.
- **Marks have a fixed document ID** (`assessmentId_studentId`) so a student can only ever have one mark per assessment, and rules can check the ID.
- **Teacher reads are narrow.** Teachers can only read marks for subjects they are assigned, so their queries must filter by year, class and subject (and stream when the assignment is per stream).
- **Students and reports are written by Functions** so admission numbers stay unique, enrolments stay in step, and every status change is audited.
- **No composite indexes are needed.** Every query is equality-only, or a single-field `orderBy`.
