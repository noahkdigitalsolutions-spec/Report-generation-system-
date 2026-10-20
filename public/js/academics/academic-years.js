import { requireAuth } from "../auth-guard.js";
import { mountHeader, mountAcademicTabs } from "../navigation.js";
import { initCrudPage, onlyOneCurrent, duplicate, badge } from "./crud-page.js";
import { COLLECTIONS } from "../utils/constants.js";
import { formatRange } from "../utils/date-utils.js";

const { profile } = await requireAuth(["admin", "headteacher", "academic"]);
mountHeader(profile);
mountAcademicTabs(document.getElementById("tabs"));

initCrudPage({
  profile,
  root: document.getElementById("crud"),
  collection: COLLECTIONS.ACADEMIC_YEARS,
  title: "Academic years",
  singular: "academic year",
  nameOf: (y) => y.name,
  emptyText: "No academic years yet. Add one to get started.",
  fields: [
    { name: "name", label: "Name", required: true, placeholder: "2026" },
    { name: "startDate", label: "Starts", type: "date", required: true },
    { name: "endDate", label: "Ends", type: "date", required: true },
    { name: "isCurrent", label: "This is the current year", type: "checkbox" }
  ],
  columns: [
    { label: "Year", render: (y) => y.name },
    { label: "Dates", render: (y) => formatRange(y.startDate, y.endDate) },
    { label: "Status", render: (y) => (y.isCurrent ? badge("Current", "active") : badge("Past or upcoming", "inactive")) }
  ],
  sort: (a, b) => (b.startDate || "").localeCompare(a.startDate || ""),
  validate(data, { items, editingId }) {
    if (data.endDate <= data.startDate) return "The end date must be after the start date.";
    if (duplicate(items, editingId, (y) => y.name.toLowerCase() === data.name.toLowerCase())) return "That academic year already exists.";
  },
  afterSave: onlyOneCurrent(COLLECTIONS.ACADEMIC_YEARS),
  deleteGuards: [
    { collection: COLLECTIONS.TERMS, field: "academicYearId", message: "This year has terms. Delete them first." }
  ]
});
