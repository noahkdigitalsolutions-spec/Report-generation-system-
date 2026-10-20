import { requireAuth } from "../auth-guard.js";
import { mountHeader, mountGradingTabs } from "../navigation.js";
import { initCrudPage, badge } from "../academics/crud-page.js";
import { COLLECTIONS } from "../utils/constants.js";

const { profile } = await requireAuth(["admin", "headteacher", "academic"]);
mountHeader(profile);
mountGradingTabs(document.getElementById("tabs"));

const TYPES = { classTeacher: "Class teacher", headteacher: "Head teacher" };

initCrudPage({
  profile,
  root: document.getElementById("app"),
  collection: COLLECTIONS.REMARK_RULES,
  title: "Report remarks",
  singular: "remark",
  nameOf: (r) => `${TYPES[r.type]} remark from ${r.minAverage}%`,
  emptyText: "No remarks yet. Without them, report cards leave the remark lines blank.",
  fields: [
    { name: "type", label: "Whose remark", type: "select", required: true, options: Object.entries(TYPES).map(([value, label]) => ({ value, label })) },
    { name: "minAverage", label: "For an average of at least (%)", type: "number", numeric: true, required: true, attrs: { min: 0, max: 100, step: 1 },
      help: "The remark with the highest threshold the student's average reaches is used." },
    { name: "text", label: "Remark", required: true, placeholder: "An excellent term. Keep it up." }
  ],
  columns: [
    { label: "Whose", render: (r) => badge(TYPES[r.type] || r.type, r.type === "headteacher" ? "active" : "inactive") },
    { label: "From average", render: (r) => `${r.minAverage}%` },
    { label: "Remark", render: (r) => r.text }
  ],
  sort: (a, b) => (a.type || "").localeCompare(b.type || "") || b.minAverage - a.minAverage,
  validate(data, { items, editingId }) {
    if (!Number.isInteger(data.minAverage) || data.minAverage < 0 || data.minAverage > 100) return "The average must be a whole number from 0 to 100.";
    if (data.text.length > 200) return "Keep the remark under 200 characters.";
    if (items.some((r) => r.id !== editingId && r.type === data.type && r.minAverage === data.minAverage)) return "That type already has a remark starting at this average.";
  }
});
