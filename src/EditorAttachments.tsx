import {FileText,FileDiff,X} from 'lucide-react';
import type {Snapshot,Command} from './shared';
export function EditorAttachments({attachment,conversationId,busy,run}:{attachment:Snapshot['editorAttachment'];conversationId:string;busy:boolean;run:(c:Command)=>Promise<void>}){
 if(attachment.conversationId!==conversationId||!attachment.options.length)return null;
 return <div className="editor-attachment-chips">{attachment.options.map(file=>{const attached=attachment.selected===file.id;const diff=file.staged!==undefined||!!file.turnChangeId;return <div key={file.id} className={`editor-attachment-chip ${attached?'':'detached'}`} title={file.path}><button type="button" disabled={busy} aria-pressed={attached} aria-label={`${attached?'Attached':'Attach'} ${file.path}`} onClick={()=>void run({type:'editor.attach',conversationId,value:file.id})}>{diff?<FileDiff size={14}/>:<FileText size={14}/>}<span>{file.path.split(/[\\/]/).pop()}</span>{diff&&<small>Diff</small>}</button>{attached&&<button type="button" disabled={busy} aria-label={`Detach ${file.path}`} onClick={()=>void run({type:'editor.attach',conversationId,value:'none'})}><X size={12}/></button>}</div>;})}</div>;
}
