// Shared by error.tsx and global-error.tsx: park the local save, drop the page caches and start over.
// krob-token stays so the server copy is re-pulled; the SW is kept because unregistering kills the push subscription.
export function clearLocalAndReload() {
  if (!confirm("ล้างข้อมูลในเครื่องนี้แล้วเปิดใหม่? (ข้อมูลบน server ยังอยู่)")) return;
  try {
    localStorage.setItem("krob-v1.bad", localStorage.getItem("krob-v1") ?? "");
    localStorage.removeItem("krob-v1");
  } catch {}
  const wipe = typeof caches === "undefined" ? Promise.resolve() : caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k))));
  wipe.catch(() => {}).then(() => location.replace("/"));
}
