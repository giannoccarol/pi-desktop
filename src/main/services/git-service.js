"use strict";
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

function strip(s){ return String(s||"").trim(); }

function readHead(cwd){
  try{
    const headPath = path.join(String(cwd), ".git", "HEAD");
    const raw = fs.readFileSync(headPath, "utf8").trim();
    if(raw.startsWith("ref: ")){
      const ref = raw.slice(5).trim();
      const branch = ref.replace(/^refs\/heads\//,"");
      return { branch, rawHead: raw };
    }
    // detached HEAD -> short sha
    return { branch: raw.slice(0,7), rawHead: raw, detached:true };
  } catch { return { branch:null, rawHead:null }; }
}

function execGit(cwd, args, timeout=1500){
  return new Promise((resolve)=>{
    execFile("git", args, { cwd, timeout, maxBuffer: 256*1024 }, (err, stdout)=>{
      if(err) return resolve(null);
      resolve(String(stdout||""));
    });
  });
}

async function getGitStatus(cwd){
  const dir = String(cwd||"");
  if(!dir || !fs.existsSync(path.join(dir,".git"))) return { isGit:false, branch:null, dirty:0, ahead:0, behind:0, label:"" };
  const head = readHead(dir);
  let branch = head.branch;
  let porcelain = await execGit(dir, ["status","--porcelain","--branch"]);
  // Fallback: if git fails, use HEAD
  if(porcelain===null){
    return { isGit:true, branch, dirty:0, ahead:0, behind:0, label: branch||"" };
  }
  const lines = porcelain.split("\n");
  const branchLine = lines[0]||"";
  // branchLine like "## main...origin/main [ahead 1, behind 2]"
  if(branchLine.startsWith("##")){
    const m = branchLine.match(/^##\s+([^\s.]+)/);
    if(m) branch = m[1];
    if(branch==="HEAD" || branch==="(no branch)"){
      branch = head.branch;
    }
  }
  let branchOut = await execGit(dir, ["rev-parse","--abbrev-ref","HEAD"]);
  if(branchOut) {
    const b = strip(branchOut);
    if(b && b!=="HEAD") branch = b;
  }
  let dirty = 0;
  for(let i=1;i<lines.length;i++){
    const l = lines[i];
    if(!l.trim()) continue;
    dirty++;
  }
  let ahead=0, behind=0;
  const mAhead = branchLine.match(/ahead (\d+)/);
  if(mAhead) ahead = parseInt(mAhead[1],10)||0;
  const mBehind = branchLine.match(/behind (\d+)/);
  if(mBehind) behind = parseInt(mBehind[1],10)||0;
  let label="";
  if(branch){
    label = branch;
    if(dirty) label += ` • ${dirty} modificati`;
    if(ahead||behind){
      const parts=[];
      if(ahead) parts.push(`↑${ahead}`);
      if(behind) parts.push(`↓${behind}`);
      label += ` (${parts.join(" ")})`;
    }
  }
  return { isGit:true, branch, dirty, ahead, behind, label };
}

module.exports = { getGitStatus, readHead };
