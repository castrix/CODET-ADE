import {injectBrowserAction} from "electron-chrome-extensions/browser-action";
import { contextBridge, ipcRenderer } from "electron";
import type { DesktopApi, Snapshot } from "../src/shared";
const api: DesktopApi = {
  terminal:action=>ipcRenderer.invoke("dao:terminal",action),
  onTerminalEvent:listener=>{const handler=(_event:unknown,event:any)=>listener(event);ipcRenderer.on("dao:terminal-event",handler);return ()=>ipcRenderer.removeListener("dao:terminal-event",handler);},
  importAttachment:(name,bytes)=>ipcRenderer.invoke("dao:attachment-import",name,bytes),
  attachmentPreview:id=>ipcRenderer.invoke("dao:attachment-preview",id),
  pickProjectFolder:()=>ipcRenderer.invoke("dao:project-folder"),
  pickAttachments:()=>ipcRenderer.invoke("dao:attachments"),
  readClipboardText:()=>ipcRenderer.invoke("dao:clipboard-text"),
  copyText: text=>ipcRenderer.invoke("dao:copy",text),
  onShortcut: listener=>{const handler=(_event:unknown,key:string)=>listener(key);ipcRenderer.on("dao:shortcut",handler);return ()=>{ipcRenderer.removeListener("dao:shortcut",handler);};},
  readFile: tabId => ipcRenderer.invoke("dao:read-file", tabId),
  snapshot: () => ipcRenderer.invoke("dao:snapshot"),
  command: (command) => ipcRenderer.invoke("dao:command", command),
  editor: action=>ipcRenderer.invoke("dao:editor",action),
  onEditorEvent: listener=>{const handler=(_event:unknown,p:any)=>listener(p);ipcRenderer.on("dao:editor-event",handler);return ()=>ipcRenderer.removeListener("dao:editor-event",handler);},
  browserBounds: (bounds) => ipcRenderer.invoke("dao:browser-bounds", bounds),
  subscribe: (listener) => {
    const handler = (_event: unknown, snapshot: Snapshot) => listener(snapshot);
    ipcRenderer.on("dao:changed", handler);
    return () => ipcRenderer.removeListener("dao:changed", handler);
  },
};
contextBridge.exposeInMainWorld("dao", api);

injectBrowserAction();
