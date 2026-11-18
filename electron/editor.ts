import ignore, {type Ignore} from 'ignore';
import {importAttachment} from './attachments';
import {app,BrowserWindow,dialog,shell} from 'electron';
import {readdir,readFile,writeFile,stat,realpath,mkdir,rename} from 'node:fs/promises';
import {resolve,relative,isAbsolute,join,dirname,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createMessageConnection,StreamMessageReader,StreamMessageWriter,MessageConnection} from 'vscode-jsonrpc/node';
import {z} from 'zod';
import type {Workspace} from '../src/shared';
import type {EditorAction,EditorEvent} from '../src/editor-types';
const exec=promisify(execFile);
const schema=z.object({projectId:z.string(),op:z.enum(['attach','list','read','save','create','rename','trash','git','stage-all','stage','unstage','diff','commit','search','change','close','lsp']),path:z.string().max(32768).optional(),text:z.string().max(4*1024*1024).optional(),revision:z.string().optional(),directory:z.boolean().optional(),destination:z.string().optional(),staged:z.boolean().optional(),method:z.enum(['completion','hover','definition']).optional(),line:z.number().int().nonnegative().optional(),character:z.number().int().nonnegative().optional()});
const sameText=(a:string,b:string)=>a.replace(/\r\n?/g,'\n')===b.replace(/\r\n?/g,'\n');
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const language=(path:string)=>({'.ts':'typescript','.tsx':'typescriptreact','.js':'javascript','.jsx':'javascriptreact','.mjs':'javascript','.cjs':'javascript','.json':'json','.css':'css','.html':'html','.md':'markdown','.py':'python','.mq5':'cpp','.mqh':'cpp','.cpp':'cpp','.h':'cpp','.rs':'rust','.vue':'html','.yaml':'yaml','.yml':'yaml','.sh':'shell','.ps1':'powershell'}[extname(path).toLowerCase()] ?? 'plaintext');
type Doc={text:string;saved:string;version:number;uri:string;language:string;encoding:'utf8'|'utf16le'|'utf16be';bom:boolean;revision:string};
export class EditorService {
 private docs=new Map<string,Map<string,Doc>>();
 private queue=new Map<string,Promise<unknown>>();
 private servers=new Map<string,Promise<{connection:MessageConnection;stop:()=>void}>>();
 constructor(private window:BrowserWindow,private state:Workspace){}
 private emit(event:EditorEvent){if(!this.window.isDestroyed())this.window.webContents.send('dao:editor-event',event);}
 private async root(id:string){const p=this.state.projects.find(p=>p.id===id);if(!p?.folder)throw new Error('Choose a project folder');return realpath(p.folder);}
 private async path(id:string,input='',newFile=false){const root=await this.root(id);const path=resolve(root,input);const rel=relative(root,path);if(rel==='..'||rel.startsWith('..'+(process.platform==='win32'?'\\':'/'))||isAbsolute(rel))throw new Error('File is outside this project');const actual=newFile?join(await realpath(dirname(path)),path.split(/[\\/]/).pop()!):await realpath(path);const check=relative(root,actual);if(check==='..'||check.startsWith('..'+(process.platform==='win32'?'\\':'/'))||isAbsolute(check))throw new Error('Linked file is outside this project');return actual;}
 private async git(id:string,args:string[]){return (await exec('git',['--literal-pathspecs','-C',await this.root(id),...args],{windowsHide:true,maxBuffer:8*1024*1024,timeout:20000})).stdout;}
 private documents(id:string){let docs=this.docs.get(id);if(!docs){docs=new Map();this.docs.set(id,docs);}return docs;}
 private async server(id:string){
  if(!this.servers.has(id))this.servers.set(id,(async()=>{
   const root=await this.root(id);
   const child=spawn(process.execPath,[join(app.getAppPath(),'node_modules/typescript-language-server/lib/cli.mjs'),'--stdio'],{cwd:root,windowsHide:true,env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},stdio:['pipe','pipe','pipe']});
   let stopping=false;
   const connection=createMessageConnection(new StreamMessageReader(child.stdout),new StreamMessageWriter(child.stdin));
   child.stderr.on('data',()=>{});child.on('error',e=>this.emit({projectId:id,error:e.message}));
   connection.onNotification('textDocument/publishDiagnostics',(p:any)=>this.emit({projectId:id,uri:p.uri,diagnostics:p.diagnostics}));
   connection.onRequest('workspace/configuration',(p:any)=>p.items.map(()=>({})));
   connection.onRequest('client/registerCapability',()=>null);
   connection.listen();
   const timeout=setTimeout(()=>child.kill(),20000);
   await connection.sendRequest('initialize',{processId:process.pid,rootUri:pathToFileURL(root).href,workspaceFolders:[{uri:pathToFileURL(root).href,name:root}],capabilities:{textDocument:{completion:{completionItem:{snippetSupport:true}},hover:{contentFormat:['markdown','plaintext']},publishDiagnostics:{versionSupport:true}}},initializationOptions:{hostInfo:'DAO ADE',tsserver:{path:join(app.getAppPath(),'node_modules/typescript/lib/tsserver.js')}}});
   clearTimeout(timeout);
   connection.sendNotification('initialized',{});
   child.on('exit',()=>{if(!stopping&&this.servers.has(id)){this.servers.delete(id);this.emit({projectId:id,error:'Language server stopped; reopen the editor to reconnect.'});}});
   return {connection,stop:()=>{stopping=true;connection.dispose();child.kill();}};
  })().catch(e=>{this.servers.delete(id);throw e;}));
  return this.servers.get(id)!;
 }
 private supported(doc:Doc){return ['typescript','typescriptreact','javascript','javascriptreact'].includes(doc.language);}
 private async notify(id:string,method:string,params:any){const {connection}=await this.server(id);await connection.sendNotification(method,params);}
 async handle(raw:unknown):Promise<any>{
  const action=schema.parse(raw);
  if(!['read','save','change','close','rename','trash','create'].includes(action.op))return this.perform(action);
  const next=(this.queue.get(action.projectId)??Promise.resolve()).catch(()=>{}).then(()=>this.perform(action));
  this.queue.set(action.projectId,next);return next;
 }
 private async perform(raw:unknown):Promise<any>{
  const a=schema.parse(raw) as EditorAction;await this.root(a.projectId);
  const docs=this.documents(a.projectId);
  if(a.op==='search'){
   const q=(a.text??'').toLowerCase();if(!q)return [];
   const root=await this.root(a.projectId),result:string[]=[];let count=0;
   const excluded=new Set(['.git','node_modules','data','.runtime','dist','build','coverage','.next','.nuxt','.output','.cache','.turbo','vendor','__pycache__']);
   type Rules={base:string;matcher:Ignore};
   const directories:{path:string;rules:Rules[]}[]=[{path:root,rules:[]}];
   while(directories.length&&count<15000&&result.length<60){
    const {path:dir,rules:inherited}=directories.shift()!;
    const rules=[...inherited];
    try {const text=await readFile(join(dir,'.gitignore'),'utf8');rules.push({base:dir,matcher:ignore().add(text)});}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
    let items;try{items=await readdir(dir,{withFileTypes:true});}catch{continue;}
    for(const item of items){
     if(++count>15000||result.length>=60)break;
     if(item.isSymbolicLink() || item.isDirectory() && (excluded.has(item.name)||item.name.startsWith('.output-')))continue;
     const full=join(dir,item.name),directory=item.isDirectory();
     let ignored=false;
     for(const rule of rules){const match=rule.matcher.test(relative(rule.base,full).split('\\').join('/')+(directory?'/':''));if(match.ignored)ignored=true;else if(match.unignored)ignored=false;}
     if(ignored)continue;
     if(directory)directories.push({path:full,rules});
     else if(relative(root,full).toLowerCase().includes(q))result.push(relative(root,full));
    }
   }
   return result;
  }
  if(a.op==='git'){
   const raw=await this.git(a.projectId,['status','--porcelain=v1','-z','--untracked-files=all']);const parts=raw.split('\0'),entries=[];
   for(let i=0;i<parts.length;i++){const row=parts[i];if(!row)continue;entries.push({path:row.slice(3),index:row[0],worktree:row[1]});if(/[RC]/.test(row.slice(0,2)))i++;}
   return {branch:(await this.git(a.projectId,['branch','--show-current'])).trim()||'Detached HEAD',entries};
  }
  if(a.op==='commit'){if(!a.text?.trim())throw new Error('Enter a commit message');return this.git(a.projectId,['commit','-m',a.text]);}
  if(a.op==='stage-all')return this.git(a.projectId,['add','-A','--','.']);
  if(a.op==='stage'||a.op==='unstage'||a.op==='diff'){
   const root=await this.root(a.projectId);const path=resolve(root,a.path??'');const rel=relative(root,path).replaceAll('\\','/');if(!rel||rel==='..'||rel.startsWith('../')||isAbsolute(rel))throw new Error('Invalid Git path');
   if(a.op==='stage')return this.git(a.projectId,['add','--',rel]);
   if(a.op==='unstage'){try{await this.git(a.projectId,['rev-parse','--verify','HEAD']);}catch{return this.git(a.projectId,['rm','--cached','--',rel]);}return this.git(a.projectId,['reset','HEAD','--',rel]);}
   let original='';try{original=await this.git(a.projectId,['show',a.staged?`HEAD:${rel}`:`:${rel}`]);}catch{}
   let modified='';if(a.staged){try{modified=await this.git(a.projectId,['show',`:${rel}`]);}catch{}}else{try{modified=(await readFile(await this.path(a.projectId,rel))).toString('utf8');}catch{}}
   return {original,modified,language:language(rel)};
  }
  const path=await this.path(a.projectId,a.path,a.op==='create');
  if(a.op==='attach'){const info=await stat(path);if(!info.isFile()||info.size>20*1024*1024)throw Error('File exceeds attachment limit');const file=await importAttachment(path,await readFile(path));file.name=relative(await this.root(a.projectId),path).replaceAll('\\','/');return file;}
  if(a.op==='list')return (await readdir(path,{withFileTypes:true})).filter(x=>!x.isSymbolicLink()&&x.name!=='.git').sort((a,b)=>Number(b.isDirectory())-Number(a.isDirectory())||a.name.localeCompare(b.name)).map(x=>({name:x.name,path:join(path,x.name),directory:x.isDirectory()}));
  if(a.op==='create'){if(a.directory)await mkdir(path);else await writeFile(path,'',{flag:'wx'});return;}
  if(a.op==='rename'||a.op==='trash'){
   if(path===await this.root(a.projectId))throw new Error('Cannot change the project root');
   if([...docs.keys()].some(p=>p===path||p.startsWith(path+ (process.platform==='win32'?'\\':'/'))))throw new Error('Close files in this path first');
   if(a.op==='trash'){const response=await dialog.showMessageBox(this.window,{message:'Move to trash?',detail:path,buttons:['Cancel','Move to trash'],cancelId:0,defaultId:0});if(response.response===1)await shell.trashItem(path);}
   else{const target=await this.path(a.projectId,a.destination!,true);try{await stat(target);throw new Error('Destination already exists');}catch(e:any){if(e.code!=='ENOENT')throw e;}await rename(path,target);}return;
  }
  if(a.op==='read'){
   if((await stat(path)).size>2*1024*1024)throw new Error('Editor supports text files up to 2 MB');const bytes=await readFile(path);let encoding:Doc['encoding']='utf8',bom=false,text:string;
   if(bytes[0]===255&&bytes[1]===254){encoding='utf16le';bom=true;text=bytes.subarray(2).toString('utf16le');}
   else if(bytes[0]===254&&bytes[1]===255){encoding='utf16be';bom=true;text=new TextDecoder('utf-16be',{fatal:true}).decode(bytes.subarray(2));}
   else{if(bytes.includes(0))throw new Error('Binary file');bom=bytes.subarray(0,3).equals(Buffer.from([239,187,191]));text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
   const doc=docs.get(path)??{text,saved:text,version:1,uri:pathToFileURL(path).href,language:language(path),encoding,bom,revision:hash(bytes)};const isNew=!docs.has(path);const diskRevision=hash(bytes);const conflict=!isNew&&doc.revision!==diskRevision&&!sameText(doc.text,doc.saved);
   if(!isNew&&doc.revision!==diskRevision&&!conflict){doc.text=text;doc.saved=text;doc.revision=diskRevision;doc.encoding=encoding;doc.bom=bom;doc.version++;if(this.supported(doc))void this.notify(a.projectId,'textDocument/didChange',{textDocument:{uri:doc.uri,version:doc.version},contentChanges:[{text}]}).catch(()=>{});}
   docs.set(path,doc);
   if(isNew&&this.supported(doc))void this.notify(a.projectId,'textDocument/didOpen',{textDocument:{uri:doc.uri,languageId:doc.language,version:doc.version,text:doc.text}}).catch(e=>this.emit({projectId:a.projectId,error:String(e)}));
   return {path,uri:doc.uri,text:doc.text,revision:doc.revision,language:doc.language,conflict};
  }
  const doc=docs.get(path);if(!doc)throw new Error('Open this file first');
  if(a.op==='change'){doc.text=a.text??'';doc.version++;if(this.supported(doc))void this.notify(a.projectId,'textDocument/didChange',{textDocument:{uri:doc.uri,version:doc.version},contentChanges:[{text:doc.text}]}).catch(()=>{});return;}
  if(a.op==='save'){
   const current=await readFile(path);if(hash(current)!==a.revision)throw new Error('File changed on disk. Close and reopen it to load the latest version before saving.');
   const text=a.text??doc.text;let bytes=Buffer.from(text,doc.encoding==='utf8'?'utf8':'utf16le');if(doc.encoding==='utf16be')bytes.swap16();if(doc.bom)bytes=Buffer.concat([Buffer.from(doc.encoding==='utf8'?[239,187,191]:doc.encoding==='utf16le'?[255,254]:[254,255]),bytes]);
   await writeFile(path,bytes);doc.saved=text;doc.revision=hash(bytes);if(this.supported(doc))await this.notify(a.projectId,'textDocument/didSave',{textDocument:{uri:doc.uri}});return hash(bytes);
  }
  if(a.op==='close'){if(!sameText(doc.text,doc.saved)){const r=await dialog.showMessageBox(this.window,{message:'Discard unsaved changes?',detail:path,buttons:['Cancel','Discard'],defaultId:0,cancelId:0});if(r.response!==1)return false;}docs.delete(path);if(this.supported(doc))await this.notify(a.projectId,'textDocument/didClose',{textDocument:{uri:doc.uri}});if(!docs.size){const server=this.servers.get(a.projectId);this.servers.delete(a.projectId);void server?.then(s=>s.stop());}return true;}
  if(a.op==='lsp'&&this.supported(doc)){const {connection}=await this.server(a.projectId);return connection.sendRequest('textDocument/'+a.method,{textDocument:{uri:doc.uri},position:{line:a.line??0,character:a.character??0}});}
  return null;
 }
 async close(tabId:string){const tab=this.state.tabs.find(t=>t.id===tabId);if(tab?.kind!=='ide')return true;if(this.state.tabs.some(t=>t.id!==tabId&&t.kind==='ide'&&t.projectId===tab.projectId))return true;const docs=this.documents(tab.projectId);if([...docs.values()].some(d=>!sameText(d.text,d.saved))){const r=await dialog.showMessageBox(this.window,{message:'Discard unsaved editor changes?',buttons:['Cancel','Discard'],defaultId:0,cancelId:0});if(r.response!==1)return false;}this.release(tab.projectId);return true;}
 private release(id:string){this.docs.delete(id);const server=this.servers.get(id);this.servers.delete(id);void server?.then(s=>s.stop());this.emit({projectId:id,closed:true});}
 isDirty(projectId:string,path:string){const doc=this.docs.get(projectId)?.get(path);return !!doc&&!sameText(doc.text,doc.saved);}
 confirmQuit(){return ![...this.docs.values()].some(docs=>[...docs.values()].some(d=>!sameText(d.text,d.saved)))||dialog.showMessageBoxSync(this.window,{message:'Discard unsaved editor changes and quit?',buttons:['Cancel','Discard and quit'],defaultId:0,cancelId:0})===1;}
 dispose(){for(const id of this.docs.keys())this.release(id);}
}
