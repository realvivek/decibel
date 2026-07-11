/* End-to-end check: serves the repo, drives the three labs through their test
   hooks in a real Chromium, and captures desktop + mobile screenshots.
   Usage: NODE_PATH=$(npm root -g) node tests/browser-check.js [shotDir] */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SHOT_DIR = process.argv[2] || process.env.SHOT_DIR || "/tmp/shots";
const PORT = 8123;

const MIME = {
  ".html": "text/html", ".css": "text/css", ".js": "text/javascript",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split("?")[0]);
      if (p === "/") p = "/index.html";
      const file = path.join(ROOT, p);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end("nope"); return;
      }
      res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(PORT, "127.0.0.1", () => resolve(srv));
  });
}

async function main() {
  const { chromium } = require("playwright");
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const srv = await serve();

  let browser;
  try {
    browser = await chromium.launch();
  } catch (e) {
    browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  }

  const results = [];
  const check = (name, pass, detail = "") => {
    results.push({ name, pass, detail });
    console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  };

  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "load", timeout: 30000 });
  await page.waitForTimeout(1200);

  // walk the page so scroll-reveal sections get their .in class before screenshots
  // (scrollIntoView with behavior:'instant' — plain scrollTo loses to CSS smooth scrolling)
  const revealAll = async () => {
    await page.evaluate(async () => {
      const targets = [...document.querySelectorAll(".lab, .footer .notes")];
      for (const t of targets) {
        t.scrollIntoView({ block: "center", behavior: "instant" });
        await new Promise((r) => setTimeout(r, 300));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(1000);
  };
  await revealAll();
  const revealed = await page.evaluate(() =>
    [...document.querySelectorAll(".lab, .footer .notes")].map((el) => el.classList.contains("in"))
  );
  check("all sections revealed", revealed.every(Boolean), JSON.stringify(revealed));

  // presence
  const globals = await page.evaluate(() =>
    ["DB", "LAB1", "LAB2", "LAB3", "LAB1_MATH", "LAB2_MATH", "LAB3_MATH"].map((k) => [k, !!window[k]])
  );
  for (const [k, ok] of globals) check(`global ${k}`, ok);

  // LAB 1: set +23 dBm -> 200 mW readout (wait for the smoothed value to settle)
  await page.evaluate(() => window.LAB1 && window.LAB1.set(23));
  await page.waitForFunction(
    () => { const s = window.LAB1.get(); return Math.abs(s.shown - s.target) < 0.002; },
    null, { timeout: 8000 }
  );
  await page.waitForTimeout(150);
  const watts = await page.textContent("#ro-watts");
  const db = await page.textContent("#ro-db");
  check("lab1 readout dB", /\+23\.0/.test(db), db.trim());
  check("lab1 readout watts", /200 mW/.test(watts), watts.trim());

  // LAB 2: sector stats, then array morph
  const sector = await page.evaluate(() => (window.LAB2.setPreset("sector"), window.LAB2.stats()));
  check("lab2 sector peak 17 dBi", /17/.test(String(sector.peakDbi)), JSON.stringify(sector));
  check("lab2 sector HPBW ~65", parseFloat(sector.hpbw) > 60 && parseFloat(sector.hpbw) < 70, String(sector.hpbw));
  await page.evaluate(() => { window.LAB2.setPreset("array"); window.LAB2.setArray({ n: 8, d: 0.5, steer: 0 }); });
  await page.waitForTimeout(900);
  const arr = await page.evaluate(() => window.LAB2.stats());
  check("lab2 array HPBW ~13", parseFloat(arr.hpbw) > 9 && parseFloat(arr.hpbw) < 18, String(arr.hpbw));

  // LAB 3: 28 GHz + rain + 30 km must fail, defaults must close
  await page.evaluate(() => window.LAB3.set({ km: 30, band: 28000, rain: true }));
  await page.waitForTimeout(600);
  const failCls = await page.getAttribute("#lb-verdict", "class");
  check("lab3 rain fail verdict", /fail/.test(failCls), failCls);
  await page.evaluate(() => window.LAB3.set({ km: 2, band: 3600, rain: false }));
  await page.waitForTimeout(600);
  const okCls = await page.getAttribute("#lb-verdict", "class");
  const margin = await page.evaluate(() => window.LAB3.get().margin);
  check("lab3 default closes", /ok/.test(okCls) && margin > 18 && margin < 21, `class=${okCls} margin=${margin}`);

  // reset lab1 for the screenshot
  await page.evaluate(() => window.LAB1.set(0));
  await page.waitForTimeout(800);

  await page.screenshot({ path: path.join(SHOT_DIR, "desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(SHOT_DIR, "mobile-375.png"), fullPage: true });

  check("no page errors", errors.length === 0, errors.slice(0, 5).join(" | "));

  await browser.close();
  srv.close();

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots in ${SHOT_DIR}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
