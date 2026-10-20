import { requireAuth } from "../auth-guard.js";
import { mountHeader } from "../navigation.js";
import { db } from "../firebase-init.js";
import {
  collection, getDocs, query, where, doc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { el } from "../academics/crud-page.js";
import { COLLECTIONS, markId } from "../utils/constants.js";
import { parseScore, summarize, takesSubject, sortStudents, entryState } from "./marks-validation.js";

const { profile } = await requireAuth(["admin", "academic", "teacher"]);
mountHeader(profile);

const root = document.getElementById("app");
const isTeacher = profile.role === "teacher";

// ---------- reference data ----------
let terms, years, classes, streams, subjects, combos;
try {
  const [t, y, c, st, su, k] = await Promise.all([
    getDocs(collection(db, COLLECTIONS.TERMS)),
    getDocs(collection(db, COLLECTIONS.ACADEMIC_YEARS)),
    getDocs(collection(db, COLLECTIONS.CLASSES)),
    getDocs(collection(db, COLLECTIONS.STREAMS)),
    getDocs(collection(db, COLLECTIONS.SUBJECTS)),
    getDocs(collection(db, COLLECTIONS.SUBJECT_COMBINATIONS))
  ]);
  const rows = (x) => x.docs.map((d) => ({ id: d.id, ...d.data() }));
  years = new Map(rows(y).map((r) => [r.id, r]));
  terms = rows(t).sort((a, b) =>
    (years.get(b.academicYearId)?.startDate || "").localeCompare(years.get(a.academicYearId)?.startDate || "") ||
    (b.number || 0) - (a.number || 0));
  classes = rows(c).sort((a, b) => (a.order || 0) - (b.order || 0));
  streams = rows(st).sort((a, b) => a.name.localeCompare(b.name));
  subjects = rows(su).sort((a, b) => a.name.localeCompare(b.name));
  combos = new Map(rows(k).map((r) => [r.id, r]));
} catch {
  root.replaceChildren(el("div", { class: "notice error", role: "alert", text: "Could not load this page. Check your connection and refresh." }));
  throw new Error("load failed");
}
if (!terms.length) {
  root.replaceChildren(
    el("div", { class: "page-head" }, el("h1", { text: "Enter marks" })),
    el("div", { class: "notice error", text: "There are no terms yet. The academic office needs to set up the year and terms first." })
  );
  throw new Error("no terms");
}

const classById = new Map(classes.map((c) => [c.id, c]));
const streamById = new Map(streams.map((s) => [s.id, s]));
const subjectById = new Map(subjects.map((s) => [s.id, s]));

// ---------- skeleton ----------
const termSel = el("select", { "aria-label": "Term" });
terms.forEach((t) => termSel.append(el("option", { value: t.id, text: `${years.get(t.academicYearId)?.name || "?"} · ${t.name}` })));
termSel.value = (terms.find((t) => t.isCurrent) || terms[0]).id;

const mySel = el("select", { "aria-label": "My class and subject" });           // teachers
const classSel = el("select", { "aria-label": "Class" });                       // admin / academic
const streamSel = el("select", { "aria-label": "Stream" });
const subjectSel = el("select", { "aria-label": "Subject" });
const assessmentSel = el("select", { "aria-label": "Assessment" });

const notice = el("div", { role: "status", hidden: true });
const say = (kind, msg) => { notice.className = `notice ${kind}`; notice.textContent = msg; notice.hidden = false; };
const sheet = el("div");

root.replaceChildren(
  el("div", { class: "page-head" }, el("h1", { text: "Enter marks" })),
  el("div", { class: "filters" },
    termSel,
    ...(isTeacher ? [mySel] : [classSel, streamSel, subjectSel]),
    assessmentSel),
  notice,
  sheet
);

// ---------- state ----------
let targets = [];          // teacher: assigned class/stream/subject combinations
let assessmentList = [];
let rows = [];             // one entry per student on screen
const term = () => terms.find((t) => t.id === termSel.value);

function currentTarget() {
  if (isTeacher) return targets[Number(mySel.value)] || null;
  if (!classSel.value || !subjectSel.value) return null;
  return { classId: classSel.value, streamId: streamSel.value || null, subjectId: subjectSel.value };
}

const targetLabel = (t) => {
  const cls = classById.get(t.classId)?.name || "?";
  const stream = t.streamId ? ` ${streamById.get(t.streamId)?.name || ""}` : "";
  return `${cls}${stream} · ${subjectById.get(t.subjectId)?.name || "?"}`;
};

// ---------- targets ----------
async function loadTargets() {
  const yearId = term().academicYearId;
  const snap = await getDocs(query(
    collection(db, COLLECTIONS.TEACHER_ASSIGNMENTS),
    where("academicYearId", "==", yearId),
    where("teacherUid", "==", profile.uid)
  ));
  targets = snap.docs.map((d) => d.data())
    .filter((a) => classById.has(a.classId) && subjectById.has(a.subjectId))
    .sort((a, b) =>
      (classById.get(a.classId).order || 0) - (classById.get(b.classId).order || 0) ||
      (streamById.get(a.streamId)?.name || "").localeCompare(streamById.get(b.streamId)?.name || "") ||
      subjectById.get(a.subjectId).name.localeCompare(subjectById.get(b.subjectId).name));
  mySel.replaceChildren(...targets.map((t, i) => el("option", { value: String(i), text: targetLabel(t) })));
  mySel.hidden = targets.length === 0;
}

function syncManagerSelects() {
  const cls = classById.get(classSel.value);
  const list = cls ? streams.filter((s) => s.classId === cls.id) : [];
  streamSel.replaceChildren(el("option", { value: "", text: "All streams" }), ...list.map((s) => el("option", { value: s.id, text: s.name })));
  streamSel.hidden = list.length === 0;

  const keep = subjectSel.value;
  const fitting = cls ? subjects.filter((s) => s.level === "Both" || s.level === cls.level) : [];
  subjectSel.replaceChildren(...fitting.map((s) => el("option", { value: s.id, text: s.name })));
  if (fitting.some((s) => s.id === keep)) subjectSel.value = keep;
}

// ---------- assessments ----------
async function loadAssessments() {
  notice.hidden = true;
  rows = [];
  assessmentSel.replaceChildren();
  sheet.replaceChildren();

  const t = currentTarget();
  if (!t) {
    sheet.append(el("div", { class: "notice error", text: isTeacher
      ? "You aren't assigned to any class for this year yet. Ask the academic office to assign you."
      : "Choose a class and subject." }));
    return;
  }

  try {
    const snap = await getDocs(query(
      collection(db, COLLECTIONS.ASSESSMENTS),
      where("termId", "==", termSel.value),
      where("classId", "==", t.classId),
      where("subjectId", "==", t.subjectId)
    ));
    assessmentList = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .filter((a) => !isTeacher || a.status !== "draft")
      .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
  } catch {
    return say("error", "Could not load assessments. Check your connection and refresh.");
  }

  if (!assessmentList.length) {
    sheet.append(el("div", { class: "notice error", text: isTeacher
      ? "Nothing is open for marks here yet. The academic office opens each assessment when it's ready."
      : "There are no assessments for this subject in this term. Add them under Assessments." }));
    return;
  }

  assessmentList.forEach((a) => assessmentSel.append(el("option", { value: a.id, text: `${a.name} (out of ${a.maxScore})${a.status === "open" ? "" : " · " + a.status}` })));
  assessmentSel.value = (assessmentList.find((a) => a.status === "open") || assessmentList[0]).id;
  await loadSheet();
}

// ---------- the mark sheet ----------
async function loadSheet() {
  notice.hidden = true;
  const t = currentTarget();
  const a = assessmentList.find((x) => x.id === assessmentSel.value);
  if (!t || !a) return;
  const cls = classById.get(t.classId);
  const subject = subjectById.get(t.subjectId);

  sheet.replaceChildren(el("p", { class: "help", text: "Loading…" }));
  let students, saved;
  try {
    const markFilters = [
      where("assessmentId", "==", a.id),
      where("academicYearId", "==", a.academicYearId),
      where("classId", "==", t.classId),
      where("subjectId", "==", t.subjectId),
      ...(t.streamId ? [where("streamId", "==", t.streamId)] : [])
    ];
    const [stSnap, mkSnap] = await Promise.all([
      getDocs(query(collection(db, COLLECTIONS.STUDENTS), where("classId", "==", t.classId))),
      getDocs(query(collection(db, COLLECTIONS.MARKS), ...markFilters))
    ]);
    students = sortStudents(
      stSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
        .filter((s) => s.status === "active")
        .filter((s) => !t.streamId || s.streamId === t.streamId)
        .filter((s) => takesSubject(s, cls.level, subject, combos))
    );
    saved = new Map(mkSnap.docs.map((d) => [d.data().studentId, d.data()]));
  } catch (err) {
    sheet.replaceChildren();
    return say("error", err?.code === "permission-denied"
      ? "You don't have access to these marks. Check that you're assigned to this class and subject."
      : "Could not load the students. Check your connection and refresh.");
  }

  if (!students.length) {
    sheet.replaceChildren(el("div", { class: "notice error", text: "No active students found for this class and subject." }));
    return;
  }
  renderSheet(students, saved, a, t);
}

function renderSheet(students, saved, a, t) {
  const { editable, reason } = entryState(a, term());
  const summaryEl = el("span", { class: "progress", "aria-live": "polite" });
  const onlyMissing = el("input", { type: "checkbox" });
  const listEl = el("ol", { class: "mark-list" });

  const updateSummary = () => {
    const s = summarize(rows);
    summaryEl.textContent = `${s.entered} of ${s.total} entered · ${s.absent} absent · ${s.missing} missing`;
  };

  rows = students.map((student, i) => {
    const prior = saved.get(student.id);
    const row = {
      student,
      score: prior && prior.score !== undefined ? prior.score : null,
      absent: !!prior?.absent,
      hasDoc: !!prior,
      savedState: prior ? { score: prior.score ?? null, absent: !!prior.absent } : null,
      busy: false, dirty: false, failed: false, invalid: false
    };

    const input = el("input", {
      class: "score-input", type: "text", inputmode: "decimal", enterkeyhint: "next",
      autocomplete: "off", "aria-label": `Score for ${student.firstName} ${student.lastName}`
    });
    input.value = row.score ?? "";
    const absentBox = el("input", { type: "checkbox" });
    absentBox.checked = row.absent;
    const statusEl = el("div", { class: "row-status" });

    input.disabled = !editable || row.absent;
    absentBox.disabled = !editable;

    Object.assign(row, { input, absentBox, statusEl });

    const setStatus = (kind, text = "") => {
      statusEl.className = `row-status ${kind}`;
      statusEl.textContent = text;
      if (kind === "failed") {
        statusEl.append(" ", el("button", { class: "btn-small", type: "button", text: "Retry", onclick: () => persist(row) }));
      }
    };
    row.setStatus = setStatus;

    const changed = () =>
      !row.savedState ? (row.score !== null || row.absent)
        : row.savedState.score !== row.score || row.savedState.absent !== row.absent;

    async function persist(r) {
      if (r.busy) { r.dirty = true; return; }
      r.busy = true;
      do {
        r.dirty = false;
        const snapshot = { score: r.score, absent: r.absent };
        setStatus("saving", "Saving…");
        try {
          await setDoc(doc(db, COLLECTIONS.MARKS, markId(a.id, student.id)), {
            assessmentId: a.id,
            academicYearId: a.academicYearId,
            termId: a.termId,
            classId: a.classId,
            streamId: student.streamId ?? null,
            subjectId: a.subjectId,
            studentId: student.id,
            score: snapshot.score,
            absent: snapshot.absent,
            enteredBy: profile.uid,
            updatedAt: serverTimestamp()
          });
          r.savedState = snapshot;
          r.failed = false;
          if (!r.dirty) setStatus("saved", "Saved ✓");
        } catch (err) {
          r.failed = true;
          setStatus("failed", err?.code === "permission-denied" ? "Not saved: this assessment may have been locked." : "Not saved.");
          break;
        }
      } while (r.dirty);
      r.busy = false;
      updateSummary();
    }

    function commit() {
      const parsed = parseScore(input.value, a.maxScore);
      if (!parsed.ok) {
        row.invalid = true;
        input.setAttribute("aria-invalid", "true");
        setStatus("failed", parsed.error);
        return false;
      }
      row.invalid = false;
      input.removeAttribute("aria-invalid");
      row.score = parsed.score;
      updateSummary();
      if (changed()) persist(row);
      else if (!row.failed) setStatus("", "");
      return true;
    }

    input.addEventListener("change", commit);
    input.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      if (!commit()) return;
      const next = rows.slice(i + 1).find((r) => !r.li.hidden && !r.input.disabled);
      if (next) { next.input.focus(); next.input.select(); } else input.blur();
    });
    absentBox.addEventListener("change", () => {
      row.absent = absentBox.checked;
      if (row.absent) {
        input.value = "";
        input.disabled = true;
        row.score = null;
        row.invalid = false;
        input.removeAttribute("aria-invalid");
      } else {
        input.disabled = false;
        input.focus();
      }
      updateSummary();
      if (changed()) persist(row);
    });

    row.li = el("li", { class: "mark-row" },
      el("span", { class: "num", text: String(i + 1) }),
      el("div", { class: "who" },
        el("strong", { text: `${student.lastName} ${student.firstName}${student.otherNames ? " " + student.otherNames : ""}` }),
        el("small", { text: student.admissionNo })),
      el("div", { class: "mark-controls" },
        input,
        el("label", { class: "check" }, absentBox, el("span", { text: "Absent" }))),
      statusEl);
    listEl.append(row.li);
    return row;
  });

  onlyMissing.addEventListener("change", () => {
    rows.forEach((r) => { r.li.hidden = onlyMissing.checked && (r.absent || r.score !== null); });
  });

  const cls = classById.get(t.classId)?.name || "";
  const stream = t.streamId ? ` ${streamById.get(t.streamId)?.name || ""}` : "";
  sheet.replaceChildren(
    ...(reason ? [el("div", { class: "notice error", text: reason })] : []),
    el("div", { class: "sheet-bar" },
      el("div", {},
        el("div", { class: "sheet-title", text: `${cls}${stream} · ${subjectById.get(t.subjectId).name} · ${a.name}` }),
        summaryEl),
      el("label", { class: "check only-missing" }, onlyMissing, el("span", { text: "Show only missing" }))),
    listEl,
    el("p", { class: "help", text: `Marks are out of ${a.maxScore}. Each mark saves when you press Enter or move to the next box.` })
  );
  updateSummary();
  if (editable) rows.find((r) => !r.input.disabled)?.input.focus({ preventScroll: true });
}

// ---------- events ----------
async function onTermChange() {
  try {
    if (isTeacher) await loadTargets();
    await loadAssessments();
  } catch {
    say("error", "Could not load. Check your connection and refresh.");
  }
}

termSel.addEventListener("change", onTermChange);
mySel.addEventListener("change", loadAssessments);
classSel.addEventListener("change", () => { syncManagerSelects(); loadAssessments(); });
streamSel.addEventListener("change", loadAssessments);
subjectSel.addEventListener("change", loadAssessments);
assessmentSel.addEventListener("change", loadSheet);

window.addEventListener("beforeunload", (e) => {
  if (rows.some((r) => r.busy || r.failed || r.invalid)) { e.preventDefault(); e.returnValue = ""; }
});

if (!isTeacher) {
  classes.forEach((c) => classSel.append(el("option", { value: c.id, text: c.name })));
  syncManagerSelects();
}
onTermChange();
