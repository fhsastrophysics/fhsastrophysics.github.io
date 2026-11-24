// Seeded random user. Same seed + profile + engine = same choices.
import { cdp } from "./browser.mjs";
import { check, settle } from "./invariants.mjs";
import { ROUTES } from "./profiles.mjs";
export function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const targets = (page) => page.evaluate(() => {
  const out = [];
  document.querySelectorAll("a[href], button, [role=button], summary, input, .home__astro-wrap, .modal__scrim, .nav__scrim, .plb__fig img").forEach((n) => {
    const r = n.getBoundingClientRect(); if (!r.width || !r.height) return;
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return;
    if (getComputedStyle(n).visibility === "hidden" || n.closest("[inert]")) return;
    out.push({ x, y, l: n.tagName.toLowerCase() + "." + String(n.className.baseVal ?? n.className).split(" ")[0] + (n.dataset.route ? "→" + n.dataset.route : "") + (n.id ? "#" + n.id : "") });
  });
  return out;
});

async function touch(page, type, pts) { const c = await cdp(page); await c.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: i })) }); }
// WebKit has no trusted multi-touch input; the same gesture is sent as DOM touch events (no native scrolling).
async function fakeTouch(page, path, two) {
  await page.evaluate(({ path, two }) => {
    const [x0, y0] = path[0], el = document.elementFromPoint(x0, y0) || document.body;
    const mk = (t, pts) => { const list = pts.map(([x, y], i) => ({ identifier: i, target: el, clientX: x, clientY: y, pageX: x, pageY: y })); const ev = new Event(t, { bubbles: true, cancelable: true }); Object.defineProperty(ev, "touches", { value: t === "touchend" ? [] : list }); Object.defineProperty(ev, "changedTouches", { value: list }); el.dispatchEvent(ev); };
    const both = ([x, y]) => two ? [[x, y], [x + 40, y + 40]] : [[x, y]];
    mk("touchstart", both(path[0])); path.slice(1, -1).forEach((p) => mk("touchmove", both(p))); mk("touchend", both(path.at(-1)));
  }, { path, two });
}
export async function swipe(page, x0, y0, x1, y1, steps = 8, two = false) {
  const path = Array.from({ length: steps + 1 }, (_, i) => [x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps]);
  if (page.engine !== "chromium") return fakeTouch(page, path, two);
  const p = (q) => two ? [q, [q[0] + 60, q[1] + 60]] : [q];
  await touch(page, "touchStart", p(path[0]));
  for (const q of path.slice(1)) { await touch(page, "touchMove", p(q)); await page.waitForTimeout(8); }
  await touch(page, "touchEnd", []);
}
export async function pinch(page, x, y, from, to) {
  if (page.engine !== "chromium") return fakeTouch(page, [[x, y], [x + 5, y], [x + 60, y]], true);
  await touch(page, "touchStart", [[x - from, y], [x + from, y]]);
  for (let i = 1; i <= 6; i++) { const k = from + (to - from) * i / 6; await touch(page, "touchMove", [[x - k, y], [x + k, y]]); await page.waitForTimeout(8); }
  await touch(page, "touchEnd", []);
}
export const tap = (page, x, y) => page.profile.touch ? page.touchscreen.tap(x, y) : page.mouse.click(x, y);

export async function monkey(page, { seed, steps = 120, base, onStep, ignore }) {
  const r = rng(seed), pick = (a) => a[Math.floor(r() * a.length)], between = (a, b) => a + (b - a) * r();
  const trace = [], T = page.profile.touch;
  // A queued Back can interrupt the reload; wait for it and try again.
  const reopen = async () => { for (let i = 0; i < 5; i++) { try { await page.goto(base); return; } catch { await page.waitForTimeout(400); } } };
  const vp = () => page.viewportSize();
  const home = vp();
  const pt = () => { const v = vp(); return [Math.floor(between(2, v.width - 2)), Math.floor(between(2, v.height - 2))]; };
  const target = async () => { const t = await targets(page); return t.length ? pick(t) : null; };
  const hashes = [...ROUTES.map((x) => "#" + x), "#/nope", "#/About/", "#", "#meeting-2627-6", "#meeting-2526-3", "#meeting-9", "#meeting-zzz", "#meeting-2526-99", "#/../x", "#/%E0%A4%A", "#nextMeeting", "#about"];
  const A = {
    async tapTarget() { const t = await target(); if (!t) return "tapTarget none"; await tap(page, t.x, t.y); return "tap " + t.l; },
    async tapEdge() { const t = await target(); if (!t) return "none"; const dx = between(-30, 30), dy = between(-18, 18); const v = vp(); await tap(page, Math.min(v.width - 1, Math.max(1, t.x + dx)), Math.min(v.height - 1, Math.max(1, t.y + dy))); return "tapNear " + t.l; },
    async tapPoint() { const [x, y] = pt(); await tap(page, x, y); return `tap ${x},${y}`; },
    async rapid() { const t = await target(); if (!t) return "none"; const n = 2 + Math.floor(r() * 5); for (let i = 0; i < n; i++) await tap(page, t.x, t.y); return `rapid x${n} ${t.l}`; },
    async twoFast() { const a = await target(), b = await target(); if (!a) return "none"; await tap(page, a.x, a.y); await tap(page, b.x, b.y); return `fast ${a.l} then ${b.l}`; },
    async dbl() { const t = await target(); if (!t) return "none"; if (T) { await tap(page, t.x, t.y); await tap(page, t.x, t.y); } else await page.mouse.dblclick(t.x, t.y); return "dbl " + t.l; },
    async pressDrag() { const a = await target(), b = await target(); if (!a) return "none"; if (T) await swipe(page, a.x, a.y, b.x, b.y, 5); else { await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 5 }); await page.mouse.up(); } return `press ${a.l} release ${b.l}`; },
    async drag() { const [a, b] = pt(), [c, d] = pt(); if (T) await swipe(page, a, b, c, d); else { await page.mouse.move(a, b); await page.mouse.down(); await page.mouse.move(c, d, { steps: 6 }); await page.mouse.up(); } return `drag ${a},${b}-${c},${d}`; },
    async scroll() { const [x, y] = pt(); const dy = pick([-3000, -800, -300, 300, 800, 2500, 6000]), dx = pick([0, 0, 0, -400, 400]); if (T && page.engine === "webkit") await page.evaluate(([dx, dy]) => window.scrollBy(dx, dy), [dx, dy]); else if (T) await swipe(page, x, Math.min(vp().height - 5, Math.max(5, vp().height / 2 + Math.sign(dy) * 160)), x - dx / 4, vp().height / 2 - Math.sign(dy) * 160, 4); else { await page.mouse.move(x, y); await page.mouse.wheel(dx, dy); } return `scroll ${dx},${dy}`; },
    async key() { const k = pick(["Tab", "Tab", "Tab", "Shift+Tab", "Enter", "Space", "Escape", "Escape", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageDown", "PageUp"]); await page.keyboard.press(k); return "key " + k; },
    async keys() { const s = []; for (let i = 0, n = 2 + Math.floor(r() * 6); i < n; i++) { const k = pick(["Tab", "Tab", "Enter", "Escape", "Space", "ArrowRight", "Shift+Tab"]); await page.keyboard.press(k); s.push(k); } return "keys " + s.join(","); },
    async holdEnter() { await page.keyboard.down("Enter"); for (let i = 0; i < 6; i++) await page.keyboard.down("Enter"); await page.keyboard.up("Enter"); return "hold Enter"; },
    async back() { await page.evaluate(() => { if (window.__chaosDepth === undefined) window.__chaosDepth = 0; history.back(); }); return "back"; },
    async forward() { await page.evaluate(() => history.forward()); return "forward"; },
    async backSpam() { const n = 2 + Math.floor(r() * 4); const p = Array.from({ length: n }, () => r() < .6 ? -1 : 1); await page.evaluate((p) => p.forEach((d) => history.go(d)), p); return "go " + p.join(","); },
    async hash() { const h = pick(hashes); await page.evaluate((h) => { location.hash = h; }, h); return "hash " + h; },
    async hashTwice() { const a = pick(hashes), b = pick(hashes); await page.evaluate(([a, b]) => { location.hash = a; location.hash = b; }, [a, b]); return `hash ${a} ${b}`; },
    async reload() { await page.reload({ waitUntil: "load" }); return "reload"; },
    async resize() { const v = pick([[320, 568], [375, 667], [414, 896], [768, 1024], [1024, 768], [1280, 800], [1920, 1080], [740, 360], [861, 700], [860, 700]]); await page.setViewportSize({ width: v[0], height: v[1] }); return "resize " + v; },
    async rotate() { const v = vp(); await page.setViewportSize({ width: v.height, height: v.width }); return "rotate"; },
    async unsize() { await page.setViewportSize(home); return "resize back"; },
    async hover() { if (T) return A.tapPoint(); const t = await target(); if (!t) return "none"; await page.mouse.move(t.x, t.y); await page.mouse.move(1, 1); return "hover " + t.l; },
    async right() { const t = await target(); if (!t) return "none"; if (T) { if (page.engine === "chromium") { await touch(page, "touchStart", [[t.x, t.y]]); await page.waitForTimeout(650); await touch(page, "touchEnd", []); } return "longpress " + t.l; } await page.mouse.click(t.x, t.y, { button: "right" }); await page.keyboard.press("Escape"); return "right " + t.l; },
    async pinch() { if (!T) return A.scroll(); const [x, y] = pt(); await pinch(page, x, y, pick([20, 90]), pick([30, 100])); return "pinch"; },
    async twoFinger() { if (!T) return A.drag(); const [a, b] = pt(), [c, d] = pt(); await swipe(page, a, b, c, d, 5, true); return "two-finger"; },
    async swipeSide() { if (!T) return A.drag(); const v = vp(), y = v.height * between(.3, .7), L = r() < .5; await swipe(page, v.width * (L ? .85 : .15), y, v.width * (L ? .1 : .9), y + between(-20, 20), 6); return "swipe " + (L ? "left" : "right"); },
    async menu() { const on = await page.locator("#navToggle").isVisible(); if (!on) return A.tapTarget(); const b = await page.locator("#navToggle").boundingBox(); await tap(page, b.x + b.width / 2, b.y + b.height / 2); return "menu button"; },
    async hide() { await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); document.dispatchEvent(new Event("visibilitychange")); }); await page.waitForTimeout(between(20, 400)); await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event("visibilitychange")); }); return "background+return"; },
    // Open a viewer and immediately do something rude to it.
    async viewer() {
      const sel = pick([".mcard", ".acard", ".ph", ".arc-node"]);
      const p = await page.evaluate((sel) => { const a = [...document.querySelectorAll(".route.active " + sel)].filter((n) => n.getClientRects().length && !n.hidden); if (!a.length || document.querySelector(".modal.open")) return null; const n = a[Math.floor(a.length / 2)]; n.scrollIntoView({ block: "center", behavior: "instant" }); const b = n.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; }, sel);
      if (!p) { const h = { ".mcard": "#/meetings", ".acard": "#/atlas", ".ph": "#/events", ".arc-node": "#/about" }[sel]; await page.evaluate((h) => { location.hash = h; }, h); return "go " + h; }
      const v = vp(); if (p[0] < 0 || p[0] > v.width || p[1] < 0 || p[1] > v.height) return "viewer off screen";
      await tap(page, ...p);
      const then = pick(["none", "none", "none", "esc", "esc2", "esc-tap", "back", "back2", "fwd", "tap", "hash", "resize", "arrows", "reload", "corner"]);
      const esc = () => page.keyboard.press("Escape");
      if (then === "esc") await esc(); if (then === "esc2") { await esc(); await esc(); }
      if (then === "esc-tap") { await esc(); await tap(page, ...p); }
      if (then === "back") await page.evaluate(() => history.back()); if (then === "back2") await page.evaluate(() => history.go(-2));
      if (then === "fwd") { await esc(); await page.waitForTimeout(200); await page.evaluate(() => history.forward()); }
      if (then === "tap") await tap(page, ...p); if (then === "hash") await A.hash(); if (then === "resize") await A.resize(); if (then === "reload") await page.reload({ waitUntil: "load" });
      if (then === "arrows") for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowRight"); if (then === "corner") await tap(page, 3, v.height - 3);
      return `viewer ${sel} ${then}`;
    },
    async jump() { const f = r(); await page.evaluate((f) => window.scrollTo(0, f * document.documentElement.scrollHeight), f); return "jump " + f.toFixed(2); },
  };
  const W = { tapTarget: 16, tapEdge: 4, tapPoint: 4, rapid: 5, twoFast: 7, dbl: 3, pressDrag: 3, drag: 3, scroll: 7, key: 5, keys: 3, holdEnter: 2, back: 6, forward: 4, backSpam: 2, hash: 3, hashTwice: 2, reload: 1, resize: 1.5, rotate: 1.5, unsize: 2, hover: 2, right: 2, pinch: 1.5, twoFinger: 1, swipeSide: 3, menu: 5, hide: 1, jump: 4, viewer: 14 };
  const total = Object.values(W).reduce((a, b) => a + b, 0);
  const next = () => { let k = r() * total; for (const n in W) if ((k -= W[n]) < 0) return n; return "tapTarget"; };
  for (let i = 0; i < steps; i++) {
    const name = next();
    const gap = pick([0, 0, 30, 120, 300, 560, 900, 1400]);
    let d;
    try { d = await A[name](); } catch (e) { d = name + " !" + e.message.split("\n")[0]; }
    trace.push(d);
    // Back past the first entry leaves the site, as it does for a person. Walk back in.
    if (!page.url().startsWith(base)) { await reopen(); trace.push("(left the site, reopened)"); continue; }
    if (r() < .55) { await page.waitForTimeout(gap); continue; }
    await settle(page);
    if (!page.url().startsWith(base)) { await reopen(); trace.push("(left the site, reopened)"); continue; }
    // A pinch can leave the page zoomed, where layout coordinates no longer match taps. Zoom back out first.
    if (T && page.engine === "chromium") { const s = await page.evaluate(() => visualViewport.scale); if (s > 1.01) { await page.reload({ waitUntil: "load" }); const c = await cdp(page); await c.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 }); trace.push("(zoom reset)"); await settle(page, 300); } }
    const bad = (await check(page)).filter((b) => !ignore || !ignore.test(b));
    if (onStep) onStep(i, d, bad);
    if (bad.length) return { ok: false, step: i, bad, trace };
  }
  await settle(page, 400);
  const bad = (await check(page)).filter((b) => !ignore || !ignore.test(b));
  return { ok: !bad.length, step: steps, bad, trace };
}
