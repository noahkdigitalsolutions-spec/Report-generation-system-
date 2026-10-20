import { logout } from "./auth.js";
import { DASHBOARD_BY_ROLE, ROLE_LABELS } from "./utils/constants.js";

const OFFICE = ["admin", "headteacher", "academic"];

const LINKS = [
  { label: "Dashboard", href: (p) => DASHBOARD_BY_ROLE[p.role], match: "/dashboards/", roles: null },
  { label: "Academic setup", href: () => "/academics/academic-years.html", match: "/academics/", roles: OFFICE },
  { label: "Students", href: () => "/students/students.html", match: "/students/", roles: null },
  { label: "Assessments", href: () => "/assessments/assessment-setup.html", match: "/assessments/assessment-setup", roles: ["admin", "academic"] },
  { label: "Enter marks", href: () => "/assessments/enter-marks.html", match: "/assessments/enter-marks", roles: ["teacher", "admin", "academic"] },
  { label: "Grading", href: () => "/grading/grading-rules.html", match: "/grading/", roles: OFFICE },
  { label: "Reports", href: (p) => (p.role === "headteacher" ? "/reports/report-approval.html" : "/reports/generate-report.html"), match: "/reports/", roles: OFFICE },
  { label: "Staff", href: () => "/staff/staff.html", match: "/staff/staff", roles: ["admin", "headteacher"] },
  { label: "Assignments", href: () => "/staff/teacher-assignments.html", match: "/staff/teacher-assignments", roles: ["admin", "academic"] },
  { label: "Settings", href: () => "/settings/school-profile.html", match: "/settings/", roles: ["admin"] }
];

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "text") node.textContent = v;
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  node.append(...children);
  return node;
}

/** Fill <header id="app-header" class="app-header"> with the brand, role-aware links and sign out. */
export function mountHeader(profile) {
  const header = document.getElementById("app-header");
  const nav = el("nav", { "aria-label": "Main" }, el("strong", { text: "SPN School Reports" }));

  for (const link of LINKS) {
    if (link.roles && !link.roles.includes(profile.role)) continue;
    const a = el("a", { href: link.href(profile), text: link.label });
    if (location.pathname.startsWith(link.match)) a.setAttribute("aria-current", "page");
    nav.append(a);
  }

  const signOut = el("a", { href: "#", text: "Sign out" });
  signOut.addEventListener("click", (e) => {
    e.preventDefault();
    logout();
  });
  const who = el("span", { class: "who" }, `${profile.fullName || profile.email} (${ROLE_LABELS[profile.role] || profile.role}) · `, signOut);

  header.replaceChildren(nav, who);
}

function mountTabs(container, label, tabs) {
  const nav = el("nav", { class: "tabs", "aria-label": label });
  for (const [text, href] of tabs) {
    const a = el("a", { href, text });
    if (location.pathname === href) a.setAttribute("aria-current", "page");
    nav.append(a);
  }
  container.replaceChildren(nav);
}

export function mountAcademicTabs(container) {
  mountTabs(container, "Academic setup", [
    ["Years", "/academics/academic-years.html"],
    ["Terms", "/academics/terms.html"],
    ["Classes", "/academics/classes.html"],
    ["Streams", "/academics/streams.html"],
    ["Subjects", "/academics/subjects.html"],
    ["Combinations", "/academics/subject-combinations.html"]
  ]);
}

export function mountGradingTabs(container) {
  mountTabs(container, "Grading", [
    ["Grade scales", "/grading/grading-rules.html"],
    ["Remarks", "/grading/remark-rules.html"]
  ]);
}

export function mountReportTabs(container) {
  mountTabs(container, "Reports", [
    ["Generate", "/reports/generate-report.html"],
    ["Approval", "/reports/report-approval.html"]
  ]);
}

export function mountSettingsTabs(container) {
  mountTabs(container, "Settings", [
    ["School profile", "/settings/school-profile.html"],
    ["Report settings", "/settings/report-settings.html"]
  ]);
}
