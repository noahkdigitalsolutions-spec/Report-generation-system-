import { db, functions } from "../firebase-init.js";
import { collection, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";
import { el } from "../academics/crud-page.js";
import { COLLECTIONS } from "../utils/constants.js";

const createStudent = httpsCallable(functions, "createStudent");
const updateStudent = httpsCallable(functions, "updateStudent");

const STATUSES = [["active", "Active"], ["transferred", "Transferred"], ["left", "Left"], ["completed", "Completed"]];

function friendly(err) {
  if (err?.code === "functions/internal" || err?.code === "functions/unavailable") {
    return "Something went wrong. Check your connection and try again.";
  }
  return err?.message || "Something went wrong. Try again.";
}

/** Add or edit a student. Pass studentId to edit. */
export async function initStudentForm({ root, studentId = null }) {
  const editing = !!studentId;
  const notice = el("div", { class: "notice error", role: "alert", hidden: true });
  const showError = (msg) => { notice.textContent = msg; notice.hidden = false; notice.scrollIntoView({ block: "nearest" }); };

  root.replaceChildren(el("div", { class: "page-head" }, el("h1", { text: editing ? "Edit student" : "Add student" })), notice);

  let classes, streams, combos, existing = null;
  try {
    const [c, s, k] = await Promise.all([
      getDocs(collection(db, COLLECTIONS.CLASSES)),
      getDocs(collection(db, COLLECTIONS.STREAMS)),
      getDocs(collection(db, COLLECTIONS.SUBJECT_COMBINATIONS))
    ]);
    classes = c.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0));
    streams = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name));
    combos = k.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name));
    if (editing) {
      const snap = await getDoc(doc(db, COLLECTIONS.STUDENTS, studentId));
      if (!snap.exists()) return showError("That student doesn't exist. Go back to the student list and pick again.");
      existing = snap.data();
    }
  } catch {
    return showError("Could not load the form. Check your connection and refresh.");
  }

  if (!classes.length) {
    return showError("Add at least one class before adding students. You can do that under Academic setup.");
  }

  // ----- controls -----
  const input = (id, type = "text", extra = {}) => el("input", { id, type, autocomplete: "off", ...extra });
  const select = (id, options, placeholder = "Choose…") => {
    const s = el("select", { id });
    s.append(el("option", { value: "", text: placeholder }));
    options.forEach(([v, label]) => s.append(el("option", { value: v, text: label })));
    return s;
  };
  const field = (label, control, wrapProps = {}) =>
    el("div", { class: "field", ...wrapProps }, el("label", { for: control.id, text: label }), control);

  const admissionNo = input("admissionNo", "text", { maxlength: 30 });
  const firstName = input("firstName", "text", { maxlength: 60 });
  const lastName = input("lastName", "text", { maxlength: 60 });
  const otherNames = input("otherNames", "text", { maxlength: 80 });
  const sex = select("sex", [["F", "Female"], ["M", "Male"]]);
  const dob = input("dob", "date", { max: new Date().toISOString().slice(0, 10) });
  const classSel = select("classId", classes.map((c) => [c.id, c.name]));
  const streamSel = select("streamId", []);
  const comboSel = select("combinationId", combos.map((c) => [c.id, c.name]));
  const statusSel = select("status", STATUSES, "Choose…");
  const gName = input("gName", "text", { maxlength: 100 });
  const gPhone = input("gPhone", "tel", { maxlength: 30 });
  const gRel = input("gRel", "text", { maxlength: 40, placeholder: "Mother, uncle, guardian…" });

  const streamWrap = field("Stream", streamSel);
  const comboWrap = field("Subject combination", comboSel);

  function syncPlacement() {
    const cls = classes.find((c) => c.id === classSel.value);
    const list = cls ? streams.filter((s) => s.classId === cls.id) : [];
    const keep = streamSel.value;
    streamSel.replaceChildren(el("option", { value: "", text: "Choose…" }), ...list.map((s) => el("option", { value: s.id, text: s.name })));
    streamSel.value = list.some((s) => s.id === keep) ? keep : "";
    streamWrap.hidden = list.length === 0;
    comboWrap.hidden = !(cls && cls.level === "A-Level");
    if (comboWrap.hidden) comboSel.value = "";
  }
  classSel.addEventListener("change", syncPlacement);

  if (existing) {
    admissionNo.value = existing.admissionNo || "";
    firstName.value = existing.firstName || "";
    lastName.value = existing.lastName || "";
    otherNames.value = existing.otherNames || "";
    sex.value = existing.sex || "";
    dob.value = existing.dateOfBirth || "";
    classSel.value = existing.classId || "";
    syncPlacement();
    streamSel.value = existing.streamId || "";
    comboSel.value = existing.combinationId || "";
    statusSel.value = existing.status || "active";
    gName.value = existing.guardian?.name || "";
    gPhone.value = existing.guardian?.phone || "";
    gRel.value = existing.guardian?.relationship || "";
  } else {
    syncPlacement();
  }

  const submit = el("button", { class: "btn-primary", type: "submit", text: editing ? "Save changes" : "Add student" });
  const cancelHref = editing ? `/students/student-profile.html?id=${encodeURIComponent(studentId)}` : "/students/students.html";

  const form = el("form", { novalidate: true },
    el("h2", { class: "form-section", text: "Student" }),
    field("Admission number", admissionNo),
    el("div", { class: "form-grid" }, field("First name", firstName), field("Last name", lastName)),
    field("Other names (optional)", otherNames),
    el("div", { class: "form-grid" }, field("Sex", sex), field("Date of birth (optional)", dob)),
    el("h2", { class: "form-section", text: "Class" }),
    el("div", { class: "form-grid" }, field("Class", classSel), streamWrap),
    comboWrap,
    ...(editing ? [field("Status", statusSel)] : []),
    el("h2", { class: "form-section", text: "Parent or guardian (optional)" }),
    field("Name", gName),
    el("div", { class: "form-grid" }, field("Phone", gPhone), field("Relationship", gRel)),
    el("div", { class: "form-actions" }, submit, el("a", { class: "btn-small", href: cancelHref, text: "Cancel" }))
  );
  root.append(el("div", { class: "card form-card" }, form));
  admissionNo.focus();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    notice.hidden = true;

    const missing = [
      [admissionNo.value.trim(), "Admission number"],
      [firstName.value.trim(), "First name"],
      [lastName.value.trim(), "Last name"],
      [sex.value, "Sex"],
      [classSel.value, "Class"],
      [streamWrap.hidden ? "ok" : streamSel.value, "Stream"],
      [comboWrap.hidden ? "ok" : comboSel.value, "Subject combination"]
    ].find(([v]) => !v);
    if (missing) return showError(`${missing[1]} is required.`);

    const data = {
      admissionNo: admissionNo.value,
      firstName: firstName.value,
      lastName: lastName.value,
      otherNames: otherNames.value,
      sex: sex.value,
      dateOfBirth: dob.value,
      classId: classSel.value,
      streamId: streamWrap.hidden ? null : streamSel.value,
      combinationId: comboWrap.hidden ? null : comboSel.value,
      guardian: { name: gName.value, phone: gPhone.value, relationship: gRel.value }
    };

    submit.disabled = true;
    submit.textContent = "Saving…";
    try {
      if (editing) {
        await updateStudent({ studentId, status: statusSel.value, ...data });
        location.href = `/students/student-profile.html?id=${encodeURIComponent(studentId)}&saved=1`;
      } else {
        const { data: res } = await createStudent(data);
        location.href = `/students/student-profile.html?id=${encodeURIComponent(res.studentId)}&added=1`;
      }
    } catch (err) {
      showError(friendly(err));
      submit.disabled = false;
      submit.textContent = editing ? "Save changes" : "Add student";
    }
  });
}
