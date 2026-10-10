/*
 * Captures every page and tab of the dialer in light mode into
 * docs/screenshots/, from the demo workspace (backend/src/lib/demo), so the
 * images never show a real record.
 *
 *   bun run screenshots              all shots
 *   bun run screenshots contact      only shots whose name contains "contact"
 *
 * Starts its own Vite server on :5174 with placeholder SIP settings, answers
 * every /api request from apiFixtures.ts, and opens pages with ?simulate=1 so
 * no SIP traffic is sent. Needs a Playwright Chromium (bunx playwright install chromium).
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import { buildDemoRecords, DEMO_USER } from "../../backend/src/lib/demo/records/index.js";
import { respond } from "./apiFixtures.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, "docs", "screenshots");
const PORT = 5174;
const ORIGIN = `http://localhost:${PORT}`;
const PAGE_URL = `${ORIGIN}/__demo/offer.html`;
const VIEWPORT = { width: 1440, height: 900 };

const db = buildDemoRecords();
const featured = db.agencyProspects[0];
const featuredCall = db.agencyCalls[0];
const lead = db.agencyLeads[1];

/**
 * A JWT-shaped token for the demo member. The app reads its claims to restore
 * the session; it is never signed because no real server sees it.
 */
function demoToken(): string {
  const part = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const claims = { userId: DEMO_USER.id, email: DEMO_USER.email, memberName: DEMO_USER.name, workspaceMemberId: DEMO_USER.id, exp: Math.floor(Date.now() / 1000) + 3600 };
  return `${part({ alg: "none", typ: "JWT" })}.${part(claims)}.demo`;
}

interface Shot {
  name: string;
  title: string;
  path: string;
  /** Runs after the page settles: open a tab, a panel, the dock. */
  act?: (page: Page) => Promise<void>;
  signedOut?: boolean;
  viewport?: { width: number; height: number };
}

const tab = (label: string) => async (page: Page) => {
  // A tab may carry a count badge ("Activity 6"), so match the start of its name.
  await page.getByRole("tab", { name: new RegExp(`^${label}`) }).first().click();
};
const rail = (label: string) => async (page: Page) => {
  const panel = page.getByRole("navigation", { name: "Contact panels" }).getByRole("button", { name: label, exact: true });
  if ((await panel.getAttribute("aria-pressed")) !== "true") await panel.click();
};
const dock = (tabLabel?: string) => async (page: Page) => {
  await page.getByRole("button", { name: /^Dialer/ }).first().click();
  if (tabLabel) await page.getByRole("dialog", { name: "Dialer" }).getByRole("tab", { name: tabLabel, exact: true }).click();
};

/** Start a simulated call (?simulate=1: no SIP) from the dock's Contacts tab, then `then`. */
const liveCall = (then?: (page: Page) => Promise<void>) => async (page: Page) => {
  await dock("Contacts")(page);
  const dialog = page.getByRole("dialog", { name: "Dialer" });
  await dialog.getByTitle("Call", { exact: true }).first().click();
  await dialog.getByRole("button", { name: /End call/ }).waitFor();
  await page.waitForTimeout(3_000);
  if (then) await then(page);
};
const dockButton = (name: string | RegExp) => async (page: Page) => {
  await page.getByRole("dialog", { name: "Dialer" }).getByRole("button", { name }).first().click();
};

export const SHOTS: Shot[] = [
  { name: "login", title: "Sign in with Twenty", path: "/login", signedOut: true },
  { name: "reports-overview", title: "Reports: overview", path: "/reports", act: tab("Overview") },
  { name: "reports-numbers", title: "Reports: number health", path: "/reports", act: tab("Number Health") },
  { name: "reports-team", title: "Reports: team performance", path: "/reports", act: tab("Team Performance") },
  { name: "reports-dispositions", title: "Reports: disposition report", path: "/reports", act: tab("Disposition Report") },
  { name: "contacts", title: "Contacts", path: "/contacts" },
  { name: "contact-summary", title: "Contact: call summary", path: `/contacts/${featured.id}`, act: rail("Call summary") },
  { name: "contact-history", title: "Contact: record history", path: `/contacts/${featured.id}`, act: rail("Record history") },
  { name: "contact-script", title: "Contact: call script", path: `/contacts/${featured.id}`, act: rail("Call script") },
  { name: "contact-notes", title: "Contact: notes", path: `/contacts/${featured.id}`, act: rail("Notes") },
  { name: "contact-website", title: "Contact: website and video", path: `/contacts/${featured.id}`, act: rail("Website and video") },
  { name: "lead", title: "Lead", path: `/leads/${lead.id}`, act: rail("Call summary") },
  { name: "dialer-recents", title: "Dialer: recents", path: "/contacts", act: dock("Recents") },
  { name: "dialer-contacts", title: "Dialer: contacts", path: "/contacts", act: dock("Contacts") },
  { name: "dialer-keypad", title: "Dialer: keypad", path: "/contacts", act: dock("Keypad") },
  { name: "dialer-settings", title: "Dialer: settings", path: "/contacts", act: async (page) => { await dock()(page); await dockButton("Dialer settings")(page); } },
  { name: "dialer-live", title: "Dialer: live call", path: "/contacts", act: liveCall() },
  { name: "dialer-live-notes", title: "Dialer: live call with notes", path: "/contacts", act: liveCall(dockButton(/^Notes/)) },
  { name: "dialer-live-script", title: "Dialer: live call with the script beside it", path: "/contacts", act: liveCall(dockButton(/^Script/)) },
  { name: "dialer-summary", title: "Dialer: after the call", path: "/contacts", act: liveCall(dockButton(/End call/)) },
  { name: "history", title: "Call history", path: "/history" },
  { name: "call-overview", title: "Call review: overview", path: `/history/${featuredCall.id}`, act: tab("Overview") },
  { name: "call-recording", title: "Call review: recording and transcript", path: `/history/${featuredCall.id}`, act: tab("Recording") },
  { name: "call-ai", title: "Call review: AI review", path: `/history/${featuredCall.id}`, act: tab("AI Review") },
  { name: "call-activity", title: "Call review: activity", path: `/history/${featuredCall.id}`, act: tab("Activity") },
  { name: "call-technical", title: "Call review: technical", path: `/history/${featuredCall.id}`, act: tab("Technical") },
  { name: "scripts", title: "Scripts", path: "/scripts" },
  { name: "phone-numbers", title: "Phone numbers", path: "/phone-numbers" },
  { name: "admin-overview", title: "Admin: overview", path: "/admin", act: tab("Overview") },
  { name: "admin-activity", title: "Admin: activity log", path: "/admin", act: tab("Activity Log") },
  { name: "admin-team", title: "Admin: team activity", path: "/admin", act: tab("Team Activity") },
  { name: "admin-objects", title: "Admin: data objects", path: "/admin", act: tab("Data Objects") },
  { name: "settings-appearance", title: "Settings: appearance", path: "/settings", act: tab("Appearance") },
  { name: "settings-audio", title: "Settings: audio source", path: "/settings", act: tab("Audio Source") },
  { name: "settings-reports", title: "Settings: reports", path: "/settings", act: tab("Reports") },
  { name: "settings-account", title: "Settings: account", path: "/settings", act: tab("Account") },
];

/** A stand-in for the prospect page the dialer texts, served at /__demo/offer.html. */
function offerPage(slug: string): string {
  const p = db.agencyProspects.find((x) => x.slug === slug) ?? featured;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;font-family:system-ui,sans-serif;color:#111827;background:#f8fafc}
    header{padding:28px 24px;background:#0f172a;color:#fff}
    h1{margin:0 0 6px;font-size:24px}p{margin:0;color:#cbd5e1;font-size:14px}
    main{padding:20px 24px;display:grid;gap:12px}
    .card{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:14px}
    .card b{display:block;margin-bottom:4px}.btn{display:inline-block;margin-top:8px;padding:10px 14px;border-radius:8px;background:#4f46e5;color:#fff;font-weight:600}
  </style></head><body><header><h1>${p.name}</h1><p>${p.niche} in ${p.city}. ${p.rating} stars from ${p.reviewCount} reviews.</p>
  <span class="btn">Book online</span></header><main>
  <div class="card"><b>Ceramic tint from $199</b>Lifetime warranty, done in one visit.</div>
  <div class="card"><b>What customers say</b>"Booked on my phone, in and out in two hours."</div>
  <div class="card"><b>Open today</b>9:00 to 18:00, ${p.fullAddress}</div></main></body></html>`;
}

/** A few minutes of quiet, speech-shaped noise so the player has a real file. */
function recordingWav(seconds = 222): Buffer {
  const rate = 8000;
  const n = rate * seconds;
  const buf = Buffer.alloc(44 + n);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate, 28);
  buf.writeUInt16LE(1, 32);
  buf.writeUInt16LE(8, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n, 40);
  let seed = 7;
  for (let i = 0; i < n; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const envelope = Math.max(0, Math.sin(i / (rate * 0.9)) * Math.sin(i / (rate * 0.13)));
    buf[44 + i] = 128 + Math.round(((seed / 0x7fffffff) * 2 - 1) * 40 * envelope);
  }
  return buf;
}

function startVite(): Promise<ChildProcess> {
  const env = {
    ...process.env,
    NO_COLOR: "1",
    // Same origin, so every request is answered by the fixtures below.
    VITE_API_URL: "",
    VITE_SIP_PROVIDER: "telnyx",
    VITE_SIP_URI: "sip:demo@sip.example",
    VITE_SIP_PASSWORD: "demo",
    VITE_SIP_WS_URL: "wss://sip.example:7443",
    VITE_SIP_CALLER_ID: "+15125550100",
  };
  // Node runs Vite directly (no shell), so killing the child stops the server.
  const viteBin = path.join(path.dirname(createRequire(path.join(ROOT, "frontend", "package.json")).resolve("vite/package.json")), "bin", "vite.js");
  const child: ChildProcess = spawn(process.execPath, [viteBin, "--port", String(PORT), "--strictPort"], {
    cwd: path.join(ROOT, "frontend"),
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Vite did not start within 60s")), 60_000);
    const onData = (chunk: Buffer) => {
      // Vite colours the port, so match the text with escape codes removed.
      if (chunk.toString().replace(/\u001b\[[0-9;]*m/g, "").includes(`localhost:${PORT}`)) {
        clearTimeout(timer);
        resolve(child);
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("exit", (code) => reject(new Error(`Vite exited with ${code}`)));
  });
}

/** docs/screenshots/README.md: every shot, grouped by page, in capture order. */
function writeGallery() {
  const groups = new Map<string, Shot[]>();
  for (const shot of SHOTS) {
    const page = shot.title.split(":")[0];
    groups.set(page, [...(groups.get(page) ?? []), shot]);
  }
  const lines = [
    "# Screenshots",
    "",
    "Every page and tab of the dialer in light mode, captured from the demo workspace",
    "(fictional businesses, 555 numbers, `.example` addresses), never from a real CRM.",
    "",
    "Regenerate them all, and this file, with:",
    "",
    "```bash",
    "bun run screenshots",
    "```",
    "",
    "The capture is [scripts/screenshots/captureScreenshots.ts](../../scripts/screenshots/captureScreenshots.ts). It answers",
    "every API request from [apiFixtures.ts](../../scripts/screenshots/apiFixtures.ts), which runs the demo records in",
    "[backend/src/lib/demo](../../backend/src/lib/demo/records/demoRecords.ts) through the real route mappers.",
    "",
  ];
  for (const [page, shots] of groups) {
    lines.push(`## ${page}`, "");
    for (const s of shots) lines.push(`**${s.title.includes(":") ? s.title.split(": ")[1] : s.title}**`, "", `![${s.title}](${s.name}.png)`, "");
  }
  writeFileSync(path.join(OUT, "README.md"), lines.join("\n"));
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  // Skeletons resolve once data lands; wait for them to go.
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"], .animate-pulse'), null, { timeout: 8_000 }).catch(() => {});
  await page.waitForTimeout(600);
}

async function main() {
  const only = process.argv[2];
  const shots = only ? SHOTS.filter((s) => s.name.includes(only)) : SHOTS;
  mkdirSync(OUT, { recursive: true });
  const vite = await startVite();
  const browser = await chromium.launch();
  const unknown = new Set<string>();
  const wav = recordingWav();
  try {
    for (const shot of shots) {
      const context = await browser.newContext({ viewport: shot.viewport ?? VIEWPORT, colorScheme: "light", deviceScaleFactor: 1 });
      await context.addInitScript((token: string | null) => {
        localStorage.setItem("dialer-theme", "light");
        if (token) localStorage.setItem("cold-dialer-token", token);
        // The React Query devtools button only exists in dev builds; keep it out of the shots.
        document.addEventListener("DOMContentLoaded", () => {
          const style = document.createElement("style");
          style.textContent = ".tsqd-parent-container { display: none !important; }";
          document.head.appendChild(style);
        });
      }, shot.signedOut ? null : demoToken());
      await context.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== ORIGIN) {
          // Fonts and the stand-in pages are fine; nothing else leaves the machine.
          if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) return route.continue();
          return route.abort();
        }
        if (url.pathname === "/__demo/offer.html") return route.fulfill({ contentType: "text/html", body: offerPage(url.searchParams.get("prospect") ?? "") });
        if (url.pathname === "/__demo/recording.wav") return route.fulfill({ contentType: "audio/wav", body: wav });
        if (!url.pathname.startsWith("/api/")) return route.continue();
        const res = respond(route.request().method(), url, PAGE_URL);
        if (!res) {
          unknown.add(`${route.request().method()} ${url.pathname}`);
          return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "Not in the demo workspace" }) });
        }
        return route.fulfill({ status: res.status, contentType: "application/json", body: JSON.stringify(res.body) });
      });
      const page = await context.newPage();
      const sep = shot.path.includes("?") ? "&" : "?";
      await page.goto(`${ORIGIN}${shot.path}${sep}simulate=1`);
      await settle(page);
      if (shot.act) {
        try {
          await shot.act(page);
        } catch (err) {
          await page.screenshot({ path: path.join(OUT, `${shot.name}.failed.png`) });
          throw new Error(`${shot.name}: ${(err as Error).message.split(/\r?\n/)[0]} (see ${shot.name}.failed.png)`);
        }
        await settle(page);
      }
      await page.mouse.move(0, VIEWPORT.height - 1);
      const file = path.join(OUT, `${shot.name}.png`);
      await page.screenshot({ path: file });
      console.log(`${shot.name}.png  ${shot.title}`);
      await context.close();
    }
  } finally {
    await browser.close();
    vite.kill();
  }
  if (!only) writeGallery();
  if (unknown.size) {
    console.log("\nRequests the demo workspace does not answer (add them to apiFixtures.ts):");
    for (const u of unknown) console.log(`  ${u}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
