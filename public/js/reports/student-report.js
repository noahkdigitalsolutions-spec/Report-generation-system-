import { requireAuth } from "../auth-guard.js";
import { mountHeader } from "../navigation.js";
import { db } from "../firebase-init.js";
import { collection, getDocs, getDoc, doc, query, where } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { el } from "../academics/crud-page.js";
import { COLLECTIONS } from "../utils/constants.js";
import { renderReportCard } from "./report-print.js";
import { byLastName } from "./report-format.js";

const { profile } = await requireAuth(["admin", "academic", "headteacher"]);
mountHeader(profile);

const root = document.getElementById("app");
const params = new URLSearchParams(location.search);
const termId = params.get("term");
const studentId = params.get("student");
const classId = params.get("class");

const sheets = el("div", { class: "sheets" });
const count = el("span", { class: "result-count" });
const includeDrafts = el("input", { type: "checkbox" });

const back = el("a", { class: "btn-small", href: "/reports/report-approval.html", text: "Back" });
const printBtn = el("button", { class: "btn-link", type: "button", text: "Print", onclick: () => window.print() });
const draftsToggle = el("label", { class: "check", hidden: !classId }, includeDrafts, el("span", { text: "Include reports that aren't approved yet (marked DRAFT)" }));

root.replaceChildren(
  el("div", { class: "no-print toolbar" }, back, printBtn, draftsToggle, count),
  sheets
);

function problem(msg) {
  sheets.replaceChildren(el("div", { class: "notice error no-print", role: "alert", text: msg }));
  count.textContent = "";
  printBtn.disabled = true;
}

if (!termId || (!studentId && !classId)) {
  problem("Nothing to show. Open a report from the approval page.");
  throw new Error("missing params");
}

// ---------- shared data ----------
let school = {}, settings = {}, nextTermBegins = null, all = [];
const scales = new Map();
try {
  const [schoolSnap, settingsSnap, termSnap] = await Promise.all([
    getDoc(doc(db, COLLECTIONS.SETTINGS, "school")),
    getDoc(doc(db, COLLECTIONS.SETTINGS, "report")),
    getDoc(doc(db, COLLECTIONS.TERMS, termId))
  ]);
  school = schoolSnap.exists() ? schoolSnap.data() : {};
  settings = settingsSnap.exists() ? settingsSnap.data() : {};
  nextTermBegins = termSnap.exists() ? termSnap.data().nextTermBegins || null : null;

  if (studentId) {
    const snap = await getDoc(doc(db, COLLECTIONS.REPORTS, `${termId}_${studentId}`));
    all = snap.exists() ? [snap.data()] : [];
  } else {
    const snap = await getDocs(query(collection(db, COLLECTIONS.REPORTS), where("termId", "==", termId), where("classId", "==", classId)));
    all = snap.docs.map((d) => d.data()).sort(byLastName);
  }

  for (const id of new Set(all.map((r) => r.gradingScaleId).filter(Boolean))) {
    const s = await getDoc(doc(db, COLLECTIONS.GRADING_SCALES, id));
    if (s.exists()) scales.set(id, s.data());
  }
} catch {
  problem("Could not load the reports. Check your connection and refresh.");
  throw new Error("load failed");
}

function draw() {
  const shown = studentId || includeDrafts.checked ? all : all.filter((r) => ["approved", "published"].includes(r.status));
  sheets.replaceChildren();
  if (!shown.length) {
    problem(studentId
      ? "That report doesn't exist yet. Generate the reports first."
      : all.length
        ? "None of this class's reports are approved yet. Tick the box above to preview them as drafts."
        : "There are no reports for this class yet.");
    return;
  }
  printBtn.disabled = false;
  shown.forEach((r) => sheets.append(renderReportCard(r, { school, settings, scale: scales.get(r.gradingScaleId), nextTermBegins })));
  count.textContent = `${shown.length} ${shown.length === 1 ? "report" : "reports"}`;
  document.title = studentId ? `${shown[0].studentName} · ${shown[0].termName}` : `${shown[0].className} reports · ${shown[0].termName}`;
}

includeDrafts.addEventListener("change", draw);
draw();
