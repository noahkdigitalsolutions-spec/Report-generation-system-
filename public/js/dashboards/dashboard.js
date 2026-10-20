import { requireAuth } from "../auth-guard.js";
import { mountHeader } from "../navigation.js";
import { el } from "../academics/crud-page.js";
import { ROLE_LABELS } from "../utils/constants.js";

const { profile } = await requireAuth();
mountHeader(profile);

const TILES = {
  admin: [
    ["Staff", "Add accounts, deactivate leavers", "/staff/staff.html"],
    ["Academic setup", "Years, terms, classes, subjects", "/academics/academic-years.html"],
    ["Teacher assignments", "Who teaches what", "/staff/teacher-assignments.html"],
    ["Students", "Add and update students", "/students/students.html"],
    ["Grading", "Grade scales and remarks", "/grading/grading-rules.html"],
    ["Reports", "Generate and approve report cards", "/reports/generate-report.html"],
    ["Settings", "School profile and report settings", "/settings/school-profile.html"]
  ],
  academic: [
    ["Assessments", "Set up and open assessments", "/assessments/assessment-setup.html"],
    ["Enter marks", "Record or correct marks", "/assessments/enter-marks.html"],
    ["Reports", "Generate and submit report cards", "/reports/generate-report.html"],
    ["Students", "Add and update students", "/students/students.html"],
    ["Teacher assignments", "Who teaches what", "/staff/teacher-assignments.html"],
    ["Academic setup", "Years, terms, classes, subjects", "/academics/academic-years.html"],
    ["Grading", "Grade scales and remarks", "/grading/grading-rules.html"]
  ],
  headteacher: [
    ["Report approval", "Review, approve and publish", "/reports/report-approval.html"],
    ["Students", "Look up a student", "/students/students.html"],
    ["Staff", "Who has an account", "/staff/staff.html"]
  ],
  teacher: [
    ["Enter marks", "Record marks for your classes", "/assessments/enter-marks.html"],
    ["Students", "Look up a student", "/students/students.html"]
  ]
};

const first = (profile.fullName || profile.email || "").split(" ")[0];
document.getElementById("app").replaceChildren(
  el("h1", { class: "dash-greeting", text: `Hello, ${first}` }),
  el("p", { class: "dash-sub", text: ROLE_LABELS[profile.role] || profile.role }),
  el("div", { class: "tile-grid" },
    ...(TILES[profile.role] || []).map(([title, text, href]) =>
      el("a", { class: "tile", href }, el("strong", { text: title }), el("span", { text })))));
