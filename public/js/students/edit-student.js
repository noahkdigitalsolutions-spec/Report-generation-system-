import { requireAuth } from "../auth-guard.js";
import { mountHeader } from "../navigation.js";
import { initStudentForm } from "./student-form.js";

const { profile } = await requireAuth(["admin", "academic"]);
mountHeader(profile);
const id = new URLSearchParams(location.search).get("id");
await initStudentForm({ root: document.getElementById("app"), studentId: id });
