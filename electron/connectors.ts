import {browserInstructions} from "./browser-tools";
import {readTextFile} from "./files";
import {app,safeStorage} from 'electron';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {join,extname,dirname} from 'node:path';
import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {Readable,Writable} from 'node:stream';
import {randomUUID} from 'node:crypto';
import {client,ndJsonStream,type ClientConnection} from '@agentclientprotocol/sdk';
import {z} from 'zod';
import type {Conversation,Attachment,Approval,PermissionMode} from '../src/shared';
import {connectorPresets,connectorModel,type ConnectorConfig,type ConnectorStatus} from '../src/connectors';
export const configSchema=z.object({id:z.string().regex(/^[a-zA-Z0-9_-]+$/).max(80),name:z.string().trim().min(1).max(80),command:z.string().min(1).max(32768),args:z.array(z.string().max(32768)).max(100),env:z.record(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),z.string().max(32768)).optional(),enabled:z.boolean(),customModels:z.array(z.string().min(1).max(500)).max(100)});
type Running={child:ChildProcessWithoutNullStreams;rpc:ClientConnection;init:any;loaded:Set<string>;probe?:string;busy:number;infos:Map<string,any>;closing?:boolean};
export class Connectors {
 private configs:ConnectorConfig[]=[];
 private logins=new Map<string,ChildProcessWithoutNullStreams>();
 private statuses=new Map<string,ConnectorStatus>();
 private running=new Map<string,Promise<Running>>();
 private sessions=new Map<string,{conversation:Conversation;permission:PermissionMode;message?:string;replay:boolean}>();
 private pending=new Map<string,{conversationId:string;resolve:(response:any)=>void;options:any[];kind?:string;questions?:any[]}>();
 private active=new Set<string>();
 private stopped=new Set<string>();
 constructor(private changed:()=>void,private approval:(a:Approval)=>void,private clearApproval:(id:string)=>void,private browserServers:(c:Conversation)=>Promise<any[]>,private recordEdits:(id:string,event:string,changes:any[])=>void){
  const path=join(app.getPath('userData'),'connectors.json');
  if(existsSync(path)){const saved=JSON.parse(readFileSync(path,'utf8'));this.configs=saved.map((entry:any)=>{const {encryptedEnv,...rest}=entry;return configSchema.parse({...rest,env:encryptedEnv?JSON.parse(safeStorage.decryptString(Buffer.from(encryptedEnv,'base64'))):{}});});}
  if(!existsSync(path)){this.configs=connectorPresets.map(c=>({...c}));this.persist();}
 }
 snapshot(){return this.configs.map(c=>{const {env,...safe}=c;const status=this.statuses.get(c.id);return {...safe,envKeys:Object.keys(env??{}),connected:false,account:'Not connected',authMethods:c.command==='@bundled/claude'?[{id:'dao-claude-login',name:'Sign in with Claude'}]:[],options:[],models:[{id:connectorModel(c.id,'__default__'),label:`${c.name} · Agent default`,efforts:[],defaultEffort:'',isDefault:false}],...status};});}
 private config(id:string){const c=this.configs.find(c=>c.id===id);if(!c)throw new Error('Connector not found');return c;}
 private persist(){writeFileSync(join(app.getPath('userData'),'connectors.json'),JSON.stringify(this.configs.map(({env,...c})=>({...c,encryptedEnv:Object.keys(env??{}).length?safeStorage.encryptString(JSON.stringify(env)).toString('base64'):undefined})),null,2));}
 save(raw:unknown){const c=configSchema.parse(raw);if(this.isBusy(c.id))throw new Error('Stop this provider’s active turns first');if(c.env&&Object.keys(c.env).length&&!safeStorage.isEncryptionAvailable())throw new Error('OS credential encryption is unavailable');const old=this.configs.find(x=>x.id===c.id);c.env??=old?.env??{};this.disconnect(c.id);this.configs=this.configs.filter(x=>x.id!==c.id);this.configs.push(c);this.persist();this.changed();}
 remove(id:string){if(this.isBusy(id))throw new Error('Stop active turns first');this.disconnect(id);this.configs=this.configs.filter(c=>c.id!==id);this.persist();this.changed();}
 private activeProviders=new Map<string,string>();
 private isBusy(id:string){return this.logins.has(id)||[...this.activeProviders.values()].includes(id);}
 private state(id:string,values:Partial<ConnectorStatus>){const existing=this.snapshot().find(c=>c.id===id);if(!existing)return;this.statuses.set(id,{...existing,...values});this.changed();}
 private async launch(config:ConnectorConfig){
  let command=config.command,args=[...config.args],env={...process.env,...config.env};
  if(command==='@bundled/claude'){command=process.execPath;args=[join(app.getAppPath(),'node_modules/@agentclientprotocol/claude-agent-acp/dist/index.js'),...args];env.ELECTRON_RUN_AS_NODE='1';}
  else if(/\.(mjs|cjs|js)$/i.test(command)){args=[command,...args];command=process.execPath;env.ELECTRON_RUN_AS_NODE='1';}
  else if(process.platform==='win32'){
   // Resolve npm launchers to their JS entry point, never pass user arguments through cmd.exe.
   const locations=[dirname(command),...(process.env.PATH??'').split(';'),join(app.getPath('appData'),'npm')];
   const base=command.split(/[\\/]/).pop()!.replace(/\.cmd$/i,'');
   const shim=locations.map(dir=>join(dir,base+'.cmd')).find(existsSync);
   if(shim){const text=readFileSync(shim,'utf8');const match=text.match(/"%dp0%[\\/]([^"\r\n]+\.(?:js|mjs|cjs))"/i);if(match){args=[join(dirname(shim),match[1]),...args];command=process.execPath;env.ELECTRON_RUN_AS_NODE='1';}else if(/\.cmd$/i.test(config.command))throw new Error('Use the native executable or JavaScript entry path instead of a .cmd wrapper');}
  }
  const child=spawn(command,args,{cwd:app.getPath('home'),env,stdio:'pipe',windowsHide:true});let stderr='';child.stderr.on('data',data=>{stderr=(stderr+data).slice(-1500);});
  const host=client().onNotification('session/update',({params})=>this.update(config.id,params)).onRequest('session/request_permission',({params})=>this.permission(config.id,params)).onRequest('cursor/ask_question',(p:unknown)=>p as any,({params})=>this.cursorRequest(config.id,'questions',params)).onRequest('cursor/create_plan',(p:unknown)=>p as any,({params})=>this.cursorRequest(config.id,'plan',params));
  const rpc=host.connect(ndJsonStream(Writable.toWeb(child.stdin) as any,Readable.toWeb(child.stdout) as any,{maxMessageBytes:16*1024*1024}));
  child.on('error',error=>rpc.close(error));child.stdin.on('error',error=>rpc.close(error));
  const fail=()=>{if(this.running.has(config.id)){this.running.delete(config.id);this.state(config.id,{connected:false,account:'Disconnected',error:stderr||'Provider disconnected'});}for(const s of this.sessions.values())if(s.conversation.providerId===config.id&&s.conversation.status==='running'){s.conversation.status='error';s.conversation.turnId=undefined;this.note(s.conversation,'Provider disconnected. Reconnect before continuing.');this.cancelApprovals(s.conversation.id);}this.changed();};
  let intentional=false;child.once('dao-close',()=>{intentional=true;});void rpc.closed.then(()=>{if(!intentional)fail();});child.on('exit',()=>rpc.close());
  try{const init=await rpc.agent.request('initialize',{protocolVersion:1,clientInfo:{name:'dao-ade',version:'0.1.0'},clientCapabilities:{}},{cancellationSignal:AbortSignal.timeout(20000),stopWaitingOnCancel:true});if(init.protocolVersion!==1)throw new Error('This connector requires ACP v1 support');this.state(config.id,{connected:true,account:'Connected; sign-in not yet verified',error:undefined,authMethods:(config.command==='@bundled/claude'?[{id:'dao-claude-login',name:'Sign in with Claude'}]:init.authMethods??[]).map((m:any)=>({...m,description:m.description??undefined}))});return {child,rpc,init,loaded:new Set<string>(),busy:0,infos:new Map<string,any>()} as Running;}
  catch(error){rpc.close();child.kill();throw error;}
 }
 async connect(id:string,cwd=app.getPath('home')){if(this.isBusy(id))throw Error('Wait for active turns before refreshing');const running=await this.ensure(id);try{if(running.probe){const info=running.infos.get(running.probe);if(info)this.catalog(id,info);return;}const info=await running.rpc.agent.request('session/new',{cwd,mcpServers:[]},{cancellationSignal:AbortSignal.timeout(30000),stopWaitingOnCancel:true});running.probe=info.sessionId;running.infos.set(info.sessionId,info);this.catalog(id,info);this.state(id,{account:'Ready',error:undefined});if(running.init.agentCapabilities?.sessionCapabilities?.close)await running.rpc.agent.request('session/close',{sessionId:info.sessionId});}catch(e){this.state(id,{account:'Setup or sign-in required',error:String(e)});throw e;}}
 private async ensure(id:string){const config=this.config(id);if(!config.enabled)throw new Error('Provider is disabled');if(!this.running.has(id)){const promise=this.launch(config).catch(e=>{this.running.delete(id);this.state(id,{connected:false,error:String(e),account:'Unavailable'});throw e;});this.running.set(id,promise);}return this.running.get(id)!;}
 async auth(id:string,methodId:string){if(methodId==='dao-claude-login'&&this.config(id).command==='@bundled/claude'){this.loginClaude(id);return;}const r=await this.ensure(id);const method=r.init.authMethods?.find((m:any)=>m.id===methodId);if(!method)throw new Error('Authentication method unavailable');if(method.type==='terminal')throw new Error('This provider requires signing in through its own CLI terminal, then reconnecting here.');await r.rpc.agent.request('authenticate',{methodId},{cancellationSignal:AbortSignal.timeout(300000),stopWaitingOnCancel:true});r.probe=undefined;await this.connect(id);}
 private loginClaude(id:string){
  if(this.isBusy(id))throw Error('Stop active turns before changing account');if(this.logins.has(id))throw Error('Sign-in is already running');
  const config=this.config(id);this.disconnect(id);
  const child=spawn(process.execPath,[join(app.getAppPath(),'node_modules/@agentclientprotocol/claude-agent-acp/dist/index.js'),'--cli','auth','login','--claudeai'],{cwd:app.getPath('home'),env:{...process.env,...config.env,ELECTRON_RUN_AS_NODE:'1'},stdio:'pipe',windowsHide:true});this.logins.set(id,child);this.state(id,{loginActive:true,loginOutput:'Starting Claude sign-in…',error:undefined});
  const output=(data:Buffer)=>{const clean=data.toString().replace(/\x1b\[[0-9;?]*[a-zA-Z]/g,'');this.state(id,{loginOutput:((this.statuses.get(id)?.loginOutput??'')+'\n'+clean).slice(-12000)});};child.stdout.on('data',output);child.stderr.on('data',output);child.stdin.on('error',()=>{});
  child.on('error',error=>{this.logins.delete(id);this.state(id,{loginActive:false,error:String(error)});});child.on('exit',code=>{this.logins.delete(id);this.state(id,{loginActive:false,account:code===0?'Sign-in completed':'Sign-in stopped'});if(code===0)void this.connect(id).catch(()=>{});});
 }
 loginInput(id:string,text:string){const child=this.logins.get(id);if(!child)throw Error('No sign-in in progress');child.stdin.write(text+'\n');}
 cancelLogin(id:string){this.logins.get(id)?.kill();}
 private options(info:any){return info.configOptions??[];}
 private catalog(id:string,info:any){
  const config=this.config(id),options=this.options(info);const flat=(values:any[]):any[]=>values.flatMap(v=>Array.isArray(v.options)?flat(v.options):v);
  const modelOption=options.find((o:any)=>o.category==='model');const effortOption=options.find((o:any)=>['thought_level','reasoning_effort'].includes(o.category)||/effort|thinking/.test(o.id));
  const available=modelOption?flat(modelOption.options??[]).map((m:any)=>({id:m.value,name:m.name})):info.models?.availableModels?.map((m:any)=>({id:m.modelId,name:m.name}))??[];
  for(const model of config.customModels)if(!available.some((m:any)=>m.id===model))available.push({id:model,name:model});
  if(!available.length)available.push({id:'__default__',name:'Agent default'});
  const efforts=effortOption?flat(effortOption.options??[]).map((o:any)=>({level:String(o.value),description:''})):[];
  this.state(id,{options,models:available.map((m:any)=>({id:connectorModel(id,m.id),label:`${config.name} · ${m.name}`,efforts,defaultEffort:effortOption?.currentValue??'',isDefault:false}))});
 }
 private note(c:Conversation,text:string){c.messages.push({id:randomUUID(),role:'system',text});}
 private toolDiffs=new Map<string,any[]>();
 private update(providerId:string,p:any){const s=this.sessions.get(`${providerId}:${p.sessionId}`);const u=p.update;if(u.sessionUpdate==='config_option_update')this.catalog(providerId,u);if(!s||s.replay)return;const c=s.conversation;
  if(u.sessionUpdate==='agent_message_chunk'){
   if(!s.message){s.message=randomUUID();c.messages.push({id:s.message,role:'assistant',text:''});}const m=c.messages.find(m=>m.id===s.message)!;
   const content=u.content;if(content.type==='text')m.text+=content.text;else if(content.type==='resource_link')m.text+=`\n[${content.name??'Resource'}](${content.uri})\n`;else m.text+=`\n[${content.type} output is not rendered]\n`;
  }else if(['tool_call','tool_call_update'].includes(u.sessionUpdate)){s.message=undefined;const key=`acp-tool:${p.sessionId}:${u.toolCallId}`;const diffs=(u.content??[]).filter((v:any)=>v.type==='diff');if(diffs.length)this.toolDiffs.set(key,diffs);if(u.status==='completed'){this.recordEdits(c.id,key,this.toolDiffs.get(key)??[]);this.toolDiffs.delete(key);}if(u.status==='failed')this.toolDiffs.delete(key);let message=c.messages.find(m=>m.id===key);if(!message){message={id:key,role:'system',text:''};c.messages.push(message);}message.text=[u.title??message.text.split('\n')[0]??'Tool',u.status,...(u.content??[]).map((v:any)=>v.type==='content'?v.content?.text??v.content?.type:v.type==='diff'?`File: ${v.path}`:v.type)].filter(Boolean).join('\n').slice(-10000);
  }else if(u.sessionUpdate==='plan')this.note(c,(u.entries??[]).map((e:any)=>`${e.status}: ${e.content}`).join('\n'));
  else if(u.sessionUpdate==='available_commands_update')c.providerCommands=(u.availableCommands??[]).map((v:any)=>({name:v.name,description:v.description}));
  else if(u.sessionUpdate==='current_mode_update')c.providerMode=u.currentModeId;
  this.changed();
 }
 private permission(providerId:string,p:any):Promise<any>{const s=this.sessions.get(`${providerId}:${p.sessionId}`);if(!s||s.replay||s.conversation.status!=='running')return Promise.resolve({outcome:{outcome:'cancelled'}});const options=p.options??[];const allow=options.find((o:any)=>o.kind==='allow_once');if(s.permission==='read-only'&&!['read','search','think'].includes(p.toolCall?.kind))return Promise.resolve({outcome:{outcome:'cancelled'}});if(s.permission==='full-access'&&allow)return Promise.resolve({outcome:{outcome:'selected',optionId:allow.optionId}});
  const id='acp:'+randomUUID();return new Promise(resolve=>{this.pending.set(id,{conversationId:s.conversation.id,resolve,options});this.approval({id,conversationId:s.conversation.id,method:p.toolCall?.title??'Agent permission',detail:JSON.stringify(p.toolCall,null,2)});this.changed();});
 }
 private cursorRequest(providerId:string,kind:string,p:any):Promise<any>{
  const candidates=[...this.sessions.values()].filter(s=>!s.replay&&s.conversation.providerId===providerId&&s.conversation.status==='running');
  const s=candidates.find(s=>s.conversation.acpSessionId===p.sessionId)||candidates.find(s=>s.conversation.messages.some(m=>m.id.endsWith(':'+p.toolCallId)))||(candidates.length===1?candidates[0]:undefined);
  if(!s)return Promise.resolve({outcome:{outcome:'cancelled'}});
  const id='acp:'+randomUUID();return new Promise(resolve=>{this.pending.set(id,{conversationId:s.conversation.id,resolve,options:[],kind,questions:p.questions});this.approval({id,conversationId:s.conversation.id,method:p.title??p.name??(kind==='plan'?'Approve plan':'Agent question'),detail:kind==='plan'?p.plan??p.overview??'':p.title??'',questions:kind==='questions'?p.questions:undefined});this.changed();});
 }
 respond(id:string,accept:boolean,answers?:{questionId:string;selectedOptionIds:string[]}[]){const p=this.pending.get(id);if(!p)throw new Error('Approval expired');if(p.kind==='questions'&&accept){for(const q of p.questions??[]){const a=answers?.find(a=>a.questionId===q.id);if(!a||!a.selectedOptionIds.length||(!q.allowMultiple&&a.selectedOptionIds.length!==1)||a.selectedOptionIds.some(id=>!q.options.some((o:any)=>o.id===id)))throw Error('Choose an answer for each question');}}
 this.pending.delete(id);if(p.kind){p.resolve({outcome:p.kind==='plan'?{outcome:accept?'accepted':'rejected'}:accept?{outcome:'answered',answers}:{outcome:'cancelled'}});this.clearApproval(id);return;}const choice=p.options.find((o:any)=>o.kind===(accept?'allow_once':'reject_once'));p.resolve({outcome:choice?{outcome:'selected',optionId:choice.optionId}:{outcome:'cancelled'}});this.clearApproval(id);}
 private cancelApprovals(id:string){for(const [key,p]of this.pending)if(p.conversationId===id)this.respond(key,false);}
 async send(c:Conversation,model:string,effort:string|undefined,text:string,files:Attachment[],cwd:string,permission:PermissionMode,editorContext=""){
  const providerId=c.providerId!;this.activeProviders.set(c.id,providerId);this.active.add(c.id);this.stopped.delete(c.id);c.status='running';c.turnId=randomUUID();this.changed();
  try{
   const r=await this.ensure(providerId);const mcpServers=await this.browserServers(c);let info:any;
   let continuation='';
   if(c.acpSessionId&&!c.contextEdited&&r.loaded.has(c.acpSessionId))info=r.infos.get(c.acpSessionId)??{configOptions:this.statuses.get(providerId)?.options};
   else if(c.acpSessionId&&!c.contextEdited&&r.init.agentCapabilities?.loadSession){this.sessions.set(`${providerId}:${c.acpSessionId}`,{conversation:c,permission,replay:true});info=await r.rpc.agent.request('session/load',{sessionId:c.acpSessionId,cwd,mcpServers});}
   else {if(c.messages.length)continuation='Prior conversation (partial):\n'+c.messages.filter(m=>m.role!=='system').map(m=>`${m.role}: ${m.text}`).join('\n').slice(-40000)+'\n\nCurrent request:\n';info=await r.rpc.agent.request('session/new',{cwd,mcpServers});c.acpSessionId=info.sessionId;c.contextEdited=false;}
   if(this.stopped.has(c.id))throw new Error('Turn cancelled');
   info??={};const sessionId=c.acpSessionId!;r.loaded.add(sessionId);r.infos.set(sessionId,info);this.sessions.set(`${providerId}:${sessionId}`,{conversation:c,permission,replay:false});this.catalog(providerId,info);
   const options=info.configOptions??[];c.providerModes=info.modes?.availableModes??c.providerModes??[];c.providerMode=info.modes?.currentModeId??c.providerMode;
   if(permission==='read-only'){const mode=c.providerModes?.find((m:any)=>/^(plan|read[-_ ]?only)$/i.test(m.id));if(!mode)throw new Error('This agent does not advertise a read-only/plan mode. Select Ask permission or configure its native sandbox.');await r.rpc.agent.request('session/set_mode',{sessionId,modeId:mode.id});c.providerMode=mode.id;}
   else if(c.providerMode&&/^(plan|read[-_ ]?only)$/i.test(c.providerMode)){const mode=c.providerModes?.find((m:any)=>/^(default|code|agent|ask)$/i.test(m.id));if(mode){await r.rpc.agent.request('session/set_mode',{sessionId,modeId:mode.id});c.providerMode=mode.id;}}
   const modelOption=options.find((o:any)=>o.category==='model');if(model!=='__default__'){if(modelOption)await r.rpc.agent.request('session/set_config_option',{sessionId,configId:modelOption.id,value:model});else await r.rpc.agent.request('session/set_model',{sessionId,modelId:model});}
   const effortOption=options.find((o:any)=>['thought_level','reasoning_effort'].includes(o.category)||/effort|thinking/.test(o.id));if(effort&&effortOption)await r.rpc.agent.request('session/set_config_option',{sessionId,configId:effortOption.id,value:effort});
   for(const [configId,value]of Object.entries(c.providerOptions??{}))if(options.some((o:any)=>o.id===configId&&!['model','thought_level','reasoning_effort','mode'].includes(o.category)&&!/permission|approval|mode/i.test(o.id)))await r.rpc.agent.request('session/set_config_option',{sessionId,configId,value});
   const prompt:any[]=[{type:'text',text:browserInstructions+"\n\n"+continuation+text+editorContext}];for(const file of files){if(file.kind==='image'){if(!r.init.agentCapabilities?.promptCapabilities?.image)throw new Error('This provider does not support image attachments');prompt.push({type:'image',mimeType:({'.png':'image/png','.webp':'image/webp'} as any)[extname(file.path)]??'image/jpeg',data:(await readFile(file.path)).toString('base64')});}else prompt.push({type:'text',text:`Attached file ${file.name}:\n${(await readTextFile(file.path)).text}`});}
   if(this.stopped.has(c.id))throw Error('Turn cancelled');
   c.messages.push({id:randomUUID(),role:'user',text,attachments:files});if(c.title==='New conversation')c.title=text.slice(0,52);c.updatedAt=Date.now();c.permissionMode=permission;this.changed();
   const response:any=await r.rpc.agent.request('session/prompt',{sessionId,prompt});if(response.stopReason!=='end_turn')this.note(c,`Agent stopped: ${response.stopReason}`);c.status='idle';
  }catch(error){c.status=this.stopped.has(c.id)?'idle':'error';this.note(c,String(error));throw error;}finally{c.turnId=undefined;this.active.delete(c.id);this.activeProviders.delete(c.id);this.cancelApprovals(c.id);this.changed();}
 }
 async stop(c:Conversation){this.stopped.add(c.id);this.cancelApprovals(c.id);if(c.acpSessionId){const r=await this.running.get(c.providerId!);await r?.rpc.agent.notify('session/cancel',{sessionId:c.acpSessionId});}}
 disconnect(id:string){if(this.isBusy(id))throw new Error('Stop active turns before disconnecting');const r=this.running.get(id);this.running.delete(id);void r?.then(r=>{r.child.emit('dao-close');r.rpc.close();r.child.kill();}).catch(()=>{});this.statuses.delete(id);this.changed();}
 dispose(){for(const child of this.logins.values())child.kill();this.logins.clear();for(const p of this.pending.values())p.resolve({outcome:{outcome:'cancelled'}});this.pending.clear();for(const r of this.running.values())void r.then(r=>{r.child.emit('dao-close');r.rpc.close();r.child.kill();}).catch(()=>{});this.running.clear();}
}
