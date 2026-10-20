// Generates the browser copy of the grading engine from the server source.
//   npm run sync:grading
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const SOURCE = fileURLToPath(new URL("../functions/src/grading/grade-calculator.js", import.meta.url));
export const TARGET = fileURLToPath(new URL("../public/js/grading/grade-calculator.js", import.meta.url));

const HEADER = "// GENERATED from functions/src/grading/grade-calculator.js by `npm run sync:grading`. Do not edit by hand.\n";

/** Turn the CommonJS source into an ES module. */
export function buildBrowserCopy(source) {
  const body = source.replace(/^"use strict";\n/, "");
  const match = body.match(/module\.exports\s*=\s*\{([^}]*)\};?\s*$/);
  if (!match) throw new Error("Could not find module.exports at the end of grade-calculator.js");
  const names = match[1].split(",").map((s) => s.trim()).filter(Boolean);
  return `${HEADER}${body.slice(0, match.index).trimEnd()}\n\nexport { ${names.join(", ")} };\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(TARGET, buildBrowserCopy(readFileSync(SOURCE, "utf8")));
  console.log("Wrote", TARGET);
}
