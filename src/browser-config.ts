import {z} from "zod";
export const permissionNames=["camera","microphone","geolocation","notifications","clipboard-read","fullscreen","pointerLock","display-capture","midi","midiSysex","persistent-storage","mediaKeySystem","screen-wake-lock","local-fonts"] as const;
export const decisionSchema=z.enum(["ask","allow","block"]);
export const browserConfigSchema=z.object({
  homepage:z.string().url().refine(v=>/^https?:\/\//.test(v)).default("https://www.google.com"),
  searchEngine:z.enum(["google","duckduckgo","bing"]).default("google"),
  zoom:z.number().min(.5).max(2).default(1),
  spellcheck:z.boolean().default(true),
  languages:z.array(z.string().min(2).max(20)).max(10).default(["en-US"]),
  downloadDirectory:z.string().default(""),
  askDownloadLocation:z.boolean().default(true),
  permissionDefaults:z.partialRecord(z.enum(permissionNames),decisionSchema).default({}),
  proxyMode:z.enum(["system","direct","fixed_servers"]).default("system"),
  proxyRules:z.string().max(2000).default(""),
  proxyBypass:z.string().max(2000).default("<local>"),
});
export type BrowserConfig=z.infer<typeof browserConfigSchema>;
export type PermissionName=typeof permissionNames[number];
export type PermissionDecision=z.infer<typeof decisionSchema>;
export type SitePermission={origin:string;embeddingOrigin:string;permission:string;decision:PermissionDecision};
export type DownloadRecord={id:string;name:string;url:string;path:string;received:number;total:number;state:"progressing"|"completed"|"cancelled"|"interrupted";paused:boolean;resumable:boolean;startedAt:number};
export type ExtensionRecord={id:string;name:string;version:string;path:string;enabled:boolean;source:"store"|"unpacked";permissions:string[];error?:string};
export type BrowserProfileSnapshot={config:BrowserConfig;downloads:DownloadRecord[];permissions:SitePermission[];extensions:ExtensionRecord[];languages:string[];siteData:{origin:string;cookies:number}[];error?:string};
export type BrowserProfileCommand =
 | {type:"browser.settings";values:Partial<Omit<BrowserConfig,"downloadDirectory">>}
 | {type:"browser.download-folder"}
 | {type:"download.action";id:string;action:"pause"|"resume"|"cancel"|"open"|"show"|"retry"|"remove"}
 | {type:"site.permission";origin:string;embeddingOrigin:string;permission:PermissionName;decision:PermissionDecision}
 | {type:"site.reset";origin:string}
 | {type:"browser.clear-data";kind:"cache"|"cookies"|"site";origin?:string}
 | {type:"browser.refresh-data"}
 | {type:"extension.load"}
 | {type:"extension.action";id:string;action:"enable"|"disable"|"remove"|"reload"|"options"}
 | {type:"extension.update"};
