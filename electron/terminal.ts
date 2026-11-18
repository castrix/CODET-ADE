import {app,BrowserWindow} from 'electron';
import {existsSync} from 'node:fs';
import {join,basename} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import * as pty from 'node-pty';
import {z} from 'zod';
import type {Workspace} from '../src/shared';
import type {TerminalProfile,TerminalEvent} from '../src/terminal-types';
const exec=promisify(execFile);
type Profile=TerminalProfile&{file:string;args:string[]};
type Session={pty:pty.IPty;profile:Profile;buffer:string;seq:number;exitCode?:number;pending:string;timer?:NodeJS.Timeout};
const tabId=z.string().min(1).max(100),size=z.number().int().min(2).max(1000);
const schema=z.discriminatedUnion('op',[z.object({op:z.literal('profiles')}),z.object({op:z.literal('open'),tabId,profileId:z.string().max(200).optional(),cols:size,rows:size}),z.object({op:z.literal('write'),tabId,data:z.string().max(1000000)}),z.object({op:z.literal('resize'),tabId,cols:size,rows:size}),...(['stop','restart'] as const).map(op=>z.object({op:z.literal(op),tabId})),z.object({op:z.literal('focus'),tabId,focused:z.boolean()})]);
export class TerminalService{
 private sessions=new Map<string,Session>();private profilesCache?:Promise<Profile[]>;focusedTab?:string;
 constructor(private window:BrowserWindow,private workspace:Workspace,private changed:()=>void){}
 private async profiles(){return this.profilesCache??=this.discover();}
 private async discover(){const profiles:Profile[]=[];
  if(process.platform==='win32'){
   const system=join(process.env.SystemRoot??'C:\\Windows','System32');
   const powershell=join(system,'WindowsPowerShell','v1.0','powershell.exe');if(existsSync(powershell))profiles.push({id:'powershell',name:'Windows PowerShell',kind:'powershell',file:powershell,args:['-NoLogo']});
   try{const result=await exec(join(system,'where.exe'),['pwsh.exe'],{windowsHide:true,timeout:3000});const file=result.stdout.trim().split(/\r?\n/)[0];if(file&&existsSync(file))profiles.unshift({id:'pwsh',name:'PowerShell 7',kind:'powershell',file,args:['-NoLogo']});}catch{}
   const cmd=join(system,'cmd.exe');if(existsSync(cmd))profiles.push({id:'cmd',name:'Command Prompt',kind:'cmd',file:cmd,args:[]});
   const wsl=join(system,'wsl.exe');if(existsSync(wsl)){profiles.push({id:'wsl',name:'WSL · Default',kind:'wsl',file:wsl,args:[]});try{const result=await exec(wsl,['--list','--quiet'],{windowsHide:true,timeout:5000,encoding:'buffer'});const text=result.stdout.includes(0)?result.stdout.toString('utf16le'):result.stdout.toString('utf8');for(const name of text.replace(/\u0000/g,'').replace(/^\uFEFF/,'').split(/\r?\n/).map(v=>v.trim()).filter(Boolean))profiles.push({id:'wsl:'+name,name:'WSL · '+name,kind:'wsl',file:wsl,args:['--distribution',name]});}catch{}}
  }else{for(const file of [...new Set([process.env.SHELL,'/bin/zsh','/bin/bash','/bin/sh'].filter((v):v is string=>!!v))])if(existsSync(file))profiles.push({id:file,name:basename(file),kind:'shell',file,args:['-l']});}
  return profiles;
 }
 async profile(id?:string){const profiles=await this.profiles();const found=id?profiles.find(p=>p.id===id):profiles[0];if(!found)throw Error('Shell profile unavailable');return found;}
 private emit(event:TerminalEvent){if(!this.window.isDestroyed())this.window.webContents.send('dao:terminal-event',event);}
 private flush(id:string,s:Session){if(s.timer){clearTimeout(s.timer);s.timer=undefined;}if(!s.pending)return;const data=s.pending;s.pending='';s.buffer=(s.buffer+data).slice(-1024*1024);this.emit({tabId:id,seq:++s.seq,data});}
 private async open(id:string,cols:number,rows:number,profileId?:string):Promise<any>{let s=this.sessions.get(id);if(s){this.flush(id,s);return {profile:s.profile,buffer:s.buffer,seq:s.seq,exitCode:s.exitCode};}const tab=this.workspace.tabs.find(t=>t.id===id&&t.kind==='terminal');if(!tab)throw Error('Terminal tab not found');const profile=await this.profile(profileId??tab.terminalProfile);if(this.sessions.has(id))return this.open(id,cols,rows);const folder=this.workspace.projects.find(p=>p.id===tab.projectId)?.folder;const cwd=folder&&existsSync(folder)?folder:app.getPath('home');const env:NodeJS.ProcessEnv={...process.env,TERM:'xterm-256color',COLORTERM:'truecolor'};delete env.ELECTRON_RUN_AS_NODE;
 const child=pty.spawn(profile.file,[...profile.args,...(profile.kind==='wsl'?['--cd',folder?cwd:'~']:[])],{name:'xterm-256color',cols,rows,cwd,env});s={pty:child,profile,buffer:'',seq:0,pending:''};this.sessions.set(id,s);const current=s;tab.terminalProfile=profile.id;tab.terminalTitle=profile.name;this.changed();child.onData(data=>{current.pending+=data;if(current.pending.length>=65536)this.flush(id,current);else current.timer??=setTimeout(()=>this.flush(id,current),16);});child.onExit(({exitCode})=>{this.flush(id,current);current.exitCode=exitCode;this.emit({tabId:id,seq:++current.seq,exitCode});});return {profile,buffer:'',seq:0};
 }
 async handle(raw:unknown):Promise<any>{const a=schema.parse(raw);if(a.op==='profiles')return (await this.profiles()).map(({file,args,...p})=>p);const tab=this.workspace.tabs.find(t=>t.id===a.tabId&&t.kind==='terminal');if(!tab)throw Error('Terminal tab not found');if(a.op==='focus'){this.focusedTab=a.focused?a.tabId:undefined;return;}if(a.op==='open')return this.open(a.tabId,a.cols,a.rows,a.profileId);const s=this.sessions.get(a.tabId);if(a.op==='restart'){if(s&&s.exitCode===undefined)throw Error('Stop the terminal before restarting');this.close(a.tabId);return this.open(a.tabId,100,30);}if(!s)throw Error('Terminal is not running');if(a.op==='stop'){s.pty.kill();return;}if(s.exitCode!==undefined)throw Error('Terminal has exited');if(a.op==='write')s.pty.write(a.data);else if(a.op==='resize')s.pty.resize(a.cols,a.rows);}
 close(id:string){const s=this.sessions.get(id);if(s){if(s.timer)clearTimeout(s.timer);if(s.exitCode===undefined)s.pty.kill();this.sessions.delete(id);}if(this.focusedTab===id)this.focusedTab=undefined;}
 dispose(){for(const id of this.sessions.keys())this.close(id);}
}
