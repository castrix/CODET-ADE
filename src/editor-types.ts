export type EditorAction = {projectId:string;op:'attach'|'list'|'read'|'save'|'create'|'rename'|'trash'|'git'|'stage-all'|'stage'|'unstage'|'diff'|'commit'|'search'|'change'|'close'|'lsp';path?:string;turnChangeId?:string;text?:string;revision?:string;directory?:boolean;destination?:string;staged?:boolean;method?:'completion'|'hover'|'definition';line?:number;character?:number};
export type EditorFile={path:string;uri:string;text:string;revision:string;language:string};
export type FileEntry={name:string;path:string;directory:boolean};
export type GitEntry={path:string;index:string;worktree:string};
export type EditorEvent={projectId:string;uri?:string;diagnostics?:any[];closed?:boolean;error?:string};
