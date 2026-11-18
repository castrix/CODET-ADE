import {X} from "lucide-react";
import {ConnectorSettings} from "./ConnectorSettings";
import {BrowserSettings,browserSections} from "./BrowserSettings";
import {useEffect,useRef,useState} from "react";
import type {Command,Snapshot} from "./shared";
type Props={snapshot:Snapshot;run:(command:Command)=>Promise<void>;close:()=>void;initialSection?:string;site?:string};
export function Settings({snapshot,run,close,initialSection,site}:Props) {
  const [section,setSection]=useState(initialSection ?? "General");
  const {preferences}=snapshot.workspace;
  useEffect(()=>{if(initialSection)setSection(initialSection);},[initialSection,site]);
  const row=(title:string,control:React.ReactNode)=><div key={title} className="setting-row"><span>{title}</span>{control}</div>;
  return <section className="settings-page"><button type="button" className="settings-close" aria-label="Close settings" title="Close settings" onClick={close}><X size={18}/></button><nav><h2>Settings</h2>{["General","Appearance","Providers",...browserSections,"Keybindings"].map(name=><button key={name} className={section===name?"selected":""} onClick={()=>setSection(name)}>{name}</button>)}<button onClick={close}>Back to workspace</button></nav><div className="settings-body"><h1>{section}</h1>
    {section==="General" && <><h3>Workspace</h3>{row("Projects",snapshot.workspace.projects.filter(p=>!p.isUnassigned).length)}{row("Open tabs",snapshot.workspace.tabs.length)}{row("Quick search",<button onClick={()=>{close();window.dispatchEvent(new CustomEvent("dao:palette"));}}>Open search · Ctrl+P</button>)}</>}
    {section==="Appearance" && <><h3>Chat</h3>{row("Text size",<label className="setting-input"><input aria-label="Chat text size" type="range" min="11" max="20" value={preferences.fontSize} onChange={e=>void run({type:"preferences.update",values:{fontSize:Number(e.target.value)}})}/><span>{preferences.fontSize}px</span></label>)}{row("Theme","Dark")}</>}
    {section==="Providers" && <ConnectorSettings snapshot={snapshot} run={run}/>}
    {browserSections.includes(section) && <BrowserSettings section={section} snapshot={snapshot} run={run} site={site}/>}
    {section==="Keybindings" && <>{[["Search tabs, chats, projects and history","Ctrl / Cmd + P"],["New tab","Ctrl / Cmd + T"],["Close tab","Ctrl / Cmd + W"],["Address / search","Ctrl / Cmd + L"],["Reload browser","Ctrl / Cmd + R"],["Settings","Ctrl / Cmd + ,"],["Downloads","Ctrl / Cmd + J"],["Select search result","↑ / ↓, Enter"],["Dismiss search","Escape"]].map(([name,key])=>row(name,<kbd>{key}</kbd>))}</>}
  </div></section>;
}
export function Spotlight({snapshot,run,close,initialQuery=""}:Props & {initialQuery?:string}) {
  const [query,setQuery]=useState(initialQuery);const [selected,setSelected]=useState(0);const active=useRef<HTMLButtonElement>(null);const search=useRef<HTMLInputElement>(null);
  useEffect(()=>{let mounted=true;void window.dao.browserBounds(null).then(()=>{if(mounted)search.current?.focus();});return ()=>{mounted=false;};},[]);
  const state=snapshot.workspace;const q=query.trim().toLowerCase();
  const [files,setFiles]=useState<{projectId:string;project:string;path:string}[]>([]);
  const [fileError,setFileError]=useState("");
  const activeTab=state.tabs.find(t=>t.id===state.activeTabId);
  const fileProject=activeTab
    ? state.projects.find(p=>p.id===activeTab.projectId && !p.isUnassigned && p.folder)
    : undefined;
  useEffect(()=>{
    let live=true;setFiles([]);setFileError("");
    // No request means no filesystem traversal or file index for unrelated tabs.
    if(!q || !fileProject)return;
    const projectId=fileProject.id,project=fileProject.name;
    const timer=setTimeout(()=>{
      void window.dao.editor({op:"search",projectId,text:q}).then((paths:string[])=>{
        if(live)setFiles(paths.map(path=>({projectId,project,path})));
      }).catch(()=>{if(live)setFileError("Project files could not be searched");});
    },180);
    return ()=>{live=false;clearTimeout(timer);};
  },[q,fileProject?.id,fileProject?.folder,fileProject?.name]);

  const results:{id:string;title:string;detail:string;command:Command}[]=[];
  for(const t of state.tabs.filter(t=>t.terminalPlacement!=="panel")){const b=state.browsers.find(b=>b.id===t.resourceId);const c=state.conversations.find(c=>c.id===t.conversationId);results.push({id:t.id,title:t.kind==="terminal"?(t.terminalTitle??"Terminal"):t.kind==="ide"?`${state.projects.find(p=>p.id===t.projectId)?.name} · Editor`:b?.title ?? t.filePath?.split(/[\\/]/).pop() ?? c?.title ?? "New tab",detail:`Tab · ${b?.url ?? t.filePath ?? t.kind}`,command:{type:"tab.select",id:t.id}});}
  for(const c of state.conversations.filter(c=>c.messages.some(m=>m.role==="user"))) results.push({id:c.id,title:c.title,detail:"Conversation",command:{type:"chat.open",id:c.id}});
  for(const p of state.projects.filter(p=>!p.isUnassigned)) results.push({id:p.id,title:p.name,detail:`Project · ${p.folder ?? ""}`,command:{type:"project.select",id:p.id}});
  for(const h of state.browserHistory) results.push({id:h.url,title:h.title,detail:`History · ${h.url}`,command:{type:"link.open",target:h.url,projectId:state.activeProjectId,sourceTabId:state.activeTabId}});
  const matches=results.filter(r=>`${r.title} ${r.detail}`.toLowerCase().includes(q)).slice(0,40);
  matches.unshift(...files.slice(0,40).map(f=>({id:`file:${f.projectId}:${f.path}`,title:f.path,detail:`File · ${f.project}`,command:{type:"editor.open" as const,projectId:f.projectId,path:f.path}})));
  if(q) matches.push({id:"navigate",title:`Open or search “${query.trim()}”`,detail:"New browser tab",command:{type:"tab.launch",projectId:state.activeProjectId,mode:"browser",text:query.trim()}});
  useEffect(()=>{setSelected(0);},[query]);useEffect(()=>{active.current?.scrollIntoView({block:"nearest"});},[selected]);
  function choose(index:number){const result=matches[index];if(result){void run(result.command);close();}}
  return <div className="spotlight-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)close();}}><section role="dialog" aria-modal="true" aria-label="Search workspace" className="spotlight" onKeyDown={e=>{if(e.key==="Escape"){e.preventDefault();close();}if(e.key==="ArrowDown"){e.preventDefault();setSelected(i=>Math.min(i+1,matches.length-1));}if(e.key==="ArrowUp"){e.preventDefault();setSelected(i=>Math.max(i-1,0));}if(e.key==="Enter"){e.preventDefault();choose(selected);}}}><div className="spotlight-input"><input ref={search} autoFocus aria-label="Search files, tabs, chats, projects, history or enter URL" placeholder="Search anything or enter a URL…" value={query} onChange={e=>setQuery(e.target.value)}/><kbd>Esc</kbd></div><div className="spotlight-results">{matches.map((r,i)=><button ref={selected===i?active:undefined} key={r.id} className={selected===i?"selected":""} onMouseEnter={()=>setSelected(i)} onClick={()=>choose(i)}><span>{r.title}</span><small>{r.detail}</small></button>)}{!matches.length && <p>No results</p>}</div>{fileError && <p role="status">{fileError}</p>}<footer>↑ ↓ to navigate · Enter to open</footer></section></div>;
}
