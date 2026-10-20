"use strict";
/**
 * Report status rules, kept free of Firebase so they can be tested with node.
 *
 *   draft --submit--> submitted --approve--> approved --publish--> published
 *   submitted --return--> draft        approved/published --reopen--> draft
 */

const TRANSITIONS = {
  submit: {
    from: ["draft"], roles: ["admin", "academic"],
    empty: "There are no draft reports to submit for this class.",
    patch: ({ actor, now }) => ({ status: "submitted", submittedBy: actor.uid, submittedAt: now, approvedBy: null, approvedAt: null, statusNote: null })
  },
  approve: {
    from: ["submitted"], roles: ["admin", "headteacher"],
    empty: "There are no submitted reports waiting for approval.",
    patch: ({ actor, now }) => ({ status: "approved", approvedBy: actor.uid, approvedAt: now, statusNote: null })
  },
  return: {
    from: ["submitted"], roles: ["admin", "headteacher"],
    empty: "There are no submitted reports to return.",
    patch: ({ note }) => ({ status: "draft", submittedBy: null, submittedAt: null, statusNote: note || null })
  },
  publish: {
    from: ["approved"], roles: ["admin", "headteacher"],
    empty: "There are no approved reports to publish.",
    patch: ({ actor, now }) => ({ status: "published", publishedBy: actor.uid, publishedAt: now })
  },
  reopen: {
    from: ["approved", "published"], roles: ["admin", "headteacher"], needsNote: true,
    empty: "There are no approved or published reports to reopen.",
    patch: ({ note }) => ({
      status: "draft", submittedBy: null, submittedAt: null, approvedBy: null, approvedAt: null,
      publishedBy: null, publishedAt: null, statusNote: note
    })
  }
};

const fail = (code, message) => ({ ok: false, code, message });

function nameList(reports) {
  const names = reports.slice(0, 5).map((r) => r.studentName);
  return reports.length > 5 ? `${names.join(", ")} and ${reports.length - 5} more` : names.join(", ");
}

/**
 * Work out what a class-wide status change would do.
 * reports: [{ id, status, ready, studentName }]. Returns { ok, updates:[{id,patch}], changed, untouched } or { ok:false, code, message }.
 */
function planTransition({ action, reports, actor, note, now }) {
  const t = Object.hasOwn(TRANSITIONS, action) ? TRANSITIONS[action] : null;
  if (!t) return fail("invalid-argument", "Unknown action.");
  if (!t.roles.includes(actor.role)) return fail("permission-denied", "You don't have permission to do this.");

  const cleanNote = typeof note === "string" ? note.trim().slice(0, 300) : "";
  if (t.needsNote && cleanNote.length < 3) return fail("invalid-argument", "Give a reason, so others can see why the reports were reopened.");

  const eligible = reports.filter((r) => t.from.includes(r.status));
  if (!eligible.length) return fail("failed-precondition", t.empty);

  if (action === "submit") {
    const notReady = eligible.filter((r) => !r.ready);
    if (notReady.length) {
      return fail("failed-precondition",
        `${notReady.length} ${notReady.length === 1 ? "report is" : "reports are"} still missing marks (${nameList(notReady)}). Enter the marks, generate again, then submit.`);
    }
  }

  const updates = eligible.map((r) => ({
    id: r.id,
    patch: { ...t.patch({ actor, note: cleanNote, now }), statusChangedBy: actor.uid, statusChangedAt: now }
  }));
  return { ok: true, updates, changed: eligible.length, untouched: reports.length - eligible.length };
}

/**
 * Check an edit to the remarks on one report.
 * Class teacher remark: admin/academic while draft. Head teacher remark: headteacher/admin while draft or submitted.
 * A blank remark clears it. Returns { ok, patch } or { ok:false, code, message }.
 */
function planRemarkEdit({ report, actor, classTeacherRemark, headteacherRemark }) {
  const patch = {};
  const clean = (v, label) => {
    if (v === null || v === "") return null;
    if (typeof v !== "string") throw new Error(`${label} is not valid.`);
    const text = v.trim().replace(/\s+/g, " ");
    if (text.length > 300) throw new Error(`${label} is too long (300 characters at most).`);
    return text || null;
  };

  try {
    if (classTeacherRemark !== undefined) {
      if (!["admin", "academic"].includes(actor.role)) return fail("permission-denied", "Only the academic office can change the class teacher's remark.");
      if (report.status !== "draft") return fail("failed-precondition", `This report is ${report.status}. Reopen it to change the class teacher's remark.`);
      patch.classTeacherRemark = clean(classTeacherRemark, "Class teacher remark");
      patch["remarkEdited.classTeacher"] = true;
    }
    if (headteacherRemark !== undefined) {
      if (!["admin", "headteacher"].includes(actor.role)) return fail("permission-denied", "Only the head teacher can change the head teacher's remark.");
      if (!["draft", "submitted"].includes(report.status)) return fail("failed-precondition", `This report is ${report.status}. Reopen it to change the head teacher's remark.`);
      patch.headteacherRemark = clean(headteacherRemark, "Head teacher remark");
      patch["remarkEdited.headteacher"] = true;
    }
  } catch (err) {
    return fail("invalid-argument", err.message);
  }

  if (!Object.keys(patch).length) return fail("invalid-argument", "Nothing to change.");
  return { ok: true, patch };
}

module.exports = { TRANSITIONS, planTransition, planRemarkEdit };
