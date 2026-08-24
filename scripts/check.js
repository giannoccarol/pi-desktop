"use strict";
// Syntax-checks every JS file in the project. Run with `npm run check`.
const { execFileSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const root = path.join(__dirname, "..");
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".git", "dist"].includes(entry.name)) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (entry.name.endsWith(".js") || entry.name.endsWith(".mjs")) out.push(p);
  }
  return out;
}

let failed = false;
for (const file of walk(root)) {
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
    console.log(`ok   ${path.relative(root, file)}`);
  } catch (err) {
    failed = true;
    console.error(`FAIL ${path.relative(root, file)}\n${err.stderr}`);
  }
}
process.exit(failed ? 1 : 0);
