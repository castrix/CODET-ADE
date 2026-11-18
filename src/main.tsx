import {AgentActivity} from "./AgentActivity";
import {EditorAttachments} from './EditorAttachments';
import {TurnChangesPanel} from './TurnChangesPanel';
import {ProjectInspector} from "./ProjectInspector";
import {TerminalPanel} from "./TerminalPanel";
import {AgentApproval} from "./AgentApproval";
import {lazy,Suspense} from "react";
const TerminalPane=lazy(()=>import("./TerminalPane"));
const EditorPane=lazy(()=>import("./EditorPane"));
import {AttachmentPreview} from "./AttachmentPreview";
import {Composer} from "./Composer";
import type {Attachment,PermissionMode} from "./shared";
import {Dropdown} from "./Dropdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  GitBranch,
  TerminalSquare,
  ChevronDown,
  Download,
  Shield,
  Puzzle,
  Copy,
  Check,
  Pencil,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Folder,
  Globe2,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Square,
  X,
  PanelRightClose,
  PanelLeft,
  PanelRight,
  Sparkles,
} from "lucide-react";
import type { Command, Conversation, Snapshot, WorkTab, Project } from "./shared";
import "@fontsource-variable/geist";
import "./styles.css";
import {ProjectModal,ProjectTree,RecentConversations} from "./Projects";
import {TabStrip} from "./TabStrip";
import {ModelPicker} from "./ModelPicker";
import {Settings,Spotlight} from "./WorkspaceTools";

function App() {
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [error, setError] = useState("");
  const [editingProject,setEditingProject]=useState<Project>();
  const [projectForm, setProjectForm] = useState(false);
  const [filter, setFilter] = useState("");
  const [settings, setSettings] = useState(false);
  const [settingsSection,setSettingsSection]=useState("General");
  const [settingsSite,setSettingsSite]=useState<string>();
  const [palette,setPalette]=useState(false);
  const [paletteQuery,setPaletteQuery]=useState("");
  const [groupOverlay,setGroupOverlay]=useState(false);

  const [chatTools,setChatTools]=useState<Record<string,"terminal"|"files"|"git"|undefined>>({});
  const [openPanels, setOpenPanels] = useState<Record<string, boolean>>({});
  const [address, setAddress] = useState("");
  const browserHost = useRef<HTMLDivElement>(null);
  async function run(command: Command) {
    setError("");
    try {
      await window.dao.command(command);
    } catch (e) {
      setError(
        String(e).replace(
          /^Error: Error invoking remote method '[^']+': Error: /,
          "",
        ),
      );
    }
  }
  useEffect(() => {
    if (!window.dao) {
      setError(
        "Open DAO ADE with npm run dev or npm start. The desktop bridge is required.",
      );
      return;
    }
    const unsubscribe = window.dao.subscribe(setSnapshot);
    void window.dao
      .snapshot()
      .then(setSnapshot)
      .catch((e) => setError(String(e)));
    return unsubscribe;
  }, []);
  const state = snapshot?.workspace;
  const sidebar=state?.preferences.sidebarExpanded ?? true;
  const setSidebar=(value:boolean)=>void run({type:"preferences.update",values:{sidebarExpanded:value}});
  const tab = state?.tabs.find((t) => t.id === state.activeTabId);
  const panelKey = tab?.groupId ?? tab?.id;
  const dock = panelKey ? (openPanels[panelKey] ?? (tab?.kind === "ide"||tab?.kind === "terminal")) : false;
  const setDock = (open: boolean) => {
    if (panelKey) setOpenPanels((previous) => ({ ...previous, [panelKey]: open }));
  };
  const project = state?.projects.find((p) => p.id === state.activeProjectId);
  const folderChat=tab?.kind==="chat"&&!!project?.folder;
  const chatTool=tab?chatTools[tab.id]:undefined;
  const toggleChatTool=(tool:"terminal"|"files"|"git")=>{if(tab)setChatTools(old=>({...old,[tab.id]:old[tab.id]===tool?undefined:tool}));};
  const browser = state?.browsers.find((b) => b.id === tab?.resourceId);
  const conversation = state?.conversations.find(
    (c) => c.id === tab?.conversationId,
  );
  useEffect(() => {
    setAddress(browser?.url ?? "");
  }, [browser?.id, browser?.url]);
  useEffect(() => {
    if (!window.dao) return;
    if (
      tab?.kind !== "browser" ||
      !browserHost.current ||
      !browser ||
      settings || palette || groupOverlay || projectForm
    ) {
      void window.dao.browserBounds(null);
      return;
    }
    const element = browserHost.current;
    const resize = () => {
      const r = element.getBoundingClientRect();
      void window.dao
        .browserBounds({
          id: browser.id,
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
        })
        .catch((e) => setError(String(e)));
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    return () => {
      observer.disconnect();
      void window.dao.browserBounds(null);
    };
  }, [tab?.id, browser?.id, dock, settings, sidebar, palette, groupOverlay, projectForm]);
  useEffect(()=>{
    const open=(event:Event)=>{setPaletteQuery((event as CustomEvent<{query?:string}>).detail?.query ?? "");setPalette(true);};window.addEventListener("dao:palette",open);
    const unsubscribe=window.dao.onShortcut(key=>{
      if(key==="terminal"){if(folderChat)toggleChatTool("terminal");else window.dispatchEvent(new CustomEvent("dao:terminal-panel"));}
      if(key==="p" || key==="l") {setPaletteQuery("");setPalette(true);}
      if(key===",") setSettings(value=>!value);
      if(key==="j"){setSettingsSection("Downloads");setSettings(true);}
      if(key==="t" && state) void run({type:"tab.create",projectId:"unassigned",kind:"launcher"});
      if(key==="w" && tab) void run({type:"tab.close",id:tab.id});
      if(key==="r" && browser) void run({type:"browser.reload",id:browser.id});
    });
    return ()=>{unsubscribe();window.removeEventListener("dao:palette",open);};
  },[state?.activeProjectId,tab?.id,browser?.id,folderChat]);
  useEffect(()=>{document.documentElement.style.setProperty("--chat-font-size",`${state?.preferences.fontSize ?? 13}px`);},[state?.preferences.fontSize]);
  if (!snapshot || !state || !project)
    return (
      <div className="boot">
        <div className="logo">d.</div>
        <p>{error || "Opening your workspace…"}</p>
      </div>
    );
  const create = (kind: "chat" | "browser" | "launcher") =>
    run({ type: "tab.create", kind, projectId: "unassigned" });
  const title = (t: (typeof state.tabs)[number]) =>
    t.kind === "terminal" ? (t.terminalTitle??"Terminal") :
    t.kind === "ide" ? `${state.projects.find(p=>p.id===t.projectId)?.name ?? "Project"} · Editor` :
    t.kind === "file" ? (t.filePath?.split(/[\\/]/).pop() ?? "File") :
    t.kind === "launcher"
      ? "New tab"
      : t.kind === "browser"
        ? (state.browsers.find((b) => b.id === t.resourceId)?.title ??
          "Browser")
        : (state.conversations.find((c) => c.id === t.conversationId)?.title ??
          "Chat");
  return (
    <div className="app">
      {projectForm && <ProjectModal project={editingProject} close={()=>setProjectForm(false)} onCreated={()=>{setProjectForm(false);setSettings(false);}}/>}
      {sidebar && (
        <aside className="sidebar">
          <div className="brand">
            <div className="logo">d.</div>
            <span>
              dao<span className="muted"> / </span>ade
            </span>
          </div>
          <button className="new-chat" onClick={() => void create("chat")}>
            <Plus size={17} /> New conversation <span>↗</span>
          </button>
          <div className="search">
            <Search size={14} />
            <input
              aria-label="Search conversations"
              placeholder="Find a conversation"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <div className="section-label">
            PROJECTS
            <button
              aria-label="Add project"
              title="Add project"
              onClick={() => {setEditingProject(undefined);setProjectForm(true);}}
            >
              <Plus size={14} />
            </button>
          </div>
          <ProjectTree onEdit={p=>{setEditingProject(p);setProjectForm(true);}} state={state} conversationId={conversation?.id} filter={filter} run={run} onOpen={()=>setSettings(false)}/>
          <RecentConversations state={state} conversationId={conversation?.id} filter={filter} run={run} onOpen={()=>setSettings(false)}/>
          <div className="sidebar-footer">
            <button onClick={() => setSettings(!settings)}>
              <Settings2 size={15} />
              <span>Settings</span>
              <span
                className={`status-dot ${snapshot.provider.connected ? "online" : ""}`}
              />
            </button>
          </div>
        </aside>
      )}
      <main>
        <div className="topbar">
          <button
            className="panel-toggle"
            title={sidebar ? "Hide navigation" : "Show navigation"}
            aria-label="Toggle navigation"
            aria-expanded={sidebar}
            onClick={() => setSidebar(!sidebar)}
          >
            <PanelLeft size={17} />
          </button>
          <TabStrip onOverlay={setGroupOverlay} state={state} run={run} title={title} create={()=>void create("launcher")}/>
          <div className="panel-actions"><button className="panel-toggle" title="New terminal" aria-label="New terminal" onClick={()=>folderChat?toggleChatTool("terminal"):void run({type:"tab.create",kind:"terminal",projectId:state.activeProjectId})}><TerminalSquare size={16}/></button>{folderChat&&<><button className="panel-toggle" aria-label="Toggle project files" title="Project files" aria-pressed={chatTool==="files"} onClick={()=>toggleChatTool("files")}><Folder size={16}/></button><button className="panel-toggle" aria-label="Toggle project Git" title="Project Git" aria-pressed={chatTool==="git"} onClick={()=>toggleChatTool("git")}><GitBranch size={16}/></button></>}
            <button
              className="panel-toggle"
              title="Settings"
              aria-label="Settings"
              aria-pressed={settings}
              onClick={() => setSettings(!settings)}
            >
              <Settings2 size={16} />
            </button>
            {(tab?.kind === "browser" || tab?.kind === "ide" || tab?.kind === "terminal") && (
              <button
                className="panel-toggle"
                title={dock ? "Hide chat panel" : "Show chat panel"}
                aria-label="Toggle chat panel"
                aria-expanded={dock}
                onClick={() => setDock(!dock)}
              >
                <PanelRight size={17} />
              </button>
            )}
          </div>
        </div>
        {error && (
          <div className="error-banner">
            <span>{error}</span>
            <button aria-label="Dismiss error" onClick={() => setError("")}>
              <X size={14} />
            </button>
          </div>
        )}
        <div className="work-content">{settings ? (
          <Settings snapshot={snapshot} run={async command=>{await run(command);if(command.type==="link.open")setSettings(false);}} close={()=>setSettings(false)} initialSection={settingsSection} site={settingsSite}/>
        ) : tab?.kind === "terminal" ? (
          <div className="browser-workspace"><section className="browser-column"><Suspense fallback={<div className="page-error">Opening terminal…</div>}><TerminalPane key={tab.id} tab={tab} run={run}/></Suspense></section>{dock && conversation && <section className="chat-dock"><Chat key={conversation.id} compact conversation={conversation} snapshot={snapshot} run={run}/></section>}</div>
        ) : tab?.kind === "ide" ? (
          <div className="browser-workspace"><section className="browser-column"><Suspense fallback={<div className="page-error">Opening editor…</div>}><EditorPane key={tab.id} tab={tab}/></Suspense></section>{dock && conversation && <section className="chat-dock"><Chat key={conversation.id} compact conversation={conversation} snapshot={snapshot} run={run}/></section>}</div>
        ) : tab?.kind === "file" ? (
          <TextReader key={tab.id} tab={tab} />
        ) : tab?.kind === "chat" && conversation ? (
          <div className="chat-workspace"><div className="chat-primary"><Chat
            key={conversation.id}
            browserId={tab.groupId ? state.tabs.find(t=>t.groupId===tab.groupId && t.kind==="browser")?.resourceId : undefined}
            conversation={conversation}
            snapshot={snapshot}
            run={run}
          /></div>{folderChat&&chatTool&&<aside className="chat-project-tools" aria-label="Chat project tools"><header className="chat-tools-header">{(["terminal","files","git"] as const).map(tool=><button key={tool} aria-pressed={chatTool===tool} onClick={()=>toggleChatTool(tool)}>{tool==="git"?"Git":tool[0].toUpperCase()+tool.slice(1)}</button>)}<button aria-label="Close project tools" onClick={()=>toggleChatTool(chatTool)}><X size={15}/></button></header>{chatTool==="terminal"?<TerminalPanel key={tab.id} state={state} run={run} ownerTabId={tab.id} onHide={()=>toggleChatTool("terminal")}/>:<ProjectInspector key={tab.projectId} sourceTabId={tab.id} projectId={tab.projectId} mode={chatTool} run={run}/>}</aside>}</div>
        ) : tab?.kind === "browser" && browser ? (
          <div className="browser-workspace">
            <section className="browser-column">
              <form
                className="addressbar"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run({
                    type: "browser.navigate",
                    id: browser.id,
                    url: address,
                  });
                }}
              >
                <button
                  type="button"
                  aria-label="Back"
                  disabled={!browser.canBack}
                  onClick={() =>
                    void run({ type: "browser.back", id: browser.id })
                  }
                >
                  <ArrowLeft size={16} />
                </button>
                <button
                  type="button"
                  aria-label="Forward"
                  disabled={!browser.canForward}
                  onClick={() =>
                    void run({ type: "browser.forward", id: browser.id })
                  }
                >
                  <ArrowRight size={16} />
                </button>
                <button
                  type="button"
                  aria-label="Reload"
                  onClick={() =>
                    void run({ type: "browser.reload", id: browser.id })
                  }
                >
                  <RefreshCw
                    size={14}
                    className={browser.loading ? "spin" : ""}
                  />
                </button>
                <button type="button" title="Site permissions" aria-label="Site permissions" onClick={()=>{try{setSettingsSite(new URL(browser.url).origin);}catch{}setSettingsSection("Site permissions");setSettings(true);}}><Shield size={14}/></button>
                <div className="address-field">
                  <Globe2 size={13} />
                  <input
                    aria-label="Browser address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                </div>
                <button aria-label="Navigate" type="submit">
                  <ArrowRight size={15} />
                </button>
                {React.createElement("browser-action-list",{partition:"persist:dao-browser",tab:browser.webContentsId?.toString(),alignment:"bottom right"})}
                <button type="button" title="Extensions" aria-label="Extensions" onClick={()=>{setSettingsSection("Extensions");setSettings(true);}}><Puzzle size={15}/></button>
                <button type="button" title="Downloads" aria-label="Downloads" onClick={()=>{setSettingsSection("Downloads");setSettings(true);}}><Download size={15}/>{snapshot.browserProfile.downloads.filter(d=>d.state==="progressing").length || ""}</button>
              </form>
              {browser.error && (
                <div className="page-error">{browser.error}</div>
              )}
              <div className="browser-host" ref={browserHost} />
            </section>
            {dock && (
              <section className="chat-dock">
                <div className="dock-header">
                  <MessageSquare size={14} />
                  <strong>Chat</strong>
                  <button title="Hide chat" onClick={() => setDock(false)}>
                    <PanelRightClose size={16} />
                  </button>
                </div>
                {conversation ? (
                  <>
                    <div className="conversation-picker">
                      <Dropdown label="Browser conversation" value={conversation.id}
                        onChange={id=>void run({type:"chat.attach",tabId:tab.id,conversationId:id})}
                        options={state.conversations.filter(c=>c.projectId===project.id && (c.id===conversation.id || c.messages.some(m=>m.role==="user"))).map(c=>({value:c.id,label:c.title}))}/>

                      <button
                        title="New companion conversation"
                        onClick={() =>
                          void run({ type: "chat.attach", tabId: tab.id })
                        }
                      >
                        <Plus size={15} />
                      </button>
                    </div>
                    <Chat
                      key={conversation.id}
                      compact
                      conversation={conversation}
                      snapshot={snapshot}
                      run={run}
                      browserId={browser.id}
                    />
                  </>
                ) : (
                  <div className="dock-empty" />
                )}
              </section>
            )}
          </div>
        ) : (
          <NewTab
            key={tab?.id ?? project.id}
            tabId={tab?.id}
            projectId={project.id}
            snapshot={snapshot}
            run={run}
          />
        )}
        </div>
        {folderChat?<div className="terminal-statusbar"><button onClick={()=>toggleChatTool("terminal")}><TerminalSquare size={13}/> Terminal</button></div>:<TerminalPanel state={state} run={run}/>}
        {palette && <Spotlight initialQuery={paletteQuery} snapshot={snapshot} run={run} close={()=>setPalette(false)} />}
      </main>
    </div>
  );
}

function ModelControls({
  snapshot,
  model,
  effort,
  setModel,
  setEffort,
}: {
  snapshot: Snapshot;
  model: string;
  effort: string;
  setModel: (model: string) => void;
  setEffort: (effort: string) => void;
}) {
  const requested = useRef(false);
  useEffect(() => {
    if (!snapshot.provider.connected && !requested.current) {
      requested.current = true;
      void window.dao.command({ type: "provider.connect" }).catch(() => {});
    }
  }, [snapshot.provider.connected]);
  const selected =
    snapshot.provider.models.find((m) => m.id === model) ??
    (model?{id:model,label:model.startsWith("acp:")?`${snapshot.connectors.find(p=>model.startsWith(`acp:${encodeURIComponent(p.id)}:`))?.name??"Agent"} · ${decodeURIComponent(model.split(":").slice(2).join(":"))=== "__default__"?"Agent default":decodeURIComponent(model.split(":").slice(2).join(":"))}`:model,efforts:[],defaultEffort:"",isDefault:false}:undefined) ??
    snapshot.provider.models.find((m) => m.isDefault) ?? snapshot.provider.models.find(m=>!m.id.startsWith("acp:"));
  const levels = selected?.efforts ?? [];
  const current = levels.some((e) => e.level === effort)
    ? effort
    : (selected?.defaultEffort ?? "");
  const index = Math.max(
    0,
    levels.findIndex((e) => e.level === current),
  );
  const label = (value: string) =>
    ({
      xhigh: "Extra high",
      max: "Max",
      ultra: "Ultra",
      minimal: "Minimal",
      none: "None",
      low: "Low",
      medium: "Medium",
      high: "High",
    })[value] ?? value;
  return <ModelPicker models={snapshot.provider.models} selected={selected} current={current}
    levels={levels} index={index} label={label} onModel={value=>{setModel(value);setEffort("");}}
    onEffort={setEffort} connected={snapshot.provider.connected}/>;
}

function NewTab({
  tabId,
  projectId,
  snapshot,
  run,
}: {
  tabId?: string;
  projectId: string;
  snapshot: Snapshot;
  run: (command: Command) => Promise<void>;
}) {
  const [chatProject,setChatProject]=useState(projectId);
  const [attachments,setAttachments]=useState<Attachment[]>([]);
  const [permission,setPermission]=useState<PermissionMode>("read-only");
  const [sendError,setSendError]=useState("");
  const query="";
  const browseInput=useRef<HTMLInputElement>(null);
  const [browseText,setBrowseText]=useState("");
  useEffect(()=>{browseInput.current?.focus();},[tabId]);
  const openBrowse=(text="")=>{setBrowseText("");window.dispatchEvent(new CustomEvent("dao:palette",{detail:{query:text}}));};
  const [draft, setDraft] = useState("");
  const [model, setModel] = useState("");
  const [effort, setEffort] = useState("");
  const [busy, setBusy] = useState(false);
  async function launch(mode: "chat" | "browser") {
    const text = (mode === "chat" ? draft : query).trim() || (attachments.length?"Please review the attached files.":"");
    if (!text || busy) return;
    setBusy(true);setSendError("");
    try {
      await window.dao.command({
        type: "tab.launch",
        tabId,
        projectId:mode==="chat"?chatProject:projectId,
        attachmentIds:attachments.map(a=>a.id),permissionMode:permission,
        mode,
        text,
        model: model || undefined,
        effort: effort || undefined,
      });
    } catch(error){setSendError(String(error));} finally {
      setBusy(false);
    }
  }
  return (
    <section className="new-tab-page">
      <header className="new-tab-welcome"><h1>Welcome back.</h1><p>What would you like to do?</p></header>
      <div className="new-tab-section"><h2>Browse</h2>
        <div className="new-tab-search spotlight-launch">
          <Search size={18}/><input ref={browseInput} aria-label="Browse" placeholder="Search anything or enter a URL…" value={browseText}
            onClick={()=>openBrowse(browseText)}
            onChange={event=>{setBrowseText(event.target.value);if(!(event.nativeEvent as InputEvent).isComposing)openBrowse(event.target.value);}}
            onCompositionEnd={event=>openBrowse(event.currentTarget.value)}
            onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();openBrowse(browseText);}}}/><kbd>Ctrl P</kbd>
        </div>
      </div>
      <div className="new-tab-tools"><button onClick={()=>void window.dao.command({type:"tab.create",kind:"terminal",projectId:chatProject})}>Open terminal</button></div>
      <h2 className="new-tab-chat-title">Chat</h2>
      <Composer agentManaged={model.startsWith("acp:")} draft={draft} setDraft={setDraft} attachments={attachments} setAttachments={setAttachments}
        permission={permission} setPermission={setPermission} projects={snapshot.workspace.projects} projectId={chatProject} setProjectId={setChatProject}
        busy={busy} onSend={()=>void launch("chat")} error={sendError}
        models={<ModelControls snapshot={snapshot} model={model} effort={effort} setModel={setModel} setEffort={setEffort}/>}/>

    </section>
  );
}

function Chat({
  conversation,
  snapshot,
  run,
  browserId,
  compact = false,
}: {
  conversation: Conversation;
  snapshot: Snapshot;
  run: (command: Command) => Promise<void>;
  browserId?: string;
  compact?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [attachments,setAttachments]=useState<Attachment[]>([]);
  const [permission,setPermission]=useState<PermissionMode>(conversation.permissionMode ?? "read-only");
  const [sending,setSending]=useState(false);
  const [model, setModel] = useState(conversation.model ?? "");
  const [effort, setEffort] = useState(conversation.effort ?? "");
  const [editing,setEditing]=useState<string>();
  const [editText,setEditText]=useState("");
  const [copied,setCopied]=useState<string>();
  const [messageError,setMessageError]=useState("");
  async function copyMessage(id:string,text:string) {
    try {await window.dao.copyText(text);setCopied(id);setTimeout(()=>setCopied(current=>current===id?undefined:current),1800);}
    catch {setMessageError("Could not copy this message.");}
  }
  async function resendEdit() {
    if(!editing || !editText.trim()) return;
    try {await window.dao.command({type:"message.edit",conversationId:conversation.id,messageId:editing,text:editText,model:model || undefined,effort:effort || undefined,browserId});setEditing(undefined);setMessageError("");}
    catch(error) {setMessageError(String(error));}
  }
  const bottom = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const [showLatest,setShowLatest] = useState(false);
  const jumpToLatest = () => { following.current=true; setShowLatest(false); bottom.current?.scrollIntoView({block:"end"}); };
  useEffect(jumpToLatest,[conversation.id]);
  useEffect(() => {
    if (following.current) bottom.current?.scrollIntoView({ behavior: "instant", block: "end" });
  }, [conversation.messages.length, conversation.messages.at(-1)?.text]);
  const send = async () => {
    if ((!draft.trim() && !attachments.length) || conversation.status==="running" || sending)return;
    setSending(true);setMessageError("");
    try{await window.dao.command({type:"chat.send",id:conversation.id,text:draft.trim() || "Please review the attached files.",model:model || undefined,effort:effort || undefined,browserId,attachmentIds:attachments.map(a=>a.id),permissionMode:permission});setDraft("");setAttachments([]);}
    catch(error){setMessageError(String(error));}finally{setSending(false);}
  };

  return (
    <div className={`chat ${compact ? "compact" : ""}`}>
      {messageError && <div className="error-text" role="alert">{messageError}</div>}
      <div className="messages" onScroll={e=>{
        const view=e.currentTarget;
        following.current=view.scrollHeight-view.scrollTop-view.clientHeight < 48;
        setShowLatest(!following.current);
      }}>
        {conversation.messages.length === 0 ? (
          <div className="chat-welcome">
            <h1>New conversation</h1>
            {!compact && (
              <div className="suggestions">
                {[
                  "Help me explore an idea",
                  "Explain this project",
                  "Plan my next steps",
                ].map((text) => (
                  <button key={text} onClick={() => setDraft(text)}>
                    {text}
                    <ArrowUp size={13} />
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          conversation.messages.map((message,index) => message.role==="system" ? (
            conversation.messages[index-1]?.role==="system" ? null : <AgentActivity key={message.id} steps={conversation.messages.slice(index, (()=>{const next=conversation.messages.findIndex((m,i)=>i>index && m.role!=="system");return next<0?undefined:next;})())}/>
          ) : (
            <article className={`message ${message.role}`} key={message.id}>
              {message.role !== "user" && (
                <div className="message-label">
                  {message.role === "assistant" ? (snapshot.connectors.find(p=>p.id===conversation.providerId)?.name??"Codex") : "ACTIVITY"}
                </div>
              )}
              {!!message.attachments?.length && <div className="sent-attachments">{message.attachments.map(a=><div className="sent-attachment" key={a.id}><AttachmentPreview file={a}/></div>)}</div>}
              {editing===message.id ? <div className="message-editor">
                <textarea aria-label="Edit message" autoFocus value={editText} onChange={e=>setEditText(e.target.value)} onKeyDown={e=>{if(e.key==="Escape")setEditing(undefined);}} />
                <div><button onClick={()=>setEditing(undefined)}>Cancel</button><button disabled={!editText.trim() || conversation.status==="running"} onClick={()=>void resendEdit()}>Resend</button></div>
                <small>Resends from here and replaces the later replies.</small>
              </div> : <div className="message-text"><ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={(url)=>url} components={{
                a: ({href,children}) => <a href="#" title={href} onClick={e=>{e.preventDefault(); if(href) void run({type:"link.open",sourceTabId:snapshot.workspace.activeTabId,target:href,projectId:conversation.projectId});}}>{children}</a>,
                img: ({src,alt}) => <a href="#" onClick={e=>{e.preventDefault();if(typeof src==="string") void run({type:"link.open",sourceTabId:snapshot.workspace.activeTabId,target:src,projectId:conversation.projectId});}}>{alt || "Image"}</a>,
              }}>{message.text}</ReactMarkdown></div>}
              {editing!==message.id && <div className="message-actions">
                <button title={copied===message.id?"Copied":"Copy"} aria-label="Copy message" onClick={()=>void copyMessage(message.id,message.text)}>{copied===message.id?<Check size={13}/>:<Copy size={13}/>}</button>
                {message.role==="user" && <button title="Edit" aria-label="Edit message" disabled={conversation.status==="running"} onClick={()=>{setEditing(message.id);setEditText(message.text.replace(/\n\n\[Browser attached\]$/, ""));setMessageError("");}}><Pencil size={13}/></button>}
              </div>}
            </article>
          ))
        )}
        {conversation.status === "running" && (
          <div className="working" role="status">
            <span className="pulse dot" /> {snapshot.connectors.find(p=>p.id===conversation.providerId)?.name ?? "Codex"} is working…
          </div>
        )}
      {snapshot.turnChanges.filter(t=>t.conversationId===conversation.id).map(t=><TurnChangesPanel key={t.id} turn={t} busy={conversation.status==='running'} sourceTabId={snapshot.workspace.activeTabId!} run={run}/>)}
        <div ref={bottom} />
      </div>

      {snapshot.approvals
        .filter((a) => a.conversationId === conversation.id)
        .map((a) => (
          <AgentApproval key={a.id} approval={a} run={run}/>
        ))}
      <div className="composer-wrap">
        {showLatest && <button className="chat-latest" onClick={jumpToLatest}>↓ Latest message</button>}
        <Composer agentManaged={model.startsWith("acp:")} draft={draft} setDraft={setDraft} attachments={attachments} setAttachments={setAttachments}
          context={<EditorAttachments attachment={snapshot.editorAttachment} conversationId={conversation.id} busy={sending||conversation.status==='running'} run={run}/>}
          permission={permission} setPermission={setPermission} projects={snapshot.workspace.projects} projectId={conversation.projectId}
          busy={sending || conversation.status==="running"} onSend={()=>void send()} onStop={conversation.turnId?()=>void run({type:"chat.stop",id:conversation.id}):undefined}
          models={<><ModelControls snapshot={snapshot} model={model} effort={effort} setModel={setModel} setEffort={setEffort}/>{model.startsWith('acp:')&&<AgentOptions snapshot={snapshot} conversation={conversation} run={run}/>}</>}/>
        {!!conversation.providerCommands?.length&&<Dropdown label="Agent commands" value="" options={conversation.providerCommands.map(c=>({value:c.name,label:`/${c.name} — ${c.description}`}))} onChange={name=>setDraft(`/${name} `)}/>}
      </div>
    </div>
  );
}

function TextReader({tab}:{tab:WorkTab}) {
  const [content,setContent]=useState<{path:string;text:string}>();
  const [error,setError]=useState("");
  const [revision,setRevision]=useState(0);
  const selected=useRef<HTMLSpanElement>(null);
  useEffect(()=>{let active=true; setError(""); window.dao.readFile(tab.id).then(value=>{if(active)setContent(value);}).catch(e=>{if(active)setError(String(e));}); return ()=>{active=false;};},[tab.id,revision]);
  useEffect(()=>{selected.current?.scrollIntoView({block:"center"});},[content,tab.line]);
  return <section className="text-reader"><header><span title={tab.filePath}>{tab.filePath}</span><button title="Reload file" onClick={()=>setRevision(v=>v+1)}><RefreshCw size={14}/></button></header>{error ? <p className="error-text">{error}</p> : !content ? <p>Loading…</p> : <pre>{content.text.split("\n").map((line,i)=><span key={i} ref={i+1===tab.line?selected:undefined} className={`file-line ${i+1===tab.line?"selected":""}`}><span className="line-number">{i+1}</span>{line || " "}</span>)}</pre>}</section>;
}

createRoot(document.getElementById("root")!).render(<App />);

function AgentOptions({snapshot,conversation,run}:{snapshot:Snapshot;conversation:Conversation;run:(command:Command)=>Promise<void>}){
 const options=snapshot.connectors.find(c=>c.id===conversation.providerId)?.options??[];
 const flat=(values:any[]):any[]=>values.flatMap(v=>Array.isArray(v.options)?flat(v.options):v);
 return <>{options.filter(o=>!['model','thought_level','reasoning_effort','mode'].includes(o.category)&&!/effort|thinking|permission|approval|mode/i.test(o.id)&&Array.isArray(o.options)).map(o=><Dropdown key={o.id} label={o.name} value={conversation.providerOptions?.[o.id]??o.currentValue} disabled={conversation.status==='running'} options={flat(o.options).map(v=>({value:String(v.value),label:v.name}))} onChange={value=>void run({type:'chat.provider-option',id:conversation.id,option:o.id,value})}/>)}</>;
}
