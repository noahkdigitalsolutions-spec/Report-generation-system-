import test from "node:test";
import assert from "node:assert/strict";
import {
  ordinal, formatPosition, formatAverage, formatComponent, subjectCells, gradeKeyRows, statusBanner, reportTitle, byLastName
} from "../public/js/reports/report-format.js";
import { formatDate, formatRange } from "../public/js/utils/date-utils.js";

test("ordinals, including the 11th to 13th exceptions", () => {
  const got = [1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal);
  assert.deepEqual(got, ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st", "111th"]);
});

test("position and average text", () => {
  assert.equal(formatPosition(3, 40), "3rd of 40");
  assert.equal(formatPosition(null, null), "—");
  assert.equal(formatPosition(2), "2nd");
  assert.equal(formatAverage(72.5), "72.5%");
  assert.equal(formatAverage(0), "0%");
  assert.equal(formatAverage(null), "—");
});

test("assessment components", () => {
  assert.equal(formatComponent({ name: "End of term", score: 85, maxScore: 100, absent: false }), "End of term 85/100");
  assert.equal(formatComponent({ name: "Test 1", score: null, maxScore: 20, absent: true }), "Test 1 absent");
  assert.equal(formatComponent({ name: "Quiz", score: null, maxScore: 20, absent: false }), "Quiz —/20");
  assert.equal(formatComponent({ name: "Quiz", score: 0, maxScore: 20, absent: false }), "Quiz 0/20");
});

test("subject cells for each status", () => {
  assert.deepEqual(subjectCells({ status: "complete", percent: 78, grade: "B", remark: "Good" }), { mark: "78", grade: "B", remark: "Good" });
  assert.deepEqual(subjectCells({ status: "complete", percent: 0, grade: "F", remark: null }), { mark: "0", grade: "F", remark: "" });
  assert.equal(subjectCells({ status: "absent" }).mark, "ABS");
  assert.equal(subjectCells({ status: "incomplete" }).remark, "Marks incomplete");
  assert.equal(subjectCells({ status: "invalid-weights" }).mark, "—");
});

test("grade key runs high to low with each band's upper limit", () => {
  const rows = gradeKeyRows([{ min: 0, grade: "F", remark: "Fail" }, { min: 80, grade: "A", remark: "Excellent" }, { min: 50, grade: "C" }]);
  assert.deepEqual(rows, [
    { grade: "A", range: "80–100", remark: "Excellent" },
    { grade: "C", range: "50–79", remark: "" },
    { grade: "F", range: "0–49", remark: "Fail" }
  ]);
  assert.deepEqual(gradeKeyRows(undefined), []);
});

test("only approved and published reports are free of a banner", () => {
  assert.equal(statusBanner("approved"), null);
  assert.equal(statusBanner("published"), null);
  assert.equal(statusBanner("draft"), "DRAFT");
  assert.equal(statusBanner("submitted"), "AWAITING APPROVAL");
});

test("report title and last-name ordering", () => {
  assert.equal(reportTitle({ termName: "Term 1", yearName: "2026" }), "Term 1 · 2026 · Report");
  const list = [{ studentName: "Mary Abara" }, { studentName: "Amy Okello" }, { studentName: "Ann Grace Abara" }];
  assert.deepEqual(list.sort(byLastName).map((r) => r.studentName), ["Ann Grace Abara", "Mary Abara", "Amy Okello"]);
});

test("dates", () => {
  assert.equal(formatDate("2026-02-03"), "3 Feb 2026");
  assert.equal(formatDate(""), "—");
  assert.equal(formatDate("2026-13-01"), "—");
  assert.equal(formatRange("2026-02-03", "2026-04-11"), "3 Feb 2026 – 11 Apr 2026");
});
