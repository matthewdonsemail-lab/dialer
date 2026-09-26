import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { queryClient } from "@/lib/queryClient";
import { AuthProvider } from "@/components/auth/AuthProvider";
import App from "@/App";
import "@/index.css";

// A deploy replaces hashed chunks: a tab holding a stale index.html then fails
// to import a deleted chunk (served as text/html by the SPA fallback). Recover
// with a visible, retry-tolerant reload instead of a dead page.
const CHUNK_ERROR_PATTERNS = [
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /Loading chunk \d+ failed/i,
  /Loading CSS chunk .* failed/i,
];
const CHUNK_RELOAD_KEY = "chunk-reloads";
const CHUNK_RELOAD_MAX = 3;
const CHUNK_RELOAD_DELAY_MS = 5000;

function chunkLoadFailed(message: string): boolean {
  return CHUNK_ERROR_PATTERNS.some((rx) => rx.test(message || ""));
}
function isStaleChunkTarget(e: Event): boolean {
  // Resource load failures (script/link) don't bubble and carry no message —
  // they must be caught in the capture phase and identified by target.
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  if (typeof Window !== "undefined" && t instanceof Window) return false;
  const tag = (t.tagName || "").toUpperCase();
  if (tag !== "SCRIPT" && tag !== "LINK") return false;
  const src =
    (t as HTMLScriptElement).src || (t as HTMLLinkElement).href || "";
  return src.includes("/assets/");
}
function chunkReloadCount(): number {
  try {
    return Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0);
  } catch {
    return CHUNK_RELOAD_MAX; // storage blocked: don't loop, show manual message
  }
}
function showDeployBanner(text: string, stuck: boolean) {
  let el = document.getElementById("deploy-reload-banner");
  if (!el) {
    el = document.createElement("div");
    el.id = "deploy-reload-banner";
    el.setAttribute(
      "style",
      "position:fixed;top:0;left:0;right:0;z-index:99999;padding:10px 16px;text-align:center;" +
        "font:500 13px/1.4 system-ui,sans-serif;" +
        (stuck
          ? "background:#fef2f2;color:#b91c1c;border-bottom:1px solid #fecaca;"
          : "background:#eff6ff;color:#1d4ed8;border-bottom:1px solid #bfdbfe;")
    );
    document.body.prepend(el);
  }
  el.textContent = text;
}
function recoverFromStaleChunk() {
  const attempt = chunkReloadCount() + 1;
  try {
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(attempt));
    sessionStorage.setItem(`${CHUNK_RELOAD_KEY}-fired`, "1");
  } catch {
    // storage blocked — fall through to the manual message below
  }
  if (attempt > CHUNK_RELOAD_MAX) {
    showDeployBanner(
      "This page is out of date and could not refresh automatically — hard-refresh (Ctrl+Shift+R / Cmd+Shift+R).",
      true
    );
    return;
  }
  showDeployBanner(
    `A new app version is loading assets — refreshing (${attempt}/${CHUNK_RELOAD_MAX})…`,
    false
  );
  window.setTimeout(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("_r", String(Date.now()));
    window.location.replace(url.toString());
  }, CHUNK_RELOAD_DELAY_MS);
}
// A clean boot clears the counter — but only when no chunk failure fired
// during the window, otherwise a persistently broken deploy would loop forever.
window.setTimeout(() => {
  try {
    if (!sessionStorage.getItem(`${CHUNK_RELOAD_KEY}-fired`)) {
      sessionStorage.removeItem(CHUNK_RELOAD_KEY);
      document.getElementById("deploy-reload-banner")?.remove();
    }
  } catch {
    // ignore
  }
}, 15000);
// Capture phase: chunk resource errors do NOT bubble, so a bubble-phase
// listener never sees them (which is why stale chunks previously slipped by).
window.addEventListener("error", (e) => {
  if (chunkLoadFailed((e as ErrorEvent)?.message || "") || isStaleChunkTarget(e)) {
    recoverFromStaleChunk();
  }
}, true);
window.addEventListener("vite:preloadError", () => recoverFromStaleChunk());
window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
  const msg = String((e?.reason as any)?.message || e?.reason || "");
  if (chunkLoadFailed(msg)) recoverFromStaleChunk();
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </React.StrictMode>
);