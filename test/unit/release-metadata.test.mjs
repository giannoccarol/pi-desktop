"use strict";

import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..","..");

test("release metadata: signed Windows installer keeps latest.yml valid",()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"pi-release-meta-"));
  try{
    const installer=path.join(dir,"Pi-Desktop-1.2.3-win-x64.exe");
    const metadata=path.join(dir,"latest.yml");
    const bytes=Buffer.from("signed-installer");
    fs.writeFileSync(installer,bytes);
    fs.writeFileSync(metadata,`version: 1.2.3\nfiles:\n  - url: Pi-Desktop-1.2.3-win-x64.exe\n    sha512: old\n    size: 1\npath: old.exe\nsha512: old\nsize: 1\n`);
    execFileSync(process.execPath,[path.join(root,"scripts/build/update-latest-yml.js"),metadata,installer]);
    const updated=fs.readFileSync(metadata,"utf8");
    const hash=crypto.createHash("sha512").update(bytes).digest("base64");
    assert.match(updated,new RegExp(`path: ${path.basename(installer)}`));
    assert.equal(updated.match(new RegExp(hash.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),"g"))?.length,2);
    assert.equal(updated.match(/size: 16/g)?.length,2);
  }finally{ fs.rmSync(dir,{recursive:true,force:true}); }
});
