import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { planTransition, planRemarkEdit } = require("../functions/src/reports/report-workflow.js");

const NOW = "NOW";
const actor = (role, uid = "u1") => ({ uid, role });
const rep = (id, status, extra = {}) => ({ id, status, ready: true, studentName: `Student ${id}`, ...extra });
const plan = (action, reports, role, note) => planTransition({ action, reports, actor: actor(role), note, now: NOW });

// ---------- class-wide transitions ----------
test("submit moves ready drafts to submitted and records who and when", () => {
  const out = plan("submit", [rep("a", "draft"), rep("b", "draft"), rep("c", "approved")], "academic");
  assert.equal(out.ok, true);
  assert.deepEqual(out.updates.map((u) => u.id), ["a", "b"]);
  assert.equal(out.changed, 2);
  assert.equal(out.untouched, 1);
  assert.deepEqual(out.updates[0].patch, {
    status: "submitted", submittedBy: "u1", submittedAt: NOW, approvedBy: null, approvedAt: null, statusNote: null,
    statusChangedBy: "u1", statusChangedAt: NOW
  });
});

test("submit is blocked while any draft report is missing marks, and names them", () => {
  const out = plan("submit", [rep("a", "draft"), rep("b", "draft", { ready: false, studentName: "Amy Okello" })], "admin");
  assert.equal(out.ok, false);
  assert.equal(out.code, "failed-precondition");
  assert.match(out.message, /1 report is still missing marks \(Amy Okello\)/);
});

test("the missing-marks message lists at most five names", () => {
  const reports = Array.from({ length: 8 }, (_, i) => rep(`n${i}`, "draft", { ready: false, studentName: `S${i}` }));
  const out = plan("submit", reports, "academic");
  assert.match(out.message, /8 reports are still missing marks \(S0, S1, S2, S3, S4 and 3 more\)/);
});

test("a report that is not ready doesn't block approving other steps", () => {
  const out = plan("approve", [rep("a", "submitted"), rep("b", "draft", { ready: false })], "headteacher");
  assert.equal(out.ok, true);
  assert.deepEqual(out.updates.map((u) => u.id), ["a"]);
});

test("approve and return only touch submitted reports", () => {
  const reports = [rep("a", "submitted"), rep("b", "draft"), rep("c", "approved")];
  const approve = plan("approve", reports, "headteacher");
  assert.deepEqual(approve.updates.map((u) => u.id), ["a"]);
  assert.equal(approve.updates[0].patch.status, "approved");
  assert.equal(approve.updates[0].patch.approvedBy, "u1");

  const back = plan("return", reports, "headteacher", "  Check Maths marks  ");
  assert.equal(back.updates[0].patch.status, "draft");
  assert.equal(back.updates[0].patch.submittedBy, null);
  assert.equal(back.updates[0].patch.statusNote, "Check Maths marks");
  assert.equal(plan("return", reports, "headteacher").updates[0].patch.statusNote, null);
});

test("publish only works on approved reports", () => {
  const out = plan("publish", [rep("a", "approved"), rep("b", "submitted")], "admin");
  assert.deepEqual(out.updates.map((u) => u.id), ["a"]);
  assert.equal(out.updates[0].patch.status, "published");
  assert.equal(out.updates[0].patch.publishedBy, "u1");
});

test("reopen needs a reason and clears the approval trail", () => {
  const reports = [rep("a", "approved"), rep("b", "published"), rep("c", "draft")];
  assert.equal(plan("reopen", reports, "headteacher").ok, false);
  assert.match(plan("reopen", reports, "headteacher", "ab").message, /reason/);
  const out = plan("reopen", reports, "headteacher", "Wrong mark in Science");
  assert.deepEqual(out.updates.map((u) => u.id), ["a", "b"]);
  assert.deepEqual(
    { s: out.updates[0].patch.status, a: out.updates[0].patch.approvedBy, p: out.updates[0].patch.publishedBy, n: out.updates[0].patch.statusNote },
    { s: "draft", a: null, p: null, n: "Wrong mark in Science" });
});

test("nothing eligible gives a clear message", () => {
  const out = plan("approve", [rep("a", "draft")], "headteacher");
  assert.equal(out.ok, false);
  assert.match(out.message, /no submitted reports/);
  assert.equal(plan("submit", [], "academic").ok, false);
});

test("only the right roles can take each step", () => {
  const drafts = [rep("a", "draft")];
  const submitted = [rep("a", "submitted")];
  assert.equal(plan("submit", drafts, "academic").ok, true);
  assert.equal(plan("submit", drafts, "admin").ok, true);
  assert.equal(plan("submit", drafts, "headteacher").code, "permission-denied");
  assert.equal(plan("submit", drafts, "teacher").code, "permission-denied");
  assert.equal(plan("approve", submitted, "academic").code, "permission-denied");
  assert.equal(plan("approve", submitted, "headteacher").ok, true);
  assert.equal(plan("approve", submitted, "admin").ok, true);
  assert.equal(plan("publish", [rep("a", "approved")], "academic").code, "permission-denied");
  assert.equal(plan("reopen", [rep("a", "approved")], "academic", "reason here").code, "permission-denied");
});

test("unknown actions, including inherited object keys, are rejected", () => {
  assert.equal(plan("delete", [rep("a", "draft")], "admin").code, "invalid-argument");
  assert.equal(plan("toString", [rep("a", "draft")], "admin").code, "invalid-argument");
  assert.equal(plan("constructor", [rep("a", "draft")], "admin").code, "invalid-argument");
});

test("long notes are trimmed to 300 characters", () => {
  const out = plan("reopen", [rep("a", "approved")], "admin", "x".repeat(500));
  assert.equal(out.updates[0].patch.statusNote.length, 300);
});

// ---------- remark edits ----------
const edit = (status, role, fields) => planRemarkEdit({ report: { status }, actor: actor(role), ...fields });

test("the academic office edits the class teacher remark while a report is draft", () => {
  const out = edit("draft", "academic", { classTeacherRemark: "  A   good term.  " });
  assert.equal(out.ok, true);
  assert.deepEqual(out.patch, { classTeacherRemark: "A good term.", "remarkEdited.classTeacher": true });
  assert.equal(edit("submitted", "academic", { classTeacherRemark: "x" }).code, "failed-precondition");
  assert.equal(edit("approved", "admin", { classTeacherRemark: "x" }).code, "failed-precondition");
});

test("the head teacher edits their remark while draft or submitted, not after approval", () => {
  assert.deepEqual(edit("submitted", "headteacher", { headteacherRemark: "Well done." }).patch,
    { headteacherRemark: "Well done.", "remarkEdited.headteacher": true });
  assert.equal(edit("draft", "headteacher", { headteacherRemark: "x" }).ok, true);
  assert.equal(edit("approved", "headteacher", { headteacherRemark: "x" }).code, "failed-precondition");
  assert.equal(edit("published", "admin", { headteacherRemark: "x" }).code, "failed-precondition");
});

test("people can't edit each other's remark", () => {
  assert.equal(edit("draft", "headteacher", { classTeacherRemark: "x" }).code, "permission-denied");
  assert.equal(edit("draft", "academic", { headteacherRemark: "x" }).code, "permission-denied");
  assert.equal(edit("draft", "teacher", { classTeacherRemark: "x" }).code, "permission-denied");
});

test("a blank remark clears it, and too-long or non-text remarks are refused", () => {
  assert.equal(edit("draft", "admin", { classTeacherRemark: "   " }).patch.classTeacherRemark, null);
  assert.equal(edit("draft", "admin", { classTeacherRemark: null }).patch.classTeacherRemark, null);
  assert.equal(edit("draft", "admin", { classTeacherRemark: "x".repeat(301) }).code, "invalid-argument");
  assert.equal(edit("draft", "admin", { classTeacherRemark: 42 }).code, "invalid-argument");
  assert.equal(edit("draft", "admin", {}).code, "invalid-argument");
});

test("both remarks can be changed at once by an admin", () => {
  const out = edit("draft", "admin", { classTeacherRemark: "A", headteacherRemark: "B" });
  assert.deepEqual(Object.keys(out.patch).sort(),
    ["classTeacherRemark", "headteacherRemark", "remarkEdited.classTeacher", "remarkEdited.headteacher"]);
});
