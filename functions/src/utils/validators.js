"use strict";
const { HttpsError } = require("firebase-functions/v2/https");
const { ROLES } = require("../config/constants");

const bad = (msg) => new HttpsError("invalid-argument", msg);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A non-empty trimmed string, at most `max` characters. */
function requireString(value, label, { max = 200 } = {}) {
  if (typeof value !== "string" || !value.trim()) throw bad(`${label} is required.`);
  const clean = value.trim();
  if (clean.length > max) throw bad(`${label} must be ${max} characters or fewer.`);
  return clean;
}

/** A trimmed string, or null when empty or missing. */
function optionalString(value, label, { max = 200 } = {}) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw bad(`${label} is not valid.`);
  const clean = value.trim();
  if (!clean) return null;
  if (clean.length > max) throw bad(`${label} must be ${max} characters or fewer.`);
  return clean;
}

function requireEnum(value, allowed, label) {
  if (!allowed.includes(value)) throw bad(`Choose a valid ${label}.`);
  return value;
}

function requireEmail(value) {
  const email = requireString(value, "Email", { max: 254 }).toLowerCase();
  if (!EMAIL_RE.test(email)) throw bad("Enter a valid email address.");
  return email;
}

function requireRole(value) {
  return requireEnum(value, ROLES, "role");
}

/** A YYYY-MM-DD date string that is a real calendar date, or null when empty. */
function optionalDate(value, label) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !DATE_RE.test(value)) throw bad(`${label} must be a date.`);
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) throw bad(`${label} must be a real date.`);
  return value;
}

module.exports = { requireString, optionalString, requireEnum, requireEmail, requireRole, optionalDate };
