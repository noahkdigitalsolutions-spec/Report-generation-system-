import { requireAuth } from "../auth-guard.js";
import { mountHeader } from "../navigation.js";
import { db } from "../firebase-init.js";
import { collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { el, badge } from "../academics/crud-page.js";
import { COLLECTIONS } from "../utils/constants.js";

const MAX_ROWS = 300;
const STATUS_LABELS = { active: "Active", transferred: "Transferred", left: "Left", completed: "Completed" };

const { profile } = await requireAuth();
mountHeader(profile);

const root = document.getElementById("app");
const canEdit = ["admin", "academic"].includes(profile.role);

const search = el("input", { type: "search", placeholder: "Search by name or admission number", "aria-label": "Search students" });
const classSel = el("select", { "aria-label": "Class" });
const streamSel = el("select", { "aria-label": "Stream" });
const statusSel = el("select", { "aria-label": "Status" });
const notice = el("div", { class: "notice error", role: "alert", hidden: true });
const tbody = el("tbody");
const count = el("p", { class: "result-count", "aria-live": "polite" });

statusSel.append(el("option", { value: "all", text: "All statuses" }));
for (const [v, label] of Object.entries(STATUS_LABELS)) statusSel.append(el("option", { value: v, text: label }));
statusSel.value = "active";

root.replaceChildren(
  el("div", { class: "page-head" },
    el("h1", { text: "Students" }),
    el("a", { class: "btn-link", href: "/students/add-student.html", text: "Add student", hidden: !canEdit })),
  el("div", { class: "filters" }, search, classSel, streamSel, statusSel),
  notice,
  el("div", { class: "table-wrap" },
    el("table", {},
      el("thead", {}, el("tr", {}, ...["Admission no.", "Name", "Class", "Sex", "Status"].map((t) => el("th", { text: t })))),
      tbody)),
  count
);

let students = [];
let classes = new Map();
let streams = new Map();

try {
  const [s, c, st] = await Promise.all([
    getDocs(query(collection(db, COLLECTIONS.STUDENTS), orderBy("lastName"))),
    getDocs(collection(db, COLLECTIONS.CLASSES)),
    getDocs(collection(db, COLLECTIONS.STREAMS))
  ]);
  students = s.docs.map((d) => ({ id: d.id, ...d.data() }));
  classes = new Map(c.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));
  streams = new Map(st.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));
} catch {
  notice.textContent = "Could not load students. Check your connection and refresh.";
  notice.hidden = false;
}

classSel.append(el("option", { value: "", text: "All classes" }));
[...classes.values()]
  .sort((a, b) => (a.order || 0) - (b.order || 0))
  .forEach((c) => classSel.append(el("option", { value: c.id, text: c.name })));

function fillStreams() {
  streamSel.replaceChildren(el("option", { value: "", text: "All streams" }));
  const list = [...streams.values()].filter((s) => s.classId === classSel.value).sort((a, b) => a.name.localeCompare(b.name));
  list.forEach((s) => streamSel.append(el("option", { value: s.id, text: s.name })));
  streamSel.disabled = list.length === 0;
}

function render() {
  const q = search.value.trim().toLowerCase();
  const matches = students.filter((s) => {
    if (statusSel.value !== "all" && s.status !== statusSel.value) return false;
    if (classSel.value && s.classId !== classSel.value) return false;
    if (streamSel.value && s.streamId !== streamSel.value) return false;
    if (!q) return true;
    return `${s.firstName} ${s.otherNames || ""} ${s.lastName} ${s.admissionNo}`.toLowerCase().includes(q);
  });

  tbody.replaceChildren();
  if (!matches.length) {
    const msg = students.length ? "No students match these filters." : "No students yet. Add the first one.";
    tbody.append(el("tr", {}, el("td", { class: "empty", colspan: 5, text: msg })));
  }
  for (const s of matches.slice(0, MAX_ROWS)) {
    const cls = classes.get(s.classId)?.name || "—";
    const stream = s.streamId ? streams.get(s.streamId)?.name : "";
    const fullName = [s.lastName, s.firstName, s.otherNames].filter(Boolean).join(" ");
    tbody.append(el("tr", {},
      el("td", { text: s.admissionNo }),
      el("td", {}, el("a", { class: "table-link", href: `/students/student-profile.html?id=${encodeURIComponent(s.id)}`, text: fullName })),
      el("td", { text: stream ? `${cls} ${stream}` : cls }),
      el("td", { text: s.sex === "F" ? "Female" : "Male" }),
      el("td", {}, badge(STATUS_LABELS[s.status] || s.status, s.status === "active" ? "active" : "inactive"))
    ));
  }
  count.textContent = matches.length > MAX_ROWS
    ? `Showing the first ${MAX_ROWS} of ${matches.length}. Use the filters to narrow the list.`
    : `${matches.length} of ${students.length} students`;
}

search.addEventListener("input", render);
classSel.addEventListener("change", () => { fillStreams(); render(); });
streamSel.addEventListener("change", render);
statusSel.addEventListener("change", render);

fillStreams();
render();
