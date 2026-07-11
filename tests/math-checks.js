/* Math self-tests — no browser needed: node tests/math-checks.js
   Stubs window/document, evals the real source files, asserts the physics. */
"use strict";

const fs = require("fs");
const path = require("path");

global.window = {};
global.document = { getElementById: () => null, querySelectorAll: () => [] };

const load = (f) => (0, eval)(fs.readFileSync(path.join(__dirname, "..", "assets", f), "utf8"));
load("main.js");
load("lab-dial.js");
load("lab-gain.js");
load("lab-link.js");

const { DB, LAB1_MATH: L1, LAB2_MATH: L2, LAB3_MATH: L3 } = global.window;

let failed = 0;
function check(name, cond, detail = "") {
  if (!cond) failed++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const rad = (d) => (d * Math.PI) / 180;

/* ---- shared formatters ---- */
check("fmtRatio(+3) is ×2.00", DB.fmtRatio(3) === "×2.00", DB.fmtRatio(3));
check("fmtRatio(0) is ×1.00", DB.fmtRatio(0) === "×1.00", DB.fmtRatio(0));
check("fmtRatio(50) goes scientific", DB.fmtRatio(50) === "×1.00·10⁵", DB.fmtRatio(50));
check("fmtWatts: 0 dBm = 1.00 mW", DB.fmtWatts(0) === "1.00 mW", DB.fmtWatts(0));
check("fmtWatts: +60 dBm = 1.00 kW", DB.fmtWatts(60) === "1.00 kW", DB.fmtWatts(60));
check("fmtWatts: −127 dBm = 200 aW", DB.fmtWatts(-127) === "200 aW", DB.fmtWatts(-127));
check("fmtWatts: −60 dBm = 1.00 nW (not 1000 pW)", DB.fmtWatts(-60) === "1.00 nW", DB.fmtWatts(-60));
check("fmtWatts: −30 dBm = 1.00 µW", DB.fmtWatts(-30) === "1.00 µW", DB.fmtWatts(-30));
check("fmtWattsLinear: 1e-9 W = 1.00 nW", DB.fmtWattsLinear(1e-9) === "1.00 nW", DB.fmtWattsLinear(1e-9));

/* ---- LAB 1: dial geometry ---- */
check("dial: −60 dB at 135°", near(L1.valueToAngle(-60), 135, 1e-9));
check("dial: 0 dB at top (270°)", near(L1.valueToAngle(0) % 360, 270, 1e-9));
check("dial: +60 dB at 45°", near(L1.valueToAngle(60) % 360, 45, 1e-9));
check("dial: angle↔value round-trips", [-60, -37.5, -3, 0, 12, 45, 60]
  .every((x) => near(L1.angleToValue(L1.valueToAngle(x)), x, 1e-6)));

/* ---- LAB 2: patterns ---- */
check("AF: unity at boresight (N=8, d=0.5)", near(Math.abs(L2.arrayFactor(0, 8, 0.5, 0)), 1, 1e-9));
check("AF: first null at sinθ=1/4", Math.abs(L2.arrayFactor(Math.asin(0.25), 8, 0.5, 0)) < 0.02);
check("AF: grating lobe at 90° when d=1λ", near(Math.abs(L2.arrayFactor(rad(90), 8, 1.0, 0)), 1, 1e-6));
check("AF: steered peak follows steer angle", near(Math.abs(L2.arrayFactor(rad(30), 8, 0.5, rad(30))), 1, 1e-9));

const sector = L2.sampleCurve(L2.sectorDbi);
check("sector: peak 17 dBi", near(L2.curvePeak(sector).db, 17, 1e-6));
check("sector: HPBW 65°", near(L2.curveHpbw(sector), 65, 1.5), String(L2.curveHpbw(sector)));
check("sector: F/B 25 dB", near(L2.curveFb(sector), 25, 0.5), String(L2.curveFb(sector)));

const dipole = L2.sampleCurve(L2.dipoleDbi);
check("dipole: peak 2.15 dBi", near(L2.curvePeak(dipole).db, 2.15, 0.01));
check("dipole: HPBW ≈78°", near(L2.curveHpbw(dipole), 78, 3), String(L2.curveHpbw(dipole)));
check("dipole: wedge resolves to boresight lobe", L2.curveHpbwParts(dipole).peakDeg === 0,
  String(L2.curveHpbwParts(dipole).peakDeg));

const patch = L2.sampleCurve(L2.patchDbi);
check("patch: HPBW ≈70°", near(L2.curveHpbw(patch), 70, 3), String(L2.curveHpbw(patch)));

const arr8 = L2.sampleCurve((t) => L2.arrayGainDbi(t, 8, 0.5, 0));
check("array 8×0.5λ: HPBW ≈12.8°", near(L2.curveHpbw(arr8), 12.8, 2), String(L2.curveHpbw(arr8)));
check("array 8×0.5λ: peak ≈14 dBi", near(L2.curvePeak(arr8).db, 14.03, 0.3), String(L2.curvePeak(arr8).db));

/* ---- LAB 3: link budget ---- */
check("FSPL(1 km, 2400 MHz) = 100.04", near(L3.fsplDb(1, 2400), 100.04, 0.03), L3.fsplDb(1, 2400).toFixed(2));
check("FSPL(2 km, 3600 MHz) = 109.57", near(L3.fsplDb(2, 3600), 109.57, 0.03), L3.fsplDb(2, 3600).toFixed(2));
check("floor(3.6 GHz/100 MHz BW) = −87 dBm", near(L3.noiseFloorDbm(3600), -87, 0.01));
check("sensitivity = floor + 3", near(L3.sensitivityDbm(3600), -84, 0.01));

const def = L3.linkBudget({ tx: 30, cable: 2, txg: 17, km: 2, band: 3600, rain: false, rxg: 0 });
check("default link: rx ≈ −64.57 dBm", near(def.rx, -64.57, 0.05), def.rx.toFixed(2));
check("default link: margin ≈ +19.4 dB", near(def.margin, 19.4, 0.1), def.margin.toFixed(2));

check("distance map: t=0 → 0.1 km", near(L3.tToKm(0), 0.1, 1e-9));
check("distance map: t=1 → 30 km", near(L3.tToKm(1), 30, 1e-9));
check("distance map: round-trip", near(L3.kmToT(L3.tToKm(0.5)), 0.5, 1e-6));

const wet = L3.linkBudget({ tx: 30, cable: 2, txg: 17, km: 30, band: 28000, rain: true, rxg: 0 });
check("28 GHz, 30 km: FSPL ≈ 150.93", near(wet.fspl, 150.93, 0.05), wet.fspl.toFixed(2));
check("28 GHz heavy rain adds 300 dB", near(wet.rain, 300, 0.01), String(wet.rain));
check("28 GHz wet link is hopeless", wet.margin < -300, wet.margin.toFixed(1));

console.log(failed ? `\n${failed} check(s) FAILED` : "\nall math checks passed");
process.exit(failed ? 1 : 0);
