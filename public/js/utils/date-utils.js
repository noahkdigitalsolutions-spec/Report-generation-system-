const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-02-03" -> "3 Feb 2026". Returns "—" for empty or malformed input. */
export function formatDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!m) return "—";
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return "—";
  return `${Number(m[3])} ${month} ${m[1]}`;
}

/** "3 Feb 2026 – 11 Apr 2026" */
export function formatRange(start, end) {
  return `${formatDate(start)} – ${formatDate(end)}`;
}
