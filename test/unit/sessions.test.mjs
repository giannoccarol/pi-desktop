"use strict";

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sessions = require("../../src/main/services/sessions.js");

function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"pi-sessions-"));
  const project=path.join(root,"project-a");
  fs.mkdirSync(project);
  const file=path.join(project,"session-a.jsonl");
  const entries=[
    {type:"session",id:"session-a",cwd:"/projects/alpha",timestamp:"2026-08-27T10:00:00.000Z"},
    {type:"message",id:"u1",parentId:null,message:{role:"user",content:[{type:"text",text:"Find the Jitter regression"}]}},
    {type:"message",id:"a1",parentId:"u1",message:{role:"assistant",content:[{type:"text",text:"Done"}],usage:{input:100,output:20,cacheRead:30,cacheWrite:5,totalTokens:155,cost:{total:0.0123}}}},
  ];
  fs.writeFileSync(file,entries.map((entry)=>JSON.stringify(entry)).join("\n")+"\n");
  return {root,project,file};
}

test("sessions: extracts usage and supports regex full-text search",()=>{
  const fx=fixture();
  try{
    const parsed=sessions.parseSessionFile(fx.file);
    assert.equal(parsed.cost,0.0123);
    assert.equal(parsed.tokens.total,155);
    assert.equal(parsed.tokens.cacheRead,30);
    const results=sessions.searchSessionsFullText(fx.root,{pattern:"jitt\\w+",flags:"i"});
    assert.equal(results.length,1);
    assert.equal(results[0].file,fx.file);
  }finally{ fs.rmSync(fx.root,{recursive:true,force:true}); }
});

test("sessions: trash restore returns the file to its original project",()=>{
  const fx=fixture();
  try{
    const result=sessions.bulkDeleteSessions([fx.file],fx.root);
    assert.equal(result.deleted,1);
    assert.equal(fs.existsSync(fx.file),false);
    const trash=sessions.trashDirFor(fx.root);
    const trashed=fs.readdirSync(trash).find((name)=>name.endsWith(".jsonl"));
    assert.ok(trashed);
    const restored=sessions.restoreFromTrash(fx.root,path.join(trash,trashed));
    assert.equal(restored,fx.file);
    assert.equal(fs.existsSync(fx.file),true);
    assert.equal(sessions.listSessions(fx.root).length,1);
  }finally{ fs.rmSync(fx.root,{recursive:true,force:true}); }
});

test("sessions: explorer does not follow a symlink outside the project",()=>{
  const fx=fixture();
  const outside=fs.mkdtempSync(path.join(os.tmpdir(),"pi-outside-"));
  try{
    fs.writeFileSync(path.join(outside,"secret.txt"),"secret");
    fs.symlinkSync(outside,path.join(fx.project,"escape"));
    const tree=sessions.listExplorerTree(fx.project,3,100,{showDotfiles:true});
    assert.equal(tree.some((entry)=>entry.rel.includes("secret.txt")),false);
  }finally{
    fs.rmSync(fx.root,{recursive:true,force:true});
    fs.rmSync(outside,{recursive:true,force:true});
  }
});
