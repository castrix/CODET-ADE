import { randomUUID } from "node:crypto";
import type { Workspace, WorkTab, Conversation } from "../src/shared";
export const id = () => randomUUID();
export function initialWorkspace(): Workspace {
  const projectId = id();
  const tabId = id();
  return {
    version: 1,
    groups: [],
    preferences: {sidebarExpanded:true,fontSize:13,rememberHistory:true,openLinksInNewTab:true},
    browserHistory: [],
    projects: [{ id: projectId, name: "Personal" },{id:"unassigned",name:"No project",isUnassigned:true}],
    conversations: [],
    browsers: [],
    tabs: [{ id: tabId, projectId, kind: "launcher" }],
    activeTabId: tabId,
    activeProjectId: projectId,
  };
}
export function newConversation(
  state: Workspace,
  projectId: string,
): Conversation {
  if (!state.projects.some((p) => p.id === projectId))
    throw new Error("Project not found");
  const conversation: Conversation = {
    id: id(),
    projectId,
    title: "New conversation",
    updatedAt:Date.now(),
    messages: [],
    status: "idle",
  };
  state.conversations.push(conversation);
  return conversation;
}
export function newTab(
  state: Workspace,
  projectId: string,
  kind: WorkTab["kind"],
  sourceId: string | undefined = state.activeTabId,
): WorkTab {
  if (!state.projects.some((p) => p.id === projectId))
    throw new Error("Project not found");
  if(kind === "ide") {
    if(!state.projects.find(p=>p.id===projectId)?.folder)throw new Error("Choose a project folder first");
    const source=state.tabs.find(t=>t.id===sourceId&&t.projectId===projectId);
    const existing=state.tabs.find(t=>t.kind==='ide'&&t.projectId===projectId&&(source?.kind==='ide'?t.id===source.id:source?.groupId?t.groupId===source.groupId:!source?!t.groupId:false));
    if(existing){state.activeTabId=existing.id;state.activeProjectId=projectId;return existing;}
  }
  const tab: WorkTab = { id: id(), projectId, kind };
  if (kind === "chat")
    tab.conversationId = newConversation(state, projectId).id;
  if (kind === "browser") {
    const resource = {
      id: id(),
      projectId,
      title: "New browser",
      url: "https://www.google.com",
    };
    state.browsers.push(resource);
    tab.resourceId = resource.id;
  }
  state.tabs.push(tab);
  state.activeTabId = tab.id;
  state.activeProjectId = projectId;
  return tab;
}
export function closeTab(state: Workspace, tabId: string) {
  const index = state.tabs.findIndex((t) => t.id === tabId);
  if (index < 0) return;
  const [tab] = state.tabs.splice(index, 1);
  if (tab.kind === "browser")
    state.browsers = state.browsers.filter((b) => b.id !== tab.resourceId);
  // Conversation records and running turns are deliberately independent of views.
  if (state.activeTabId === tabId) {
    const peers = state.tabs.filter(t => t.projectId === tab.projectId && tab.groupId && t.groupId === tab.groupId);
    state.activeTabId = peers[peers.length - 1]?.id ?? state.tabs.filter(t=>t.projectId===tab.projectId && t.terminalPlacement!=="panel")[0]?.id ?? state.tabs.filter(t=>t.terminalPlacement!=="panel")[0]?.id;
  }
  const active = state.tabs.find((t) => t.id === state.activeTabId);
  if (active) state.activeProjectId = active.projectId;
}
export function normalizeUrl(input: string, searchEngine: "google" | "duckduckgo" | "bing" = "google"): string {
  const raw = input.trim();
  if (!raw) throw new Error("Enter a URL");
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(raw)
    ? raw
    : raw.includes(" ") || (!raw.includes(".") && !raw.startsWith("localhost"))
      ? `${({google:"https://www.google.com/search?q=",duckduckgo:"https://duckduckgo.com/?q=",bing:"https://www.bing.com/search?q="})[searchEngine]}${encodeURIComponent(raw)}`
      : `https://${raw}`;
  const url = new URL(candidate);
  if (!["https:", "http:"].includes(url.protocol))
    throw new Error("Only HTTP and HTTPS pages are supported");
  return url.href;
}

export function groupWithSource(state: Workspace, tab: WorkTab, sourceId?: string) {
  const source = state.tabs.find(t => t.id === sourceId && t.projectId === tab.projectId);
  if (!source || source === tab || source.kind === "launcher") return;
  source.groupId ??= source.id;
  tab.groupId = source.groupId;
  tab.conversationId = source.conversationId ?? state.tabs.find(t=>t.groupId===source.groupId && t.projectId===source.projectId && t.conversationId)?.conversationId;
  state.tabs.splice(state.tabs.indexOf(tab), 1);
  const end = state.tabs.reduce((last, t, i) => t.groupId === source.groupId ? i : last, -1);
  state.tabs.splice(end + 1, 0, tab);
}

const groupColors=['#70b8ff','#b69cff','#f28bb5','#e9ab62','#72cba0','#e6cf70','#6dd3da'];
export function randomGroupColor(state:Workspace){const unused=groupColors.filter(color=>!state.groups.some(g=>g.color===color));const palette=unused.length?unused:groupColors;return palette[Math.floor(Math.random()*palette.length)];}
export function ensureCompanions(state: Workspace) {
  for(const group of state.groups){const tabs=state.tabs.filter(t=>t.groupId===group.id&&t.terminalPlacement!=='panel');if(tabs.length<=1)for(const tab of state.tabs)if(tab.groupId===group.id)tab.groupId=undefined;}

  for(const tab of state.tabs) if(tab.groupId && !state.groups.some(g=>g.id===tab.groupId)) {
    const conversation=state.conversations.find(c=>c.id===tab.conversationId);
    state.groups.push({id:tab.groupId,name:conversation?.title && conversation.title!=="New conversation"?conversation.title.slice(0,40):"Tab group",color:randomGroupColor(state),collapsed:false});
  }
  state.groups=state.groups.filter(g=>state.tabs.some(t=>t.groupId===g.id));
  for (const tab of state.tabs) {
    if (!["browser","ide","terminal"].includes(tab.kind) || tab.conversationId) continue;
    const peer = tab.groupId ? state.tabs.find(t => t.groupId === tab.groupId && t.conversationId) : undefined;
    tab.conversationId = peer?.conversationId ?? newConversation(state, tab.projectId).id;
  }
}
