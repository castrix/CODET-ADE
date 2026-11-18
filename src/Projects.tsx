import {useEffect,useRef,useState} from "react";
import {ChevronRight,Folder,FolderOpen,MessageSquare,Plus,X,Pencil} from "lucide-react";
import type {Command,Workspace,Project} from "./shared";

export function ProjectModal({close,onCreated,project}:{close:()=>void;onCreated:()=>void;project?:Project}){
  const [name,setName]=useState(project?.name ?? "");
  const [folder,setFolder]=useState<string|undefined>(project?.folder);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const panel=useRef<HTMLFormElement>(null);
  useEffect(()=>{const previous=document.activeElement as HTMLElement;panel.current?.querySelector<HTMLInputElement>("input")?.focus();return ()=>previous?.focus();},[]);
  async function create(startChat:boolean){
    if(!name.trim() || busy)return;setBusy(true);setError("");
    try{
      const before=await window.dao.snapshot();
      if(project)await window.dao.command({type:"project.update",id:project.id,name:name.trim(),folderPath:folder ?? null});
      else await window.dao.command({type:"project.create",name:name.trim(),folderPath:folder,startChat});
      const after=await window.dao.snapshot();
      if(project || after.workspace.projects.some(p=>!before.workspace.projects.some(old=>old.id===p.id)))onCreated();
    }catch(e){setError(String(e));}finally{setBusy(false);}
  }
  return <div className="project-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget && !busy)close();}}>
    <form ref={panel} className="project-modal" role="dialog" aria-modal="true" aria-labelledby="project-modal-title" onSubmit={e=>{e.preventDefault();void create(true);}} onKeyDown={e=>{
      if(e.key==="Escape" && !busy){e.stopPropagation();close();}
      if(e.key==="Tab"){
        const controls=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)'));
        const first=controls[0],last=controls[controls.length-1];
        if(e.shiftKey && document.activeElement===first){e.preventDefault();last?.focus();}
        else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first?.focus();}
      }
    }}>
      <header><div><Folder size={18}/><h2 id="project-modal-title">{project?"Edit project":"New project"}</h2></div><button type="button" aria-label="Close project creation" disabled={busy} onClick={close}><X size={17}/></button></header>
      <label className="project-name-label">Project name<div className="setting-input"><input autoFocus required maxLength={80} disabled={busy} value={name} onChange={e=>setName(e.target.value)} placeholder="My project"/></div></label>
      <div className="project-folder-field"><span>Local folder <small>Optional</small></span>
        <div className="project-folder-choice"><FolderOpen size={17}/><span title={folder}>{folder ?? "No folder selected"}</span></div>
        <div className="setting-actions"><button type="button" disabled={busy} onClick={async()=>{setBusy(true);setError("");try{const path=await window.dao.pickProjectFolder();if(path)setFolder(path);}catch(e){setError(String(e));}finally{setBusy(false);}}}>{folder?"Change folder":"Choose folder…"}</button>{folder && <button type="button" disabled={busy} onClick={()=>setFolder(undefined)}>Clear</button>}</div>
      </div>
      {error && <p role="alert" className="error-text">{error}</p>}
      <footer><button type="button" disabled={busy} onClick={close}>Cancel</button>{!project && <button type="button" disabled={busy || !name.trim()} onClick={()=>void create(false)}>Create project</button>}<button className="primary" disabled={busy || !name.trim()}>{busy?"Please wait…":project?"Save changes":"Create & chat"}</button></footer>
    </form>
  </div>;
}

export function ProjectTree({state,conversationId,filter,run,onOpen,onEdit}:{onEdit:(p:Project)=>void;state:Workspace;conversationId?:string;filter:string;run:(c:Command)=>Promise<void>;onOpen:()=>void}){
  const query=filter.trim().toLowerCase();
  return <nav className="project-tree" aria-label="Projects and conversations">
    {state.projects.filter(p=>!p.isUnassigned).map(project=>{
      const history=recentConversations(state).filter(c=>c.projectId===project.id);
      const matches=history.filter(c=>c.title.toLowerCase().includes(query));
      if(query && !matches.length && !project.name.toLowerCase().includes(query))return null;
      const expanded=!!query || !project.collapsed;
      return <section key={project.id} className="project-branch">
        <div className={`project-row ${state.activeProjectId===project.id?"selected":""}`}>
          <button className="project-disclosure" aria-label={`${expanded?"Collapse":"Expand"} ${project.name}`} aria-expanded={expanded} onClick={()=>void run({type:"project.collapse",id:project.id,collapsed:expanded})}><ChevronRight size={13} style={{transform:expanded?"rotate(90deg)":undefined}}/></button>
          <button className="project-name" title={project.folder ?? project.name} onClick={()=>{onOpen();void run({type:"project.select",id:project.id});if(project.collapsed)void run({type:"project.collapse",id:project.id,collapsed:false});}}>{expanded?<FolderOpen size={15}/>:<Folder size={15}/>}<span>{project.name}</span><small>{history.length}</small></button>
          <button className="project-edit" title={`Edit ${project.name}`} aria-label={`Edit ${project.name}`} onClick={()=>onEdit(project)}><Pencil size={12}/></button>
          <button className="project-add-chat" title={`New conversation in ${project.name}`} aria-label={`New conversation in ${project.name}`} onClick={()=>{onOpen();void run({type:"tab.create",kind:"chat",projectId:project.id});if(project.collapsed)void run({type:"project.collapse",id:project.id,collapsed:false});}}><Plus size={14}/></button>
        </div>
        {expanded && <div className="project-conversations">{(query && !project.name.toLowerCase().includes(query)?matches:history).map(c=><button key={c.id} className={`history-item ${conversationId===c.id?"active":""}`} onClick={()=>{onOpen();void run({type:"chat.open",id:c.id});}}><MessageSquare size={13}/><span>{c.title}</span>{c.status==="running" && <span className="pulse dot"/>}</button>)}{!history.length && <button className="project-first-chat" onClick={()=>{onOpen();void run({type:"tab.create",kind:"chat",projectId:project.id});}}><Plus size={12}/>Start a conversation</button>}</div>}
      </section>;
    })}
  </nav>;
}

export function recentConversations(state:Workspace){
  return state.conversations.map((c,index)=>({c,index})).filter(({c})=>c.messages.some(m=>m.role==="user")).sort((a,b)=>(b.c.updatedAt ?? 0)-(a.c.updatedAt ?? 0)||b.index-a.index).map(({c})=>c);
}
export function RecentConversations({state,conversationId,filter,run,onOpen}:{state:Workspace;conversationId?:string;filter:string;run:(c:Command)=>Promise<void>;onOpen:()=>void}){
  const chats=recentConversations(state).filter(c=>c.title.toLowerCase().includes(filter.toLowerCase()));
  return <><div className="section-label">CONVERSATIONS <span>{chats.length}</span></div><nav className="recent-conversations" aria-label="Recent conversations">{chats.map(c=><button key={c.id} className={`history-item ${c.id===conversationId?"active":""}`} title={state.projects.find(p=>p.id===c.projectId)?.name} onClick={()=>{onOpen();void run({type:"chat.open",id:c.id});}}><MessageSquare size={13}/><span>{c.title}</span>{c.status==="running" && <span className="pulse dot"/>}</button>)}{!chats.length && <p className="empty-history">No conversations yet</p>}</nav></>;
}
