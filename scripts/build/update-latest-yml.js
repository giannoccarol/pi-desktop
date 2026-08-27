"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const [metadataPath, installerPath] = process.argv.slice(2);
if (!metadataPath || !installerPath) {
  console.error("Usage: node update-latest-yml.js <latest.yml> <installer.exe>");
  process.exit(2);
}

const installerName = path.basename(installerPath);
const installer = fs.readFileSync(installerPath);
const sha512 = crypto.createHash("sha512").update(installer).digest("base64");
const size = installer.length;
const lines = fs.readFileSync(metadataPath, "utf8").split(/\r?\n/);

let inInstallerEntry = false;
let foundInstaller = false;
for (let index = 0; index < lines.length; index += 1) {
  const line = lines[index];
  const entry = line.match(/^(\s*)-\s+url:\s*(.+?)\s*$/);
  if (entry) {
    inInstallerEntry = path.basename(entry[2].replace(/^['"]|['"]$/g, "")) === installerName;
    foundInstaller ||= inInstallerEntry;
    continue;
  }
  if (inInstallerEntry && /^\s+-\s+url:/.test(line)) inInstallerEntry = false;
  if (inInstallerEntry && /^\s+sha512:/.test(line)) lines[index] = line.replace(/sha512:.*/, `sha512: ${sha512}`);
  if (inInstallerEntry && /^\s+size:/.test(line)) lines[index] = line.replace(/size:.*/, `size: ${size}`);
  if (/^path:\s*/.test(line)) lines[index] = `path: ${installerName}`;
  if (/^sha512:\s*/.test(line)) lines[index] = `sha512: ${sha512}`;
  if (/^size:\s*/.test(line)) lines[index] = `size: ${size}`;
}

if (!foundInstaller) {
  console.error(`Installer ${installerName} not found in ${metadataPath}`);
  process.exit(1);
}
fs.writeFileSync(metadataPath, lines.join("\n"), "utf8");
console.log(`Updated ${metadataPath}: ${installerName}, ${size} bytes`);
