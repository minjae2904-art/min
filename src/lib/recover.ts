// Shared by error.tsx and global-error.tsx: park the local save, drop the page caches and start over.
// krob-token stays so the server copy is re-pulled; the SW is kept because unregistering kills the push subscription.
import { msgs } from "../i18n";
import * as M from "../i18n/msg/lib-12";

const m = msgs(M);

export function clearLocalAndReload() {
  if (!confirm(m("recover.confirm"))) return;
  try {
    localStorage.setItem("krob-v1.bad", localStorage.getItem("krob-v1") ?? "");
    localStorage.removeItem("krob-v1");
  } catch {}
  const wipe = typeof caches === "undefined" ? Promise.resolve() : caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k))));
  wipe.catch(() => {}).then(() => location.replace("/"));
}
