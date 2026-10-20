import { requireAuth } from "../auth-guard.js";
import { mountHeader, mountReportTabs } from "../navigation.js";
import { db, functions } from "../firebase-init.js";
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";
import { el, badge } from "../academics/crud-page.js";
import { COLLECTIONS } from "../utils/constants.js";

const changeStatus = httpsCallable(functions, "changeReportStatus");
const saveRemarks = httpsCallable(functions, "saveReportRemarks");

const { profile } = await requireAuth(["admin", "academic", "headteacher"]);
mountHeader(profile);
mountReportTabs(document.getElementById("tabs"), profile);
const root = document.getElementById("app");
const role = profile.role;

const STATUS = {
  draft: ["Draft", "inactive"], submitted: ["Submitted", "inactive"],
  approved: ["Approved", "active"], published: ["Published", "active"]
};

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
    el("div", { class: "page-head" }, el("h1", { text: "Report approval" })),
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

const notice = el("div", { role: "status", hidden: true });
const say = (kind, msg) => { notice.className = `notice ${kind}`; notice.textContent = msg; notice.hidden = false; };
const summaryEl = el("p", { class: "result-count", "aria-live": "polite" });
const actionsEl = el("div", { class: "action-bar" });
const tbody = el("tbody");

const dialog = el("dialog", { "aria-labelledby": "dlg-title" });
root.replaceChildren(
  el("div", { class: "page-head" }, el("h1", { text: "Report approval" })),
  el("div", { class: "filters" }, termSel, classSel),
  notice,
  actionsEl,
  el("div", { class: "table-wrap" }, el("table", {},
    el("thead", {}, el("tr", {}, ...["Pos.", "Student", "Average", "Status", ""].map((t) => el("th", { text: t })))),
    tbody)),
  summaryEl,
  dialog
);

// ---------- data ----------
let reports = [];

async function load() {
  try {
    const snap = await getDocs(query(collection(db, COLLECTIONS.REPORTS), where("termId", "==", termSel.value), where("classId", "==", classSel.value)));
    reports = snap.docs.map((d) => d.data())
      .sort((a, b) => ((a.position ?? 1e9) - (b.position ?? 1e9)) || a.studentName.localeCompare(b.studentName));
    render();
  } catch {
    say("error", "Could not load reports. Check your connection and refresh.");
  }
}

const countBy = (...statuses) => reports.filter((r) => statuses.includes(r.status)).length;

// ---------- actions ----------
const STEPS = [
  { action: "submit", label: "Submit for approval", roles: ["admin", "academic"], from: ["draft"], primary: true,
    confirm: (n) => `Submit ${n} ${n === 1 ? "report" : "reports"} for approval? Their remarks and marks can't change while they wait.` },
  { action: "approve", label: "Approve", roles: ["admin", "headteacher"], from: ["submitted"], primary: true,
    confirm: (n) => `Approve ${n} ${n === 1 ? "report" : "reports"}?` },
  { action: "return", label: "Return to draft", roles: ["admin", "headteacher"], from: ["submitted"], note: { title: "Return to draft", label: "What needs fixing? (optional)", required: false } },
  { action: "publish", label: "Publish", roles: ["admin", "headteacher"], from: ["approved"], primary: true,
    confirm: (n) => `Publish ${n} ${n === 1 ? "report" : "reports"}?` },
  { action: "reopen", label: "Reopen", roles: ["admin", "headteacher"], from: ["approved", "published"], note: { title: "Reopen reports", label: "Why are they being reopened?", required: true } }
];

function askNote({ title, label, required }) {
  return new Promise((resolve) => {
    const text = el("textarea", { id: "note", rows: 3, maxlength: 300 });
    const err = el("div", { class: "notice error", role: "alert", hidden: true });
    const form = el("form", { novalidate: true },
      el("div", { class: "field" }, el("label", { for: "note", text: label }), text),
      err,
      el("div", { class: "dialog-actions" },
        el("button", { class: "btn-small", type: "button", text: "Cancel", onclick: () => { dialog.close(); resolve(null); } }),
        el("button", { class: "btn-primary", type: "submit", text: "Continue" })));
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (required && text.value.trim().length < 3) { err.textContent = "Please give a reason."; err.hidden = false; return; }
      dialog.close();
      resolve(text.value.trim());
    });
    dialog.addEventListener("cancel", () => resolve(null), { once: true });
    dialog.replaceChildren(el("h2", { id: "dlg-title", class: "dialog-title", text: title }), form);
    dialog.showModal();
    text.focus();
  });
}

async function runStep(step) {
  notice.hidden = true;
  const n = countBy(...step.from);
  let note;
  if (step.note) {
    note = await askNote(step.note);
    if (note === null) return;
  } else if (!confirm(step.confirm(n))) return;

  actionsEl.querySelectorAll("button").forEach((b) => (b.disabled = true));
  try {
    const { data } = await changeStatus({ termId: termSel.value, classId: classSel.value, action: step.action, note });
    say("success", `${data.changed} ${data.changed === 1 ? "report" : "reports"} updated.`);
  } catch (err) {
    const generic = ["functions/internal", "functions/unavailable", "functions/deadline-exceeded"].includes(err?.code);
    say("error", generic ? "Something went wrong. Try again." : err?.message || "Something went wrong. Try again.");
  }
  await load();
}

// ---------- remarks dialog ----------
function openRemarks(r) {
  const canTeacher = ["admin", "academic"].includes(role) && r.status === "draft";
  const canHead = ["admin", "headteacher"].includes(role) && ["draft", "submitted"].includes(r.status);

  const ct = el("textarea", { id: "ct", rows: 3, maxlength: 300 });
  const hd = el("textarea", { id: "hd", rows: 3, maxlength: 300 });
  ct.value = r.classTeacherRemark || ""; hd.value = r.headteacherRemark || "";
  ct.disabled = !canTeacher; hd.disabled = !canHead;
  const err = el("div", { class: "notice error", role: "alert", hidden: true });
  const locked = !canTeacher && !canHead;

  const form = el("form", { novalidate: true },
    el("div", { class: "field" }, el("label", { for: "ct", text: "Class teacher's remark" }), ct),
    el("div", { class: "field" }, el("label", { for: "hd", text: "Head teacher's remark" }), hd),
    el("p", { class: "help", text: locked ? `This report is ${r.status}, so its remarks can't be changed. Ask the head teacher to reopen it.` : "Leave a box empty for no remark." }),
    err,
    el("div", { class: "dialog-actions" },
      el("button", { class: "btn-small", type: "button", text: locked ? "Close" : "Cancel", onclick: () => dialog.close() }),
      ...(locked ? [] : [el("button", { class: "btn-primary", type: "submit", text: "Save" })])));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.hidden = true;
    const payload = { termId: termSel.value, studentId: r.studentId };
    if (canTeacher && ct.value !== (r.classTeacherRemark || "")) payload.classTeacherRemark = ct.value;
    if (canHead && hd.value !== (r.headteacherRemark || "")) payload.headteacherRemark = hd.value;
    if (Object.keys(payload).length === 2) return dialog.close();

    const btn = form.querySelector("[type=submit]");
    btn.disabled = true;
    try {
      await saveRemarks(payload);
      dialog.close();
      say("success", "Remarks saved.");
      await load();
    } catch (ex) {
      err.textContent = ["functions/internal", "functions/unavailable"].includes(ex?.code) ? "Could not save. Try again." : ex?.message || "Could not save. Try again.";
      err.hidden = false;
      btn.disabled = false;
    }
  });

  dialog.replaceChildren(el("h2", { id: "dlg-title", class: "dialog-title", text: r.studentName }), form);
  dialog.showModal();
}

// ---------- render ----------
function render() {
  actionsEl.replaceChildren();
  for (const step of STEPS) {
    if (!step.roles.includes(role)) continue;
    const n = countBy(...step.from);
    if (!n) continue;
    actionsEl.append(el("button", { class: step.primary ? "btn-link" : "btn-small", type: "button", text: `${step.label} (${n})`, onclick: () => runStep(step) }));
  }

  tbody.replaceChildren();
  if (!reports.length) {
    tbody.append(el("tr", {}, el("td", { class: "empty", colspan: 5, text: "No reports yet for this class and term. The academic office generates them first." })));
    summaryEl.textContent = "";
    return;
  }
  for (const r of reports) {
    const [label, kind] = STATUS[r.status] || [r.status, "inactive"];
    tbody.append(el("tr", {},
      el("td", { text: r.position ? `${r.position} / ${r.outOf}` : "—" }),
      el("td", {}, r.studentName, ...(r.ready ? [] : [" ", badge("Needs marks", "inactive")])),
      el("td", { text: r.average ?? "—" }),
      el("td", {}, badge(label, kind), ...(r.statusNote && r.status === "draft" ? [el("div", { class: "help", text: `Note: ${r.statusNote}` })] : [])),
      el("td", { class: "row-actions" }, el("button", { class: "btn-small", type: "button", text: "Remarks", onclick: () => openRemarks(r) }))));
  }
  const parts = Object.entries(STATUS).map(([k, [l]]) => [l, countBy(k)]).filter(([, n]) => n).map(([l, n]) => `${n} ${l.toLowerCase()}`);
  summaryEl.textContent = `${reports.length} reports · ${parts.join(" · ")}`;
}

termSel.addEventListener("change", () => { notice.hidden = true; load(); });
classSel.addEventListener("change", () => { notice.hidden = true; load(); });
load();
