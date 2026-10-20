import { requireAuth } from "../auth-guard.js";
import { mountHeader, mountAcademicTabs } from "../navigation.js";
import { initCrudPage, duplicate, badge } from "./crud-page.js";
import { COLLECTIONS } from "../utils/constants.js";

const { profile } = await requireAuth(["admin", "headteacher", "academic"]);
mountHeader(profile);
mountAcademicTabs(document.getElementById("tabs"));

initCrudPage({
  profile,
  root: document.getElementById("crud"),
  collection: COLLECTIONS.SUBJECTS,
  title: "Subjects",
  singular: "subject",
  nameOf: (s) => s.name,
  emptyText: "No subjects yet. Add the subjects the school teaches.",
  fields: [
    { name: "name", label: "Subject name", required: true, placeholder: "Mathematics" },
    { name: "code", label: "Code", required: true, placeholder: "MATH", transform: (v) => v.toUpperCase() },
    { name: "level", label: "Taught at", type: "select", required: true, default: "Both",
      options: [{ value: "O-Level", label: "O-Level only" }, { value: "A-Level", label: "A-Level only" }, { value: "Both", label: "Both levels" }] },
    { name: "isCompulsory", label: "Compulsory for every A-Level student", type: "checkbox",
      help: "Compulsory subjects are taken by everyone. Other A-Level subjects depend on the student's combination." }
  ],
  columns: [
    { label: "Subject", render: (s) => s.name },
    { label: "Code", render: (s) => s.code },
    { label: "Level", render: (s) => (s.level === "Both" ? "Both levels" : s.level) },
    { label: "A-Level", render: (s) => (s.isCompulsory ? badge("Compulsory", "active") : "Per combination") }
  ],
  sort: (a, b) => a.name.localeCompare(b.name),
  validate(data, { items, editingId }) {
    if (duplicate(items, editingId, (s) => s.name.toLowerCase() === data.name.toLowerCase())) return "A subject with that name already exists.";
    if (duplicate(items, editingId, (s) => s.code === data.code)) return "That code is already used by another subject.";
  },
  deleteGuards: [
    { collection: COLLECTIONS.ASSESSMENTS, field: "subjectId", message: "This subject has assessments. Delete them first." },
    { collection: COLLECTIONS.TEACHER_ASSIGNMENTS, field: "subjectId", message: "Teachers are assigned to this subject. Remove those assignments first." }
  ]
});
