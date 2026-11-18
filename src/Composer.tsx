import {AttachmentPicker} from './AttachmentPicker';
import {AttachmentPreview} from "./AttachmentPreview";
import {useRef,useState} from "react";
import type {ReactNode} from "react";
import {ArrowUp,Paperclip,Square,X,FileText,Image,Folder,Shield} from "lucide-react";
import {Dropdown} from "./Dropdown";
import type {Attachment,PermissionMode,Project} from "./shared";
export function Composer({context,agentManaged=false,draft,setDraft,attachments,setAttachments,permission,setPermission,projects,projectId,setProjectId,models,busy,onSend,onStop,error}:{
  context?:ReactNode;agentManaged?:boolean;draft:string;setDraft:(v:string)=>void;attachments:Attachment[];setAttachments:(v:Attachment[])=>void;
  permission:PermissionMode;setPermission:(v:PermissionMode)=>void;projects:Project[];projectId:string;setProjectId?:(v:string)=>void;
  models:ReactNode;busy:boolean;onSend:()=>void;onStop?:()=>void;error?:string;
}){
  const importing=useRef(false);
  const [dragging,setDragging]=useState(false);
  const dragDepth=useRef(0);
  const [attachmentError,setAttachmentError]=useState("");const [picking,setPicking]=useState(false);
  async function attach(){
    if(importing.current || busy)return;importing.current=true;
    setPicking(true);setAttachmentError("");
    try{const files=await window.dao.pickAttachments();if(files.length+attachments.length>10)throw Error("Attach up to 10 files");setAttachments([...attachments,...files]);}
    catch(e){setAttachmentError(String(e));}finally{setPicking(false);importing.current=false;}
  }
  async function importFiles(files:File[]){
    if(busy || importing.current || !files.length)return;
    importing.current=true;setPicking(true);setAttachmentError("");
    try{
      if(files.length+attachments.length>10)throw Error("Attach up to 10 files");
      if(files.reduce((n,f)=>n+f.size,0)+attachments.reduce((n,f)=>n+f.size,0)>40*1024*1024)throw Error("Attachments exceed 40 MB total");
      const added:Attachment[]=[];
      for(const file of files){
        if(file.size>(file.type.startsWith("image/")?20:2)*1024*1024)throw Error(`${file.name} is too large`);
        added.push(await window.dao.importAttachment(file.name || "Pasted image.png",new Uint8Array(await file.arrayBuffer())));
      }
      setAttachments([...attachments,...added]);
    }catch(error){setAttachmentError(String(error));}finally{setPicking(false);importing.current=false;}
  }
  return <div className={`board-composer ${dragging?"drag-over":""}`} onDragEnter={e=>{if(e.dataTransfer.types.includes("Files")){e.preventDefault();dragDepth.current++;setDragging(true);}}} onDragOver={e=>{if(e.dataTransfer.types.includes("Files")){e.preventDefault();e.dataTransfer.dropEffect=busy?"none":"copy";}}} onDragLeave={e=>{e.preventDefault();if(--dragDepth.current<=0){dragDepth.current=0;setDragging(false);}}} onDrop={e=>{if(!e.dataTransfer.types.includes("Files"))return;e.preventDefault();e.stopPropagation();dragDepth.current=0;setDragging(false);void importFiles(Array.from(e.dataTransfer.files));}} onPaste={e=>{const images=Array.from(e.clipboardData.items).filter(i=>i.kind==="file" && i.type.startsWith("image/")).map(i=>i.getAsFile()).filter((f):f is File=>!!f);if(images.length){e.preventDefault();void importFiles(images);}}}>
    {dragging && <div className="attachment-drop-hint">Drop files to attach</div>}
    {(error || attachmentError) && <p className="composer-error" role="alert">{error || attachmentError}</p>}
    <form className="composer" onSubmit={e=>{e.preventDefault();if(!busy && !picking)onSend();}}>
      {context}
      {!!attachments.length && <div className="composer-attachments">{attachments.map(file=><div className="attachment-tile" key={file.id}><AttachmentPreview file={file}/><button type="button" disabled={busy} aria-label={`Remove ${file.name}`} onClick={()=>setAttachments(attachments.filter(a=>a.id!==file.id))}><X size={13}/></button></div>)}</div>}
      <textarea aria-label="Message agent" placeholder="Ask anything, or describe a task…" value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==="Enter" && !e.shiftKey && !e.nativeEvent.isComposing){e.preventDefault();if(!busy && !picking)onSend();}}}/>
      <div className="composer-bottom"><div className="composer-main-controls"><AttachmentPicker projectId={projectId} hasFolder={!!projects.find(p=>p.id===projectId)?.folder} busy={busy||picking} onBrowse={()=>void attach()} onError={setAttachmentError} onAttach={file=>{if(attachments.length>=10){setAttachmentError('Attach up to 10 files');return;}if(attachments.reduce((n,a)=>n+a.size,0)+file.size>40*1024*1024){setAttachmentError('Attachments exceed 40 MB total');return;}setAttachments([...attachments,file]);}}/>{models}</div>
        {busy && onStop?<button className="send" type="button" aria-label="Stop response" onClick={onStop}><Square size={15}/></button>:<button className="send" aria-label="Send message" disabled={busy || picking || (!draft.trim() && !attachments.length)}><ArrowUp size={18}/></button>}
      </div>
    </form>
    <div className="composer-status"><div className="composer-project"><Folder size={13}/>{setProjectId?<Dropdown label="Chat project" value={projectId} onChange={setProjectId} disabled={busy} options={projects.map(p=>({value:p.id,label:p.isUnassigned?"No project":p.name}))}/>:<span>{projects.find(p=>p.id===projectId)?.name ?? "No project"}</span>}</div>
      <div className="composer-permissions"><Shield size={13}/><Dropdown label="Permissions" value={permission} onChange={v=>setPermission(v as PermissionMode)} disabled={busy} options={[{value:"read-only",label:agentManaged?"Plan mode":"Read only"},{value:"workspace-write",label:agentManaged?"Ask permission":"Project edits"},{value:"full-access",label:"Full access"}]}/></div>
    </div>
    {agentManaged && <p className="composer-permission-note">Sandbox and filesystem access are controlled by the agent.</p>}
    {permission==="full-access" && <p className="composer-permission-note">Unrestricted commands and file changes, without approval prompts.</p>}
  </div>;
}

