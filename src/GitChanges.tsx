import {useState,type ReactNode} from 'react';
import {ChevronRight,Folder,List,FolderTree,Plus} from 'lucide-react';
import type {GitEntry} from './editor-types';
export function GitChanges({entries,renderRow,onStageAll}:{entries:GitEntry[];onStageAll:()=>Promise<unknown>;renderRow:(entry:GitEntry,staged:boolean)=>ReactNode}){
 const [staging,setStaging]=useState(false);
 const [tree,setTree]=useState(false),[closed,setClosed]=useState(new Set<string>());
 function rows(items:GitEntry[],staged:boolean,prefix=''):ReactNode{
  const directories=new Map<string,GitEntry[]>(),files:GitEntry[]=[];
  for(const item of items){const rest=item.path.slice(prefix.length),slash=rest.indexOf('/');if(slash<0)files.push(item);else{const dir=rest.slice(0,slash);directories.set(dir,[...(directories.get(dir)??[]),item]);}}
  return <>{[...directories].sort(([a],[b])=>a.localeCompare(b)).map(([name,children])=>{const path=prefix+name+'/',key=String(staged)+path,collapsed=closed.has(key);return <div className="git-folder" key={key}><button className="git-folder-toggle" aria-expanded={!collapsed} onClick={()=>setClosed(old=>{const next=new Set(old);next.has(key)?next.delete(key):next.add(key);return next;})}><ChevronRight size={12} style={{transform:collapsed?undefined:'rotate(90deg)'}}/><Folder size={13}/><span>{name}</span><small>{children.length}</small></button>{!collapsed&&<div className="git-folder-children">{rows(children,staged,path)}</div>}</div>;})}{files.map(entry=><div key={entry.path}>{renderRow(entry,staged)}</div>)}</>;
 }
 return <><div className="git-view-toggle" role="group" aria-label="Git view"><button aria-pressed={!tree} onClick={()=>setTree(false)}><List size={13}/>List</button><button aria-pressed={tree} onClick={()=>setTree(true)}><FolderTree size={13}/>Tree</button></div>{[true,false].map(staged=>{const items=entries.filter(c=>staged?c.index!==' '&&c.index!=='?':c.worktree!==' ');return <section className={tree?'git-tree-view':''} key={String(staged)}><div className="git-section-heading"><h4>{staged?'Staged':'Changes'} · {items.length}</h4>{!staged&&<button type="button" aria-label="Stage all changes" title="Stage all changes" disabled={staging||!items.length} onClick={()=>{setStaging(true);void onStageAll().finally(()=>setStaging(false));}}><Plus size={14}/></button>}</div>{tree?rows(items,staged):items.map(entry=><div key={entry.path}>{renderRow(entry,staged)}</div>)}</section>;})}</>;
}
