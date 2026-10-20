import { requireAuth } from "../auth-guard.js";
import { mountHeader, mountSettingsTabs } from "../navigation.js";
import { initSettingsForm } from "./settings-page.js";

const { profile } = await requireAuth(["admin", "headteacher", "academic"]);
mountHeader(profile);
mountSettingsTabs(document.getElementById("tabs"));

initSettingsForm({
  root: document.getElementById("app"),
  docId: "school",
  title: "School profile",
  intro: "This appears at the top of every report card.",
  profile,
  fields: [
    { name: "name", label: "School name", required: true },
    { name: "motto", label: "Motto" },
    { name: "address", label: "Address" },
    { name: "phone", label: "Phone", type: "tel", max: 40 },
    { name: "email", label: "Email", type: "email", max: 120 },
    { name: "principalName", label: "Head teacher's name", help: "Printed under the head teacher's signature line." }
  ]
});
