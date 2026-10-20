import { requireAuth } from "../auth-guard.js";
import { mountHeader, mountAcademicTabs } from "../navigation.js";
import { initCrudPage, duplicate } from "./crud-page.js";
import { COLLECTIONS } from "../utils/constants.js";

const { profile } = await requireAuth(["admin", "headteacher", "academic"]);
mountHeader(profile);
mountAcademicTabs(document.getElementById("tabs"));

initCrudPage({
  profile,
  root: document.getElementById("crud"),
  collection: COLLECTIONS.SUBJECT_COMBINATIONS,
  title: "Subject combinations",
  singular: "combination",
  nameOf: (c) => c.name,
  emptyText: "No combinations yet. A-Level students each belong to one, such as PCM or HEG.",
  lookups: { subjects: COLLECTIONS.SUBJECTS },
  fields: [
    { name: "name", label: "Combination", required: true, placeholder: "PCM" },
    { name: "subjectIds", label: "Subjects in this combination", type: "checklist", required: true,
      optionsFrom: { lookup: "subjects", label: (s) => s.name } }
  ],
  columns: [
    { label: "Combination", render: (c) => c.name },
    { label: "Subjects", render: (c, { lookups }) => (c.subjectIds || []).map((id) => lookups.subjects.get(id)?.name).filter(Boolean).join(", ") || "—" }
  ],
  sort: (a, b) => a.name.localeCompare(b.name),
  validate(data, { items, editingId }) {
    if (duplicate(items, editingId, (c) => c.name.toLowerCase() === data.name.toLowerCase())) return "A combination with that name already exists.";
  },
  deleteGuards: [
    { collection: COLLECTIONS.STUDENTS, field: "combinationId", message: "Students use this combination. Change their combination first." }
  ]
});
