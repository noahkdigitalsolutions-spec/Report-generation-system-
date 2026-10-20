import { requireAuth } from "../auth-guard.js";
import { mountHeader, mountSettingsTabs } from "../navigation.js";
import { initSettingsForm } from "./settings-page.js";

const { profile } = await requireAuth(["admin", "headteacher", "academic"]);
mountHeader(profile);
mountSettingsTabs(document.getElementById("tabs"));

initSettingsForm({
  root: document.getElementById("app"),
  docId: "report",
  title: "Report settings",
  profile,
  defaults: { showPosition: true, absentPolicy: "zero" },
  fields: [
    { name: "showPosition", label: "Show class position on report cards", type: "checkbox" },
    {
      name: "absentPolicy", label: "When a student is absent for an assessment", type: "select",
      options: [
        { value: "zero", label: "Count it as 0" },
        { value: "exclude", label: "Leave it out and re-weight the others" }
      ],
      help: "Applies the next time reports are generated."
    },
    { name: "footerNote", label: "Note at the bottom of each report", type: "textarea", max: 300 }
  ]
});
