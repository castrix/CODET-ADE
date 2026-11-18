import type {ConnectorCommand,ConnectorStatus} from './connectors';
export type PermissionMode="read-only"|"workspace-write"|"full-access";
export type Attachment={id:string;name:string;path:string;kind:"image"|"text";size:number};
import type {BrowserProfileSnapshot,BrowserProfileCommand} from "./browser-config";
export type Project = { id: string; name: string; folder?: string; collapsed?: boolean; isUnassigned?:boolean };
export type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  attachments?:Attachment[];
};
export type TurnChanges={attribution?:"provider";fileStats?:Record<string,{added:number;removed:number;reverted:boolean;approved?:boolean}>;id:string;conversationId:string;projectId:string;prompt:string;createdAt:number;files:string[];state:"recording"|"ready"|"reverted";skipped?:number};
export type Conversation = {
  editorAttachment?:string;
  id: string;
  projectId: string;
  title: string;
  permissionMode?:PermissionMode;
  updatedAt?: number;
  providerId?:string;
  acpSessionId?:string;
  providerOptions?:Record<string,string>;
  providerMode?:string;
  providerModes?:{id:string;name:string;description?:string}[];
  providerCommands?:{name:string;description:string}[];
  threadId?: string;
  browserTools?: boolean;
  browserToolsVersion?: number;
  contextEdited?: boolean;
  previousThreadIds?: string[];
  messages: Message[];
  model?: string;
  effort?: string;
  status: "idle" | "running" | "error";
  turnId?: string;
};
export type BrowserResource = {
  id: string;
  projectId: string;
  title: string;
  url: string;
  error?: string;
  loading?: boolean;
  canBack?: boolean;
  canForward?: boolean;
  webContentsId?: number;
};
export type WorkTab = {
  groupId?: string;
  id: string;
  projectId: string;
  kind: "chat" | "browser" | "launcher" | "file" | "ide" | "terminal";
  terminalOwner?:string;
  terminalPlacement?:"tab"|"panel";
  terminalProfile?:string;
  terminalTitle?:string;
  filePath?: string;
  editorRevision?:number;
  diffStaged?:boolean;
  turnChangeId?:string;
  line?: number;
  resourceId?: string;
  conversationId?: string;
};
export type TabGroup = {id:string; name:string; color:string; collapsed:boolean};
export type Preferences = { sidebarExpanded:boolean; fontSize:number; rememberHistory:boolean; openLinksInNewTab:boolean };
export type HistoryEntry = {url:string;title:string;visitedAt:number};
export type Workspace = {
  groups: TabGroup[];
  preferences: Preferences;
  browserHistory: HistoryEntry[];
  version: 1;
  projects: Project[];
  conversations: Conversation[];
  browsers: BrowserResource[];
  tabs: WorkTab[];
  activeTabId?: string;
  activeProjectId: string;
};
export type Approval = {
  id: string | number;
  conversationId: string;
  method: string;
  detail: string;
  questions?:{id:string;prompt:string;options:{id:string;label:string}[];allowMultiple?:boolean}[];
};
export type ProviderStatus = {
  connected: boolean;
  account: string;
  error?: string;
  models: {
    id: string;
    label: string;
    efforts: { level: string; description: string }[];
    defaultEffort: string;
    isDefault: boolean;
  }[];
};
export type Snapshot = {
  turnChanges:TurnChanges[];
  editorAttachment:{conversationId?:string;mode:string;selected?:string;options:{id:string;path:string;staged?:boolean;turnChangeId?:string}[]};
  connectors:ConnectorStatus[];
  browserProfile: BrowserProfileSnapshot;
  workspace: Workspace;
  provider: ProviderStatus;
  approvals: Approval[];
  browserControl: { conversationId: string; browserId: string }[];
};
export type Command =
  | {type:"terminal.create";projectId:string;profileId?:string;sourceTabId?:string;placement?:"tab"|"panel"}
  | ConnectorCommand
  | BrowserProfileCommand
  | {type:"editor.attach";conversationId:string;value:string}
  | {type:"turn.approve";id:string;path:string}
  | {type:"turn.revert";id:string;path:string}
  | {type:"turn.open";id:string;path:string;sourceTabId:string}
  | {type:"editor.view";tabId:string;path?:string;staged?:boolean;dirty?:boolean;turnChangeId?:string}
  | {type:"editor.open";projectId:string;path:string;line?:number;sourceTabId?:string;diffStaged?:boolean}
  | {type:"project.update";id:string;name:string;folderAction?:"keep"|"choose"|"clear";folderPath?:string|null}
  | {type:"tab.project";id:string;projectId:string}
  | {type:"group.update";id:string;name?:string;color?:string;collapsed?:boolean}
  | {type:"group.create";tabId:string}
  | {type:"group.move";id:string;targetId?:string;targetGroupId?:string;after?:boolean}
  | {type:"tab.move";id:string;targetId?:string;after?:boolean;groupId?:string|null}
  | {type:"preferences.update"; values:Partial<Preferences>}
  | {type:"history.clear"}
  | {type:"tab.menu"; id:string}
  | {type:"message.edit"; conversationId:string; messageId:string; text:string; model?:string; effort?:string; browserId?:string}
  | { type: "link.open"; sourceTabId?: string; target: string; projectId: string }
  | { type: "browser.release"; conversationId: string }
  | {
      type: "tab.launch";
      tabId?: string;
      projectId: string;
      mode: "chat" | "browser";
      text: string;
      model?: string;
      effort?: string;
      attachmentIds?:string[];
      permissionMode?:PermissionMode;
    }
  | { type: "project.create"; name: string; folder?: boolean; folderPath?:string; startChat?:boolean }
  | {type:"project.collapse";id:string;collapsed:boolean}
  | { type: "project.select"; id: string }
  | { type: "tab.create"; kind: WorkTab["kind"]; projectId: string }
  | { type: "tab.select" | "tab.close"; id: string }
  | { type: "chat.open"; id: string }
  | { type: "chat.attach"; tabId: string; conversationId?: string }
  | {
      type: "chat.send";
      id: string;
      text: string;
      model?: string;
      effort?: string;
      attachmentIds?:string[];
      permissionMode?:PermissionMode;
      browserId?: string;
    }
  | { type: "chat.stop"; id: string }
  | { type: "provider.connect" | "provider.login" }
  | { type: "approval.respond"; id: string | number; accept: boolean; answers?:{questionId:string;selectedOptionIds:string[]}[] }
  | { type: "browser.navigate"; id: string; url: string }
  | { type: "browser.back" | "browser.forward" | "browser.reload"; id: string };
export type Bounds = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
} | null;
export interface DesktopApi {
  terminal(action:import("./terminal-types").TerminalAction):Promise<any>;
  onTerminalEvent(listener:(event:import("./terminal-types").TerminalEvent)=>void):()=>void;
  pickAttachments():Promise<Attachment[]>;
  importAttachment(name:string,bytes:Uint8Array):Promise<Attachment>;
  attachmentPreview(id:string):Promise<string>;
  pickProjectFolder():Promise<string|null>;
  snapshot(): Promise<Snapshot>;
  command(command: Command): Promise<void>;
  browserBounds(bounds: Bounds): Promise<void>;
  editor(action:import("./editor-types").EditorAction):Promise<any>;
  onEditorEvent(listener:(event:import("./editor-types").EditorEvent)=>void):()=>void;
  readClipboardText():Promise<string>;
  copyText(text:string):Promise<void>;
  onShortcut(listener:(shortcut:string)=>void):()=>void;
  readFile(tabId: string): Promise<{path: string; text: string}>;
  subscribe(listener: (snapshot: Snapshot) => void): () => void;
}
declare global {
  interface Window {
    dao: DesktopApi;
  }
}
