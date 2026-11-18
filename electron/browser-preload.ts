import { ipcRenderer } from "electron";

window.addEventListener("click", (event) => {
  if (!event.isTrusted || event.defaultPrevented || event.button !== 0 ||
      event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const anchor = event.composedPath().find(node => node instanceof HTMLAnchorElement);
  if (!(anchor instanceof HTMLAnchorElement) || !anchor.hasAttribute("href") ||
      anchor.hasAttribute("download") || !/^https?:$/.test(anchor.protocol)) return;
  const target = anchor.target || document.querySelector("base[target]")?.getAttribute("target");
  if (target && target.toLowerCase() !== "_self") return;
  if (location.hostname === "accounts.google.com" || location.hostname.endsWith(".accounts.google.com")) return;
  const url = new URL(anchor.href);
  if (url.origin === location.origin && url.pathname === location.pathname && url.search === location.search) return;
  if (!ipcRenderer.sendSync("dao:link-preference")) return;

  const previous = anchor.getAttribute("target");
  anchor.target = "_blank";
  setTimeout(() => {
    if (anchor.target !== "_blank") return;
    if (previous === null) anchor.removeAttribute("target");
    else anchor.target = previous;
  }, 0);
});
