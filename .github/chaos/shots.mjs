// node shots.mjs <root> <outdir> [engine] — every page and viewer at every width, with layout problems listed.
import fs from "node:fs";
import path from "node:path";
import { serve } from "./lib/server.mjs";
import { launch, open } from "./lib/browser.mjs";
import { ROUTES } from "./lib/profiles.mjs";
const [root, outDir, engine = "webkit", only = ""] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const site = await serve(path.resolve(root));
const b = await launch(engine);
const SIZES = [[320, 568], [360, 740], [375, 667], [390, 844], [414, 896], [430, 932], [844, 390], [568, 320], [768, 1024], [820, 1180], [1024, 768], [1180, 820], [1280, 800], [1440, 900], [1920, 1080]];
const T = (w, h) => Math.min(w, h) < 700 || w <= 1180 && h !== 800;
for (const [w, h] of SIZES) {
  if (only && !only.split(",").includes(`${w}x${h}`)) continue;
  const touch = T(w, h);
  const page = await open(b, touch ? "iphone" : "laptop", site.url, { extra: touch ? { viewport: { width: w, height: h }, deviceScaleFactor: 1 } : { viewport: { width: w, height: h } } });
  await page.waitForTimeout(2600);
  for (const r of ROUTES) {
    await page.evaluate((r) => { location.hash = r; }, r); await page.waitForTimeout(700);
    await page.evaluate(() => { document.querySelectorAll(".route.active .reveal, .route.active .section-in").forEach((n) => n.classList.add("reveal-now", "is-visible")); document.querySelectorAll("img[loading=lazy]").forEach((i) => i.loading = "eager"); });
    await page.waitForTimeout(500);
    const rep = await page.evaluate((touch) => {
      const out = [], W = document.documentElement.clientWidth;
      const vis = (n) => { const c = getComputedStyle(n); return n.getClientRects().length && c.visibility !== "hidden" && +c.opacity > .05 && !n.closest("[aria-hidden=true]") && !n.closest("details:not([open]) > :not(summary)"); };
      for (const n of document.querySelectorAll(".route.active *, .footer *, .nav__inner *")) {
        if (!vis(n) || n.closest(".home__earth-wrap, .home__astro-wrap, svg")) continue;
        const r = n.getBoundingClientRect();
        if ((r.right > W + 1 || r.left < -1) && !n.closest(".arc__track, .nav__links, .nav__ticker") && r.width && getComputedStyle(n).position !== "absolute") out.push(`offscreen ${n.tagName}.${n.className} ${r.left | 0}..${r.right | 0}`);
        if (n.childElementCount === 0 && n.textContent.trim() && n.scrollWidth > n.clientWidth + 2 && getComputedStyle(n).overflow === "hidden") out.push(`cut-text ${n.tagName}.${n.className}`);
        const fs = parseFloat(getComputedStyle(n).fontSize);
        if (n.childElementCount === 0 && n.textContent.trim() && fs < 12) out.push(`tiny-text ${fs}px ${n.tagName}.${n.className}`);
      }
      if (touch) {
        const hitBox = (n) => { // what a finger can actually hit, pseudo-elements included
          const r = n.getBoundingClientRect(); let x = r.left + Math.min(r.width / 2, 40), up = 0, dn = 0; const cy = r.top + r.height / 2;
          const at = (y) => { const e = document.elementFromPoint(x, y); return e && (e === n || n.contains(e)); };
          if (!at(cy)) return null;
          while (up < 40 && at(cy - up - 1)) up++; while (dn < 40 && at(cy + dn + 1)) dn++;
          return up + dn + 1;
        };
        for (const n of document.querySelectorAll(".route.active a, .route.active button, .route.active [role=button], .route.active summary, .route.active input, .footer a")) {
          if (!vis(n)) continue; n.scrollIntoView({ block: "center", behavior: "instant" });
          const hh = hitBox(n); const inline = getComputedStyle(n).display === "inline" && n.closest("p");
          if (hh != null && hh < 43 && !inline) out.push(`small-target ${hh}px ${n.tagName}.${n.className} "${n.textContent.trim().slice(0, 20)}"`);
          if (hh != null && n.getBoundingClientRect().width < 43 && !inline) out.push(`narrow-target ${n.getBoundingClientRect().width | 0}px ${n.tagName}.${n.className} "${n.textContent.trim().slice(0, 20)}"`);
        }
        scrollTo({ top: 0, behavior: "instant" });
      }
      return [...new Set(out)];
    }, touch);
    if (rep.length) console.log(`${w}x${h} ${r}: ${rep.slice(0, 8).join(" ; ")}${rep.length > 8 ? " +" + (rep.length - 8) : ""}`);
    const name = r === "/" ? "home" : r.slice(1);
    await page.screenshot({ path: `${outDir}/${w}x${h}-${name}.jpg`, type: "jpeg", quality: 70, fullPage: false });
    if (["/about", "/join", "/faq", "/team", "/events"].includes(r)) { await page.evaluate(() => scrollTo({ top: innerHeight * .9, behavior: "instant" })); await page.waitForTimeout(250); await page.screenshot({ path: `${outDir}/${w}x${h}-${name}-2.jpg`, type: "jpeg", quality: 70 }); }
    await page.evaluate(() => scrollTo({ top: 1e6, behavior: "instant" })); await page.waitForTimeout(250);
    await page.screenshot({ path: `${outDir}/${w}x${h}-${name}-end.jpg`, type: "jpeg", quality: 70 });
  }
  // Overlays
  const go = async (h) => { await page.evaluate((h) => { location.hash = h; }, h); await page.waitForTimeout(900); };
  await go("#meeting-2627-6"); await page.waitForTimeout(700); await page.screenshot({ path: `${outDir}/${w}x${h}-x-meeting.jpg`, type: "jpeg", quality: 70 });
  await page.evaluate(() => { const p = document.querySelector("#meetingModal .modal__panel"); p.scrollTop = 1e5; }); await page.waitForTimeout(300); await page.screenshot({ path: `${outDir}/${w}x${h}-x-meeting-end.jpg`, type: "jpeg", quality: 70 });
  await page.keyboard.press("Escape"); await go("#/atlas"); await page.evaluate(() => document.querySelector(".acard").click()); await page.waitForTimeout(900); await page.screenshot({ path: `${outDir}/${w}x${h}-x-atlas.jpg`, type: "jpeg", quality: 70 });
  await page.keyboard.press("Escape"); await page.waitForTimeout(300); await go("#/events"); await page.evaluate(() => document.querySelector(".ph").click()); await page.waitForTimeout(1500); await page.screenshot({ path: `${outDir}/${w}x${h}-x-photo.jpg`, type: "jpeg", quality: 70 });
  await page.keyboard.press("Escape"); await page.waitForTimeout(400);
  if (w <= 860) { await page.evaluate(() => document.querySelector("#navToggle").click()); await page.waitForTimeout(500); await page.screenshot({ path: `${outDir}/${w}x${h}-x-menu.jpg`, type: "jpeg", quality: 70 }); }
  await page.context().close();
}
await b.close(); site.close();
