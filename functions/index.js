const { initializeApp } = require("firebase-admin/app");
const { onCall } = require("firebase-functions/v2/https");

initializeApp();

const { createStaffUser, setUserActive } = require("./src/staff/staff-service");
const { createStudent, updateStudent } = require("./src/students/student-service");
const { generateReports } = require("./src/reports/report-service");
const { changeReportStatus, saveReportRemarks } = require("./src/reports/report-approval-service");

// Region must match getFunctions(app, region) on the client (default: us-central1).
exports.createStaffUser = onCall(createStaffUser);
exports.setUserActive = onCall(setUserActive);
exports.createStudent = onCall(createStudent);
exports.updateStudent = onCall(updateStudent);
exports.generateReports = onCall(generateReports);
exports.changeReportStatus = onCall(changeReportStatus);
exports.saveReportRemarks = onCall(saveReportRemarks);
