/** Pure text helpers for report cards (no DOM), so they can be tested with node. */

const PROBLEM = new Set(["incomplete", "invalid-weights", "invalid-marks", "no-assessments"]);

/** 1 -> "1st", 2 -> "2nd", 3 -> "3rd", 11 -> "11th", 22 -> "22nd". */
export function ordinal(n) {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${{ 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th"}`;
}

/** "3rd of 40", or "—" when the student isn't ranked. */
export function formatPosition(position, outOf) {
  if (!position) return "—";
  return outOf ? `${ordinal(position)} of ${outOf}` : ordinal(position);
}

/** 72.5 -> "72.5%", null -> "—". */
export function formatAverage(average) {
  return average === null || average === undefined ? "—" : `${average}%`;
}

/** One assessment on a report card: "End of term 85/100", "Test 1 absent", "Quiz —/20". */
export function formatComponent(c) {
  if (c.absent) return `${c.name} absent`;
  const score = c.score === null || c.score === undefined ? "—" : c.score;
  return `${c.name} ${score}/${c.maxScore}`;
}

/** What to print in the Mark %, Grade and Remark cells for one subject. */
export function subjectCells(s) {
  if (s.status === "complete") return { mark: String(s.percent), grade: s.grade || "–", remark: s.remark || "" };
  if (s.status === "absent") return { mark: "ABS", grade: "–", remark: "Absent" };
  if (PROBLEM.has(s.status)) return { mark: "—", grade: "–", remark: "Marks incomplete" };
  return { mark: "—", grade: "–", remark: "" };
}

/** Grade key for the footer, high to low: [{ grade: "A", range: "80–100", remark }]. */
export function gradeKeyRows(boundaries) {
  const sorted = [...(boundaries || [])].sort((a, b) => b.min - a.min);
  return sorted.map((b, i) => {
    const max = i === 0 ? 100 : sorted[i - 1].min - 1;
    return { grade: b.grade, range: `${b.min}–${max}`, remark: b.remark || "" };
  });
}

/** Banner for reports that aren't final. Approved and published reports have none. */
export function statusBanner(status) {
  if (status === "approved" || status === "published") return null;
  if (status === "submitted") return "AWAITING APPROVAL";
  return "DRAFT";
}

export function reportTitle(r) {
  return [r.termName, r.yearName, "Report"].filter(Boolean).join(" · ");
}

/** Sort comparator: last name, then first word of the name. Works on report documents. */
export function byLastName(a, b) {
  const last = (r) => (r.studentName || "").trim().split(/\s+/).slice(-1)[0] || "";
  const first = (r) => (r.studentName || "").trim().split(/\s+/)[0] || "";
  return last(a).localeCompare(last(b)) || first(a).localeCompare(first(b));
}
