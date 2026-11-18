import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
  copyFileSync,
} from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { initialWorkspace } from "./workspace";
import type { Workspace } from "../src/shared";
const persisted = z.object({
  version: z.literal(1),
  groups:z.array(z.object({id:z.string(),name:z.string(),color:z.string(),collapsed:z.boolean()})).default([]),
  preferences:z.object({sidebarExpanded:z.boolean().default(true),fontSize:z.number().min(11).max(20),rememberHistory:z.boolean(),openLinksInNewTab:z.boolean()}).default({sidebarExpanded:true,fontSize:13,rememberHistory:true,openLinksInNewTab:false}),
  browserHistory:z.array(z.object({url:z.string(),title:z.string(),visitedAt:z.number()})).default([]),
  projects: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      folder: z.string().optional(),
      collapsed:z.boolean().optional(),
      isUnassigned:z.boolean().optional(),
    }),
  ),
  conversations: z.array(
    z.object({
      id: z.string(),
      projectId: z.string(),
      title: z.string(),
      messages: z.array(
        z.object({
          id: z.string(),
          role: z.enum(["user", "assistant", "system"]),
          text: z.string(),
          attachments:z.array(z.object({id:z.string(),name:z.string(),path:z.string(),kind:z.enum(["image","text"]),size:z.number()})).optional(),
        }),
      ),
      status: z.enum(["idle", "running", "error"]),
      permissionMode:z.enum(["read-only","workspace-write","full-access"]).optional(),
      updatedAt:z.number().optional(),
      providerId:z.string().optional(),acpSessionId:z.string().optional(),providerOptions:z.record(z.string(),z.string()).optional(),providerMode:z.string().optional(),providerModes:z.array(z.object({id:z.string(),name:z.string(),description:z.string().optional()})).optional(),providerCommands:z.array(z.object({name:z.string(),description:z.string()})).optional(),
      editorAttachment:z.string().optional(),
      threadId: z.string().optional(),
      browserTools: z.boolean().optional(),
      browserToolsVersion: z.number().optional(),
      contextEdited: z.boolean().optional(),
      previousThreadIds: z.array(z.string()).optional(),
      model: z.string().optional(),
      effort: z.string().optional(),
      turnId: z.string().optional(),
    }),
  ),
  browsers: z.array(
    z.object({
      id: z.string(),
      projectId: z.string(),
      title: z.string(),
      url: z.string(),
    }),
  ),
  tabs: z.array(
    z.object({
      id: z.string(),
      projectId: z.string(),
      pinned:z.boolean().optional(),
      terminalOwner:z.string().optional(),terminalPlacement:z.enum(["tab","panel"]).optional(),terminalProfile:z.string().optional(),terminalTitle:z.string().optional(),
      editorRevision:z.number().optional(),
      diffStaged:z.boolean().optional(),
      turnChangeId:z.string().optional(),
      kind: z.enum(["chat", "browser", "launcher", "file", "ide", "terminal"]),
      groupId: z.string().optional(),
      filePath: z.string().optional(),
      line: z.number().optional(),
      resourceId: z.string().optional(),
      conversationId: z.string().optional(),
    }),
  ),
  activeTabId: z.string().optional(),
  activeProjectId: z.string(),
});
export class WorkspaceStore {
  state: Workspace;
  private file: string;
  constructor(directory: string) {
    mkdirSync(directory, { recursive: true });
    this.file = join(directory, "workspace.json");
    this.state = initialWorkspace();
    if (existsSync(this.file)) {
      try {
        this.state = persisted.parse(
          JSON.parse(readFileSync(this.file, "utf8")),
        );
      } catch {
        copyFileSync(this.file, `${this.file}.invalid-${Date.now()}`);
      }
    }
    if(!this.state.projects.some(p=>p.id==="unassigned"))this.state.projects.push({id:"unassigned",name:"No project",isUnassigned:true});
    for (const chat of this.state.conversations)
      if (chat.status === "running") {
        chat.status = "idle";
        chat.turnId = undefined;
        chat.messages.push({
          id: `interrupted-${Date.now()}`,
          role: "system",
          text: "The app closed during a turn. Reconnect to resume this conversation; the previous run was interrupted.",
        });
      }
  }
  save() {
    writeFileSync(`${this.file}.tmp`, JSON.stringify(this.state), "utf8");
    renameSync(`${this.file}.tmp`, this.file);
  }
}
