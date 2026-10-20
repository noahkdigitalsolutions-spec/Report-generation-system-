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
  collection: COLLECTIONS.STREAMS,
  title: "Streams",
  singular: "stream",
  nameOf: (s) => s.name,
  emptyText: "No streams yet. Streams are optional: add them only if a class is split (for example North and South).",
  lookups: { classes: COLLECTIONS.CLASSES },
  fields: [
    { name: "classId", label: "Class", type: "select", required: true,
      optionsFrom: { lookup: "classes", label: (c) => c.name, sort: (a, b) => (a.order || 0) - (b.order || 0) } },
    { name: "name", label: "Stream name", required: true, placeholder: "North" }
  ],
  columns: [
    { label: "Class", render: (s, { lookups }) => lookups.classes.get(s.classId)?.name || "—" },
    { label: "Stream", render: (s) => s.name }
  ],
  sort: (a, b, { lookups }) =>
    (lookups.classes.get(a.classId)?.order || 0) - (lookups.classes.get(b.classId)?.order || 0) || a.name.localeCompare(b.name),
  validate(data, { items, editingId }) {
    if (duplicate(items, editingId, (s) => s.classId === data.classId && s.name.toLowerCase() === data.name.toLowerCase())) {
      return "That class already has a stream with this name.";
    }
  },
  deleteGuards: [
    { collection: COLLECTIONS.STUDENTS, field: "streamId", message: "This stream has students. Move them first." }
  ]
});
