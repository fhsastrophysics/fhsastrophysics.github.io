// One test per bug (or per rule) the audit found. Each returns a list of problems.
import fs from "node:fs";
import path from "node:path";
import { check, settle } from "./invariants.mjs";
import { tap, swipe, pinch } from "./monkey.mjs";
import { ROUTES } from "./profiles.mjs";

export const TESTS = [];
const test = (name, on, fn, opts = {}) => TESTS.push({ name, on, fn, opts });
const PHONE = ["iphone"], BOTH = ["iphone", "laptop"], DESK = ["laptop"];
const go = async (p, h, ms = 0) => { await p.evaluate((h) => { location.hash = h; }, h); await settle(p, ms); };
const ev = (p, f, a) => p.evaluate(f, a);
const route = (p) => ev(p, () => document.querySelector(".route.active").dataset.route);
const box = async (p, sel, n = 0) => { const l = p.locator(sel).nth(n); await l.evaluate((e) => e.scrollIntoView({ block: "center", behavior: "instant" })); const b = await l.boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
const tapOn = async (p, sel, n = 0) => { const c = await box(p, sel, n); await tap(p, ...c); };
const openSel = (p) => ev(p, () => [...document.querySelectorAll(".modal.open")].map((m) => m.id).join("+"));
const CARD = { "/meetings": ".mcard:not([style*='display: none'])", "/atlas": ".acard", "/events": ".ph:not([hidden])" };

test("every page passes every rule, top to bottom", ["iphone", "iphone-se1", "iphone-land", "pixel", "ipad", "ipad-land", "laptop", "desktop", "narrow-window", "touch-laptop", "iphone-calm", "laptop-calm"], async (p) => {
  const out = [];
  for (const r of ROUTES) { await go(p, "#" + r); for (const f of [0, .3, .6, 1]) { await ev(p, (f) => scrollTo({ top: f * document.documentElement.scrollHeight, behavior: "instant" }), f); await p.waitForTimeout(350); out.push(...(await check(p)).map((b) => `${r}@${f} ${b}`)); } }
  return out;
});

test("Tab through every page never scrolls a clipped box or hides focus", ["iphone", "iphone-land", "ipad", "laptop", "narrow-window"], async (p) => {
  const out = [];
  for (const r of ROUTES) {
    await go(p, "#" + r); await ev(p, () => document.activeElement.blur());
    for (let i = 0; i < (r === "/faq" ? 40 : 45); i++) { await p.keyboard.press(p.engine === "webkit" ? "Alt+Tab" : "Tab"); if (i % 3 === 0) { await p.waitForTimeout(30); const b = (await ev(p, () => { const f = document.activeElement; if (!f || f === document.body) return null; let o = 1; for (let e = f; e; e = e.parentElement) { const c = getComputedStyle(e); if (c.visibility === "hidden") o = 0; } return o ? null : f.className; })); if (b) out.push(`${r}: focus on hidden ${b}`); } }
    await settle(p, 500);
    out.push(...(await check(p)).map((b) => `${r} ${b}`));
  }
  return out;
});

test("drag-selecting text cannot scroll a page sideways or inside itself", ["laptop", "narrow-window"], async (p) => {
  const out = [];
  for (const r of ROUTES) {
    await go(p, "#" + r); const v = p.viewportSize();
    for (const [a, b] of [[[v.width * .2, v.height * .4], [v.width - 2, v.height * .5]], [[v.width * .5, v.height * .5], [v.width * .6, v.height - 2]]]) {
      await p.mouse.move(...a); await p.mouse.down(); await p.mouse.move(...b, { steps: 12 }); for (let i = 0; i < 12; i++) { await p.mouse.move(b[0] + (i % 2), b[1]); await p.waitForTimeout(40); } await p.mouse.up();
    }
    await ev(p, () => getSelection().removeAllRanges()); await settle(p);
    out.push(...(await check(p)).map((x) => `${r} ${x}`));
  }
  return out;
});

test("in-page find / scrollIntoView cannot move a page inside itself", ["iphone", "iphone-se1", "ipad", "laptop"], async (p) => {
  const out = [];
  for (const r of ROUTES) { await go(p, "#" + r); await ev(p, () => document.querySelectorAll(".route.active a, .route.active h1, .route.active h2, .route.active p").forEach((n) => n.scrollIntoView({ block: "center", inline: "center", behavior: "instant" }))); await ev(p, () => scrollTo({ top: 0, behavior: "instant" })); await settle(p); out.push(...(await check(p)).filter((b) => /inner|h-/.test(b)).map((x) => `${r} ${x}`)); }
  return out;
});

test("a meeting link opened while another preview is up shows the meeting in the URL", BOTH, async (p) => {
  await go(p, "#meeting-2627-3", 300); await go(p, "#meeting-2526-5", 300); const a = await check(p);
  await ev(p, () => history.back()); await settle(p, 300); const b = await check(p);
  await ev(p, () => history.back()); await settle(p, 300); return a.concat(b, await check(p));
});

test("meeting links keep the season switches on every page in step", BOTH, async (p) => {
  await go(p, "#meeting-2526-5", 400); await p.keyboard.press("Escape"); await settle(p);
  const s = await ev(p, () => [...document.querySelectorAll(".arc__year.is-active")].map((b) => b.dataset.year || b.dataset.season).join());
  return s === "25,25,25" ? [] : ["seasons " + s];
});

test("leaving a meeting link before its preview opens keeps you where you went", BOTH, async (p) => {
  await ev(p, () => { location.hash = "#meeting-2627-6"; }); await p.waitForTimeout(150); await ev(p, () => { location.hash = "#/team"; }); await settle(p, 700);
  const r = await route(p), o = await openSel(p); return (r === "/team" && !o ? [] : [`on ${r} with "${o}"`]).concat(await check(p));
});

test("opening the menu while a meeting link is loading leaves one thing open", PHONE, async (p) => {
  await p.reload(); await ev(p, () => { location.hash = "#meeting-2627-6"; }); await p.waitForTimeout(120); await tapOn(p, "#navToggle"); await settle(p, 800); return check(p);
});

test("Back during the light-speed jump wins over the jump", DESK, async (p) => {
  await go(p, "#/about"); await go(p, "#/team"); await tapOn(p, '#navLinks a[data-route="/faq"]'); await p.waitForTimeout(200); await ev(p, () => history.back()); await p.waitForTimeout(1600); await settle(p);
  const r = await route(p); return (r === "/about" ? [] : ["ended on " + r]).concat(await check(p));
});

test("the last link clicked wins, even during the light-speed jump", BOTH, async (p) => {
  const out = [];
  for (const gap of [0, 200, 500, 700, 1100]) {
    await go(p, "#/about");
    for (const r of ["/team", "/join"]) { const c = await p.locator(`.footer__nav a[data-route="${r}"]`); await c.evaluate((a) => a.click()); if (r === "/team") await p.waitForTimeout(gap); }
    await p.waitForTimeout(2200); await settle(p); const r = await route(p); if (r !== "/join") out.push(`gap ${gap}ms ended on ${r}`); out.push(...await check(p));
  }
  return out;
});

test("a scroll still gliding when the page changes does not carry into the new page", BOTH, async (p) => {
  const out = [];
  for (const key of ["PageDown", "Space", "End"]) for (const gap of [0, 60, 140, 300, 480]) for (const how of ["link", "hash"]) {
    await go(p, "#/meetings"); await ev(p, () => { document.activeElement.blur(); });
    await p.keyboard.press(key); await p.waitForTimeout(gap);
    await ev(p, (how) => { if (how === "link") document.querySelector('.brand').click(); else location.hash = "#/"; }, how);
    if (how === "link" && !p.profile.touch) { await p.waitForTimeout(400); await p.keyboard.press(key); }   // again, mid-jump
    await p.waitForTimeout(how === "link" ? 1500 : 700); const y = await ev(p, () => scrollY); if (y) out.push(`${key}+${gap} ${how}: new page starts at ${Math.round(y)}`); out.push(...(await check(p)).map((b) => `${key}+${gap} ${how} ${b}`));
  }
  return out;
});

test("opening a viewer while the page is jumping away never strands it", DESK, async (p) => {
  const out = [];
  for (const [r, sel] of Object.entries(CARD)) for (const gap of [60, 300, 500]) {
    await go(p, "#" + r); const c = await box(p, sel); await p.locator('.footer__nav a[data-route="/team"]').evaluate((a) => a.click()); await p.waitForTimeout(gap); await tap(p, ...c); await p.waitForTimeout(1900); await settle(p);
    out.push(...(await check(p)).map((b) => `${r}+${gap} ${b}`));
    const before = await ev(p, () => history.length); await go(p, "#/faq"); await ev(p, () => history.back()); await settle(p, 300); await ev(p, () => history.forward()); await settle(p, 300);
    const now = await route(p); if (now !== "/faq") out.push(`${r}+${gap}: Forward stuck on ${now}`);
    if (await openSel(p)) await p.keyboard.press("Escape"); await settle(p);
  }
  return out;
});

test("holding Enter opens a card once and leaves it open", BOTH, async (p) => {
  const out = [];
  for (const [r, sel] of Object.entries(CARD)) {
    await go(p, "#" + r); await p.locator(sel).first().focus();
    const n0 = await ev(p, () => __chaos.pushes);
    await p.keyboard.down("Enter"); for (let i = 0; i < 7; i++) { await p.keyboard.down("Enter"); await p.waitForTimeout(40); } await p.keyboard.up("Enter"); await settle(p, 300);
    const n1 = await ev(p, () => __chaos.pushes), o = await openSel(p);
    if (n1 - n0 !== 1 || !o) out.push(`${r}: opened ${n1 - n0} times, now "${o}"`);
    out.push(...await check(p)); await p.keyboard.press("Escape"); await settle(p);
  }
  return out;
});

test("double Escape / Escape-then-reopen stay consistent", BOTH, async (p) => {
  const out = [];
  for (const [r, sel] of Object.entries(CARD)) for (const how of ["esc2", "esc-open", "esc-open-esc", "tapclose2", "esc-back"]) {
    await go(p, "#/about"); await go(p, "#" + r); const len0 = await ev(p, () => history.length);
    const c = await box(p, sel); await tap(p, ...c); await p.waitForTimeout(250);
    await ev(p, ({ how, sel }) => {
      const esc = () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      const open = () => document.querySelector(".route.active " + sel).click();
      if (how === "esc2") { esc(); esc(); } if (how === "esc-open") { esc(); open(); } if (how === "esc-open-esc") { esc(); open(); esc(); }
      if (how === "tapclose2") { const b = document.querySelector(".modal.open .modal__close"); b.click(); b.click(); }
      if (how === "esc-back") { esc(); history.back(); }
    }, { how, sel });
    await settle(p, 500);
    out.push(...(await check(p)).map((b) => `${r} ${how}: ${b}`));
    if (how !== "esc-back" && (await route(p)) !== r) out.push(`${r} ${how}: ended on ${await route(p)}`);
    if (how === "esc-open" && !(await openSel(p))) out.push(`${r} esc-open: viewer lost`);
    if (await openSel(p)) { await p.keyboard.press("Escape"); await settle(p); }
    if (how !== "esc-back") { await ev(p, () => history.back()); await settle(p, 300); if ((await route(p)) !== "/about") out.push(`${r} ${how}: Back went to ${await route(p)}, not the page before`); }
  }
  return out;
});

test("a viewer closes by button, backdrop, Escape and Back, and focus returns", ["iphone", "ipad", "laptop", "narrow-window"], async (p) => {
  const out = [];
  for (const [r, sel] of Object.entries(CARD)) for (const how of ["button", "backdrop", "escape", "back"]) {
    await go(p, "#" + r); await p.locator(sel).first().evaluate((n) => n.scrollIntoView({ block: "center", behavior: "instant" })); await p.locator(sel).first().focus(); await p.keyboard.press("Enter"); await settle(p, 200);
    if (!(await openSel(p))) { out.push(`${r} did not open`); continue; }
    out.push(...(await check(p)).map((b) => `${r} open: ${b}`));
    const y0 = await ev(p, () => scrollY);
    if (how === "button") await tapOn(p, ".modal.open .modal__close"); if (how === "backdrop") await tap(p, 4, p.viewportSize().height - 4);
    if (how === "escape") await p.keyboard.press("Escape"); if (how === "back") await ev(p, () => history.back());
    await settle(p, 250);
    if (await openSel(p)) out.push(`${r}: ${how} did not close it`);
    if (!(await ev(p, (sel) => document.activeElement === document.querySelector(".route.active " + sel), sel))) out.push(`${r}: focus not returned after ${how} (${await ev(p, () => document.activeElement.className || document.activeElement.tagName)})`);
    if (Math.abs((await ev(p, () => scrollY)) - y0) > 2) out.push(`${r}: page moved after ${how}`);
    out.push(...(await check(p)).map((b) => `${r} ${how}: ${b}`));
  }
  return out;
});

test("opening and closing 30 viewers does not pile up history, nodes or listeners", BOTH, async (p) => {
  const out = [];
  for (const [r, sel] of Object.entries(CARD)) {
    await go(p, "#" + r); const c = await box(p, sel);
    const once = async () => { await tap(p, ...c); await p.waitForTimeout(90); await p.keyboard.press("Escape"); await p.waitForTimeout(120); };
    await once(); await settle(p);
    const m = () => ev(p, () => [history.length, document.querySelectorAll("*").length, __chaos.listeners]); const a = await m();
    for (let i = 0; i < 12; i++) await once(); await settle(p); const b = await m();
    a.forEach((x, i) => { if (b[i] > x) out.push(`${r} ${["history", "nodes", "listeners"][i]} ${x}→${b[i]}`); });
  }
  return out;
});

test("visiting every page in every order leaks nothing", BOTH, async (p) => {
  const m = () => ev(p, () => [document.querySelectorAll("*").length, __chaos.listeners]);
  const out = []; for (const r of ROUTES) await go(p, "#" + r); await go(p, "#/"); const a = await m();
  for (const x of ROUTES) for (const y of ROUTES) if (x !== y) { await ev(p, ([x, y]) => { location.hash = "#" + x; location.hash = "#" + y; }, [x, y]); await p.waitForTimeout(40); }
  await go(p, "#/"); await settle(p, 600); const b = await m(); a.forEach((v, i) => { if (b[i] > v) out.push(`${["nodes", "listeners"][i]} ${v}→${b[i]}`); });
  return out.concat(await check(p));
});

test("the page behind a viewer or the menu does not scroll", BOTH, async (p) => {
  const out = [];
  const shove = async () => { const v = p.viewportSize(); if (p.profile.touch && p.engine === "chromium") { await swipe(p, v.width / 2, v.height * .7, v.width / 2, v.height * .2, 6); await swipe(p, 12, v.height * .9, 12, v.height * .3, 6); } else if (!p.profile.touch) { await p.mouse.move(v.width / 2, v.height / 2); await p.mouse.wheel(0, 900); await p.mouse.move(4, v.height - 4); await p.mouse.wheel(0, 900); } for (const k of ["PageDown", "End", "Space"]) { if (k !== "Space") await p.keyboard.press(k); } await p.waitForTimeout(500); };
  for (const [r, sel] of Object.entries(CARD)) { await go(p, "#" + r); await tapOn(p, sel); await settle(p, 200); const y = await ev(p, () => scrollY); await shove(); const z = await ev(p, () => scrollY); if (z !== y) out.push(`${r}: ${y}→${z}`); if (!(await openSel(p))) out.push(`${r}: scrolling closed it`); await p.keyboard.press("Escape"); await settle(p); }
  if (p.profile.touch) { await go(p, "#/meetings"); await ev(p, () => scrollTo({ top: 300, behavior: "instant" })); await tapOn(p, "#navToggle"); await settle(p); const y = await ev(p, () => scrollY); await shove(); const z = await ev(p, () => scrollY); if (z !== y) out.push(`menu: ${y}→${z}`); }
  return out;
});

test("Tab stays inside an open viewer and the open menu", BOTH, async (p) => {
  const out = []; const k = p.engine === "webkit" ? "Alt+Tab" : "Tab";
  for (const [r, sel] of Object.entries(CARD)) { await go(p, "#" + r); await tapOn(p, sel); await settle(p); for (let i = 0; i < 14; i++) { await p.keyboard.press(i % 5 === 4 ? (p.engine === "webkit" ? "Alt+Shift+Tab" : "Shift+Tab") : k); const bad = await ev(p, () => { const f = document.activeElement; return f !== document.body && !f.closest(".modal.open") ? f.className || f.tagName : null; }); if (bad) { out.push(`${r}: focus reached ${bad}`); break; } } await p.keyboard.press("Escape"); await settle(p); }
  return out;
});

test("closing the menu by backdrop, button or Escape hands focus back to the button", ["iphone", "narrow-window"], async (p) => {
  const out = [];
  for (const how of ["scrim", "button", "Escape"]) { await go(p, "#/about"); await p.locator("#navToggle").focus(); await p.keyboard.press("Enter"); await settle(p, 250); if (how === "scrim") await tap(p, 8, 400); if (how === "button") await tapOn(p, "#navToggle"); if (how === "Escape") await p.keyboard.press("Escape"); await settle(p, 300); const f = await ev(p, () => document.activeElement.id); if (f !== "navToggle") out.push(`${how}: focus on "${f || (await ev(p, () => document.activeElement.className || document.activeElement.tagName))}"`); out.push(...await check(p)); }
  return out;
});

test("Back right after a tap leaves no half-finished transition", ["iphone", "ipad", "touch-laptop", "laptop"], async (p) => {
  const out = [];
  for (const gap of [0, 40, 150, 300, 600, 900]) { await go(p, "#/about"); await go(p, "#/team"); await p.locator('.footer__nav a[data-route="/faq"]').evaluate((a) => a.click()); await p.waitForTimeout(gap); await ev(p, () => history.back()); await p.waitForTimeout(1700); const s = await ev(p, () => document.body.className + " / " + [...document.querySelectorAll(".route")].map((r) => r.className).filter((c) => /warp|prewarm/.test(c))); if (/warp/.test(s)) out.push(`${gap}ms: ${s}`); out.push(...await check(p)); }
  return out;
});

test("a press on a link that never ends leaves nothing behind", ["iphone", "touch-laptop"], async (p) => {
  await go(p, "#/about"); await ev(p, () => document.querySelector('.footer__nav a[data-route="/meetings"]').dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1 }))); await p.waitForTimeout(1900); return check(p);
});

test("every menu link works, from every page", ["iphone", "ipad"], async (p) => {
  const out = [];
  for (const from of ROUTES) for (const to of ROUTES.slice(1)) { await go(p, "#" + from); await tapOn(p, "#navToggle"); await p.waitForTimeout(120); const b = await p.locator(`#navLinks a[data-route="${to}"]`).boundingBox(); if (b.y + b.height / 2 > p.viewportSize().height) { out.push(`${to} below the menu`); continue; } await tap(p, b.x + b.width / 2, b.y + b.height / 2); await p.waitForTimeout(380); const r = await route(p); if (r !== to) out.push(`${from}→${to} ended on ${r}`); }
  return out.concat(await check(p));
});

test("\"See all photos\" keeps keyboard focus in the gallery", BOTH, async (p) => {
  await go(p, "#/events"); await p.locator(".gallery__more").first().focus(); await p.keyboard.press("Enter"); await settle(p, 200);
  const f = await ev(p, () => document.activeElement.className); return /\bph\b/.test(f) ? [] : [`focus on "${f || "body"}"`];
});

test("an invisible Back-to-top button cannot be reached by keyboard", BOTH, async (p) => {
  await go(p, "#/about"); const o = await ev(p, () => { const b = document.querySelector("#backTop"); b.focus(); return document.activeElement === b; });
  return o ? ["focused while hidden"] : [];
});

test("following a link inside the page by keyboard moves focus to the new page", BOTH, async (p) => {
  const out = [];
  for (const r of ["/about", "/team", "/faq"]) { await go(p, "#" + r); await p.locator(".route.active .route__next-link").focus(); await p.keyboard.press("Enter"); await p.waitForTimeout(1500); await settle(p); const f = await ev(p, () => { const a = document.activeElement; return a.closest(".route.active") ? "" : (a.className || a.tagName); }); if (f) out.push(`${r}: focus left on ${f}`); const y = await ev(p, () => scrollY); if (y) out.push(`${r}: new page starts at ${y}`); out.push(...await check(p)); }
  return out;
});

test("a photo that fails to load still leaves a usable viewer, and never shows the wrong photo", BOTH, async (p) => {
  const out = []; await go(p, "#/events"); await tapOn(p, ".ph"); await settle(p, 400);
  await p.keyboard.press("ArrowRight"); await p.waitForTimeout(1200);
  const s = await ev(p, () => { const i = document.querySelector("#plbImg"); return { o: +getComputedStyle(i).opacity, h: i.getBoundingClientRect().height, alt: i.alt }; });
  if (s.o < .9) out.push(`failed photo leaves a blank viewer (opacity ${s.o}, height ${s.h})`);
  return out;
}, { quiet: true, routes: (c) => c.route(/events\/.*\/(full|mid)\/.*webp/, (r) => r.abort()) });

test("slow network: the atlas viewer never shows the previous object's picture", BOTH, async (p) => {
  await go(p, "#/atlas"); await ev(p, () => document.querySelectorAll(".acard")[0].click()); await p.waitForTimeout(1200); await p.keyboard.press("Escape"); await settle(p);
  await ev(p, () => document.querySelectorAll(".acard")[4].click()); await p.waitForTimeout(200);
  return ev(p, () => { const i = document.querySelector("#lbImg"); const want = "fig-andromeda"; return i.currentSrc && !i.currentSrc.includes(want) && +getComputedStyle(i).opacity > .1 && i.naturalWidth ? [`"Andromeda Galaxy" shows ${i.currentSrc.split("/").pop()}`] : (!i.complete && +getComputedStyle(i).opacity > .1 && i.getClientRects().length && i.naturalWidth ? ["old pixels kept while loading"] : []); });
}, { quiet: true, routes: (c) => c.route(/fig-andromeda/, async (r) => { await new Promise((k) => setTimeout(k, 1500)); await r.continue().catch(() => {}); }) });

test("photo viewer: swipe pages, vertical drag and pinch do not", PHONE, async (p) => {
  const out = []; const n = () => ev(p, () => document.querySelector("#plbCount").textContent); await go(p, "#/events"); await tapOn(p, ".ph"); await settle(p, 400);
  const v = p.viewportSize(), y = v.height / 2; const at = async (want, why) => { await p.waitForTimeout(250); const c = await n(); if (!c.startsWith(want + " ")) out.push(`${why}: ${c}, expected ${want}`); };
  await at(1, "open"); await swipe(p, 320, y, 60, y); await at(2, "swipe left"); await swipe(p, 60, y, 320, y); await at(1, "swipe right");
  await swipe(p, 200, y + 100, 210, y - 200); await at(1, "vertical"); await pinch(p, 200, y, 30, 110); await at(1, "pinch"); await swipe(p, 320, y, 60, y, 5, true); await at(1, "two fingers");
  return out;
});

test("arrow keys with a modifier are the browser's, not the photo viewer's", DESK, async (p) => {
  await go(p, "#/events"); await tapOn(p, ".ph"); await settle(p, 300); const c = await ev(p, () => { for (const m of ["altKey", "metaKey", "ctrlKey"]) document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", [m]: true, bubbles: true })); return document.querySelector("#plbCount").textContent; });
  return c.startsWith("1 ") ? [] : ["moved to " + c];
});

test("the astronaut lets go when the drag is cancelled", DESK, async (p) => {
  await go(p, "#/"); await ev(p, () => { const a = document.querySelector(".home__astro-wrap"); a.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 1, bubbles: true })); window.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 1, bubbles: true })); });
  const c = await ev(p, () => document.querySelector(".home__astro-wrap").style.cursor); return c === "grabbing" ? ["still grabbed"] : [];
});

test("iOS rule: a finger landing on any link never reveals clickable content (it would eat the tap)", ["iphone", "ipad"], async (p) => {
  const out = [];
  for (const r of ROUTES) await go(p, "#" + r);
  for (const r of ["/", "/about", "/faq", "/join"]) {
    await go(p, "#" + r);
    out.push(...await ev(p, (r) => {
      const seen = () => new Set([...document.querySelectorAll("a,button,[role=button],summary,input")].filter((n) => n.getClientRects().length && getComputedStyle(n).visibility !== "hidden"));
      const bad = [];
      for (const a of document.querySelectorAll(".route.active a[data-route], .footer a[data-route], #navLinks a, .brand")) {
        const b = seen(), h = document.documentElement.scrollHeight; a.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1 }));
        const n = [...seen()].filter((x) => !b.has(x)); if (n.length) bad.push(`${r}: touching ${a.dataset.route} reveals ${n.length}`);
        if (document.documentElement.scrollHeight !== h) bad.push(`${r}: touching ${a.dataset.route} changes page height`);
        document.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1 })); document.querySelectorAll(".prewarm").forEach((x) => x.classList.remove("prewarm"));
      }
      return bad.slice(0, 3);
    }, r));
  }
  return out;
});

test("phones: no filters, blend modes or stray will-change (the iOS crash budget)", ["iphone"], async (p) => {
  const out = [];
  for (const r of ROUTES) { await go(p, "#" + r); out.push(...await ev(p, (r) => { const c = { filter: 0, blend: 0, back: 0 }; const who = []; document.querySelectorAll(".route.active *, .nav *, .footer *, body > *").forEach((n) => { if (!n.getClientRects().length) return; for (const ps of [null, "::before", "::after"]) { const s = getComputedStyle(n, ps); if (ps && s.content === "none") continue; if (s.filter !== "none") { c.filter++; who.push(n.className); } if (s.mixBlendMode !== "normal") { c.blend++; who.push(n.className); } if ((s.backdropFilter || s.webkitBackdropFilter || "none") !== "none") { c.back++; who.push(n.className); } } }); const total = c.filter + c.blend + c.back; return total > 2 ? [`${r}: ${JSON.stringify(c)} ${[...new Set(who)].slice(0, 5)}`] : []; }, r)); }
  return out;
});

const SIZES = [[260, 563], [280, 653], [320, 568], [360, 740], [375, 667], [390, 844], [414, 896], [430, 932], [568, 320], [844, 390], [768, 1024], [820, 1180], [1024, 768], [1280, 800], [1440, 900], [1920, 1080]];
const cut = () => { const W = document.documentElement.clientWidth, out = []; document.querySelectorAll(".route.active h1 .split-g, .route.active h1, .route.active h2, .route.active h3, .route.active p, .route.active a, .route.active button, .route.active summary, .nav__inner > *, .footer a").forEach((n) => { if (!n.getClientRects().length || n.closest(".arc__track, .nav__links, .home__earth-wrap") || n.closest("details:not([open]) > :not(summary)")) return; const r = n.getBoundingClientRect(); if (r.right > W + 1 || r.left < -1) out.push(`${n.tagName}.${n.className} ${Math.round(r.left)}..${Math.round(r.right)} of ${W}`); }); return out.slice(0, 3); };
for (const [label, css] of [["", ""], [" with 150% text", "html{font-size:150% !important} body{font-size:24px !important}"], [" with fonts blocked", "FONTS"]])
  test(`nothing is cut off at any width${label}`, BOTH, async (p) => {
    const out = [];
    if (css && css !== "FONTS") await p.addStyleTag({ content: css });
    for (const [w, h] of SIZES) { if (css && css !== "FONTS" && (w > 860 || w < 375)) continue;   // enlarged text past the phone widths is handled by em breakpoints, which injected CSS can't reach
       if (p.profile.touch !== (w < 1024)) continue; await p.setViewportSize({ width: w, height: h }); for (const r of ROUTES) { await go(p, "#" + r, -200); out.push(...(await ev(p, cut)).map((x) => `${w}x${h} ${r} ${x}`)); const o = await ev(p, () => document.documentElement.scrollWidth - document.documentElement.clientWidth); if (o > 1) out.push(`${w}x${h} ${r} scrolls sideways ${o}px`); } }
    return out;
  }, css === "FONTS" ? { quiet: true, routes: (c) => c.route(/fonts\.g/, (r) => r.abort()) } : {});

test("home: both buttons are on the first screen", ["iphone", "iphone-se1", "iphone-land", "pixel", "ipad", "ipad-land", "laptop", "desktop"], async (p) => ev(p, () => [...document.querySelectorAll(".home__actions a")].filter((a) => a.getBoundingClientRect().bottom > innerHeight).map((a) => `${a.textContent.trim()} ends at ${Math.round(a.getBoundingClientRect().bottom)} of ${innerHeight}`)));

test("touch targets are at least 44px tall", ["iphone", "iphone-se1", "pixel", "ipad"], async (p) => {
  const out = [];
  const scan = () => { const bad = []; const vis = (n) => n.getClientRects().length && getComputedStyle(n).visibility !== "hidden" && !n.closest("[inert]") && !n.closest("details:not([open]) > :not(summary)");
    const root = document.querySelector(".modal.open") || document; const list = root === document ? ".route.active a, .route.active button, .route.active [role=button], .route.active summary, .route.active input, .footer a, .nav__inner > a, .nav__toggle, .nav__links.open a" : "a, button";
    root.querySelectorAll(list).forEach((n) => { if (!vis(n) || (n.closest(".nav__inner") && root === document && n.closest("#navLinks") && !n.closest(".open"))) return; if (getComputedStyle(n).display === "inline" && n.closest("p")) return;
      if (n.closest(".route, .footer, .modal__panel, .lightbox__body")) n.scrollIntoView({ block: "center", behavior: "instant" }); const r = n.getBoundingClientRect(); const x = r.left + Math.min(r.width / 2, 30), y = r.top + r.height / 2; const at = (y) => { const e = document.elementFromPoint(x, y); return e && (e === n || n.contains(e)); }; if (!at(y)) return; let u = 0, d = 0; while (u < 30 && at(y - u - 1)) u++; while (d < 30 && at(y + d + 1)) d++; if (u + d + 1 < 43) bad.push(`${u + d + 1}px ${n.className || n.tagName} "${n.textContent.trim().slice(0, 18)}"`); }); return bad; };
  for (const r of ROUTES) { await go(p, "#" + r); await ev(p, () => document.querySelectorAll(".reveal").forEach((n) => n.classList.add("reveal-now", "is-visible"))); await p.waitForTimeout(400); out.push(...(await ev(p, scan)).map((x) => `${r} ${x}`)); }
  for (const [r, sel] of Object.entries(CARD)) { await go(p, "#" + r); await tapOn(p, sel); await settle(p, 300); out.push(...(await ev(p, scan)).map((x) => `${r} viewer ${x}`)); await p.keyboard.press("Escape"); await settle(p); }
  return [...new Set(out)];
});

test("all pictures missing: pages still work", BOTH, async (p) => { const out = []; for (const r of ROUTES) { await go(p, "#" + r); out.push(...(await check(p)).filter((b) => !/broken-image|http|request|console/.test(b)).map((b) => `${r} ${b}`)); } for (const [r, sel] of Object.entries(CARD)) { await go(p, "#" + r); await tapOn(p, sel); await settle(p, 300); out.push(...(await check(p)).filter((b) => !/broken-image|http|request|console/.test(b)).map((b) => `${r} viewer ${b}`)); await p.keyboard.press("Escape"); await settle(p); } return out; }, { quiet: true, routes: (c) => c.route(/\.(png|jpe?g|webp)(\?|$)/, (r) => r.abort()) });

test("without JavaScript the pages are still readable", BOTH, async (p) => { const t = await p.locator("body").innerText(); return /When and where are meetings held/.test(t) && /Founded in September 2025/.test(t) ? [] : [`page is blank (${t.length} characters)`]; }, { quiet: true, extra: { javaScriptEnabled: false }, nojs: true });

for (const [what, pre] of [
  ["IntersectionObserver missing", () => { delete window.IntersectionObserver; }],
  ["IntersectionObserver throws", () => { window.IntersectionObserver = class { constructor() { throw new Error("chaos"); } }; }],
  ["matchMedia without change events", () => { const m = window.matchMedia.bind(window); window.matchMedia = (q) => { const x = m(q); return { matches: x.matches, media: q }; }; }],
  ["pushState refused", () => { history.pushState = () => { throw new DOMException("chaos", "SecurityError"); }; }],
  ["pushState and replaceState refused", () => { history.pushState = history.replaceState = () => { throw new DOMException("chaos", "SecurityError"); }; }],
  ["canvas unavailable", () => { HTMLCanvasElement.prototype.getContext = () => null; }],
  ["one part of the page missing", () => { document.addEventListener("DOMContentLoaded", () => { document.querySelector("#arcTrack")?.remove(); document.querySelector("#plbTitle")?.remove(); document.querySelector("#eventsList")?.remove(); document.querySelector("#navLinks")?.removeAttribute("x"); }, true); }],
]) test(`broken browser: ${what}`, BOTH, async (p) => {
  const out = []; p.log.splice(0);
  for (const r of ROUTES) { await go(p, "#" + r); const now = await route(p).catch(() => "nothing"); if (now !== r) out.push(`${r} shows ${now}`); }
  await go(p, "#/meetings"); await tapOn(p, CARD["/meetings"]).catch((e) => out.push("no cards")); await settle(p, 200); if (!(await openSel(p))) out.push("preview did not open"); await p.keyboard.press("Escape"); await settle(p, 200); if (await openSel(p)) out.push("preview did not close");
  if (await ev(p, () => document.body.style.overflow === "hidden" || document.querySelector("#router").hasAttribute("inert"))) out.push("page left locked");
  if (p.profile.touch) { await tapOn(p, "#navToggle"); await p.waitForTimeout(400); await tapOn(p, '#navLinks a[data-route="/team"]'); await settle(p, 200); if ((await route(p)) !== "/team") out.push("menu link dead"); }
  return out;
}, { pre, quiet: true });

test("copy button says it copied only when it did", BOTH, async (p) => { await go(p, "#/join"); await tapOn(p, ".js-copy-btn"); await p.waitForTimeout(500); const t = await ev(p, () => document.querySelector("#toast").classList.contains("on") ? document.querySelector("#toast").textContent : ""); return /^Copied/.test(t) ? [`said "${t}" though both copy methods failed`] : []; }, { pre: () => { Object.defineProperty(navigator, "clipboard", { value: { writeText: () => Promise.reject(new Error("denied")) } }); document.execCommand = () => false; } });

test("sign-up never loses a typed address", BOTH, async (p) => {
  const out = []; await go(p, "#/join"); const i = p.locator(".signup__input");
  await i.fill("not an email"); await i.press("Enter"); await p.waitForTimeout(200); if ((await i.inputValue()) !== "not an email") out.push("bad address wiped"); if ((await ev(p, () => __chaos.opened.length))) out.push("bad address sent");
  await i.fill("test.person@example.com"); await i.press("Enter"); await p.waitForTimeout(300); const o = await ev(p, () => __chaos.opened); if (o.length !== 1 || !/entry\.624766096=test\.person%40example\.com/.test(o[0])) out.push("opened " + o);
  return out;
});

for (const [label, when, want] of [["before", -90061e3, /Next meeting/], ["during", 60e3, /Happening now/], ["after", 3 * 3600e3, /Last meeting/]])
  test(`next-meeting card reads right ${label} the meeting`, BOTH, async (p) => {
    await p.clock.install({ time: Date.parse("2026-11-18T12:55:00-08:00") + when }); await p.reload(); await p.clock.runFor(3000); await ev(p, () => { location.hash = "#/join"; }); await p.clock.runFor(2000);
    const s = await ev(p, () => [document.querySelector(".nextmeet__k").textContent, getComputedStyle(document.querySelector(".nextmeet__clock")).display, document.querySelector('[data-nm-unit="days"]').textContent]);
    return want.test(s[0]) && (label === "before") === (s[1] !== "none") ? [] : [s.join(" | ")];
  });

test("loose and broken addresses land on a real page and are corrected", BOTH, async (p) => {
  const out = []; for (const [h, r] of [["#/About/", "/about"], ["#about", "/about"], ["#/nope", "/"], ["#", "/"], ["#/%E0%A4%A", "/"], ["#meeting-zzz", "/meetings"], ["#meeting-2526-99", "/meetings"], ["#//team", "/team"], ["#/team?x=1", "/team"]]) { await go(p, "#/faq"); await go(p, h, 300); const now = await route(p); if (now !== r) out.push(`${h} → ${now}, expected ${r}`); out.push(...(await check(p)).map((b) => `${h} ${b}`)); } return out;
});

test("reload on every page and in every viewer comes back to the same place", BOTH, async (p) => {
  const out = []; for (const h of [...ROUTES.map((r) => "#" + r), "#meeting-2526-4"]) { await go(p, h); await p.reload(); await settle(p, 400); out.push(...(await check(p)).map((b) => `${h} ${b}`)); }
  await p.keyboard.press("Escape"); for (const [r, sel] of Object.entries(CARD)) { await go(p, "#/about"); await go(p, "#" + r); await tapOn(p, sel); await settle(p); await p.reload(); await settle(p, 500); out.push(...(await check(p)).map((b) => `${r} viewer ${b}`)); if (await openSel(p)) { await p.keyboard.press("Escape"); await settle(p); } await ev(p, () => history.back()); await settle(p, 300); if ((await route(p)) !== "/about") out.push(`${r}: Back after reload went to ${await route(p)}`); }
  return out;
});

test("Back and Forward step through pages and viewers one at a time", BOTH, async (p) => {
  const out = []; await go(p, "#/about"); await go(p, "#/atlas"); await tapOn(p, ".acard"); await settle(p); await go(p, "#/team"); await go(p, "#/faq");
  const seen = []; for (let i = 0; i < 4; i++) { await ev(p, () => history.back()); await settle(p, 250); seen.push(await route(p)); out.push(...(await check(p)).map((b) => `back ${i}: ${b}`)); if (seen.at(-1) === "/about") break; }
  if (seen.at(-1) !== "/about") out.push("back: " + seen); for (let i = 0; i < 4; i++) { await ev(p, () => history.forward()); await settle(p, 250); out.push(...(await check(p)).map((b) => `fwd ${i}: ${b}`)); }
  if ((await route(p)) !== "/faq") out.push(`Forward x4 ended on ${await route(p)}, expected /faq`); return out;
});

test("rotating and resizing mid-action leaves everything usable", ["iphone", "ipad", "laptop"], async (p) => {
  const out = []; const v = p.viewportSize(); const flip = async () => { const c = p.viewportSize(); await p.setViewportSize({ width: c.height, height: c.width }); await p.waitForTimeout(300); };
  for (const [r, sel] of Object.entries(CARD)) { await go(p, "#" + r); await tapOn(p, sel); await p.waitForTimeout(60); await flip(); await settle(p, 200); out.push(...(await check(p)).map((b) => `${r} rotated ${b}`)); const ok = await ev(p, () => { const b = document.querySelector(".modal.open .modal__close").getBoundingClientRect(); return b.top >= 0 && b.right <= innerWidth && b.bottom <= innerHeight; }); if (!ok) out.push(`${r}: close button off screen after rotating`); await flip(); await p.keyboard.press("Escape"); await settle(p); }
  if (v.width <= 860) { await go(p, "#/about"); await tapOn(p, "#navToggle"); await p.setViewportSize({ width: 1000, height: 700 }); await settle(p, 300); out.push(...await check(p)); await p.setViewportSize(v); await settle(p, 200); out.push(...await check(p)); }
  return out;
});

test("a fast fling never leaves blank cards", ["iphone", "laptop"], async (p) => { const out = []; for (const r of ["/meetings", "/notes", "/atlas", "/events"]) { await go(p, "#" + r); await ev(p, async () => { for (let i = 0; i < 12; i++) { scrollBy({ top: 1400, behavior: "instant" }); await new Promise(requestAnimationFrame); } for (let i = 0; i < 5; i++) { scrollBy({ top: -1700, behavior: "instant" }); await new Promise(requestAnimationFrame); } }); await p.waitForTimeout(700); out.push(...(await check(p)).map((b) => `${r} ${b}`)); } return out; });

test("no page has a missing file behind any link", DESK, async (p) => {
  const out = []; const links = new Set(); for (const r of ROUTES) { await go(p, "#" + r); for (const h of await ev(p, () => [...document.querySelectorAll("a[href], img[src]")].map((n) => n.href || n.src))) links.add(h); }
  await ev(p, () => document.querySelectorAll('[data-season="25"], [data-year="25"]').forEach((b) => b.click()));
  for (const n of await ev(p, () => [...document.querySelectorAll(".mcard")].map((c) => c.id))) { await go(p, "#" + n, 100); for (const h of await ev(p, () => [...document.querySelectorAll("#meetingModal a")].map((a) => a.href))) links.add(h); }
  const here = new URL(p.url()).origin; for (const u of links) { if (!u.startsWith(here)) { if (!/^(https:|mailto:)/.test(u)) out.push("odd link " + u); continue; } if (u.includes("#") && new URL(u).pathname === "/") continue; const res = await fetch(u); if (!res.ok) out.push(`${res.status} ${u}`); }
  return out;
});

test("no em dashes in visible text or picture names", DESK, async (p) => { const out = []; for (const r of ROUTES) { await go(p, "#" + r); const b = await ev(p, () => (document.querySelector(".route.active").innerText.match(/.{0,20}—.{0,20}/) || [])[0]); if (b) out.push(`${r} "${b}"`); } await go(p, "#/events"); await tapOn(p, ".ph"); await settle(p); const a = await ev(p, () => document.querySelector("#plbImg").alt); if (a.includes("—")) out.push(`photo alt "${a}"`); return out; });

test("screen readers hear page titles as words", BOTH, async (p) => { const out = []; for (const r of ROUTES) { await go(p, "#" + r); const b = await ev(p, () => { const h = document.querySelector(".route.active h1"); return h.querySelector(".split-c") && !h.getAttribute("aria-label") ? h.textContent : ""; }); if (b) out.push(`${r} "${b}" read letter by letter`); } return out; });
