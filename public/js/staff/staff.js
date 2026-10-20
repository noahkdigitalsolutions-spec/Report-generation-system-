import { db, functions } from "../firebase-init.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";
import { el, badge } from "../academics/crud-page.js";
import { COLLECTIONS, ROLE_LABELS } from "../utils/constants.js";

const setUserActive = httpsCallable(functions, "setUserActive");

/** Fill the staff table. Admins also get an Activate/Deactivate button on each row. */
export async function initStaffList(profile) {
  const body = document.getElementById("staff-body");
  const notice = document.getElementById("notice");
  const isAdmin = profile.role === "admin";
  const cols = isAdmin ? 5 : 4;

  const say = (msg) => { notice.textContent = msg; notice.hidden = !msg; };

  async function load() {
    say("");
    let staff;
    try {
      const snap = await getDocs(collection(db, COLLECTIONS.USERS));
      staff = snap.docs.map((d) => ({ uid: d.id, ...d.data() })).sort((a, b) => (a.fullName || "").localeCompare(b.fullName || ""));
    } catch {
      body.replaceChildren(el("tr", {}, el("td", { class: "empty", colspan: cols, text: "Could not load staff." })));
      return say("Could not load the staff list. Check your connection and refresh.");
    }

    if (!staff.length) {
      body.replaceChildren(el("tr", {}, el("td", { class: "empty", colspan: cols, text: "No staff yet." })));
      return;
    }

    body.replaceChildren(...staff.map((u) => {
      const tr = el("tr", {},
        el("td", { text: u.fullName || "—" }),
        el("td", { text: u.email || "—" }),
        el("td", { text: ROLE_LABELS[u.role] || u.role || "—" }),
        el("td", {}, u.active ? badge("Active", "active") : badge("Deactivated", "inactive")));
      if (isAdmin) {
        const self = u.uid === profile.uid;
        tr.append(el("td", { class: "row-actions" }, el("button", {
          class: "btn-small", type: "button", disabled: self,
          title: self ? "You can't deactivate your own account" : null,
          text: u.active ? "Deactivate" : "Activate",
          onclick: () => toggle(u)
        })));
      }
      return tr;
    }));
  }

  async function toggle(u) {
    if (u.active && !confirm(`Deactivate ${u.fullName || u.email}? They will be signed out and unable to sign in.`)) return;
    try {
      await setUserActive({ uid: u.uid, active: !u.active });
      await load();
    } catch (err) {
      say(err?.message || "Could not change that account. Try again.");
    }
  }

  await load();
}
