import {useEffect,useRef,useState} from 'react';
import {Terminal} from '@xterm/xterm';
import {FitAddon} from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import './terminal.css';
import {Dropdown} from './Dropdown';
import type {Command,WorkTab} from './shared';
import type {TerminalEvent,TerminalProfile,TerminalState} from './terminal-types';
type View={term:Terminal;fit:FitAddon;host:HTMLDivElement;exitCode?:number;seq:number;notify?:()=>void;dispose:()=>void};
const views=new Map<string,Promise<View>>();
let watching=false;
function viewFor(tabId:string,profileId?:string){
 if(views.has(tabId))return views.get(tabId)!;
 if(!watching){watching=true;window.dao.subscribe(snapshot=>{for(const [id,promise]of views)if(!snapshot.workspace.tabs.some(t=>t.id===id)){views.delete(id);void promise.then(v=>v.dispose()).catch(()=>{});}});}
 const promise=(async()=>{
 const host=document.createElement('div');host.className='terminal-screen';
 const term=new Terminal({cursorBlink:true,fontSize:13,fontFamily:'Cascadia Code, Consolas, Menlo, monospace',scrollback:5000,allowProposedApi:false,theme:{background:'#0a0a0a',foreground:'#ededed',cursor:'#ededed',selectionBackground:'#ffffff30'},screenReaderMode:true});const fit=new FitAddon();term.loadAddon(fit);
 const v:View={term,fit,host,seq:0,dispose:()=>{unsubscribe();term.dispose();}};let ready=false;const queue:TerminalEvent[]=[];
 const receive=(event:TerminalEvent)=>{if(event.seq<=v.seq)return;v.seq=event.seq;if(event.data)term.write(event.data);if(event.exitCode!==undefined){v.exitCode=event.exitCode;term.write(`\r\n[Process exited with code ${event.exitCode}]\r\n`);v.notify?.();}};
 const unsubscribe=window.dao.onTerminalEvent(event=>{if(event.tabId!==tabId)return;if(!ready)queue.push(event);else receive(event);});
 term.onData(data=>{void window.dao.terminal({op:'write',tabId,data}).catch(()=>{});});
 term.attachCustomKeyEventHandler(event=>{if(event.type!=='keydown')return true;if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='c'&&(event.shiftKey||term.hasSelection())){void window.dao.copyText(term.getSelection());event.preventDefault();return false;}if((event.ctrlKey||event.metaKey)&&event.shiftKey&&event.key.toLowerCase()==='v'){void window.dao.readClipboardText().then(text=>term.paste(text));event.preventDefault();return false;}return true;});
 host.addEventListener('focusin',()=>{void window.dao.terminal({op:'focus',tabId,focused:true});});host.addEventListener('focusout',()=>{void window.dao.terminal({op:'focus',tabId,focused:false}).catch(()=>{});});
 try{const state:TerminalState=await window.dao.terminal({op:'open',tabId,profileId,cols:100,rows:30});v.seq=state.seq;v.exitCode=state.exitCode;term.write(state.buffer);if(state.exitCode!==undefined)term.write(`\r\n[Process exited with code ${state.exitCode}]\r\n`);ready=true;queue.forEach(receive);return v;}catch(error){v.dispose();views.delete(tabId);throw error;}
 })();views.set(tabId,promise);return promise;
}
export default function TerminalPane({tab,run}:{tab:WorkTab;run:(command:Command)=>Promise<void>}){
 const root=useRef<HTMLDivElement>(null);const current=useRef<View|undefined>(undefined);const [profiles,setProfiles]=useState<TerminalProfile[]>([]);const [selected,setSelected]=useState(tab.terminalProfile??'');const [start,setStart]=useState(!!tab.terminalProfile);const [error,setError]=useState('');const [exitCode,setExitCode]=useState<number>();const [generation,setGeneration]=useState(0);
 useEffect(()=>{void window.dao.terminal({op:'profiles'}).then((profiles:TerminalProfile[])=>{setProfiles(profiles);setSelected(old=>old||profiles[0]?.id||'');}).catch(e=>setError(String(e)));},[]);
 useEffect(()=>{if(!start)return;let live=true;let observer:ResizeObserver|undefined;let view:View|undefined;void viewFor(tab.id,selected||undefined).then(v=>{if(!live)return;view=v;current.current=v;root.current!.append(v.host);if(!v.term.element)v.term.open(v.host);v.notify=()=>setExitCode(v.exitCode);setExitCode(v.exitCode);const resize=()=>{if(!root.current?.clientWidth||!root.current.clientHeight)return;v.fit.fit();if(v.exitCode===undefined)void window.dao.terminal({op:'resize',tabId:tab.id,cols:Math.max(2,v.term.cols),rows:Math.max(2,v.term.rows)}).catch(()=>{});};resize();observer=new ResizeObserver(resize);observer.observe(root.current!);v.term.focus();}).catch(e=>{if(live){setError(String(e));setStart(false);}});return()=>{live=false;observer?.disconnect();if(view){view.notify=undefined;view.host.remove();}void window.dao.terminal({op:'focus',tabId:tab.id,focused:false}).catch(()=>{});};},[tab.id,start,generation]);
 async function restart(){try{await window.dao.terminal({op:'restart',tabId:tab.id});const old=views.get(tab.id);views.delete(tab.id);void old?.then(v=>v.dispose());setExitCode(undefined);setError('');setGeneration(v=>v+1);}catch(e){setError(String(e));}}
 return <section className="terminal-pane"><header className="terminal-toolbar"><Dropdown label="Terminal shell" value={selected} options={profiles.map(p=>({value:p.id,label:p.name}))} onChange={setSelected}/>{start?<button onClick={()=>void run({type:'terminal.create',projectId:tab.projectId,profileId:selected,sourceTabId:tab.terminalOwner??(tab.terminalPlacement==="panel"?undefined:tab.id),placement:tab.terminalPlacement})}>New terminal</button>:<button disabled={!selected} onClick={()=>{setError('');setStart(true);}}>Open terminal</button>}<span/>{start&&<><button onClick={()=>current.current?.term.clear()}>Clear</button>{exitCode===undefined?<button onClick={()=>void window.dao.terminal({op:'stop',tabId:tab.id}).catch(e=>setError(String(e)))}>Stop</button>:<button onClick={()=>void restart()}>Restart</button>}</>}</header>{error&&<p role="alert" className="error-text">{error}</p>}{!start&&<div className="terminal-empty"><h2>Terminal</h2><p>Choose a shell above.</p></div>}<div className="terminal-host" ref={root}/></section>;
}
