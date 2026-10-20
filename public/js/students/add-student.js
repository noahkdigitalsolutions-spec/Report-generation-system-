import { requireAuth } from "../auth-guard.js";
import { mountHeader } from "../navigation.js";
import { initStudentForm } from "./student-form.js";

const { profile } = await requireAuth(["admin", "academic"]);
mountHeader(profile);
await initStudentForm({ root: document.getElementById("app") });
