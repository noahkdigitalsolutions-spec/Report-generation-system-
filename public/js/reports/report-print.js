import { el } from "../academics/crud-page.js";
import { formatDate } from "../utils/date-utils.js";
import {
  formatPosition, formatAverage, formatComponent, subjectCells, gradeKeyRows, statusBanner, reportTitle
} from "./report-format.js";

/**
 * Build one printable report card.
 * ctx: { school, settings, scale, nextTermBegins }, all optional.
 */
export function renderReportCard(r, ctx = {}) {
  const school = ctx.school || {};
  const showPosition = ctx.settings?.showPosition !== false;
  const banner = statusBanner(r.status);

  const info = (label, value) => [el("dt", { text: label }), el("dd", { text: value })];
  const stream = r.streamName ? ` ${r.streamName}` : "";

  const contact = [school.address, [school.phone, school.email].filter(Boolean).join(" · ")].filter(Boolean);

  const rows = (r.subjects || []).map((s) => {
    const cells = subjectCells(s);
    return el("tr", {},
      el("th", { scope: "row", text: s.name }),
      el("td", { class: "parts", text: (s.components || []).map(formatComponent).join("  ·  ") }),
      el("td", { class: "num", text: cells.mark }),
      el("td", { class: "num", text: cells.grade }),
      el("td", { text: cells.remark }));
  });

  const key = ctx.scale ? gradeKeyRows(ctx.scale.boundaries) : [];

  const logo = el("img", { class: "report-logo", src: "/assets/images/school-logo.png", alt: "" });
  logo.addEventListener("error", () => logo.remove());

  return el("article", { class: `report${banner ? " is-draft" : ""}`, ...(banner ? { "data-banner": banner } : {}) },
    el("header", { class: "report-head" },
      logo,
      el("div", {},
        el("h1", { text: school.name || "SPN School" }),
        ...(school.motto ? [el("p", { class: "motto", text: school.motto })] : []),
        ...contact.map((line) => el("p", { class: "contact", text: line })))),
    el("h2", { class: "report-title", text: reportTitle(r) }),

    el("dl", { class: "student-info" },
      ...info("Name", r.studentName),
      ...info("Admission no.", r.admissionNo),
      ...info("Class", `${r.className}${stream}`),
      ...info("Average", formatAverage(r.average)),
      ...info("Overall grade", r.overallGrade || "—"),
      ...(showPosition ? info("Position", formatPosition(r.position, r.outOf)) : []),
      ...(showPosition && r.streamPosition ? info("Position in stream", formatPosition(r.streamPosition, r.streamOutOf)) : [])),

    el("table", { class: "marks" },
      el("thead", {}, el("tr", {}, ...["Subject", "Assessments", "Mark %", "Grade", "Remark"].map((t) => el("th", { text: t })))),
      el("tbody", {}, ...rows),
      el("tfoot", {}, el("tr", {}, el("th", { colspan: 2, text: "Total" }), el("td", { class: "num", text: String(r.totalMarks ?? "—") }), el("td", { class: "num", text: r.overallGrade || "–" }), el("td", { text: "" })))),

    el("section", { class: "remarks" },
      el("div", { class: "remark" },
        el("h3", { text: "Class teacher's remark" }),
        el("p", { text: r.classTeacherRemark || "—" }),
        el("div", { class: "sign", text: "Signature" })),
      el("div", { class: "remark" },
        el("h3", { text: "Head teacher's remark" }),
        el("p", { text: r.headteacherRemark || "—" }),
        el("div", { class: "sign", text: school.principalName ? `Signature · ${school.principalName}` : "Signature" }))),

    el("footer", { class: "report-foot" },
      ...(key.length ? [el("p", { class: "grade-key" }, el("strong", { text: "Grades: " }), key.map((k) => `${k.grade} ${k.range}${k.remark ? " " + k.remark : ""}`).join("  ·  "))] : []),
      ...(ctx.nextTermBegins ? [el("p", { text: `Next term begins: ${formatDate(ctx.nextTermBegins)}` })] : []),
      ...(ctx.settings?.footerNote ? [el("p", { class: "note", text: ctx.settings.footerNote })] : [])));
}
