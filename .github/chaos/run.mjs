// node run.mjs                         full suite
// node run.mjs monkey [--seed N] [--seeds K] [--steps N] [--profile p] [--engine e] [--keep]
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { serve } from "./lib/server.mjs";
import { launch, open } from "./lib/browser.mjs";
import { monkey } from "./lib/monkey.mjs";
import { MOBILE, DESKTOP } from "./lib/profiles.mjs";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i < 0 ? d : process.argv[i + 1]; };
const mode = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "all";
const OUT = path.join(HERE, "out"); fs.mkdirSync(OUT, { recursive: true });

async function pool(jobs, n) { const out = []; let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < jobs.length) { const k = i++; out[k] = await jobs[k](); } })); return out; }

async function runMonkey(site) {
  const seed0 = +arg("seed", 1), seeds = +arg("seeds", 2), steps = +arg("steps", 120);
  const engines = arg("engine", "chromium,webkit").split(","), profs = arg("profile", [...MOBILE, ...DESKTOP].join(",")).split(",");
  const jobs = [];
  const browsers = {}; for (const e of engines) browsers[e] = await launch(e);
  for (let s = seed0; s < seed0 + seeds; s++) for (const e of engines) for (const p of profs) jobs.push(async () => {
    const page = await open(browsers[e], p, site.url);
    await page.waitForTimeout(2500);
    const res = await monkey(page, { seed: s, steps, base: site.url, ignore: arg("ignore", "") && new RegExp(arg("ignore")) });
    const name = `${e}/${p}/seed ${s}`;
    if (!res.ok) {
      console.log(`FAIL ${name} at step ${res.step}: ${res.bad.join(" ; ")}\n     last: ${res.trace.slice(-7).join(" | ")}`);
      fs.writeFileSync(path.join(OUT, `fail-${e}-${p}-${s}.json`), JSON.stringify(res, null, 1));
      await page.screenshot({ path: path.join(OUT, `fail-${e}-${p}-${s}.png`) }).catch(() => {});
    } else if (arg("verbose", "")) console.log(`ok   ${name}`);
    await page.context().close();
    return res.ok;
  });
  const t0 = Date.now(), r = await pool(jobs, +arg("workers", 5));
  for (const e of engines) await browsers[e].close();
  const ok = r.filter(Boolean).length;
  console.log(`monkey: ${ok}/${r.length} runs clean (${steps} steps each, ${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  return ok === r.length;
}

async function runTests(site) {
  const { TESTS } = await import("./lib/tests.mjs");
  const engines = arg("engine", "chromium,webkit").split(","), only = arg("only", ""), prof = arg("profile", "");
  const browsers = {}; for (const e of engines) browsers[e] = await launch(e);
  const jobs = []; const fails = {};
  for (const t of TESTS) { if (only && !new RegExp(only, "i").test(t.name)) continue; for (const e of engines) for (const p of t.on) { if (prof && !prof.split(",").includes(p)) continue; jobs.push(async () => {
    let bad; let page;
    try {
      page = await open(browsers[e], p, site.url, t.opts);
      await page.waitForTimeout(t.opts.nojs ? 300 : 2600);
      bad = await Promise.race([t.fn(page), new Promise((_, no) => setTimeout(() => no(new Error("test took over 4 minutes")), 240000))]);
    } catch (err) { bad = ["threw: " + err.message.split("\n")[0]]; }
    if (page) await page.context().close().catch(() => {});
    if (bad.length) (fails[t.name] ||= []).push(`${e}/${p}: ${bad.slice(0, 5).join(" ; ")}${bad.length > 5 ? ` (+${bad.length - 5})` : ""}`);
    return !bad.length;
  }); } }
  const t0 = Date.now(), r = await pool(jobs, +arg("workers", 7));
  for (const e of engines) await browsers[e].close();
  for (const t of TESTS) if (fails[t.name]) console.log(`FAIL ${t.name}\n     ${fails[t.name].join("\n     ")}`);
  const ok = r.filter(Boolean).length;
  console.log(`tests: ${ok}/${r.length} passed (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  return ok === r.length;
}

const site = await serve(path.resolve(arg("root", ROOT)));
let ok = true;
if (mode === "tests" || mode === "all") ok = (await runTests(site)) && ok;
if (mode === "monkey" || mode === "all") ok = (await runMonkey(site)) && ok;
site.close();
process.exit(ok ? 0 : 1);
