import { requireAuth } from "../auth-guard.js";
import { mountHeader, mountReportTabs } from "../navigation.js";
import { db, functions } from "../firebase-init.js";
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";
import { el, badge } from "../academics/crud-page.js";
import { COLLECTIONS } from "../utils/constants.js";

const generateReports = httpsCallable(functions, "generateReports");

const { profile } = await requireAuth(["admin", "academic"]);
mountHeader(profile);
mountReportTabs(document.getElementById("tabs"), profile);
const root = document.getElementById("app");

// ---------- reference data ----------
let terms, years, classes;
try {
  const [t, y, c] = await Promise.all([
    getDocs(collection(db, COLLECTIONS.TERMS)),
    getDocs(collection(db, COLLECTIONS.ACADEMIC_YEARS)),
    getDocs(collection(db, COLLECTIONS.CLASSES))
  ]);
  const rows = (x) => x.docs.map((d) => ({ id: d.id, ...d.data() }));
  years = new Map(rows(y).map((r) => [r.id, r]));
  terms = rows(t).sort((a, b) =>
    (years.get(b.academicYearId)?.startDate || "").localeCompare(years.get(a.academicYearId)?.startDate || "") ||
    (b.number || 0) - (a.number || 0));
  classes = rows(c).sort((a, b) => (a.order || 0) - (b.order || 0));
} catch {
  root.replaceChildren(el("div", { class: "notice error", role: "alert", text: "Could not load this page. Check your connection and refresh." }));
  throw new Error("load failed");
}
if (!terms.length || !classes.length) {
  root.replaceChildren(
    el("div", { class: "page-head" }, el("h1", { text: "Generate reports" })),
    el("div", { class: "notice error", text: `Add ${!terms.length ? "a term" : "a class"} first, under Academic setup.` })
  );
  throw new Error("setup incomplete");
}

// ---------- skeleton ----------
const termSel = el("select", { "aria-label": "Term" });
terms.forEach((t) => termSel.append(el("option", { value: t.id, text: `${years.get(t.academicYearId)?.name || "?"} · ${t.name}` })));
termSel.value = (terms.find((t) => t.isCurrent) || terms[0]).id;
const classSel = el("select", { "aria-label": "Class" });
classes.forEach((c) => classSel.append(el("option", { value: c.id, text: c.name })));

const genBtn = el("button", { class: "btn-link", type: "button", text: "Generate reports" });
const notice = el("div", { role: "status", hidden: true });
const say = (kind, msg) => { notice.className = `notice ${kind}`; notice.textContent = msg; notice.hidden = false; };
const outcome = el("div");
const tbody = el("tbody");
const count = el("p", { class: "result-count", "aria-live": "polite" });

root.replaceChildren(
  el("div", { class: "page-head" }, el("h1", { text: "Generate reports" }), genBtn),
  el("p", { class: "help", text: "Calculates every student's grades, average and position from the marks entered so far. You can run it as often as you like; approved reports are never changed." }),
  el("div", { class: "filters" }, termSel, classSel),
  notice,
  outcome,
  el("div", { class: "table-wrap" }, el("table", {},
    el("thead", {}, el("tr", {}, ...["Pos.", "Student", "Average", "Grade", "Marks", "Status"].map((t) => el("th", { text: t })))),
    tbody)),
  count
);

// ---------- existing reports ----------
let reports = [];
const WORKFLOW = { draft: "Draft", submitted: "Submitted", approved: "Approved", published: "Published" };

async function loadReports() {
  try {
    const snap = await getDocs(query(collection(db, COLLECTIONS.REPORTS), where("termId", "==", termSel.value), where("classId", "==", classSel.value)));
    reports = snap.docs.map((d) => d.data())
      .sort((a, b) => (b.ready - a.ready) || ((a.position ?? 1e9) - (b.position ?? 1e9)) || a.studentName.localeCompare(b.studentName));
    renderReports();
  } catch {
    say("error", "Could not load reports. Check your connection and refresh.");
  }
}

function renderReports() {
  tbody.replaceChildren();
  if (!reports.length) {
    tbody.append(el("tr", {}, el("td", { class: "empty", colspan: 6, text: "No reports yet for this class and term. Press Generate reports." })));
    count.textContent = "";
    return;
  }
  for (const r of reports) {
    const problems = (r.issues || []).map((i) => i.subjectName).join(", ");
    tbody.append(el("tr", {},
      el("td", { text: r.position ? `${r.position} / ${r.outOf}` : "—" }),
      el("td", { text: r.studentName }),
      el("td", { text: r.average ?? "—" }),
      el("td", { text: r.overallGrade || "—" }),
      el("td", { title: problems }, r.ready ? badge("Complete", "active") : badge(problems ? `Missing: ${problems}` : "Nothing to grade", "inactive")),
      el("td", { text: WORKFLOW[r.status] || r.status })));
  }
  const ready = reports.filter((r) => r.ready).length;
  count.textContent = `${reports.length} reports · ${ready} complete · ${reports.length - ready} need marks`;
}

// ---------- generate ----------
const PROBLEM_TEXT = {
  none: "has no assessments for this term",
  "only-drafts": "only has assessments that haven't been opened"
};

function showOutcome(res) {
  outcome.replaceChildren();
  const parts = [];
  if (res.notReady) parts.push(`${res.notReady} need marks before their position is final`);
  if (res.skipped.length) parts.push(`${res.skipped.length} already approved and left unchanged`);
  outcome.append(el("div", { class: "notice success", role: "status", text: `Generated ${res.generated} ${res.generated === 1 ? "report" : "reports"}: ${res.ready} complete${parts.length ? "; " + parts.join("; ") : ""}.` }));

  if (res.warnings.length) {
    outcome.append(el("div", { class: "notice error" },
      el("strong", { text: "Left off the reports:" }),
      el("ul", { class: "plain-list" }, ...res.warnings.map((w) => el("li", { text: `${w.subjectName} ${PROBLEM_TEXT[w.problem] || w.problem}.` })))));
  }
  if (res.notReadyStudents.length) {
    outcome.append(el("details", { class: "problem-details" },
      el("summary", { text: `See what is missing (${res.notReadyStudents.length})` }),
      el("ul", { class: "plain-list" }, ...res.notReadyStudents.map((s) => el("li", {}, el("strong", { text: s.name }), ": ", s.problems.join("; "))))));
  }
}

genBtn.addEventListener("click", async () => {
  notice.hidden = true;
  outcome.replaceChildren();
  if (reports.length && !confirm("Reports for this class already exist. Generating again recalculates them from the current marks. Remarks someone typed themselves are kept. Continue?")) return;

  genBtn.disabled = true;
  genBtn.textContent = "Generating…";
  try {
    const { data } = await generateReports({ termId: termSel.value, classId: classSel.value });
    showOutcome(data);
    await loadReports();
  } catch (err) {
    const generic = err?.code === "functions/internal" || err?.code === "functions/unavailable" || err?.code === "functions/deadline-exceeded";
    say("error", generic ? "Something went wrong while generating. Try again." : err?.message || "Something went wrong. Try again.");
  } finally {
    genBtn.disabled = false;
    genBtn.textContent = "Generate reports";
  }
});

termSel.addEventListener("change", () => { notice.hidden = true; outcome.replaceChildren(); loadReports(); });
classSel.addEventListener("change", () => { notice.hidden = true; outcome.replaceChildren(); loadReports(); });
loadReports();
