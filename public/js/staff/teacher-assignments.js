import { requireAuth } from "../auth-guard.js";
import { mountHeader } from "../navigation.js";
import { db } from "../firebase-init.js";
import {
  collection, getDocs, query, where, doc, deleteDoc, writeBatch, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { el } from "../academics/crud-page.js";
import { COLLECTIONS, assignmentId } from "../utils/constants.js";

const { profile } = await requireAuth(["admin", "headteacher", "academic"]);
mountHeader(profile);

const root = document.getElementById("app");
const canEdit = ["admin", "academic"].includes(profile.role);

const notice = el("div", { role: "status", hidden: true });
function say(kind, msg) {
  notice.className = `notice ${kind}`;
  notice.textContent = msg;
  notice.hidden = false;
}

// ---------- load reference data ----------
let teachers, classes, streams, subjects, years;
try {
  const [t, c, st, su, y] = await Promise.all([
    getDocs(query(collection(db, COLLECTIONS.USERS), where("role", "==", "teacher"))),
    getDocs(collection(db, COLLECTIONS.CLASSES)),
    getDocs(collection(db, COLLECTIONS.STREAMS)),
    getDocs(collection(db, COLLECTIONS.SUBJECTS)),
    getDocs(collection(db, COLLECTIONS.ACADEMIC_YEARS))
  ]);
  const rows = (s) => s.docs.map((d) => ({ id: d.id, ...d.data() }));
  teachers = new Map(rows(t).map((u) => [u.id, u]));
  classes = rows(c).sort((a, b) => (a.order || 0) - (b.order || 0));
  streams = rows(st).sort((a, b) => a.name.localeCompare(b.name));
  subjects = rows(su).sort((a, b) => a.name.localeCompare(b.name));
  years = rows(y).sort((a, b) => (b.startDate || "").localeCompare(a.startDate || ""));
} catch {
  root.replaceChildren(el("div", { class: "notice error", role: "alert", text: "Could not load this page. Check your connection and refresh." }));
  throw new Error("load failed");
}

const missing = !years.length ? "an academic year" : !classes.length ? "a class" : !subjects.length ? "a subject" : !teachers.size ? "a teacher account" : null;
if (missing) {
  root.replaceChildren(
    el("div", { class: "page-head" }, el("h1", { text: "Teacher assignments" })),
    el("div", { class: "notice error", text: `Add ${missing} first. Assignments connect teachers to classes and subjects.` })
  );
  throw new Error("setup incomplete");
}

const classById = new Map(classes.map((c) => [c.id, c]));
const streamById = new Map(streams.map((s) => [s.id, s]));
const subjectById = new Map(subjects.map((s) => [s.id, s]));
const teacherName = (uid) => {
  const u = teachers.get(uid);
  return u ? `${u.fullName}${u.active ? "" : " (inactive)"}` : "Unknown teacher";
};

// ---------- controls ----------
const yearSel = el("select", { "aria-label": "Academic year" });
years.forEach((y) => yearSel.append(el("option", { value: y.id, text: y.name })));
yearSel.value = (years.find((y) => y.isCurrent) || years[0]).id;

const teacherSel = el("select", { id: "teacher" }, el("option", { value: "", text: "Choose…" }));
[...teachers.values()]
  .filter((u) => u.active)
  .sort((a, b) => a.fullName.localeCompare(b.fullName))
  .forEach((u) => teacherSel.append(el("option", { value: u.id, text: u.fullName })));

const classSel = el("select", { id: "class" }, el("option", { value: "", text: "Choose…" }));
classes.forEach((c) => classSel.append(el("option", { value: c.id, text: c.name })));

const streamSel = el("select", { id: "stream" });
const streamWrap = el("div", { class: "field" }, el("label", { for: "stream", text: "Stream" }), streamSel);

const subjectsBox = el("fieldset", { class: "checklist" });
const assignBtn = el("button", { class: "btn-primary", type: "button", text: "Assign" });

const filterSel = el("select", { "aria-label": "Filter by teacher" }, el("option", { value: "", text: "All teachers" }));
[...teachers.values()]
  .sort((a, b) => a.fullName.localeCompare(b.fullName))
  .forEach((u) => filterSel.append(el("option", { value: u.id, text: teacherName(u.id) })));

const tbody = el("tbody");
const count = el("p", { class: "result-count", "aria-live": "polite" });

const assignCard = el("div", { class: "card", hidden: !canEdit, style: "margin-bottom:1.5rem" },
  el("h2", { class: "form-section", text: "Assign subjects" }),
  el("div", { class: "form-grid" },
    el("div", { class: "field" }, el("label", { for: "teacher", text: "Teacher" }), teacherSel),
    el("div", { class: "field" }, el("label", { for: "class", text: "Class" }), classSel)),
  streamWrap,
  el("div", { class: "field" }, subjectsBox),
  el("div", { class: "form-actions" }, assignBtn)
);

root.replaceChildren(
  el("div", { class: "page-head" }, el("h1", { text: "Teacher assignments" }), yearSel),
  notice,
  assignCard,
  el("div", { class: "filters" }, filterSel),
  el("div", { class: "table-wrap" },
    el("table", {},
      el("thead", {}, el("tr", {}, ...["Teacher", "Class", "Subject"].map((t) => el("th", { text: t })), ...(canEdit ? [el("th", {}, el("span", { class: "sr-only", text: "Actions" }))] : []))),
      tbody)),
  count
);

// ---------- assign form behaviour ----------
function syncClass() {
  const cls = classById.get(classSel.value);

  const list = cls ? streams.filter((s) => s.classId === cls.id) : [];
  streamSel.replaceChildren(el("option", { value: "", text: "All streams" }), ...list.map((s) => el("option", { value: s.id, text: s.name })));
  streamWrap.hidden = list.length === 0;

  subjectsBox.replaceChildren(el("legend", { text: "Subjects" }));
  if (!cls) {
    subjectsBox.append(el("p", { class: "help", text: "Choose a class to see its subjects." }));
    return;
  }
  const fitting = subjects.filter((s) => s.level === "Both" || s.level === cls.level);
  if (!fitting.length) subjectsBox.append(el("p", { class: "help", text: `No ${cls.level} subjects yet. Add some under Academic setup.` }));
  fitting.forEach((s) => {
    subjectsBox.append(el("label", { class: "check" }, el("input", { type: "checkbox", value: s.id }), el("span", { text: `${s.name} (${s.code})` })));
  });
}
classSel.addEventListener("change", syncClass);
syncClass();

// ---------- data ----------
let assignments = [];

async function loadAssignments() {
  try {
    const snap = await getDocs(query(collection(db, COLLECTIONS.TEACHER_ASSIGNMENTS), where("academicYearId", "==", yearSel.value)));
    assignments = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  } catch {
    say("error", "Could not load assignments. Check your connection and refresh.");
  }
}

function render() {
  const rows = assignments
    .filter((a) => !filterSel.value || a.teacherUid === filterSel.value)
    .sort((a, b) =>
      teacherName(a.teacherUid).localeCompare(teacherName(b.teacherUid)) ||
      (classById.get(a.classId)?.order || 0) - (classById.get(b.classId)?.order || 0) ||
      (streamById.get(a.streamId)?.name || "").localeCompare(streamById.get(b.streamId)?.name || "") ||
      (subjectById.get(a.subjectId)?.name || "").localeCompare(subjectById.get(b.subjectId)?.name || ""));

  tbody.replaceChildren();
  if (!rows.length) {
    tbody.append(el("tr", {}, el("td", { class: "empty", colspan: canEdit ? 4 : 3, text: assignments.length ? "No assignments for this teacher." : "No assignments for this year yet." })));
  }
  for (const a of rows) {
    const cls = classById.get(a.classId)?.name || "—";
    const stream = a.streamId ? streamById.get(a.streamId)?.name || "—" : "All streams";
    const subj = subjectById.get(a.subjectId);
    const tr = el("tr", {},
      el("td", { text: teacherName(a.teacherUid) }),
      el("td", { text: `${cls} · ${stream}` }),
      el("td", { text: subj ? `${subj.name} (${subj.code})` : "—" }));
    if (canEdit) {
      tr.append(el("td", { class: "row-actions" }, el("button", { class: "btn-small", type: "button", text: "Remove", onclick: () => remove(a) })));
    }
    tbody.append(tr);
  }
  count.textContent = `${rows.length} of ${assignments.length} assignments`;
}

async function remove(a) {
  notice.hidden = true;
  const subj = subjectById.get(a.subjectId)?.name || "this subject";
  if (!confirm(`Remove ${teacherName(a.teacherUid)} from ${subj}? Marks already entered are kept, but they can no longer edit them.`)) return;
  try {
    await deleteDoc(doc(db, COLLECTIONS.TEACHER_ASSIGNMENTS, a.id));
    await loadAssignments();
  } catch {
    say("error", "Could not remove the assignment. Try again.");
  }
}

assignBtn.addEventListener("click", async () => {
  notice.hidden = true;
  const subjectIds = [...subjectsBox.querySelectorAll("input:checked")].map((i) => i.value);
  if (!teacherSel.value) return say("error", "Choose a teacher.");
  if (!classSel.value) return say("error", "Choose a class.");
  if (!subjectIds.length) return say("error", "Choose at least one subject.");

  const streamId = streamWrap.hidden || !streamSel.value ? null : streamSel.value;
  const existing = new Set(assignments.map((a) => a.id));
  const fresh = subjectIds
    .map((subjectId) => ({ subjectId, id: assignmentId(yearSel.value, teacherSel.value, classSel.value, streamId, subjectId) }))
    .filter((x) => !existing.has(x.id));
  if (!fresh.length) return say("error", "That teacher already has those subjects for this class.");

  assignBtn.disabled = true;
  try {
    const batch = writeBatch(db);
    fresh.forEach(({ id, subjectId }) => {
      batch.set(doc(db, COLLECTIONS.TEACHER_ASSIGNMENTS, id), {
        academicYearId: yearSel.value,
        teacherUid: teacherSel.value,
        classId: classSel.value,
        streamId,
        subjectId,
        createdAt: serverTimestamp(),
        createdBy: profile.uid
      });
    });
    await batch.commit();
    subjectsBox.querySelectorAll("input:checked").forEach((i) => (i.checked = false));
    say("success", `${fresh.length} ${fresh.length === 1 ? "subject" : "subjects"} assigned to ${teacherName(teacherSel.value)}.`);
    await loadAssignments();
  } catch (err) {
    say("error", err?.code === "permission-denied" ? "You don't have permission to assign teachers." : "Could not save. Try again.");
  } finally {
    assignBtn.disabled = false;
  }
});

yearSel.addEventListener("change", () => { notice.hidden = true; loadAssignments(); });
filterSel.addEventListener("change", render);
loadAssignments();
