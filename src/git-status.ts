export function gitStatus(code:string){
 if(code==='?'||code==='A')return {kind:'added',label:code==='?'?'Untracked':'Added'};
 if(code==='D')return {kind:'deleted',label:'Deleted'};
 if(code==='R'||code==='C')return {kind:'renamed',label:code==='R'?'Renamed':'Copied'};
 if(code==='U')return {kind:'conflict',label:'Conflict'};
 return {kind:'modified',label:code==='T'?'Type changed':'Modified'};
}
