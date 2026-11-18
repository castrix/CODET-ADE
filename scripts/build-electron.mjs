import { build } from "esbuild";
const shared={bundle:true,platform:"node",format:"cjs",outdir:"dist-electron",outExtension:{".js":".cjs"},sourcemap:true};
await build({...shared,entryPoints:["electron/main.ts"],external:["node-pty","electron","electron-chrome-extensions","electron-chrome-web-store"]});
await build({...shared,entryPoints:["electron/preload.ts","electron/browser-preload.ts","electron/browser-mcp.ts"],external:["electron"]});
