import { requireAuth } from "../auth-guard.js";
import { mountHeader, mountAcademicTabs } from "../navigation.js";
import { initCrudPage, duplicate, badge } from "./crud-page.js";
import { COLLECTIONS } from "../utils/constants.js";

const { profile } = await requireAuth(["admin", "headteacher", "academic"]);
mountHeader(profile);
mountAcademicTabs(document.getElementById("tabs"));

const LEVELS = [{ value: "O-Level", label: "O-Level" }, { value: "A-Level", label: "A-Level" }];

initCrudPage({
  profile,
  root: document.getElementById("crud"),
  collection: COLLECTIONS.CLASSES,
  title: "Classes",
  singular: "class",
  nameOf: (c) => c.name,
  emptyText: "No classes yet. Add S.1, S.2 and so on.",
  fields: [
    { name: "name", label: "Class name", required: true, placeholder: "S.1" },
    { name: "level", label: "Level", type: "select", required: true, options: LEVELS },
    { name: "order", label: "Order", type: "number", numeric: true, required: true, attrs: { min: 1, step: 1 }, help: "Sorts classes: 1 is the lowest class." }
  ],
  columns: [
    { label: "Class", render: (c) => c.name },
    { label: "Level", render: (c) => badge(c.level, c.level === "A-Level" ? "active" : "inactive") },
    { label: "Order", render: (c) => c.order }
  ],
  sort: (a, b) => (a.order || 0) - (b.order || 0),
  validate(data, { items, editingId }) {
    if (!Number.isInteger(data.order) || data.order < 1) return "Order must be a whole number, 1 or more.";
    if (duplicate(items, editingId, (c) => c.name.toLowerCase() === data.name.toLowerCase())) return "A class with that name already exists.";
  },
  deleteGuards: [
    { collection: COLLECTIONS.STREAMS, field: "classId", message: "This class has streams. Delete them first." },
    { collection: COLLECTIONS.STUDENTS, field: "classId", message: "This class has students. Move them first." }
  ]
});
