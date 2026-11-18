import {BrowserProfile} from "./browser-profile";
import {ElectronChromeExtensions} from "electron-chrome-extensions";
import {dialog} from "electron";
import { BrowserWindow, WebContentsView, session, Menu, clipboard, shell } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { browserAction } from "./browser-tools";
import type { Bounds, Workspace } from "../src/shared";
import { normalizeUrl, newTab, groupWithSource, closeTab } from "./workspace";
export class BrowserManager {
  readonly profile:BrowserProfile;
  private extensions:ElectronChromeExtensions;
  private views = new Map<string, WebContentsView>();
  private observations = new Map<string, string>();
  constructor(
    private window: BrowserWindow,
    private state: Workspace,
    private changed: () => void,
  ) {
    this.profile=new BrowserProfile(window,changed,url=>this.openTab(url));
    this.extensions=new ElectronChromeExtensions({session:this.profile.session,
      createTab:async details=>{const tab=this.openTab(details.url || this.profile.data.config.homepage,details.active!==false);return [this.ensure(tab.resourceId!).webContents,this.window];},
      selectTab:wc=>{const tab=this.state.tabs.find(t=>this.views.get(t.resourceId ?? "")?.webContents===wc);if(tab){this.state.activeTabId=tab.id;this.state.activeProjectId=tab.projectId;this.layout(null);this.changed();}},
      removeTab:wc=>{const tab=this.state.tabs.find(t=>this.views.get(t.resourceId ?? "")?.webContents===wc);if(tab){this.close(tab.resourceId!);closeTab(this.state,tab.id);this.changed();}},
      requestPermissions:async(extension,permissions)=>{const result=await dialog.showMessageBox(this.window,{type:"question",message:`Allow additional permissions for ${extension.name}?`,detail:[...(permissions.permissions ?? []),...(permissions.origins ?? [])].join("\n"),buttons:["Deny","Allow"],defaultId:0,cancelId:0,noLink:true});return result.response===1;},
    });
    ElectronChromeExtensions.handleCRXProtocol(session.defaultSession);
  }
  async initialize(){try{await this.profile.initialize();}catch(error){this.profile.data.error=String(error);this.profile.touch();}}
  normalize(input:string){
    if(input.startsWith("chrome-extension:")){
      const url=new URL(input);if(!this.profile.session.extensions.getExtension(url.hostname))throw new Error("Extension is disabled or unavailable");return url.href;
    }
    return normalizeUrl(input,this.profile.data.config.searchEngine);
  }
  private openTab(url:string,activate=true){
    const target=this.normalize(url);const source=this.state.tabs.find(t=>t.id===this.state.activeTabId);
    const previous=this.state.activeTabId;const tab=newTab(this.state,source?.projectId ?? this.state.activeProjectId,"browser");
    this.state.browsers.find(b=>b.id===tab.resourceId)!.url=target;groupWithSource(this.state,tab,source?.id);
    if(!activate)this.state.activeTabId=previous;else this.layout(null);
    this.changed();return tab;
  }
  applySettings(){for(const view of this.views.values())view.webContents.setZoomFactor(this.profile.data.config.zoom);}

  ensure(id: string, popupOptions?: Electron.BrowserWindowConstructorOptions) {
    const existing = this.views.get(id);
    if (existing) return existing;
    const resource = this.state.browsers.find((b) => b.id === id);
    if (!resource) throw new Error("Browser not found");
    const view = new WebContentsView({
      // Electron supplies the pre-created popup WebContents on the options object.
      ...popupOptions,
      webPreferences: {
        ...popupOptions?.webPreferences,
        preload: join(__dirname, "browser-preload.cjs"),
        partition: "persist:dao-browser",
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    view.setBackgroundColor("#0a0a0a");
    this.views.set(id, view);
    this.window.contentView.addChildView(view);
    view.setVisible(false);
    const wc = view.webContents;
    resource.webContentsId=wc.id;
    wc.once("destroyed", () => {
      if (this.views.get(id) !== view) return;
      this.views.delete(id);
      this.observations.delete(id);
      const tab = this.state.tabs.find(t => t.resourceId === id);
      if (tab) { closeTab(this.state, tab.id); this.changed(); }
    });
    this.extensions.addTab(wc,this.window);
    wc.setZoomFactor(this.profile.data.config.zoom);
    const update = () => {
      if (wc.isDestroyed()) return;
      resource.url = wc.getURL() || resource.url;
      resource.title = wc.getTitle() || "Browser";
      resource.loading = wc.isLoading();
      resource.canBack = wc.navigationHistory.canGoBack();
      resource.canForward = wc.navigationHistory.canGoForward();
      this.changed();
    };
    wc.on("did-start-navigation", (_event, _url, _inPlace, isMainFrame) => { if (isMainFrame) {this.observations.delete(id);this.profile.forgetPage(wc);} });
    const recordVisit=()=>{
      const url=wc.getURL(); if(!this.state.preferences.rememberHistory || !/^https?:/.test(url)) return;
      this.state.browserHistory=this.state.browserHistory.filter(h=>h.url!==url);
      this.state.browserHistory.unshift({url,title:wc.getTitle() || url,visitedAt:Date.now()});
      this.state.browserHistory=this.state.browserHistory.slice(0,2000); this.changed();
    };
    wc.on("did-navigate", ()=>{update();recordVisit();});
    wc.on("did-navigate-in-page", update);
    wc.on("page-title-updated", update);
    wc.on("did-start-loading", () => {
      resource.error = undefined;
      update();
    });
    wc.on("did-stop-loading", ()=>{update();recordVisit();});
    wc.on("did-fail-load", (_e, code, description, _url, mainFrame) => {
      if (mainFrame && code !== -3) {
        resource.error = description;
        resource.loading = false;
        this.changed();
      }
    });
    wc.on("render-process-gone", () => {
      resource.error = "This page stopped. Reload to recover.";
      this.changed();
    });
    wc.on("will-navigate", (event, url) => {
      try {
        this.normalize(url);
      } catch {
        event.preventDefault();
      }
    });
    const openLink = (target: string) => {
      try {
        const url = this.normalize(target);
        const source = this.state.tabs.find(t => t.resourceId === id);
        if (!source) return;
        const tab = newTab(this.state, source.projectId, "browser");
        this.state.browsers.find(b => b.id === tab.resourceId)!.url = url;
        groupWithSource(this.state, tab, source.id);
        this.layout(null);
        this.changed();
      } catch {}
    };
    wc.on("context-menu", (_event,p)=>{
      const menu:Electron.MenuItemConstructorOptions[]=[];
      if(p.linkURL && /^https?:/.test(p.linkURL)) menu.push({label:"Open link in new tab",click:()=>openLink(p.linkURL)},{label:"Copy link address",click:()=>clipboard.writeText(p.linkURL)},{type:"separator"});
      const pageURL = URL.parse(wc.getURL());
      if (pageURL?.protocol === "https:" && !pageURL.username && !pageURL.password) {
        menu.push({label:"Open page in default browser for passkey sign-in…", click:async () => {
          try { await shell.openExternal(pageURL.href); }
          catch { dialog.showErrorBox("Could not open page", "Check your default browser in System Settings."); }
        }}, {type:"separator"});
      }
      if (p.isEditable && process.platform === "darwin") {
        const managers = [
          ["Apple Passwords", "/System/Applications/Passwords.app"],
          ["1Password", "/Applications/1Password.app"],
          ["Bitwarden", "/Applications/Bitwarden.app"],
          ["KeePassXC", "/Applications/KeePassXC.app"],
        ].filter(([, path]) => existsSync(path));
        for (const [name, path] of managers) {
          menu.push({label: `Open ${name}…`, click: async () => {
            const error = await shell.openPath(path);
            if (error) dialog.showErrorBox(`Could not open ${name}`, error);
          }});
        }
        if (managers.length) menu.push({type:"separator"});
      }
      if(p.isEditable) menu.push({role:"undo"},{role:"redo"},{type:"separator"},{role:"cut"},{role:"copy"},{role:"paste"},{role:"selectAll"},{type:"separator"});
      else if(p.selectionText) menu.push({label:"Copy",click:()=>clipboard.writeText(p.selectionText)},{label:"Search selection",click:()=>openLink(`https://www.google.com/search?q=${encodeURIComponent(p.selectionText)}`)},{type:"separator"});
      if(p.srcURL && p.mediaType==="image") menu.push({label:"Open image in new tab",click:()=>openLink(p.srcURL)},{label:"Copy image",click:()=>wc.copyImageAt(p.x,p.y)},{label:"Copy image address",click:()=>clipboard.writeText(p.srcURL)},{type:"separator"});
      menu.push({label:"Back",enabled:wc.navigationHistory.canGoBack(),click:()=>wc.navigationHistory.goBack()},{label:"Forward",enabled:wc.navigationHistory.canGoForward(),click:()=>wc.navigationHistory.goForward()},{label:"Reload",click:()=>wc.reload()},{label:"Copy page URL",click:()=>clipboard.writeText(wc.getURL())},{type:"separator"},{label:"Zoom in",click:()=>wc.setZoomLevel(Math.min(5,wc.getZoomLevel()+.5))},{label:"Zoom out",click:()=>wc.setZoomLevel(Math.max(-5,wc.getZoomLevel()-.5))},{label:"Reset zoom",click:()=>wc.setZoomLevel(0)},{label:"Inspect element",click:()=>wc.inspectElement(p.x,p.y)});
      if(p.linkURL && /^https?:/.test(p.linkURL))menu.push({label:"Save link as...",click:()=>wc.downloadURL(p.linkURL)});
      if(p.srcURL && p.mediaType==="image")menu.push({label:"Save image as...",click:()=>wc.downloadURL(p.srcURL)});
      if(p.misspelledWord){for(const word of p.dictionarySuggestions.slice(0,5))menu.unshift({label:word,click:()=>wc.replaceMisspelling(word)});menu.push({label:"Add to dictionary",click:()=>this.profile.session.addWordToSpellCheckerDictionary(p.misspelledWord)});}
      menu.push({label:"Print...",click:()=>wc.print({})});
      const native=Menu.buildFromTemplate(menu);for(const item of this.extensions.getContextMenuItems(wc,p))native.append(item);native.popup({window:this.window});
    });
    wc.ipc.on("dao:link-preference", event => {
      event.returnValue = event.senderFrame === wc.mainFrame && this.state.preferences.openLinksInNewTab;
    });
    // Let Chromium create the navigation: replaying only its URL loses POST data,
    // opener relationships and redirect state used by authentication popups.
    wc.setWindowOpenHandler(({ url }) => {
      try { if(url!=="about:blank")this.normalize(url); } catch { return {action:"deny"}; }
      return {action:"allow",outlivesOpener:true,createWindow:options=>{
        const source=this.state.tabs.find(t=>t.resourceId===id);
        const tab=newTab(this.state,source?.projectId ?? this.state.activeProjectId,"browser");
        this.state.browsers.find(b=>b.id===tab.resourceId)!.url=url;
        groupWithSource(this.state,tab,source?.id);
        const child=this.ensure(tab.resourceId!,options);
        this.layout(null);this.changed();
        return child.webContents;
      }};
    });
    if(!popupOptions)void wc.loadURL(resource.url === "about:blank" ? resource.url : this.normalize(resource.url)).catch(() => {});
    return view;
  }
  layout(bounds: Bounds) {
    for (const view of this.views.values()) view.setVisible(false);
    if (!bounds) return;
    const view = this.ensure(bounds.id);
    view.setBounds({
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.max(1, Math.round(bounds.width)),
      height: Math.max(1, Math.round(bounds.height)),
    });
    view.setVisible(true);
    this.extensions.selectTab(view.webContents);
  }
  navigate(id: string, url: string) {
    void this.ensure(id)
      .webContents.loadURL(this.normalize(url))
      .catch(() => {});
  }
  action(id: string, action: string) {
    const wc = this.ensure(id).webContents;
    if (action === "browser.reload") wc.reload();
    else if (action === "browser.back" && wc.navigationHistory.canGoBack())
      wc.navigationHistory.goBack();
    else if (
      action === "browser.forward" &&
      wc.navigationHistory.canGoForward()
    )
      wc.navigationHistory.goForward();
  }
  async tool(id: string, raw: unknown) {
    const args = browserAction.parse(raw);
    const wc = this.ensure(id).webContents;
    const evaluate = (code: string) => wc.executeJavaScriptInIsolatedWorld(998, [{code}], true);
    const textResult = (value: unknown) => ({ success: true, contentItems: [{type: "inputText", text: JSON.stringify(value)}] });
    if(args.action === "inspect" || args.action === "screenshot") {
      const snapshot = randomUUID(); this.observations.set(id, snapshot);
      if(args.action === "screenshot") {
        const bounds = this.views.get(id)!.getBounds();
        const capture = (await wc.capturePage()).resize({width:bounds.width,height:bounds.height});
        if(capture.isEmpty()) throw new Error("Page image unavailable; open the attached tab and retry");
        return {success: true, contentItems: [{type:"inputText", text:JSON.stringify({snapshot,url:wc.getURL(),width:capture.getSize().width,height:capture.getSize().height})}, {type:"inputImage", imageUrl:capture.toDataURL()}]};
      }
      const data = await evaluate(`(() => {
        const visible = e => { const r=e.getBoundingClientRect(); const s=getComputedStyle(e); return r.width>0 && r.height>0 && s.visibility!=="hidden" && s.display!=="none"; };
        const nodes = Array.from(document.querySelectorAll('a,button,input,textarea,select,[role="button"],[contenteditable="true"],[tabindex]')).filter(visible).slice(0,250);
        globalThis.__daoObservation = { token: ${JSON.stringify(snapshot)}, nodes };
        return { title:document.title, url:location.href, snapshot:${JSON.stringify(snapshot)}, text:document.body?.innerText.slice(0,24000) ?? "", elements:nodes.map((e,i)=>({ref:String(i+1),tag:e.tagName.toLowerCase(),role:e.getAttribute('role'),type:e.getAttribute('type'),name:(e.getAttribute('aria-label') || e.labels?.[0]?.innerText || e.innerText || e.getAttribute('placeholder') || e.getAttribute('name') || '').slice(0,180),href:e.getAttribute('href'), value:e.type==='password' ? '[redacted]' : typeof e.value==='string' ? e.value.slice(0,300):undefined})), crossOriginFrames:document.querySelectorAll('iframe').length };
      })()`);
      return textResult(data);
    }
    if(args.action === "navigate") {
      if(!args.url) throw new Error('URL is required');
      this.observations.delete(id); await wc.loadURL(this.normalize(args.url));
    } else if(args.action === 'back') {
      this.observations.delete(id);
      if(wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
    } else {
      if(!args.snapshot || this.observations.get(id)!==args.snapshot) throw new Error('Observation expired. Inspect or screenshot the attached tab again.');
      if(args.action === 'click' && args.x !== undefined && args.y !== undefined) {
        const bounds=this.views.get(id)!.getBounds();
        if(args.x>=bounds.width || args.y>=bounds.height) throw new Error('Coordinates outside viewport');
        wc.sendInputEvent({type:'mouseDown',x:Math.round(args.x),y:Math.round(args.y),button:'left',clickCount:1});
        wc.sendInputEvent({type:'mouseUp',x:Math.round(args.x),y:Math.round(args.y),button:'left',clickCount:1});
      } else if(args.action === 'click' || args.action === 'fill') {
        if(!args.ref) throw new Error('Element ref is required');
        await evaluate(`(() => {
          const args=${JSON.stringify(args)}; const observation=globalThis.__daoObservation;
          if(!observation || observation.token!==args.snapshot) throw new Error('Inspect again before using element refs');
          const element=observation.nodes[Number(args.ref)-1];
          if(!element?.isConnected) throw new Error('Element is no longer present');
          element.scrollIntoView({block:'center'}); element.focus();
          if(args.action==='click') element.click();
          else {
            if(element instanceof HTMLInputElement && ['file','password'].includes(element.type)) throw new Error('Enter passwords or file uploads yourself');
            if(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
              const setter=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element),'value')?.set;
              if(!setter) throw new Error('Element is not editable'); setter.call(element,args.text ?? '');
            } else if(element.isContentEditable) element.textContent=args.text ?? '';
            else throw new Error('Element is not editable');
            element.dispatchEvent(new Event('input',{bubbles:true})); element.dispatchEvent(new Event('change',{bubbles:true}));
          }
        })()`);
      } else if(args.action==='press') {
        if(!args.key) throw new Error('Key is required');
        const key=({ArrowDown:'Down',ArrowUp:'Up',ArrowLeft:'Left',ArrowRight:'Right'} as Record<string,string>)[args.key] ?? args.key;
        wc.sendInputEvent({type:'keyDown',keyCode:key}); wc.sendInputEvent({type:'keyUp',keyCode:key});
      } else if(args.action==='scroll') await evaluate(`window.scrollBy(0,${JSON.stringify(args.deltaY ?? 650)})`);
      this.observations.delete(id);
    }
    return textResult({url:wc.getURL(), action:args.action, message:'Action dispatched. Inspect or screenshot again to observe the result.'});
  }
  close(id: string) {
    const view = this.views.get(id);
    if (!view) return;
    this.views.delete(id);
    this.window.contentView.removeChildView(view);
    this.profile.forgetPage(view.webContents);
    this.extensions.removeTab(view.webContents);
    view.webContents.close();
    this.observations.delete(id);
  }
  dispose() {
    this.profile.dispose();
    for (const id of [...this.views.keys()]) this.close(id);
  }
}
