export type TerminalProfile={id:string;name:string;kind:'powershell'|'cmd'|'wsl'|'shell'};
export type TerminalAction={op:'profiles'}|{op:'open';tabId:string;profileId?:string;cols:number;rows:number}|{op:'write';tabId:string;data:string}|{op:'resize';tabId:string;cols:number;rows:number}|{op:'stop'|'restart';tabId:string}|{op:'focus';tabId:string;focused:boolean};
export type TerminalEvent={tabId:string;seq:number;data?:string;exitCode?:number};
export type TerminalState={profile:TerminalProfile;buffer:string;seq:number;exitCode?:number};
