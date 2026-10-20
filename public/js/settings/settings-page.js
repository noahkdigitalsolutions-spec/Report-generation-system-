import { db } from "../firebase-init.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { el } from "../academics/crud-page.js";
import { COLLECTIONS } from "../utils/constants.js";

/**
 * A single-document settings form (settings/{docId}). Only the admin can save (see firestore.rules).
 * fields: [{ name, label, type?, options?, help?, max? }]  type: text | email | textarea | select | checkbox
 */
export async function initSettingsForm({ root, docId, title, intro, fields, defaults = {}, profile }) {
  const canEdit = profile.role === "admin";
  const notice = el("div", { role: "status", hidden: true });
  const say = (kind, msg) => { notice.className = `notice ${kind}`; notice.textContent = msg; notice.hidden = false; };

  let current = { ...defaults };
  try {
    const snap = await getDoc(doc(db, COLLECTIONS.SETTINGS, docId));
    if (snap.exists()) current = { ...defaults, ...snap.data() };
  } catch {
    root.replaceChildren(el("h1", { text: title }), el("div", { class: "notice error", role: "alert", text: "Could not load these settings. Check your connection and refresh." }));
    return;
  }

  const controls = {};
  const rows = fields.map((f) => {
    const id = `s-${f.name}`;
    let input;
    if (f.type === "checkbox") {
      input = el("input", { type: "checkbox", id, disabled: !canEdit });
      input.checked = !!current[f.name];
      controls[f.name] = () => input.checked;
      return el("div", { class: "field" }, el("label", { class: "check", for: id }, input, el("span", { text: f.label })), f.help ? el("p", { class: "help", text: f.help }) : "");
    }
    if (f.type === "select") {
      input = el("select", { id, disabled: !canEdit }, ...f.options.map((o) => el("option", { value: o.value, text: o.label })));
      input.value = current[f.name] ?? f.options[0].value;
    } else if (f.type === "textarea") {
      input = el("textarea", { id, rows: 3, maxlength: f.max || 300, disabled: !canEdit });
      input.value = current[f.name] ?? "";
    } else {
      input = el("input", { id, type: f.type || "text", maxlength: f.max || 120, autocomplete: "off", disabled: !canEdit });
      input.value = current[f.name] ?? "";
    }
    controls[f.name] = () => input.value.trim();
    return el("div", { class: "field" }, el("label", { for: id, text: f.label }), input, f.help ? el("p", { class: "help", text: f.help }) : "");
  });

  const save = el("button", { class: "btn-primary", type: "submit", text: "Save", hidden: !canEdit });
  const form = el("form", { novalidate: true }, ...rows, save);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    notice.hidden = true;
    const data = Object.fromEntries(fields.map((f) => [f.name, controls[f.name]()]));
    for (const f of fields) if (f.required && !data[f.name]) return say("error", `${f.label} is required.`);
    save.disabled = true;
    try {
      await setDoc(doc(db, COLLECTIONS.SETTINGS, docId), { ...data, updatedAt: serverTimestamp(), updatedBy: profile.uid }, { merge: true });
      say("success", "Saved.");
    } catch (err) {
      say("error", err?.code === "permission-denied" ? "Only the administrator can change these settings." : "Could not save. Try again.");
    } finally {
      save.disabled = false;
    }
  });

  root.replaceChildren(
    el("div", { class: "page-head" }, el("h1", { text: title })),
    ...(intro ? [el("p", { class: "help", text: intro })] : []),
    ...(!canEdit ? [el("p", { class: "help", text: "You can view these settings. Only the administrator can change them." })] : []),
    notice, form);
}
