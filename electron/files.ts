import { open } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export function fileTarget(target: string, root: string) {
  let path = target.trim(); let line: number | undefined;
  if (path.startsWith('file:')) { const url = new URL(path); const match = url.hash.match(/^#L?(\d+)/); if(match) line = Number(match[1]); url.hash=''; path=fileURLToPath(url); }
  else { try { path=decodeURIComponent(path); } catch {} }
  const suffix = path.match(/(?::(\d+)(?::\d+)?|#L(\d+)(?:C\d+)?(?:-L?\d+)?)$/);
  if(suffix) { line = Number(suffix[1] ?? suffix[2]); path=path.slice(0,suffix.index); }
  if (/^\/[A-Za-z]:[\\/]/.test(path)) path=path.slice(1);
  if (/^[a-z][a-z\d+.-]*:/i.test(path) && !/^[A-Za-z]:[\\/]/.test(path)) throw new Error('Unsupported link protocol');
  return { path: isAbsolute(path) ? path : resolve(root, path), line };
}
export async function readTextFile(path: string) {
  const handle = await open(path,'r');
  try {
    const stat=await handle.stat(); if(!stat.isFile()) throw new Error('This reference is not a file');
    if(stat.size>2*1024*1024) throw new Error('The text reader supports files up to 2 MB');
    const bytes=Buffer.alloc(Math.min(stat.size+1,2*1024*1024+1)); const {bytesRead}=await handle.read(bytes,0,bytes.length,0); const data=bytes.subarray(0,bytesRead);
    if(bytesRead>2*1024*1024) throw new Error('File grew beyond the reader limit');
    let text:string;
    if(data[0]===0xff && data[1]===0xfe) text=data.subarray(2).toString('utf16le');
    else if(data[0]===0xfe && data[1]===0xff) text=new TextDecoder('utf-16be').decode(data.subarray(2));
    else { if(data.includes(0)) throw new Error('Binary files cannot be displayed as text'); text=data.toString('utf8').replace(/^\uFEFF/,''); }
    return {path,text};
  } finally { await handle.close(); }
}
