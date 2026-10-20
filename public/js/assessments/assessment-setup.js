import { requireAuth } from "../auth-guard.js";
import { mountHeader } from "../navigation.js";
import { db } from "../firebase-init.js";
import {
  collection, getDocs, query, where, doc, updateDoc, deleteDoc, writeBatch, limit, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { el, badge } from "../academics/crud-page.js";
import { COLLECTIONS, ASSESSMENT_STATUS } from "../utils/constants.js";

const TYPES = [["BOT", "Beginning of term"], ["MOT", "Mid-term"], ["EOT", "End of term"], ["CA", "Continuous assessment"]];
const typeLabel = (t) => TYPES.find(([v]) => v === t)?.[1] || t;
const round2 = (n) => Math.round(n * 100) / 100;

const { profile } = await requireAuth(["admin", "headteacher", "academic"]);
mountHeader(profile);

const root = document.getElementById("app");
const canManage = ["admin", "academic"].includes(profile.role);

// ---------- reference data ----------
let terms, years, classes, subjects;
try {
  const [t, y, c, s] = await Promise.all([
    getDocs(collection(db, COLLECTIONS.TERMS)),
    getDocs(collection(db, COLLECTIONS.ACADEMIC_YEARS)),
    getDocs(collection(db, COLLECTIONS.CLASSES)),
    getDocs(collection(db, COLLECTIONS.SUBJECTS))
  ]);
  const rows = (x) => x.docs.map((d) => ({ id: d.id, ...d.data() }));
  years = new Map(rows(y).map((r) => [r.id, r]));
  terms = rows(t).sort((a, b) =>
    (years.get(b.academicYearId)?.startDate || "").localeCompare(years.get(a.academicYearId)?.startDate || "") ||
    (b.number || 0) - (a.number || 0));
  classes = rows(c).sort((a, b) => (a.order || 0) - (b.order || 0));
  subjects = rows(s).sort((a, b) => a.name.localeCompare(b.name));
} catch {
  root.replaceChildren(el("div", { class: "notice error", role: "alert", text: "Could not load this page. Check your connection and refresh." }));
  throw new Error("load failed");
}

const missing = !terms.length ? "a term" : !classes.length ? "a class" : !subjects.length ? "a subject" : null;
if (missing) {
  root.replaceChildren(
    el("div", { class: "page-head" }, el("h1", { text: "Assessments" })),
    el("div", { class: "notice error", text: `Add ${missing} first, under Academic setup.` })
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

const addBtn = el("button", { class: "btn-link", type: "button", text: "Add assessment", hidden: !canManage, onclick: () => openDialog() });
const list = el("div");

const dialog = el("dialog", { "aria-labelledby": "dlg-title" });
const dlgTitle = el("h2", { id: "dlg-title", class: "dialog-title" });
const dlgNotice = el("div", { class: "notice error", role: "alert", hidden: true });
const form = el("form", { novalidate: true });
dialog.append(dlgTitle, dlgNotice, form);

root.replaceChildren(
  el("div", { class: "page-head" }, el("h1", { text: "Assessments" }), addBtn),
  el("div", { class: "filters" }, termSel, classSel),
  notice,
  list,
  dialog
);

// ---------- state ----------
let assessments = [];
const term = () => terms.find((t) => t.id === termSel.value);
const cls = () => classes.find((c) => c.id === classSel.value);
const subjectsForClass = () => subjects.filter((s) => s.level === "Both" || s.level === cls().level);
const forSubject = (sid) => assessments.filter((a) => a.subjectId === sid);
const totalWeight = (sid, exceptId = null) => round2(forSubject(sid).filter((a) => a.id !== exceptId).reduce((n, a) => n + (a.weight || 0), 0));
const editable = () => canManage && term().status !== "closed";

async function load() {
  try {
    const snap = await getDocs(query(
      collection(db, COLLECTIONS.ASSESSMENTS),
      where("termId", "==", termSel.value),
      where("classId", "==", classSel.value)
    ));
    assessments = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
    render();
  } catch {
    say("error", "Could not load assessments. Check your connection and refresh.");
  }
}

// ---------- render ----------
const STATUS_BADGE = {
  draft: ["Draft", "inactive"],
  open: ["Open", "active"],
  locked: ["Locked", "inactive"]
};

function render() {
  const canEdit = editable();
  addBtn.hidden = !canEdit;
  list.replaceChildren();

  if (canManage && term().status === "closed") {
    list.append(el("div", { class: "notice error", text: "This term is closed, so its assessments can't be changed." }));
  }

  for (const s of subjectsForClass()) {
    const mine = forSubject(s.id);
    const total = totalWeight(s.id);
    const weightBadge = !mine.length ? badge("No assessments", "inactive") : total === 100 ? badge("Weights 100%", "active") : badge(`Weights ${total}% (needs 100)`, "inactive");

    const head = el("div", { class: "subject-head" },
      el("h2", { text: `${s.name} (${s.code})` }),
      el("span", { class: "subject-tools" }, weightBadge, canEdit ? el("button", { class: "btn-small", type: "button", text: "Add", onclick: () => openDialog({ subjectId: s.id }) }) : ""));

    let body;
    if (!mine.length) {
      body = el("p", { class: "help", text: "No assessments yet." });
    } else {
      body = el("div", { class: "table-wrap" }, el("table", {},
        el("thead", {}, el("tr", {}, ...["Name", "Type", "Out of", "Weight", "Status"].map((t) => el("th", { text: t })), ...(canEdit ? [el("th", {}, el("span", { class: "sr-only", text: "Actions" }))] : []))),
        el("tbody", {}, ...mine.map((a) => {
          const [label, kind] = STATUS_BADGE[a.status] || [a.status, "inactive"];
          const tr = el("tr", {},
            el("td", { text: a.name }),
            el("td", { text: typeLabel(a.type) }),
            el("td", { text: String(a.maxScore) }),
            el("td", { text: `${a.weight}%` }),
            el("td", {}, badge(label, kind)));
          if (canEdit) {
            const next = a.status === "draft" ? ["Open for marks", "open"] : a.status === "open" ? ["Lock", "locked"] : ["Reopen", "open"];
            tr.append(el("td", { class: "row-actions" },
              el("button", { class: "btn-small", type: "button", text: next[0], onclick: () => setStatus(a, next[1]) }),
              el("button", { class: "btn-small", type: "button", text: "Edit", onclick: () => openDialog({ assessment: a }) }),
              el("button", { class: "btn-small", type: "button", text: "Delete", onclick: () => remove(a) })));
          }
          return tr;
        }))));
    }
    list.append(el("section", { class: "card subject-card" }, head, body));
  }
}

// ---------- status / delete ----------
async function hasMarks(assessmentId) {
  const snap = await getDocs(query(collection(db, COLLECTIONS.MARKS), where("assessmentId", "==", assessmentId), limit(1)));
  return !snap.empty;
}

async function setStatus(a, status) {
  notice.hidden = true;
  const subj = subjects.find((s) => s.id === a.subjectId);

  if (status === ASSESSMENT_STATUS.OPEN) {
    if (term().status === "closed") return say("error", "This term is closed.");
    const total = totalWeight(a.subjectId);
    if (total !== 100) return say("error", `${subj.name} weights add up to ${total}%. They must total 100% before marks can be entered.`);
  }
  if (status === ASSESSMENT_STATUS.LOCKED && !confirm(`Lock ${a.name} for ${subj.name}? Teachers won't be able to change its marks.`)) return;
  if (a.status === ASSESSMENT_STATUS.LOCKED && !confirm(`Reopen ${a.name} for ${subj.name}? Teachers will be able to change its marks again.`)) return;

  try {
    await updateDoc(doc(db, COLLECTIONS.ASSESSMENTS, a.id), { status, updatedAt: serverTimestamp() });
    await load();
  } catch {
    say("error", "Could not change the status. Try again.");
  }
}

async function remove(a) {
  notice.hidden = true;
  if (!confirm(`Delete ${a.name}? This can't be undone.`)) return;
  try {
    if (await hasMarks(a.id)) return say("error", `${a.name} already has marks entered, so it can't be deleted.`);
    await deleteDoc(doc(db, COLLECTIONS.ASSESSMENTS, a.id));
    await load();
  } catch {
    say("error", "Could not delete. Try again.");
  }
}

// ---------- add / edit dialog ----------
let editing = null;
let ctl = {};

function field(label, control, help) {
  return el("div", { class: "field" }, el("label", { for: control.id, text: label }), control, help ? el("p", { class: "help", text: help }) : "");
}

function openDialog({ assessment = null, subjectId = null } = {}) {
  editing = assessment;
  dlgNotice.hidden = true;
  dlgTitle.textContent = assessment ? "Edit assessment" : "Add assessment";

  const name = el("input", { id: "a-name", type: "text", autocomplete: "off", maxlength: 60, placeholder: "End of term exam" });
  const type = el("select", { id: "a-type" }, el("option", { value: "", text: "Choose…" }), ...TYPES.map(([v, l]) => el("option", { value: v, text: l })));
  const max = el("input", { id: "a-max", type: "number", min: 1, max: 1000, step: "any", inputmode: "decimal" });
  const weight = el("input", { id: "a-weight", type: "number", min: 1, max: 100, step: "any", inputmode: "decimal" });
  if (assessment) {
    name.value = assessment.name; type.value = assessment.type; max.value = assessment.maxScore; weight.value = assessment.weight;
  }

  const boxes = [];
  let subjectField = "";
  if (!assessment) {
    const preselected = new Set(subjectId ? [subjectId] : []);
    const fieldset = el("fieldset", { class: "checklist" }, el("legend", { text: "Subjects" }));
    subjectsForClass().forEach((s) => {
      const input = el("input", { type: "checkbox", value: s.id });
      input.checked = preselected.has(s.id);
      boxes.push(input);
      fieldset.append(el("label", { class: "check" }, input, el("span", { text: `${s.name} (${s.code})` })));
    });
    const toggle = el("button", { class: "btn-small", type: "button", text: "Select all", onclick: () => {
      const all = boxes.every((b) => b.checked);
      boxes.forEach((b) => (b.checked = !all));
      toggle.textContent = all ? "Select all" : "Select none";
    } });
    subjectField = el("div", { class: "field" }, fieldset, el("div", { style: "margin-top:0.5rem" }, toggle));
  }

  ctl = { name, type, max, weight, boxes };
  form.replaceChildren(
    field("Name", name),
    field("Type", type),
    el("div", { class: "form-grid" },
      field("Out of", max, "The mark the paper is marked out of."),
      field("Weight (%)", weight, "How much it counts toward the final subject score.")),
    subjectField,
    el("div", { class: "dialog-actions" },
      el("button", { class: "btn-small", type: "button", text: "Cancel", onclick: () => dialog.close() }),
      el("button", { class: "btn-primary", type: "submit", text: assessment ? "Save changes" : "Add" }))
  );
  dialog.showModal();
}

const fail = (msg) => { dlgNotice.textContent = msg; dlgNotice.hidden = false; };

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  dlgNotice.hidden = true;

  const name = ctl.name.value.trim().replace(/\s+/g, " ");
  const maxScore = ctl.max.value === "" ? NaN : Number(ctl.max.value);
  const weight = ctl.weight.value === "" ? NaN : Number(ctl.weight.value);

  if (!name) return fail("Name is required.");
  if (!ctl.type.value) return fail("Type is required.");
  if (!Number.isFinite(maxScore) || maxScore <= 0 || maxScore > 1000) return fail("\"Out of\" must be a number between 1 and 1000.");
  if (!Number.isFinite(weight) || weight <= 0 || weight > 100) return fail("Weight must be a number between 1 and 100.");

  const targets = editing ? [editing.subjectId] : ctl.boxes.filter((b) => b.checked).map((b) => b.value);
  if (!targets.length) return fail("Choose at least one subject.");

  for (const sid of targets) {
    const subj = subjects.find((s) => s.id === sid);
    const others = forSubject(sid).filter((a) => a.id !== editing?.id);
    if (others.some((a) => a.name.toLowerCase() === name.toLowerCase())) return fail(`${subj.name} already has an assessment called ${name}.`);
    const total = round2(totalWeight(sid, editing?.id) + weight);
    if (total > 100) return fail(`${subj.name}: weights would add up to ${total}%. They can't pass 100%.`);
  }

  const submitBtn = form.querySelector("[type=submit]");
  submitBtn.disabled = true;
  try {
    if (editing) {
      if (maxScore !== editing.maxScore && (await hasMarks(editing.id))) {
        return fail("Marks are already entered, so \"Out of\" can't change. Delete the marks first, or add a new assessment.");
      }
      await updateDoc(doc(db, COLLECTIONS.ASSESSMENTS, editing.id), { name, type: ctl.type.value, maxScore, weight, updatedAt: serverTimestamp() });
    } else {
      const batch = writeBatch(db);
      const t = term();
      targets.forEach((subjectId) => {
        batch.set(doc(collection(db, COLLECTIONS.ASSESSMENTS)), {
          academicYearId: t.academicYearId,
          termId: t.id,
          classId: classSel.value,
          subjectId,
          name,
          type: ctl.type.value,
          maxScore,
          weight,
          status: ASSESSMENT_STATUS.DRAFT,
          createdAt: serverTimestamp(),
          createdBy: profile.uid
        });
      });
      await batch.commit();
    }
    dialog.close();
    say("success", editing ? "Changes saved." : `Added to ${targets.length} ${targets.length === 1 ? "subject" : "subjects"}. Open each assessment when it is ready for marks.`);
    await load();
  } catch (err) {
    fail(err?.code === "permission-denied" ? "You don't have permission to change assessments." : "Could not save. Try again.");
  } finally {
    submitBtn.disabled = false;
  }
});

termSel.addEventListener("change", () => { notice.hidden = true; load(); });
classSel.addEventListener("change", () => { notice.hidden = true; load(); });
load();
