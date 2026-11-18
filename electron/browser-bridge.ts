import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {join} from 'node:path';
export class BrowserBridge {
 private tokens=new Map<string,string>();
 private ready?:Promise<number>;
 private server=createServer(async(req,res)=>{
  const token=req.headers.authorization?.replace(/^Bearer /,'');const id=token&&this.tokens.get(token);
  if(!id||req.method!=='POST'||req.url!=='/tool'){res.writeHead(403).end();return;}
  try{let body='';for await(const chunk of req){body+=chunk;if(body.length>100000)throw Error('Request too large');}
   const result=await this.action(id,JSON.parse(body));res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(result));
  }catch(error){res.writeHead(400,{'Content-Type':'application/json'}).end(JSON.stringify({success:false,contentItems:[{type:'inputText',text:String(error)}]}));}
 });
 constructor(private action:(id:string,args:unknown)=>Promise<any>){}
 async servers(id:string){this.ready??=new Promise((resolve,reject)=>{this.server.once('error',reject);this.server.listen(0,'127.0.0.1',()=>resolve((this.server.address() as any).port));});const port=await this.ready;let token=[...this.tokens].find(([,value])=>value===id)?.[0];if(!token){token=randomBytes(32).toString('hex');this.tokens.set(token,id);}
 return [{name:'dao-browser',command:process.execPath,args:[join(__dirname,'browser-mcp.cjs')],env:[{name:'ELECTRON_RUN_AS_NODE',value:'1'},{name:'DAO_BROWSER_BRIDGE_URL',value:`http://127.0.0.1:${port}/tool`},{name:'DAO_BROWSER_BRIDGE_TOKEN',value:token}]}];}
 dispose(){this.tokens.clear();this.server.close();}
}
