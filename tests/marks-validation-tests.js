import test from "node:test";
import assert from "node:assert/strict";
import { parseScore, summarize, takesSubject, sortStudents, entryState } from "../public/js/assessments/marks-validation.js";

test("empty input means not entered", () => {
  assert.deepEqual(parseScore("", 100), { ok: true, score: null });
  assert.deepEqual(parseScore("   ", 100), { ok: true, score: null });
  assert.deepEqual(parseScore(undefined, 100), { ok: true, score: null });
});

test("accepts whole numbers, decimals and comma decimals", () => {
  assert.deepEqual(parseScore("45", 100), { ok: true, score: 45 });
  assert.deepEqual(parseScore(" 45.5 ", 100), { ok: true, score: 45.5 });
  assert.deepEqual(parseScore("45,5", 100), { ok: true, score: 45.5 });
  assert.deepEqual(parseScore("0", 100), { ok: true, score: 0 });
  assert.deepEqual(parseScore("0.25", 100), { ok: true, score: 0.25 });
});

test("max score is allowed, above it is not", () => {
  assert.equal(parseScore("100", 100).ok, true);
  const over = parseScore("101", 100);
  assert.equal(over.ok, false);
  assert.match(over.error, /more than 100/);
  assert.equal(parseScore("20.5", 20).ok, false);
});

test("rejects negatives, text, exponents, hex and long decimals", () => {
  for (const bad of ["-1", "abc", "1e2", "0x10", "12.345", "4 5", ".5", "5.", "Infinity", "NaN"]) {
    assert.equal(parseScore(bad, 100).ok, false, `should reject "${bad}"`);
  }
});

test("summarize counts entered, absent and missing", () => {
  const rows = [
    { score: 50, absent: false },
    { score: 0, absent: false },
    { score: null, absent: true },
    { score: null, absent: false },
    { score: undefined, absent: false }
  ];
  assert.deepEqual(summarize(rows), { total: 5, entered: 2, absent: 1, missing: 2 });
  assert.deepEqual(summarize([]), { total: 0, entered: 0, absent: 0, missing: 0 });
});

test("a score of 0 counts as entered, not missing", () => {
  assert.equal(summarize([{ score: 0, absent: false }]).missing, 0);
});

test("takesSubject: O-Level students take every subject", () => {
  assert.equal(takesSubject({ combinationId: null }, "O-Level", { id: "phy" }, new Map()), true);
});

test("takesSubject: A-Level follows the combination, compulsory subjects always apply", () => {
  const combos = new Map([["pcm", { subjectIds: ["phy", "chem", "math"] }]]);
  const student = { combinationId: "pcm" };
  assert.equal(takesSubject(student, "A-Level", { id: "phy" }, combos), true);
  assert.equal(takesSubject(student, "A-Level", { id: "hist" }, combos), false);
  assert.equal(takesSubject(student, "A-Level", { id: "gp", isCompulsory: true }, combos), true);
  assert.equal(takesSubject({ combinationId: "gone" }, "A-Level", { id: "phy" }, combos), false);
});

test("sortStudents orders by last name then first name without changing the input", () => {
  const input = [
    { lastName: "Okello", firstName: "Zed" },
    { lastName: "Abara", firstName: "Mary" },
    { lastName: "Okello", firstName: "Amy" }
  ];
  const out = sortStudents(input);
  assert.deepEqual(out.map((s) => `${s.lastName} ${s.firstName}`), ["Abara Mary", "Okello Amy", "Okello Zed"]);
  assert.equal(input[0].firstName, "Zed");
});

test("entryState: only open assessments in open terms are editable", () => {
  const open = { status: "open" };
  assert.equal(entryState(open, { status: "open" }).editable, true);
  assert.equal(entryState(open, { status: "closed" }).editable, false);
  assert.equal(entryState({ status: "draft" }, { status: "open" }).editable, false);
  assert.equal(entryState({ status: "locked" }, { status: "open" }).editable, false);
  assert.match(entryState({ status: "locked" }, { status: "open" }).reason, /locked/);
});
