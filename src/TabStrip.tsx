import {useEffect,useState} from "react";
import {TerminalSquare,Code2,ChevronRight,Pin,Globe2,MessageSquare,Plus,X,Ellipsis} from "lucide-react";
import type {Command,Workspace,WorkTab} from "./shared";
const colors=["#70b8ff","#b69cff","#f28bb5","#e9ab62","#72cba0","#aaaaaa"];
export function TabStrip({state,run,title,create,onOverlay}:{onOverlay:(open:boolean)=>void;state:Workspace;run:(c:Command)=>Promise<void>;title:(t:WorkTab)=>string;create:()=>void}){
  const [editing,setEditing]=useState<string>();
  const [menuTab,setMenuTab]=useState<WorkTab>();
  useEffect(()=>{onOverlay(!!editing || !!menuTab);return ()=>onOverlay(false);},[editing,menuTab,onOverlay]);
  const [name,setName]=useState("");
  const [dragging,setDragging]=useState<string>();
  const [over,setOver]=useState<string>();
  const drop=(e:React.DragEvent,targetId?:string,groupId?:string|null)=>{
    e.preventDefault();e.stopPropagation();const id=e.dataTransfer.getData("application/dao-tab");
    const movedGroup=e.dataTransfer.getData("application/dao-group");
    if(movedGroup)void run({type:"group.move",id:movedGroup,targetId,targetGroupId:groupId ?? undefined,after:e.clientX>e.currentTarget.getBoundingClientRect().left+e.currentTarget.getBoundingClientRect().width/2});
    else if(id)void run({type:"tab.move",id,targetId,groupId,after:targetId?e.clientX>e.currentTarget.getBoundingClientRect().left+e.currentTarget.getBoundingClientRect().width/2:undefined});
    setDragging(undefined);setOver(undefined);
  };
  const renderTab=(t:WorkTab)=><div key={t.id} draggable onDragStart={e=>{setDragging(t.id);e.dataTransfer.setData("application/dao-tab",t.id);e.dataTransfer.effectAllowed="move";}} onDragEnd={()=>{setDragging(undefined);setOver(undefined);}}
    onDragOver={e=>{e.preventDefault();e.stopPropagation();setOver(t.id);}} onDrop={e=>drop(e,t.id,t.groupId ?? null)}
    className={`tab ${t.groupId&&t.kind==="chat"?"group-owner":""} ${t.id===state.activeTabId?"active":""} ${over===t.id?"drop-target":""} ${dragging===t.id?"dragging":""}`}
    onContextMenu={e=>{e.preventDefault();setMenuTab(t);}}>
    <button className="tab-select" title={t.groupId&&t.kind==="chat"?"Group conversation":undefined} onClick={()=>void run({type:"tab.select",id:t.id})}>{t.kind==="terminal"?<TerminalSquare size={14}/>:t.kind==="ide"?<Code2 size={14}/>:t.kind==="browser"?(t.pinned?<Pin size={14} aria-label="Pinned"/>:<Globe2 size={14}/>):t.kind==="chat"?<MessageSquare size={14}/>:<Plus size={14}/>}<span>{title(t)}</span></button>
    <button className="tab-close" aria-label={`Close ${title(t)}`} onClick={()=>void run({type:"tab.close",id:t.id})}><X size={12}/></button>
  </div>;
  const seen=new Set<string>();
  return <><div className="tabstrip" onDragOver={e=>e.preventDefault()} onDrop={e=>drop(e,undefined,null)}>
    {state.tabs.filter(t=>t.terminalPlacement!=="panel").map(t=>{
      const group=state.groups.find(g=>g.id===t.groupId);
      if(!group)return renderTab(t);
      if(seen.has(group.id))return null;seen.add(group.id);
      const tabs=state.tabs.filter(peer=>peer.groupId===group.id&&peer.terminalPlacement!=="panel");
      const owner=tabs.find(peer=>peer.kind==="chat");
      return <div className="tab-group" key={group.id} style={{"--group-color":group.color} as React.CSSProperties} onDragOver={e=>{e.preventDefault();e.stopPropagation();}} onDrop={e=>drop(e,undefined,group.id)}>
        <div className={`group-chat-header ${owner?.id===state.activeTabId?'active':''}`} draggable onDragStart={e=>{setDragging(group.id);e.dataTransfer.setData('application/dao-group',group.id);e.dataTransfer.effectAllowed='move';}} onDragEnd={()=>{setDragging(undefined);setOver(undefined);}} onContextMenu={e=>{e.preventDefault();if(owner)setMenuTab(owner);else{setEditing(group.id);setName(group.name);}}}>
          <button className="group-collapse" aria-label={`${group.collapsed?'Expand':'Collapse'} ${owner?title(owner):group.name}`} aria-expanded={!group.collapsed} onClick={()=>void run({type:'group.update',id:group.id,collapsed:!group.collapsed})}><ChevronRight size={12} style={{transform:group.collapsed?undefined:'rotate(90deg)'}}/></button>
          <button className="group-label" aria-current={owner?.id===state.activeTabId?'page':undefined} title={owner?title(owner):group.name} onClick={()=>void run(owner?{type:'tab.select',id:owner.id}:{type:'group.update',id:group.id,collapsed:!group.collapsed})}>{owner&&<MessageSquare size={13}/>}<span>{owner?title(owner):group.name}</span><small>{tabs.length}</small></button>
          {owner&&<button className="group-chat-close" aria-label={`Close ${title(owner)}`} onClick={()=>void run({type:'tab.close',id:owner.id})}><X size={12}/></button>}
        </div>
        <button className="group-edit" title="Edit tab group" aria-label={`Edit ${group.name} group`} onClick={()=>{setEditing(group.id);setName(group.name);}}><Ellipsis size={12}/></button>
        {!group.collapsed && tabs.filter(tab=>tab.id!==owner?.id).map(renderTab)}
      </div>;
    })}
    <button className="tab-add" title="New tab" aria-label="New tab" onClick={create}><Plus size={17}/></button>
  </div>{menuTab && <div className="group-editor-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setMenuTab(undefined);}}><div className="group-editor tab-context-menu" role="dialog" aria-label="Tab actions" onKeyDown={e=>{if(e.key==="Escape")setMenuTab(undefined);}}>
    <button autoFocus onClick={()=>{void run(menuTab.groupId?{type:"tab.move",id:menuTab.id,groupId:null}:{type:"group.create",tabId:menuTab.id});setMenuTab(undefined);}}>{menuTab.groupId?"Remove from group":"Add to new group"}</button>
    {state.groups.filter(g=>g.id!==menuTab.groupId && state.tabs.some(t=>t.groupId===g.id && t.projectId===menuTab.projectId)).map(g=><button key={g.id} onClick={()=>{void run({type:"tab.move",id:menuTab.id,groupId:g.id});setMenuTab(undefined);}}>Move to {g.name}</button>)}
    {menuTab.kind==="browser" && <><button onClick={()=>{void run({type:"tab.pin",id:menuTab.id,pinned:!menuTab.pinned});setMenuTab(undefined);}}>{menuTab.pinned?"Unpin tab":"Pin tab"}</button><button onClick={()=>{const b=state.browsers.find(b=>b.id===menuTab.resourceId);if(b)void run({type:"link.open",target:b.url,projectId:menuTab.projectId,sourceTabId:menuTab.id});setMenuTab(undefined);}}>Duplicate tab</button><button onClick={()=>{if(menuTab.resourceId)void run({type:"browser.reload",id:menuTab.resourceId});setMenuTab(undefined);}}>Reload</button></>}
    <button onClick={()=>{void run({type:"tab.close",id:menuTab.id});setMenuTab(undefined);}}>Close tab</button>
    <button onClick={()=>setMenuTab(undefined)}>Cancel</button>
  </div></div>}{editing && <div className="group-editor-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setEditing(undefined);}}><form className="group-editor" role="dialog" aria-label="Edit tab group" onKeyDown={e=>{if(e.key==="Escape")setEditing(undefined);}} onSubmit={e=>{e.preventDefault();if(name.trim()){void run({type:"group.update",id:editing,name:name.trim()});setEditing(undefined);}}}>
    <label>Group name<div className="setting-input"><input autoFocus maxLength={40} value={name} onChange={e=>setName(e.target.value)} aria-label="Group name"/></div></label>
    <div className="group-colors">{colors.map(color=><button key={color} type="button" aria-label={`Group color ${color}`} aria-pressed={state.groups.find(g=>g.id===editing)?.color===color} style={{background:color}} onClick={()=>void run({type:"group.update",id:editing,color})}/>)}</div>
    <div className="setting-actions"><button type="button" onClick={()=>setEditing(undefined)}>Cancel</button><button disabled={!name.trim()}>Done</button></div>
  </form></div>}</>;
}
