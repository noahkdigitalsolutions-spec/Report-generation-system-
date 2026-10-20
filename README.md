# SPN School Report System

Marks in, report cards out. Teachers enter marks, the academic office sets up assessments and generates reports,
the head teacher approves them, and report cards print from the browser.

Built with Firebase (Hosting, Authentication, Firestore, Cloud Functions). The pages are plain HTML and JavaScript; there is no build step.

## What's built

| Area | Pages |
|---|---|
| Sign in | login, forgot password |
| Staff (admin) | staff list, add staff, deactivate; teacher assignments |
| Academic setup | years, terms, classes, streams, subjects, subject combinations |
| Students | list with filters, add, edit, profile |
| Assessments | assessment setup (per class, subject and term), marks entry |
| Grading | grade scales, remarks, a tested grading engine |
| Reports | generate, approval (submit, approve, return, publish, reopen), remarks, printable report cards |
| Settings | school profile, report settings (view for all office roles, edit for admin) |

The role dashboards are simple link pages for now. Not built yet: Excel/CSV imports, audit log viewer, marks register and missing-marks pages.

## First-time setup

1. Create a Firebase project. Enable **Authentication → Email/Password** and **Firestore**. Cloud Functions needs the **Blaze** plan.
2. Put your project ID in `.firebaserc` and your web app config in `public/js/firebase-config.js`.
3. Install: `npm install` and `cd functions && npm install`.
4. Deploy: `npx firebase deploy`.
5. Create your first admin by hand: add a user in Authentication, then a Firestore document at `users/{that user's UID}`:
   `{ fullName: "Your Name", email: "you@school.com", role: "admin", active: true }`.
6. Sign in and work through, in order: **Settings → School profile**, **Academic setup** (year, terms, classes, streams, subjects),
   **Grading** (a grade scale for each level, then remarks), **Staff**, **Assignments**, **Students**.
7. Put your logo at `public/assets/images/school-logo.png`.

## Try it locally (recommended before using real data)

```
npm install
cd functions && npm install && cd ..
```

Use an emulator-only project ID in both `.firebaserc` and `public/js/firebase-config.js`, for example `demo-spn`
(anything starting with `demo-` never touches a real project).

```
npm run emulators        # terminal 1: starts everything, site at http://localhost:5000, UI at http://localhost:4000
npm run seed:emulator    # terminal 2: adds a small demo school and four logins
```

Pages opened from `localhost` automatically use the emulators, so nothing here can touch your real data.

### A walk through the whole flow

1. Sign in as `academic@spn.test` (password `password123`). Open **Assessments**, pick Term 1 and S.1, and add "End of term" (out of 100, weight 100) to every subject. Press **Open for marks** on each.
2. Sign in as `teacher@spn.test`. Open **Enter marks**, choose S.1 Mathematics, and type marks for the four students. Try 101 (refused), a letter (refused), the Absent box, and leaving one blank.
3. Back as academic: **Reports → Generate**. The student with a blank mark should show as needing marks; the rest are complete.
4. Fix the missing mark as the teacher, generate again, then **Approval → Submit for approval**.
5. Sign in as `head@spn.test`. **Reports → Approval**: add a head teacher remark, then **Approve**.
6. Press **View** on a student, then **Print**. Try **Print class reports** too.
7. As `admin@spn.test`, add a staff member and check the link it gives you.

## Tests

```
npm test            # grading, marks checks, report calculation, approval rules, card formatting (no Firebase needed)
npm run test:rules  # Firestore security rules, runs against the emulator
```

If you change `functions/src/grading/grade-calculator.js`, run `npm run sync:grading` to refresh the browser copy; a test fails if you forget.

## Layout

```
public/            the website (HTML, CSS, browser JavaScript)
functions/         Cloud Functions: staff accounts, students, report generation, approval
firestore.rules    who can read and write what
tests/             unit tests (node)
tests-rules/       security rules tests (emulator)
docs/DATABASE-STRUCTURE.md   every collection and field, and why
```
