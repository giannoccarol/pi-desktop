"use strict";
(function(root){
  function compactToolArgs(toolName, rawArgs, cwd){
    const { parsedToolArgs, fullToolArgs, compactProjectPath, changedLineCounts, parseTodoItems, todoProgress } = root.piUtils;
    const name=String(toolName||"").toLowerCase();
    const args=parsedToolArgs(rawArgs);
    const filePath=args.path||args.file||args.filePath||args.filename;
    const cp=(v)=>compactProjectPath(v,cwd);
    if(name==="read"){ const range=args.offset!=null?` · da riga ${args.offset}`:""; return `${cp(filePath)}${range}`; }
    if(["edit","write"].includes(name)){ const {added,removed}=changedLineCounts(args); const delta=added||removed?` · +${added} −${removed}`:""; return `${cp(filePath)}${delta}`; }
    if(["grep","find","search"].includes(name)){ const q=args.pattern||args.query||args.glob||args.name||""; const loc=cp(args.path||args.cwd||"."); return [q, loc&&`in ${loc}`].filter(Boolean).join(" · "); }
    if(name==="ls") return cp(args.path||args.cwd||".");
    if(name==="todo"){
      const items=parseTodoItems(args);
      if(!items.length){
        const single=[args.action, args.subject||args.title].filter(Boolean).join(" · ");
        return (single||fullToolArgs(rawArgs)).slice(0,160);
      }
      const {done}=todoProgress(items);
      const active=items.find((i)=>i.status==="in_progress")||items.find((i)=>i.status!=="completed")||{};
      const head=`${done}/${items.length}`;
      return (active.title?`${head} · ${active.title}`:head).slice(0,160);
    }
    if(["bash","shell","powershell"].some(v=>name.startsWith(v))) return String(args.command||args.value||"").trim();
    return fullToolArgs(rawArgs).slice(0,160);
  }
  root.piForms={compactToolArgs};
  if(typeof module!=="undefined"&&module.exports) module.exports={compactToolArgs};
})(typeof window!=="undefined"?window:globalThis);
