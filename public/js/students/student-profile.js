import { requireAuth } from "../auth-guard.js";
import { mountHeader } from "../navigation.js";
import { db } from "../firebase-init.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { el, badge } from "../academics/crud-page.js";
import { COLLECTIONS } from "../utils/constants.js";
import { formatDate } from "../utils/date-utils.js";

const { profile } = await requireAuth();
mountHeader(profile);

const root = document.getElementById("app");
const params = new URLSearchParams(location.search);
const id = params.get("id");
const canEdit = ["admin", "academic"].includes(profile.role);
const STATUS = { active: "Active", transferred: "Transferred", left: "Left", completed: "Completed" };

const problem = (msg) => root.replaceChildren(el("div", { class: "notice error", role: "alert", text: msg }), el("a", { class: "btn-small", href: "/students/students.html", text: "Back to students" }));
if (!id) { problem("No student chosen."); throw new Error("no id"); }

let s, cls = null, stream = null, combo = null;
try {
  const snap = await getDoc(doc(db, COLLECTIONS.STUDENTS, id));
  if (!snap.exists()) { problem("That student doesn't exist."); throw new Error("missing"); }
  s = snap.data();
  const one = async (col, key) => (key ? (await getDoc(doc(db, col, key))).data() ?? null : null);
  [cls, stream, combo] = await Promise.all([
    one(COLLECTIONS.CLASSES, s.classId), one(COLLECTIONS.STREAMS, s.streamId), one(COLLECTIONS.SUBJECT_COMBINATIONS, s.combinationId)
  ]);
} catch (err) {
  if (err.message !== "missing") problem("Could not load this student. Check your connection and refresh.");
  throw err;
}

const row = (label, value) => [el("dt", { text: label }), el("dd", { text: value || "—" })];
const name = [s.firstName, s.otherNames, s.lastName].filter(Boolean).join(" ");
const flash = params.get("added") ? "Student added." : params.get("saved") ? "Changes saved." : "";
const g = s.guardian || {};

root.replaceChildren(
  el("div", { class: "page-head" },
    el("h1", { text: name }),
    el("a", { class: "btn-link", href: `/students/edit-student.html?id=${encodeURIComponent(id)}`, text: "Edit", hidden: !canEdit })),
  ...(flash ? [el("div", { class: "notice success", role: "status", text: flash })] : []),
  el("section", { class: "card" },
    el("h2", { text: "Details" }),
    el("dl", { class: "details" },
      ...row("Admission no.", s.admissionNo),
      ...row("Sex", s.sex === "M" ? "Male" : s.sex === "F" ? "Female" : null),
      ...row("Date of birth", s.dateOfBirth ? formatDate(s.dateOfBirth) : null),
      ...row("Class", cls?.name),
      ...row("Stream", stream?.name),
      ...(cls?.level === "A-Level" ? row("Combination", combo?.name) : []))),
  el("p", {}, "Status: ", badge(STATUS[s.status] || s.status, s.status === "active" ? "active" : "inactive")),
  el("section", { class: "card" },
    el("h2", { text: "Guardian" }),
    el("dl", { class: "details" }, ...row("Name", g.name), ...row("Phone", g.phone), ...row("Relationship", g.relationship))),
  el("a", { class: "btn-small", href: "/students/students.html", text: "Back to students" })
);
