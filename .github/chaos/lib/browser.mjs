// Opens the site with everything outside it blocked, and every error recorded.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, webkit } from "playwright";
import { PROFILES } from "./profiles.mjs";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(HERE, "..", "out", "fontcache");
export const ENGINES = { chromium, webkit };

const FONT = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;
const mem = new Map();
async function fontRoute(route) {
  const u = route.request().url();
  const key = Buffer.from(u).toString("base64url").slice(-120) + (/webkit/i.test(route.request().headers()["user-agent"] || "") ? "" : "");
  const f = path.join(CACHE, key);
  try {
    if (!mem.has(u)) {
      if (fs.existsSync(f)) mem.set(u, JSON.parse(fs.readFileSync(f, "utf8")));
      else {
        const r = await fetch(u, { headers: { "user-agent": "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/138 Safari/537.36" } });
        const e = { type: r.headers.get("content-type"), body: Buffer.from(await r.arrayBuffer()).toString("base64") };
        fs.mkdirSync(CACHE, { recursive: true }); fs.writeFileSync(f, JSON.stringify(e)); mem.set(u, e);
      }
    }
    const e = mem.get(u);
    await route.fulfill({ status: 200, contentType: e.type, body: Buffer.from(e.body, "base64"), headers: { "access-control-allow-origin": "*" } });
  } catch { try { await route.abort(); } catch {} }
}

// Runs in the page before its own script: counts listeners, records blocked exits.
function instrument() {
  const W = (window.__chaos = { listeners: 0, opened: [], rejections: [], errors: [], pushes: 0 });
  const add = EventTarget.prototype.addEventListener, rem = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function (...a) { W.listeners++; return add.apply(this, a); };
  EventTarget.prototype.removeEventListener = function (...a) { W.listeners--; return rem.apply(this, a); };
  add.call(window, "unhandledrejection", (e) => W.rejections.push(String(e.reason)));
  add.call(window, "error", (e) => { if (e.message) W.errors.push(e.message + " @" + e.lineno); });
  const ps = history.pushState; history.pushState = function (...a) { W.pushes++; return ps.apply(this, a); };
  window.open = (u) => { W.opened.push(String(u)); return { opener: null }; };
  // Nothing may leave the page: new-tab links, mail links and the sign-up form are recorded, not followed.
  add.call(window, "click", (e) => {
    const a = e.target.closest && e.target.closest("a[href]"); if (!a) return;
    const out = a.target === "_blank" || /^(mailto:|tel:)/.test(a.href) || (a.host && a.host !== location.host) || /\.pdf($|\?)/.test(a.href);
    if (out || ((e.metaKey || e.ctrlKey || e.shiftKey) && !e.defaultPrevented)) { W.opened.push(a.href); e.preventDefault(); }
  });
  add.call(window, "auxclick", (e) => e.preventDefault(), true);
  add.call(window, "submit", (e) => e.preventDefault());
}

export async function launch(engine) { return ENGINES[engine].launch({ headless: true }); }

export async function open(browser, profile, url, { extra = {}, routes, quiet = false, pre } = {}) {
  const P = PROFILES[profile];
  const ctx = await browser.newContext({ ...P.opts, acceptDownloads: false, ...extra });
  await ctx.addInitScript(instrument);
  if (pre) await ctx.addInitScript(pre);
  const origin = new URL(url).origin;
  await ctx.route((u) => u.origin !== origin, (r) => FONT.test(r.request().url()) ? fontRoute(r) : r.abort());
  if (routes) await routes(ctx);
  const page = await ctx.newPage();
  page.log = [];
  ctx.on("page", (p) => { if (p !== page) p.close().catch(() => {}); });
  page.on("pageerror", (e) => page.log.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !quiet) page.log.push("console: " + m.text()); });
  page.on("requestfailed", (r) => { const er = r.failure() && r.failure().errorText; if (r.url().startsWith(origin) && !/abort|cancel/i.test(er || "") && !quiet) page.log.push("requestfailed: " + r.url() + " " + er); });
  page.on("response", (r) => { if (r.url().startsWith(origin) && r.status() >= 400 && !quiet) page.log.push(`http ${r.status()}: ${r.url()}`); });
  page.on("dialog", (dl) => dl.dismiss().catch(() => {}));
  page.profile = P; page.profileName = profile; page.engine = browser.browserType().name();
  await page.goto(url, { waitUntil: "load" });
  return page;
}
export async function cdp(page) {
  if (page.engine !== "chromium") return null;
  return (page._cdp ||= await page.context().newCDPSession(page));
}
