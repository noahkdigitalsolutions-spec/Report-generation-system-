import { requireAuth } from "../auth-guard.js";
import { mountHeader, mountGradingTabs } from "../navigation.js";
import { db } from "../firebase-init.js";
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, writeBatch, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { el, badge } from "../academics/crud-page.js";
import { COLLECTIONS } from "../utils/constants.js";
import { validateScale, normalizeScale, gradeFor } from "./grade-calculator.js";

const { profile } = await requireAuth(["admin", "headteacher", "academic"]);
mountHeader(profile);
mountGradingTabs(document.getElementById("tabs"));

const root = document.getElementById("app");
const canEdit = ["admin", "academic"].includes(profile.role);

// A starting point only. The school must set its own boundaries.
const STARTER = [
  { min: 80, grade: "A", points: 1, remark: "Excellent" },
  { min: 70, grade: "B", points: 2, remark: "Very good" },
  { min: 60, grade: "C", points: 3, remark: "Good" },
  { min: 50, grade: "D", points: 4, remark: "Fair" },
  { min: 0, grade: "E", points: 5, remark: "Needs support" }
];

// ---------- skeleton ----------
const notice = el("div", { role: "status", hidden: true });
const say = (kind, msg) => { notice.className = `notice ${kind}`; notice.textContent = msg; notice.hidden = false; };
const tbody = el("tbody");

const dialog = el("dialog", { "aria-labelledby": "dlg-title", class: "wide" });
const dlgTitle = el("h2", { id: "dlg-title", class: "dialog-title" });
const dlgNotice = el("div", { class: "notice error", role: "alert", hidden: true });
const form = el("form", { novalidate: true });
dialog.append(dlgTitle, dlgNotice, form);

root.replaceChildren(
  el("div", { class: "page-head" },
    el("h1", { text: "Grade scales" }),
    el("button", { class: "btn-link", type: "button", text: "Add grade scale", hidden: !canEdit, onclick: () => openDialog() })),
  el("p", { class: "help", text: "Each level uses its active scale to turn percentages into grades. Percentages are rounded to a whole number first." }),
  notice,
  el("div", { class: "table-wrap" }, el("table", {},
    el("thead", {}, el("tr", {}, ...["Name", "Level", "Grades", "Status"].map((t) => el("th", { text: t })), ...(canEdit ? [el("th", {}, el("span", { class: "sr-only", text: "Actions" }))] : []))),
    tbody)),
  dialog
);

// ---------- list ----------
let scales = [];

async function load() {
  try {
    const snap = await getDocs(collection(db, COLLECTIONS.GRADING_SCALES));
    scales = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => a.level.localeCompare(b.level) || a.name.localeCompare(b.name));
    render();
  } catch {
    say("error", "Could not load grade scales. Check your connection and refresh.");
  }
}

function summary(boundaries) {
  return normalizeScale(boundaries).map((b) => `${b.grade} ${b.min}–${b.max}`).join(" · ");
}

function render() {
  tbody.replaceChildren();
  if (!scales.length) {
    tbody.append(el("tr", {}, el("td", { class: "empty", colspan: canEdit ? 5 : 4, text: "No grade scales yet. Add one for O-Level and one for A-Level." })));
  }
  for (const s of scales) {
    const tr = el("tr", {},
      el("td", { text: s.name }),
      el("td", { text: s.level }),
      el("td", { text: summary(s.boundaries || []) }),
      el("td", {}, s.isActive ? badge("Active", "active") : badge("Not in use", "inactive")));
    if (canEdit) {
      tr.append(el("td", { class: "row-actions" },
        el("button", { class: "btn-small", type: "button", text: "Edit", onclick: () => openDialog(s) }),
        el("button", { class: "btn-small", type: "button", text: "Delete", onclick: () => remove(s) })));
    }
    tbody.append(tr);
  }
}

async function remove(s) {
  notice.hidden = true;
  if (s.isActive) return say("error", "This scale is in use. Make another scale active first, then delete this one.");
  if (!confirm(`Delete ${s.name}? This can't be undone.`)) return;
  try {
    await deleteDoc(doc(db, COLLECTIONS.GRADING_SCALES, s.id));
    await load();
  } catch {
    say("error", "Could not delete. Try again.");
  }
}

// ---------- editor ----------
let editing = null;
let rowEls = [];

const field = (label, control, help) =>
  el("div", { class: "field" }, el("label", { for: control.id, text: label }), control, help ? el("p", { class: "help", text: help }) : "");

function readRows() {
  return rowEls.map((r) => ({
    min: r.min.value.trim() === "" ? NaN : Number(r.min.value),
    grade: r.grade.value.trim(),
    points: r.points.value.trim() === "" ? NaN : Number(r.points.value),
    remark: r.remark.value.trim()
  }));
}

function openDialog(scale = null) {
  editing = scale;
  dlgNotice.hidden = true;
  dlgTitle.textContent = scale ? "Edit grade scale" : "Add grade scale";
  rowEls = [];

  const name = el("input", { id: "g-name", type: "text", autocomplete: "off", maxlength: 60, placeholder: "O-Level scale" });
  const level = el("select", { id: "g-level" }, el("option", { value: "", text: "Choose…" }), el("option", { value: "O-Level", text: "O-Level" }), el("option", { value: "A-Level", text: "A-Level" }));
  const active = el("input", { type: "checkbox", id: "g-active" });
  if (scale) { name.value = scale.name; level.value = scale.level; active.checked = !!scale.isActive; }

  const rowsBody = el("tbody");
  const tryInput = el("input", { id: "g-try", type: "text", inputmode: "decimal", autocomplete: "off", placeholder: "e.g. 67.5" });
  const tryOut = el("span", { class: "try-out", "aria-live": "polite" });

  const updateDerived = () => {
    const rows = readRows();
    const valid = rows.filter((r) => Number.isInteger(r.min) && r.min >= 0 && r.min <= 100);
    const sorted = [...valid].sort((a, b) => b.min - a.min);
    rowEls.forEach((r) => {
      const me = Number(r.min.value);
      const idx = sorted.findIndex((x) => x.min === me);
      r.to.textContent = r.min.value.trim() === "" || idx === -1 ? "—" : String(idx === 0 ? 100 : sorted[idx - 1].min - 1);
    });
    const p = Number(tryInput.value.replace(",", "."));
    if (tryInput.value.trim() === "") tryOut.textContent = "";
    else if (!Number.isFinite(p)) tryOut.textContent = "Enter a number.";
    else if (validateScale(rows).length) tryOut.textContent = "Fix the grades first.";
    else {
      const b = gradeFor(p, rows);
      tryOut.textContent = `${Math.round(p)}% → ${b.grade}${b.remark ? " (" + b.remark + ")" : ""}`;
    }
  };

  const addRow = (b = { min: "", grade: "", points: "", remark: "" }) => {
    const mk = (props) => el("input", { autocomplete: "off", ...props });
    const r = {
      min: mk({ type: "number", min: 0, max: 100, step: 1, inputmode: "numeric", "aria-label": "From percent" }),
      grade: mk({ type: "text", maxlength: 10, "aria-label": "Grade" }),
      points: mk({ type: "number", min: 0, step: "any", inputmode: "decimal", "aria-label": "Points" }),
      remark: mk({ type: "text", maxlength: 60, "aria-label": "Remark" }),
      to: el("span", { class: "to", text: "—" })
    };
    r.min.value = b.min; r.grade.value = b.grade; r.points.value = b.points; r.remark.value = b.remark || "";
    const tr = el("tr", {},
      el("td", {}, r.min), el("td", {}, r.to), el("td", {}, r.grade), el("td", {}, r.points), el("td", {}, r.remark),
      el("td", {}, el("button", { class: "btn-small", type: "button", text: "Remove", onclick: () => {
        rowEls = rowEls.filter((x) => x !== r);
        tr.remove();
        updateDerived();
      } })));
    [r.min, r.grade, r.points, r.remark].forEach((i) => i.addEventListener("input", updateDerived));
    rowEls.push(r);
    rowsBody.append(tr);
  };

  (scale ? normalizeScale(scale.boundaries) : []).forEach(addRow);
  if (!scale) addRow({ min: 0, grade: "", points: "", remark: "" });

  tryInput.addEventListener("input", updateDerived);

  const starterBtn = el("button", { class: "btn-small", type: "button", text: "Use starter grades", onclick: () => {
    if (rowEls.some((r) => r.grade.value.trim()) && !confirm("Replace the grades below with the starter set?")) return;
    rowsBody.replaceChildren(); rowEls = [];
    STARTER.forEach(addRow);
    updateDerived();
  } });

  form.replaceChildren(
    el("div", { class: "form-grid" }, field("Name", name), field("Level", level)),
    el("div", { class: "field" }, el("label", { class: "check", for: "g-active" }, active, el("span", { text: "Use this scale for its level (replaces the current one)" }))),
    el("h3", { class: "form-section", text: "Grades" }),
    el("div", { class: "table-wrap" }, el("table", { class: "boundaries" },
      el("thead", {}, el("tr", {}, ...["From %", "To %", "Grade", "Points", "Remark"].map((t) => el("th", { text: t })), el("th", {}, el("span", { class: "sr-only", text: "Remove" })))),
      rowsBody)),
    el("div", { class: "row-tools" },
      el("button", { class: "btn-small", type: "button", text: "Add grade", onclick: () => { addRow(); updateDerived(); } }),
      ...(scale ? [] : [starterBtn])),
    el("p", { class: "help", text: "\"To\" is worked out from the next grade. One grade must start at 0." }),
    el("div", { class: "field try" }, el("label", { for: "g-try", text: "Try a percentage" }), tryInput, tryOut),
    el("div", { class: "dialog-actions" },
      el("button", { class: "btn-small", type: "button", text: "Cancel", onclick: () => dialog.close() }),
      el("button", { class: "btn-primary", type: "submit", text: scale ? "Save changes" : "Add scale" }))
  );
  form._refs = { name, level, active };
  updateDerived();
  dialog.showModal();
}

const fail = (msg) => { dlgNotice.textContent = msg; dlgNotice.hidden = false; dlgNotice.scrollIntoView({ block: "nearest" }); };

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  dlgNotice.hidden = true;
  const { name, level, active } = form._refs;

  const nameVal = name.value.trim().replace(/\s+/g, " ");
  if (!nameVal) return fail("Name is required.");
  if (!level.value) return fail("Level is required.");
  if (scales.some((s) => s.id !== editing?.id && s.level === level.value && s.name.toLowerCase() === nameVal.toLowerCase())) {
    return fail(`There is already a ${level.value} scale called ${nameVal}.`);
  }
  const rows = readRows();
  const problems = validateScale(rows);
  if (problems.length) return fail(problems[0]);

  const boundaries = normalizeScale(rows);
  const submitBtn = form.querySelector("[type=submit]");
  submitBtn.disabled = true;
  try {
    const data = { name: nameVal, level: level.value, isActive: active.checked, boundaries };
    let id = editing?.id;
    if (id) await updateDoc(doc(db, COLLECTIONS.GRADING_SCALES, id), { ...data, updatedAt: serverTimestamp() });
    else id = (await addDoc(collection(db, COLLECTIONS.GRADING_SCALES), { ...data, createdAt: serverTimestamp(), createdBy: profile.uid })).id;

    if (data.isActive) {
      const others = await getDocs(query(collection(db, COLLECTIONS.GRADING_SCALES), where("level", "==", data.level), where("isActive", "==", true)));
      const batch = writeBatch(db);
      others.forEach((d) => { if (d.id !== id) batch.update(d.ref, { isActive: false }); });
      await batch.commit();
    }
    dialog.close();
    say("success", "Grade scale saved.");
    await load();
  } catch (err) {
    fail(err?.code === "permission-denied" ? "You don't have permission to change grade scales." : "Could not save. Try again.");
  } finally {
    submitBtn.disabled = false;
  }
});

load();
