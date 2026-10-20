/** Pure helpers for marks entry. No Firebase or DOM here, so they can be tested with node. */

/**
 * Turn what a teacher typed into a score.
 * Empty means "not entered" (score null). Accepts 45, 45.5 and 45,5; at most 2 decimals.
 */
export function parseScore(raw, max) {
  const text = String(raw ?? "").trim().replace(",", ".");
  if (text === "") return { ok: true, score: null };
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    return { ok: false, error: "Enter a number, like 45 or 45.5." };
  }
  const score = Number(text);
  if (score > max) return { ok: false, error: `Can't be more than ${max}.` };
  return { ok: true, score };
}

/** Counts for the progress line. rows: [{ score, absent }] */
export function summarize(rows) {
  let entered = 0;
  let absent = 0;
  for (const r of rows) {
    if (r.absent) absent++;
    else if (r.score !== null && r.score !== undefined) entered++;
  }
  return { total: rows.length, entered, absent, missing: rows.length - entered - absent };
}

/** A-Level students only sit subjects in their combination (plus compulsory ones). */
export function takesSubject(student, classLevel, subject, combosById) {
  if (classLevel !== "A-Level" || subject.isCompulsory) return true;
  const combo = combosById.get(student.combinationId);
  return !!combo && (combo.subjectIds || []).includes(subject.id);
}

export function sortStudents(list) {
  return [...list].sort(
    (a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)
  );
}

/** Can marks be typed for this assessment right now? */
export function entryState(assessment, term) {
  if (term.status === "closed") return { editable: false, reason: "This term is closed, so marks can't be changed." };
  if (assessment.status === "draft") return { editable: false, reason: "This assessment isn't open for marks yet. The academic office opens it when it's ready." };
  if (assessment.status === "locked") return { editable: false, reason: "This assessment is locked. Ask the academic office to reopen it if a mark must change." };
  return { editable: true, reason: null };
}
