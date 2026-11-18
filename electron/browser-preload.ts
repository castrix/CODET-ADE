import { ipcRenderer } from "electron";
// Keep native page links inside ADE; expose no shell API to page scripts.
function openLink(event: MouseEvent) {
  if (event.type === "click" && event.button !== 0) return;
  if (event.type === "auxclick" && event.button !== 1) return;
  const anchor = event.composedPath().find(node => node instanceof HTMLAnchorElement) as HTMLAnchorElement | undefined;
  if (event.defaultPrevented || !anchor || anchor.hasAttribute("download")) return;
  const host=location.hostname;
  if(host==="accounts.google.com" || host.endsWith(".accounts.google.com"))return;
  if(anchor.target && anchor.target!=="_self")return;
  const url = anchor.href;
  if (!/^https?:\/\//i.test(url)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  ipcRenderer.send("dao:page-link", url);
}
window.addEventListener("click", openLink, false);
window.addEventListener("auxclick", openLink, false);
