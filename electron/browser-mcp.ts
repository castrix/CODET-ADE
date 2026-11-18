import {createInterface} from 'node:readline';
import {browserTools} from './browser-tools';
const input=createInterface({input:process.stdin});
input.on('line',line=>{void (async()=>{let request:any;try{request=JSON.parse(line);if(request.id===undefined)return;let result:any;
 switch(request.method){
 case 'initialize':result={protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'dao-browser',version:'1.0.0'}};break;
 case 'ping':result={};break;
 case 'tools/list':result={tools:browserTools.map(({type,...tool})=>tool)};break;
 case 'tools/call':{
  if(request.params.name!=='dao_browser')throw Error('Unknown tool');
  const response=await fetch(process.env.DAO_BROWSER_BRIDGE_URL!,{method:'POST',headers:{Authorization:`Bearer ${process.env.DAO_BROWSER_BRIDGE_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify(request.params.arguments)});const data:any=await response.json();
  result={isError:!data.success,content:(data.contentItems??[]).map((item:any)=>item.type==='inputImage'?{type:'image',mimeType:item.imageUrl.split(';')[0].slice(5),data:item.imageUrl.split(',')[1]}:{type:'text',text:item.text??''})};break;}
 default:process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,error:{code:-32601,message:'Unsupported method'}})+'\n');return;
 }
 process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,result})+'\n');
 }catch(error){if(request?.id!==undefined)process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,error:{code:-32603,message:String(error)}})+'\n');}})();});
