import { db } from "../firebase-init.js";
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc,
  query, where, limit, writeBatch, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "text") node.textContent = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (v === true) node.setAttribute(k, "");
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  node.append(...children);
  return node;
}

export const badge = (text, kind) => el("span", { class: `badge ${kind}`, text });

/** True if another record (not the one being edited) matches. */
export const duplicate = (items, editingId, pred) => items.some((i) => i.id !== editingId && pred(i));

/** After saving, make sure only one record in the collection has isCurrent = true. */
export function onlyOneCurrent(collectionName) {
  return async (id, data) => {
    if (!data.isCurrent) return;
    const snap = await getDocs(query(collection(db, collectionName), where("isCurrent", "==", true)));
    const batch = writeBatch(db);
    snap.forEach((d) => { if (d.id !== id) batch.update(d.ref, { isCurrent: false }); });
    await batch.commit();
  };
}

const isEmpty = (v) => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);

function messageFor(err) {
  if (err?.code === "permission-denied") return "You don't have permission to change this.";
  if (err?.code === "unavailable") return "No connection. Check your internet and try again.";
  return "Something went wrong. Try again.";
}

/**
 * Renders a list + add/edit dialog + delete for one Firestore collection.
 * Config: profile, root, collection, title, singular, nameOf(item), emptyText,
 *   fields[], columns[], lookups{}, sort(a,b,state), validate(data,ctx), afterSave(id,data), deleteGuards[]
 * Admin and academic can change data; everyone else sees a read-only list.
 */
export function initCrudPage(cfg) {
  const { profile, root } = cfg;
  const canEdit = ["admin", "academic"].includes(profile.role);
  const state = { items: [], lookups: {} };
  let editing = null;
  let controls = {};

  // ----- skeleton -----
  const addBtn = el("button", { class: "btn-link", type: "button", text: `Add ${cfg.singular}`, hidden: !canEdit, onclick: () => openForm() });
  const notice = el("div", { class: "notice error", role: "alert", hidden: true });
  const headRow = el("tr", {}, ...cfg.columns.map((c) => el("th", { text: c.label })));
  if (canEdit) headRow.append(el("th", {}, el("span", { class: "sr-only", text: "Actions" })));
  const tbody = el("tbody");
  const colCount = cfg.columns.length + (canEdit ? 1 : 0);

  const dialog = el("dialog", { "aria-labelledby": "dlg-title" });
  const dlgTitle = el("h2", { id: "dlg-title", class: "dialog-title" });
  const dlgNotice = el("div", { class: "notice error", role: "alert", hidden: true });
  const form = el("form", { novalidate: true });
  dialog.append(dlgTitle, dlgNotice, form);

  root.replaceChildren(
    el("div", { class: "page-head" }, el("h1", { text: cfg.title }), addBtn),
    notice,
    el("div", { class: "table-wrap" }, el("table", {}, el("thead", {}, headRow), tbody)),
    dialog
  );

  // ----- data -----
  async function load() {
    try {
      const lookupEntries = Object.entries(cfg.lookups || {});
      const [snap, ...lookupSnaps] = await Promise.all([
        getDocs(collection(db, cfg.collection)),
        ...lookupEntries.map(([, name]) => getDocs(collection(db, name)))
      ]);
      state.items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      lookupEntries.forEach(([key], i) => {
        state.lookups[key] = new Map(lookupSnaps[i].docs.map((d) => [d.id, { id: d.id, ...d.data() }]));
      });
      if (cfg.sort) state.items.sort((a, b) => cfg.sort(a, b, state));
      render();
    } catch (err) {
      showNotice("Could not load this list. Check your connection and refresh.");
    }
  }

  function render() {
    tbody.replaceChildren();
    if (!state.items.length) {
      tbody.append(el("tr", {}, el("td", { class: "empty", colspan: colCount, text: cfg.emptyText })));
      return;
    }
    for (const item of state.items) {
      const tr = el("tr");
      for (const col of cfg.columns) {
        const value = col.render(item, state);
        tr.append(el("td", {}, value instanceof Node ? value : String(value ?? "—")));
      }
      if (canEdit) {
        tr.append(el("td", { class: "row-actions" },
          el("button", { class: "btn-small", type: "button", text: "Edit", onclick: () => openForm(item) }),
          el("button", { class: "btn-small", type: "button", text: "Delete", onclick: () => remove(item) })
        ));
      }
      tbody.append(tr);
    }
  }

  function showNotice(msg) {
    notice.textContent = msg;
    notice.hidden = false;
  }

  // ----- form -----
  function optionsFor(f) {
    if (f.options) return f.options;
    const { lookup, label, sort } = f.optionsFrom;
    let docs = [...state.lookups[lookup].values()];
    if (sort) docs.sort(sort);
    const opts = docs.map((d) => ({ value: d.id, label: label(d) }));
    return sort ? opts : opts.sort((a, b) => a.label.localeCompare(b.label));
  }

  function buildField(f, item) {
    const current = item ? item[f.name] : f.default;
    const id = `f-${f.name}`;

    if (f.type === "checkbox") {
      const input = el("input", { type: "checkbox", id });
      input.checked = !!current;
      controls[f.name] = () => input.checked;
      return el("div", { class: "field" }, el("label", { class: "check", for: id }, input, el("span", { text: f.label })));
    }

    if (f.type === "checklist") {
      const selected = new Set(current || []);
      const boxes = optionsFor(f).map((o) => {
        const input = el("input", { type: "checkbox", value: o.value });
        input.checked = selected.has(o.value);
        return { o, input };
      });
      controls[f.name] = () => boxes.filter((b) => b.input.checked).map((b) => b.o.value);
      return el("div", { class: "field" },
        el("fieldset", { class: "checklist" },
          el("legend", { text: f.label }),
          ...boxes.map(({ o, input }) => el("label", { class: "check" }, input, el("span", { text: o.label })))));
    }

    let input;
    if (f.type === "select") {
      input = el("select", { id });
      input.append(el("option", { value: "", text: "Choose…" }));
      for (const o of optionsFor(f)) input.append(el("option", { value: String(o.value), text: o.label }));
      input.value = current === undefined || current === null ? "" : String(current);
    } else {
      input = el("input", { id, type: f.type || "text", autocomplete: "off" });
      for (const [k, v] of Object.entries(f.attrs || {})) input.setAttribute(k, v);
      if (f.placeholder) input.placeholder = f.placeholder;
      input.value = current ?? "";
    }
    controls[f.name] = () => {
      const raw = input.value.trim();
      if (raw === "") return null;
      if (f.type === "number" || f.numeric) return Number(raw);
      return f.transform ? f.transform(raw) : raw;
    };
    return el("div", { class: "field" },
      el("label", { for: id, text: f.label }),
      input,
      f.help ? el("p", { class: "help", text: f.help }) : "");
  }

  function openForm(item = null) {
    editing = item;
    controls = {};
    dlgNotice.hidden = true;
    dlgTitle.textContent = `${item ? "Edit" : "Add"} ${cfg.singular}`;
    form.replaceChildren(...cfg.fields.map((f) => buildField(f, item)));
    form.append(el("div", { class: "dialog-actions" },
      el("button", { class: "btn-small", type: "button", text: "Cancel", onclick: () => dialog.close() }),
      el("button", { class: "btn-primary", type: "submit", text: item ? "Save changes" : `Add ${cfg.singular}` })));
    dialog.showModal();
  }

  function fail(msg) {
    dlgNotice.textContent = msg;
    dlgNotice.hidden = false;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    dlgNotice.hidden = true;

    const data = {};
    for (const f of cfg.fields) data[f.name] = controls[f.name]();
    for (const f of cfg.fields) {
      if (f.required && isEmpty(data[f.name])) return fail(`${f.label} is required.`);
    }
    const problem = cfg.validate?.(data, { items: state.items, lookups: state.lookups, editingId: editing?.id });
    if (problem) return fail(problem);

    const submitBtn = form.querySelector("[type=submit]");
    submitBtn.disabled = true;
    try {
      let id = editing?.id;
      if (id) {
        await updateDoc(doc(db, cfg.collection, id), { ...data, updatedAt: serverTimestamp() });
      } else {
        const ref = await addDoc(collection(db, cfg.collection), {
          ...data, createdAt: serverTimestamp(), createdBy: profile.uid
        });
        id = ref.id;
      }
      if (cfg.afterSave) await cfg.afterSave(id, data);
      dialog.close();
      await load();
    } catch (err) {
      fail(messageFor(err));
    } finally {
      submitBtn.disabled = false;
    }
  });

  // ----- delete -----
  async function remove(item) {
    notice.hidden = true;
    if (!confirm(`Delete ${cfg.nameOf(item)}? This can't be undone.`)) return;
    try {
      for (const g of cfg.deleteGuards || []) {
        const q = query(collection(db, g.collection), where(g.field, g.op || "==", item.id), limit(1));
        if (!(await getDocs(q)).empty) return showNotice(g.message);
      }
      await deleteDoc(doc(db, cfg.collection, item.id));
      await load();
    } catch (err) {
      showNotice(messageFor(err));
    }
  }

  load();
}
