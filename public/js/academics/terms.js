import { requireAuth } from "../auth-guard.js";
import { mountHeader, mountAcademicTabs } from "../navigation.js";
import { initCrudPage, onlyOneCurrent, duplicate, badge } from "./crud-page.js";
import { COLLECTIONS } from "../utils/constants.js";
import { formatDate, formatRange } from "../utils/date-utils.js";

const { profile } = await requireAuth(["admin", "headteacher", "academic"]);
mountHeader(profile);
mountAcademicTabs(document.getElementById("tabs"));

initCrudPage({
  profile,
  root: document.getElementById("crud"),
  collection: COLLECTIONS.TERMS,
  title: "Terms",
  singular: "term",
  nameOf: (t) => t.name,
  emptyText: "No terms yet. Add an academic year first, then its terms.",
  lookups: { years: COLLECTIONS.ACADEMIC_YEARS },
  fields: [
    {
      name: "academicYearId", label: "Academic year", type: "select", required: true,
      optionsFrom: { lookup: "years", label: (y) => y.name, sort: (a, b) => (b.startDate || "").localeCompare(a.startDate || "") }
    },
    { name: "name", label: "Term name", required: true, placeholder: "Term 1" },
    {
      name: "number", label: "Term number", type: "select", numeric: true, required: true,
      options: [{ value: 1, label: "1" }, { value: 2, label: "2" }, { value: 3, label: "3" }]
    },
    { name: "startDate", label: "Starts", type: "date", required: true },
    { name: "endDate", label: "Ends", type: "date", required: true },
    { name: "nextTermBegins", label: "Next term begins (optional)", type: "date" },
    {
      name: "status", label: "Status", type: "select", required: true, default: "open",
      options: [{ value: "open", label: "Open" }, { value: "closed", label: "Closed" }]
    },
    { name: "isCurrent", label: "This is the current term", type: "checkbox" }
  ],
  columns: [
    { label: "Term", render: (t) => t.name },
    { label: "Year", render: (t, { lookups }) => lookups.years.get(t.academicYearId)?.name || "—" },
    { label: "Dates", render: (t) => formatRange(t.startDate, t.endDate) },
    { label: "Next term", render: (t) => formatDate(t.nextTermBegins) },
    {
      label: "Status",
      render: (t) => (t.isCurrent ? badge("Current", "active") : badge(t.status === "closed" ? "Closed" : "Open", t.status === "closed" ? "inactive" : "active"))
    }
  ],
  sort(a, b, { lookups }) {
    const ya = lookups.years.get(a.academicYearId)?.startDate || "";
    const yb = lookups.years.get(b.academicYearId)?.startDate || "";
    return yb.localeCompare(ya) || (b.number || 0) - (a.number || 0);
  },
  validate(data, { items, lookups, editingId }) {
    const year = lookups.years.get(data.academicYearId);
    if (data.endDate <= data.startDate) return "The end date must be after the start date.";
    if (year && (data.startDate < year.startDate || data.endDate > year.endDate)) {
      return `Dates must fall within ${year.name} (${formatRange(year.startDate, year.endDate)}).`;
    }
    if (data.nextTermBegins && data.nextTermBegins <= data.endDate) return "The next term must begin after this term ends.";
    if (data.isCurrent && data.status === "closed") return "A closed term can't be the current term.";
    if (duplicate(items, editingId, (t) => t.academicYearId === data.academicYearId && t.number === data.number)) {
      return "That year already has a term with this number.";
    }
  },
  afterSave: onlyOneCurrent(COLLECTIONS.TERMS),
  deleteGuards: [
    { collection: COLLECTIONS.ASSESSMENTS, field: "termId", message: "This term has assessments. Delete them first." }
  ]
});
