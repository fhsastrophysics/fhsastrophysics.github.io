// What must be true of the page at every moment nothing is moving.
// Returns a list of broken rules, each "rule-id: detail".
export async function settle(page, ms = 0) {
  await page.waitForFunction(() => !document.body.classList.contains("warping") && !document.body.classList.contains("intro"), null, { timeout: 6000 }).catch(() => {});
  const hash = await page.evaluate(() => location.hash);
  await page.waitForTimeout((/meeting-/.test(hash) ? 520 : 260) + ms);
  // From here on the person is scrolling for themselves (the router holds a new page at its top until they do).
  await page.evaluate(() => window.dispatchEvent(new WheelEvent("wheel"))).catch(() => {});
}

export function inPage() {
  const bad = [];
  const $ = (s) => document.querySelector(s), $$ = (s) => [...document.querySelectorAll(s)];
  const invisible = (n) => { for (let e = n; e && e !== document.documentElement; e = e.parentElement) { const c = getComputedStyle(e); if (c.visibility === "hidden" || parseFloat(c.opacity) < .03) return e; } return null; };
  const raw = location.hash.replace(/^#/, "");
  const actives = $$(".route.active");
  if (actives.length !== 1) bad.push(`one-route: ${actives.length} active routes`);
  const act = actives[0];
  const route = act && act.dataset.route;
  const want = raw.startsWith("meeting-") ? null : (raw || "/");
  if (want && route !== want) bad.push(`url-matches-page: hash ${raw || "(none)"} shows ${route}`);
  if (document.body.dataset.route !== route) bad.push(`body-route: ${document.body.dataset.route} vs ${route}`);
  for (const a of $$(".nav__links a, .footer__nav a[data-route]")) if (a.classList.contains("active") !== (a.dataset.route === route)) { bad.push(`nav-active: ${a.dataset.route} on ${route}`); break; }
  for (const c of ["warp-out", "warp-in", "warp-in-touch", "prewarm"]) if ($(".route." + c)) bad.push(`leftover-class: ${c} on ${$(".route." + c).dataset.route}`);
  if (document.body.classList.contains("warping")) bad.push("leftover-class: body.warping");

  const open = $$(".modal.open");
  const drawer = $("#navLinks").classList.contains("open");
  const anyOpen = open.length > 0 || drawer;
  if (open.length > 1) bad.push("one-overlay: " + open.map((m) => m.id).join("+"));
  if (open.length && drawer) bad.push("one-overlay: menu under " + open[0].id);
  for (const s of ["#router", ".footer"]) {
    const inert = $(s).hasAttribute("inert");
    if (inert && !anyOpen) bad.push(`stuck-inert: ${s}`);
    if (!inert && anyOpen) bad.push(`missing-inert: ${s} behind ${open[0] ? open[0].id : "menu"}`);
  }
  if ($("#nav").hasAttribute("inert") && !open.length) bad.push("stuck-inert: #nav");
  const lock = getComputedStyle(document.body).overflowY === "hidden";
  if (lock && !anyOpen) bad.push("stuck-scroll-lock");
  if (!lock && open.length) bad.push("missing-scroll-lock: " + open[0].id);
  if (document.body.classList.contains("plb-open") !== $("#photoLightbox").classList.contains("open")) bad.push("plb-open class out of step");
  if (document.body.classList.contains("nav-open") !== drawer) bad.push("nav-open class out of step");
  if (drawer && innerWidth > 860) bad.push("menu open with no drawer at this width");
  for (const m of $$(".modal")) if ((m.getAttribute("aria-hidden") === "false") !== m.classList.contains("open")) bad.push("aria-hidden out of step: " + m.id);
  const st = history.state && history.state.overlay;
  const names = { meeting: "meetingModal", atlas: "atlasLightbox", photo: "photoLightbox" };
  if (st && !$("#" + (names[st] || "x"))?.classList.contains("open")) bad.push(`dead-history-entry: state ${st} with nothing open`);
  const mm = $("#meetingModal").classList.contains("open");
  if (mm && !raw.startsWith("meeting-")) bad.push(`url-matches-preview: preview open at ${raw}`);
  if (!mm && raw.startsWith("meeting-")) bad.push(`url-matches-preview: ${raw} with no preview`);
  if (mm && raw.startsWith("meeting-")) {
    const card = document.getElementById(raw), t = card && card.querySelector(".mcard__title");
    if (t && t.textContent !== $("#modalTitle").textContent) bad.push(`url-matches-preview: ${raw} shows "${$("#modalTitle").textContent}"`);
  }
  // Focus
  const f = document.activeElement;
  if (f && f !== document.body) {
    const cs = getComputedStyle(f);
    if (!f.getClientRects().length || cs.visibility === "hidden") bad.push(`focus-hidden: ${f.tagName}.${f.className}`);
    else if (invisible(f)) bad.push(`focus-invisible: ${f.tagName}.${f.className}`);
    if (f.closest("[inert]")) bad.push(`focus-inert: ${f.tagName}.${f.className}`);
    if (open.length && !open[0].contains(f)) bad.push(`focus-escaped: ${f.tagName}.${f.className} behind ${open[0].id}`);
  }
  // Layout
  const de = document.documentElement;
  if (de.scrollWidth > de.clientWidth + 1) {
    const who = $$(".route.active *, .footer *, .nav *").find((n) => { const r = n.getBoundingClientRect(); return r.width && r.right > de.clientWidth + 1 && getComputedStyle(n).position !== "fixed"; });
    bad.push(`h-overflow: ${de.scrollWidth}>${de.clientWidth} ${who ? who.tagName + "." + who.className : ""}`);
  }
  if (scrollY > Math.max(0, de.scrollHeight - innerHeight) + 2 && !(window.visualViewport && visualViewport.scale > 1)) bad.push(`scrolled-past-end: ${scrollY} of ${de.scrollHeight - innerHeight}`);
  if (scrollX) bad.push("h-scrolled: " + scrollX);
  // A box that only clips must never be scrolled inside itself (focus, find and drag-select all can).
  for (const n of $$(".route.active, .route.active *, .footer, .nav, .modal.open *")) {
    if (!n.scrollTop && !n.scrollLeft) continue;
    const c = getComputedStyle(n);
    if ((n.scrollLeft && !/auto|scroll/.test(c.overflowX)) || (n.scrollTop && !/auto|scroll/.test(c.overflowY))) { if (n.tagName !== "INPUT") { bad.push(`inner-scroll: ${n.tagName}.${n.className} ${n.scrollLeft},${n.scrollTop}`); break; } }
  }
  if (act) {
    const o = parseFloat(getComputedStyle(act).opacity);
    if (o < .99) bad.push("route-faded: opacity " + o);
    if (act.getBoundingClientRect().height < 200) bad.push("route-blank");
    if (!open.length && !drawer && !document.body.classList.contains("intro"))
      for (const n of act.querySelectorAll(".reveal, .section-in")) {
        const r = n.getBoundingClientRect();
        if (r.height && r.top < innerHeight - 8 && r.bottom > 80 && !n.classList.contains("is-visible")) { bad.push("unrevealed: " + n.className); break; }
      }
  }
  // Broken images on screen
  for (const im of $$(".route.active img, .modal.open img")) {
    const r = im.getBoundingClientRect();
    if (r.width && r.bottom > 0 && r.top < innerHeight && im.complete && im.naturalWidth === 0 && im.getAttribute("src")) { bad.push("broken-image: " + im.getAttribute("src")); break; }
  }
  // Nothing invisible may take a tap, and the taps that matter must reach their target.
  for (let i = 1; i < 8; i++) for (let j = 1; j < 10; j++) {
    const n = document.elementFromPoint(innerWidth * i / 8, innerHeight * j / 10);
    const inv = n && invisible(n);
    if (inv && !inv.matches(".reveal, .section-in, .split-c, .plb__fig img") && !n.closest("#warpIntro") && !n.closest(".field__copy") && !inv.closest(".reveal:not(.is-visible)")) { bad.push(`invisible-takes-taps: ${n.tagName}#${n.id}.${n.className}`); i = j = 99; }
  }
  const scope = open[0] || (drawer ? $("#navLinks") : document);
  for (const n of scope.querySelectorAll("a[href], button, [role=button], summary, input")) {
    if (n.closest("[inert]") || n.closest(".modal") !== (open[0] || null)) continue;
    const r = n.getBoundingClientRect();
    if (!r.width || r.width < 4) continue;
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    if (x < 1 || y < 1 || x > innerWidth - 1 || y > innerHeight - 1) continue;
    if (invisible(n) || (n.closest("details:not([open])") && n.tagName !== "SUMMARY")) continue;
    const hit = document.elementFromPoint(x, y);
    if (!hit || n.contains(hit) || hit.contains(n) && hit !== document.documentElement && hit !== document.body && hit.matches("a,button,[role=button],summary")) continue;
    // A multi-line inline link's centre can fall between its lines.
    if (n.getClientRects().length > 1) continue;
    const clipper = n.closest(".arc__track, .modal__panel, .lightbox__body, .nav__links");
    if (clipper) { const c = clipper.getBoundingClientRect(); if (x < c.left || x > c.right || y < c.top || y > c.bottom) continue; }
    // Scrolled under the fixed header, or the back-to-top disc / toast floating over it, is by design.
    if (hit.closest(".skip-link:focus")) continue;
    if (hit.closest(".nav, .back-top, .toast, #warpIntro")) { if (!n.closest(".nav")) continue; }
    if (hit.closest(".modal__close, .plb__nav")) continue;
    bad.push(`covered: ${n.tagName}.${String(n.className).slice(0, 40)} by ${hit.tagName}#${hit.id}.${String(hit.className.baseVal ?? hit.className).slice(0, 40)}`); break;
  }
  const c = window.__chaos;
  if (c) { if (c.rejections.length) bad.push("unhandled-rejection: " + c.rejections.splice(0).join(" | ")); if (c.errors.length) bad.push("js-error: " + c.errors.splice(0).join(" | ")); }
  return bad;
}
export async function check(page) {
  let bad;
  try { bad = await page.evaluate(inPage); } catch (e) { bad = ["evaluate-failed: " + e.message.split("\n")[0]]; }
  // One retry clears states caught mid-transition; a real fault is still there.
  if (bad.length) { await page.waitForTimeout(700); try { bad = await page.evaluate(inPage); } catch (e) { bad = ["evaluate-failed: " + e.message.split("\n")[0]]; } }
  const log = page.log.splice(0).filter((l) => !/net::ERR_FAILED|Blocked by|due to access control|ERR_BLOCKED|Failed to load resource: (net::|The operation|A server|Load cannot|Blocked|Unacceptable|Preflight)/.test(l));
  return bad.concat(log);
}
