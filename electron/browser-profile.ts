import {app,session,BrowserWindow,dialog,shell,desktopCapturer} from "electron";
import {existsSync,readFileSync,writeFileSync,renameSync,mkdirSync,copyFileSync} from "node:fs";
import {readFile} from "node:fs/promises";
import {join,basename,extname,resolve,sep} from "node:path";
import {randomUUID} from "node:crypto";
import {z} from "zod";
import {installChromeWebStore,updateExtensions,uninstallExtension} from "electron-chrome-web-store";
import {browserConfigSchema,permissionNames,type BrowserConfig,type BrowserProfileSnapshot,type BrowserProfileCommand,type DownloadRecord,type ExtensionRecord} from "../src/browser-config";
const downloadSchema=z.object({id:z.string(),name:z.string(),url:z.string(),path:z.string(),received:z.number(),total:z.number(),state:z.enum(["progressing","completed","cancelled","interrupted"]),paused:z.boolean(),resumable:z.boolean(),startedAt:z.number()});
const extensionSchema=z.object({id:z.string().regex(/^[a-p]{32}$/),name:z.string(),version:z.string(),path:z.string(),enabled:z.boolean(),source:z.enum(["store","unpacked"]),permissions:z.array(z.string()),error:z.string().optional()});
const persisted=z.object({config:browserConfigSchema.default(browserConfigSchema.parse({})),downloads:z.array(downloadSchema).default([]),permissions:z.array(z.object({origin:z.string(),embeddingOrigin:z.string(),permission:z.string(),decision:z.enum(["ask","allow","block"])})).default([]),extensions:z.array(extensionSchema).default([])});
function origin(url:string){try{const u=new URL(url);return ["http:","https:"].includes(u.protocol)?u.origin:u.protocol==="chrome-extension:"?`chrome-extension://${u.hostname}`:"";}catch{return "";}}
function extensionPermissions(manifest:Record<string,any>):string[]{return [...(manifest.permissions ?? []),...(manifest.host_permissions ?? [])].filter(v=>typeof v==="string");}
export class BrowserProfile {
  readonly session=session.fromPartition("persist:dao-browser");
  readonly extensionsPath=join(app.getPath("userData"),"Extensions");
  data:BrowserProfileSnapshot;
  private file=join(app.getPath("userData"),"browser-profile.json");
  private items=new Map<string,Electron.DownloadItem>();
  private reserved=new Set<string>();
  private timer?:NodeJS.Timeout;
  private prompting=new Map<string,Promise<boolean>>();
  private stopping=false;
  private once=new Map<number,Set<string>>();
  constructor(private window:BrowserWindow,private changed:()=>void,private openPage:(url:string)=>void){
    let saved=persisted.parse({});
    if(existsSync(this.file))try{saved=persisted.parse(JSON.parse(readFileSync(this.file,"utf8")));}catch{copyFileSync(this.file,`${this.file}.invalid-${Date.now()}`);}
    saved.config.downloadDirectory ||= app.getPath("downloads");
    for(const d of saved.downloads)if(d.state==="progressing"){d.state="interrupted";d.resumable=false;d.paused=false;}
    this.data={...saved,languages:this.session.availableSpellCheckerLanguages,siteData:[]};
    this.session.setPermissionCheckHandler((wc,permission,requestingOrigin,details)=>{
      const requester=origin(details.securityOrigin || requestingOrigin || details.requestingUrl || "");
      const embedding=origin(wc?.getURL() || details.embeddingOrigin || requester);
      const names=permission==="media" ? details.mediaType==="video"?["camera"]:details.mediaType==="audio"?["microphone"]:["camera","microphone"] : [permission];
      return !!requester && names.every(name=>this.decision(requester,embedding,name)==="allow" || (wc && this.once.get(wc.id)?.has(`${requester}|${embedding}|${name}`)));
    });
    this.session.setPermissionRequestHandler((wc,permission,callback,details)=>{
      const requester=origin(details.requestingUrl);const embedding=origin(wc.getURL());const startURL=wc.getURL();
      const media="mediaTypes" in details ? details.mediaTypes : undefined;
      const names=permission==="media" ? (media?.length?media.map(t=>t==="video"?"camera":"microphone"):["camera","microphone"]) : [permission];
      void (async()=>{for(const name of names)if(!await this.requestPermission(requester,embedding,name))return false;if(wc.isDestroyed() || wc.getURL()!==startURL)return false;
        const grants=this.once.get(wc.id) ?? new Set<string>();for(const name of names)grants.add(`${requester}|${embedding}|${name}`);this.once.set(wc.id,grants);return true;})().then(callback,()=>callback(false));
    });
    this.session.setDisplayMediaRequestHandler((request,callback)=>{
      void (async()=>{
        const requester=origin(request.securityOrigin);
        if(!await this.requestPermission(requester,requester,"display-capture")){callback({});return;}
        const sources=await desktopCapturer.getSources({types:["screen","window"],thumbnailSize:{width:0,height:0}});
        if(!sources.length){callback({});return;}
        const choices=sources.slice(0,15);
        const result=await dialog.showMessageBox(this.window,{type:"question",title:"Share your screen",message:`Choose what to share with ${requester}`,buttons:["Cancel",...choices.map(s=>s.name)],cancelId:0,defaultId:0,noLink:true});
        const source=choices[result.response-1];callback(source?{video:source}:{});
      })().catch(()=>callback({}));
    },{useSystemPicker:true});
    this.session.setDevicePermissionHandler(()=>false);
    this.session.on("will-download",(_event,item)=>this.trackDownload(item));
    this.session.extensions.on("extension-loaded",(_event,extension)=>{this.rememberExtension(extension);});
  }
  forgetPage(wc:Electron.WebContents){this.once.delete(wc.id);}
  private decision(requester:string,embedding:string,permission:string){return this.data.permissions.find(p=>p.origin===requester && p.embeddingOrigin===embedding && p.permission===permission)?.decision ?? this.data.config.permissionDefaults[permission as keyof BrowserConfig["permissionDefaults"]] ?? "ask";}
  private async requestPermission(requester:string,embedding:string,permission:string):Promise<boolean>{
    if(!requester || !permissionNames.includes(permission as any) || this.stopping)return false;
    const decision=this.decision(requester,embedding,permission);if(decision!=="ask")return decision==="allow";
    const key=`${requester}|${embedding}|${permission}`;const pending=this.prompting.get(key);if(pending)return pending;
    const promise=(async()=>{
      const result=await dialog.showMessageBox(this.window,{type:"question",title:"Site permission",message:`${requester} wants to use ${permission}`,detail:embedding!==requester?`Embedded by ${embedding}`:"",buttons:["Block","Allow once","Always allow"],defaultId:0,cancelId:0,noLink:true});
      if(this.stopping)return false;
      if(result.response!==1){this.data.permissions=this.data.permissions.filter(p=>!(p.origin===requester && p.embeddingOrigin===embedding && p.permission===permission));this.data.permissions.push({origin:requester,embeddingOrigin:embedding,permission,decision:result.response===2?"allow":"block"});this.touch();}
      return result.response!==0;
    })().finally(()=>this.prompting.delete(key));this.prompting.set(key,promise);return promise;
  }
  async initialize(){
    await this.applyConfig();
    for(const ext of [...this.data.extensions])if(ext.enabled)try{await this.session.extensions.loadExtension(ext.path);}catch(error){ext.error=String(error);}
    await installChromeWebStore({session:this.session,extensionsPath:this.extensionsPath,autoUpdate:false,loadExtensions:false,beforeInstall:async details=>{
      const result=await dialog.showMessageBox(this.window,{type:"question",title:"Install extension",message:`Add ${details.localizedName}?`,detail:`Requested permissions:\n${extensionPermissions(details.manifest).join("\n") || "None listed"}\n\nSome Chrome APIs may not work in ADE.`,buttons:["Cancel","Add extension"],defaultId:0,cancelId:0,noLink:true});
      return {action:result.response===1?"allow":"deny"};
    }});
    await this.refreshSiteData();this.touch();
  }
  async applyConfig(updateProxy=true){
    const c=this.data.config;
    this.session.setDownloadPath(c.downloadDirectory);
    this.session.setSpellCheckerEnabled(c.spellcheck);
    if(process.platform!=="darwin")this.session.setSpellCheckerLanguages(c.languages.filter(l=>this.session.availableSpellCheckerLanguages.includes(l)));
    if(updateProxy){await this.session.setProxy({mode:c.proxyMode,proxyRules:c.proxyRules,proxyBypassRules:c.proxyBypass});await this.session.closeAllConnections();}
  }
  private rememberExtension(ext:Electron.Extension){
    const previous=this.data.extensions.find(e=>e.id===ext.id);
    const source=resolve(ext.path).startsWith(resolve(this.extensionsPath)+sep)?"store":"unpacked";
    const record:ExtensionRecord={id:ext.id,name:ext.name,version:ext.version,path:ext.path,enabled:true,source,permissions:extensionPermissions(ext.manifest)};
    if(previous)Object.assign(previous,record,{error:undefined});else this.data.extensions.push(record);this.touch();
  }
  private uniquePath(name:string){
    const folder=this.data.config.downloadDirectory;mkdirSync(folder,{recursive:true});
    const safe=basename(name).replace(/[<>:"/\\|?*\x00-\x1f]/g,"_") || "download";
    const extension=extname(safe);const stem=safe.slice(0,safe.length-extension.length);
    let path=join(folder,safe);let i=1;while(existsSync(path)||this.reserved.has(path))path=join(folder,`${stem} (${i++})${extension}`);
    this.reserved.add(path);return path;
  }
  private trackDownload(item:Electron.DownloadItem){
    const record:DownloadRecord={id:randomUUID(),name:item.getFilename(),url:item.getURL(),path:"",received:0,total:item.getTotalBytes(),state:"progressing",paused:false,resumable:false,startedAt:Date.now()};
    if(this.data.config.askDownloadLocation)item.setSaveDialogOptions({defaultPath:join(this.data.config.downloadDirectory,basename(record.name))});
    else {record.path=this.uniquePath(record.name);item.setSavePath(record.path);}
    this.items.set(record.id,item);this.data.downloads.unshift(record);this.touch();
    const update=()=>{record.path=item.getSavePath();record.received=item.getReceivedBytes();record.total=item.getTotalBytes();record.paused=item.isPaused();record.resumable=item.canResume();record.state=item.getState();this.touch();};
    item.on("updated",update);
    item.once("done",(_event,state)=>{update();record.state=state;record.paused=false;record.resumable=false;this.items.delete(record.id);this.reserved.delete(record.path);this.touch();});
  }
  async refreshSiteData(){
    const cookies=await this.session.cookies.get({});const counts=new Map<string,number>();
    for(const cookie of cookies){const key=`${cookie.secure?"https":"http"}://${(cookie.domain ?? "").replace(/^\./,"")}`;counts.set(key,(counts.get(key)??0)+1);}
    this.data.siteData=[...counts].map(([origin,cookies])=>({origin,cookies})).sort((a,b)=>a.origin.localeCompare(b.origin));
  }
  async command(action:BrowserProfileCommand){
    if(action.type==="browser.settings"){
      const config=browserConfigSchema.parse({...this.data.config,...action.values});
      if(config.proxyMode==="fixed_servers" && !config.proxyRules.trim())throw new Error("Enter a proxy server");
      if(config.languages.some(l=>!this.session.availableSpellCheckerLanguages.includes(l)))throw new Error("Choose supported spellcheck languages");
      const old=this.data.config;this.data.config=config;try{await this.applyConfig(config.proxyMode!==old.proxyMode || config.proxyRules!==old.proxyRules || config.proxyBypass!==old.proxyBypass);}catch(error){this.data.config=old;await this.applyConfig();throw error;}
    }else if(action.type==="browser.download-folder"){
      const result=await dialog.showOpenDialog(this.window,{defaultPath:this.data.config.downloadDirectory,properties:["openDirectory","createDirectory"]});if(!result.canceled){this.data.config.downloadDirectory=result.filePaths[0];await this.applyConfig(false);}
    }else if(action.type==="download.action"){
      const record=this.data.downloads.find(d=>d.id===action.id);if(!record)throw new Error("Download not found");const item=this.items.get(record.id);
      if(action.action==="pause"){if(!item)throw new Error("Download is not active");item.pause();record.paused=true;}
      if(action.action==="resume"){if(!item || !item.canResume())throw new Error("This download cannot resume. Use retry.");item.resume();record.paused=false;}
      if(action.action==="cancel"){item?.cancel();}
      if(action.action==="retry"){if(record.state==="progressing")throw new Error("Download is already active");this.session.downloadURL(record.url);}
      if(action.action==="show" && record.path)shell.showItemInFolder(record.path);
      if(action.action==="open"){if(record.state!=="completed" || !existsSync(record.path))throw new Error("Downloaded file is unavailable");const error=await shell.openPath(record.path);if(error)throw new Error(error);}
      if(action.action==="remove"){if(item)throw new Error("Cancel the download first");this.data.downloads=this.data.downloads.filter(d=>d.id!==record.id);}
    }else if(action.type==="site.permission"){
      this.once.clear();
      if(!origin(action.origin)||!origin(action.embeddingOrigin))throw new Error("Invalid site origin");
      this.data.permissions=this.data.permissions.filter(p=>!(p.origin===action.origin && p.embeddingOrigin===action.embeddingOrigin && p.permission===action.permission));
      this.data.permissions.push({origin:origin(action.origin),embeddingOrigin:origin(action.embeddingOrigin),permission:action.permission,decision:action.decision});
    }else if(action.type==="site.reset"){this.once.clear();this.data.permissions=this.data.permissions.filter(p=>p.origin!==action.origin);
    }else if(action.type==="browser.clear-data"){
      if(action.kind==="cache")await this.session.clearCache();
      else if(action.kind==="cookies")await this.session.clearStorageData({storages:["cookies"]});
      else {if(!action.origin || !origin(action.origin))throw new Error("Choose a site");await this.session.clearStorageData({origin:origin(action.origin)});}
      await this.refreshSiteData();
    }else if(action.type==="browser.refresh-data"){await this.refreshSiteData();
    }else if(action.type==="extension.load"){
      const result=await dialog.showOpenDialog(this.window,{title:"Load unpacked Chrome extension",properties:["openDirectory"]});if(result.canceled)return;
      const path=result.filePaths[0];const manifest=JSON.parse(await readFile(join(path,"manifest.json"),"utf8"));
      const answer=await dialog.showMessageBox(this.window,{type:"question",message:`Load ${manifest.name || "extension"}?`,detail:`${path}\n\nPermissions:\n${extensionPermissions(manifest).join("\n") || "None listed"}`,buttons:["Cancel","Load extension"],defaultId:0,cancelId:0,noLink:true});
      if(answer.response===1)await this.session.extensions.loadExtension(path);
    }else if(action.type==="extension.action"){
      const ext=this.data.extensions.find(e=>e.id===action.id);if(!ext)throw new Error("Extension not found");
      if(action.action==="disable"){this.session.extensions.removeExtension(ext.id);ext.enabled=false;}
      if(action.action==="enable"||action.action==="reload"){if(action.action==="reload")this.session.extensions.removeExtension(ext.id);try{await this.session.extensions.loadExtension(ext.path);ext.error=undefined;}catch(error){ext.error=String(error);ext.enabled=false;this.touch();throw error;}}
      if(action.action==="remove"){if(ext.source==="store")await uninstallExtension(ext.id,{session:this.session,extensionsPath:this.extensionsPath});else this.session.extensions.removeExtension(ext.id);this.data.extensions=this.data.extensions.filter(e=>e.id!==ext.id);}
      if(action.action==="options"){const loaded=this.session.extensions.getExtension(ext.id);if(!loaded)throw new Error("Enable the extension first");const manifest=loaded.manifest;const page=manifest.options_ui?.page ?? manifest.options_page;if(!page)throw new Error("This extension has no options page");this.openPage(new URL(page,loaded.url).href);}
    }else if(action.type==="extension.update"){await updateExtensions(this.session);}
    this.touch();
  }
  touch(){if(this.stopping)return;this.changed();if(!this.timer)this.timer=setTimeout(()=>{this.timer=undefined;this.save();},400);}
  save(){mkdirSync(app.getPath("userData"),{recursive:true});const {config,downloads,permissions,extensions}=this.data;writeFileSync(`${this.file}.tmp`,JSON.stringify({config,downloads,permissions,extensions}),"utf8");renameSync(`${this.file}.tmp`,this.file);}
  dispose(){this.stopping=true;if(this.timer)clearTimeout(this.timer);for(const item of this.items.values())item.cancel();this.save();}
}
