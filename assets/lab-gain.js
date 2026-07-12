/* decibel — LAB 02 · the shape of gain
   Polar antenna-pattern laboratory: preset families + a uniform linear array. */
(() => {
  "use strict";

  /* ================================================================
     Pure math — no DOM below this banner until the guard.
     All pattern functions take θ in radians, θ = 0 at boresight (up),
     and return absolute gain in dBi.
     ================================================================ */

  const D2R = Math.PI / 180;
  const N_SAMPLES = 721;   // −180° … +180° in 0.5° steps
  const STEP_DEG = 0.5;
  const FLOOR_DB = 40;     // display floor below each curve's own peak

  const thetaDeg = (i) => -180 + i * STEP_DEG;

  /* wrap degrees to [−180, 180) */
  const wrapDeg = (d) => (((d + 180) % 360) + 360) % 360 - 180;

  const isotropicDbi = () => 0;

  /* Exact half-wave dipole cut. |cosθ| mirrors the back lobe (figure-8);
     θ→±90° is a true 0/0 null → power 0, returned far below the floor. */
  function dipoleDbi(theta) {
    const c = Math.abs(Math.cos(theta));
    if (c < 1e-7) return 2.15 - 400;
    const f = Math.cos((Math.PI / 2) * Math.sin(theta)) / c;
    return 2.15 + 10 * Math.log10(Math.max(f * f, 1e-40));
  }

  /* Stylized patch: cos^m front hemisphere (m=3.48 → ≈70° HPBW), −22 dB back. */
  function patchDbi(theta) {
    const M = 3.48, BACK = -22;
    const a = Math.abs(wrapDeg(theta / D2R));
    if (a > 90) return 7 + BACK;
    const rel = 10 * M * Math.log10(Math.max(Math.cos(a * D2R), 1e-9));
    return 7 + Math.max(rel, BACK);
  }

  /* 3GPP sector model: rel = −min(12(θ/65°)², 25 dB), 17 dBi peak. */
  function sectorDbi(theta) {
    const td = wrapDeg(theta / D2R);
    return 17 - Math.min(12 * (td / 65) * (td / 65), 25);
  }

  /* Stylized yagi: quadratic main lobe, gaussian sidelobes at ±60°,
     gaussian back lobe at 180°, −28 dB floor, 12.5 dBi peak. */
  function yagiDbi(theta) {
    const a = Math.abs(wrapDeg(theta / D2R));
    const K = 10 / Math.LN10; // gaussian power lobe expressed in dB
    const lobe = (center, pkDb, sigma) => {
      const d = a - center;
      return pkDb - (K * d * d) / (2 * sigma * sigma);
    };
    const main = -Math.min(12 * (a / 46) * (a / 46), 28);
    const rel = Math.max(main, lobe(60, -13, 10), lobe(180, -15, 14), -28);
    return 12.5 + rel;
  }

  /* Uniform linear array factor, normalized so the main lobe is 1.
     u = 2πd(sinθ − sinθ₀); the 0/0 branch (main + grating lobes) → 1. */
  function arrayFactor(theta, N, d, steerRad) {
    const u = 2 * Math.PI * d * (Math.sin(theta) - Math.sin(steerRad));
    const den = Math.sin(u / 2);
    if (Math.abs(den) < 1e-9) return 1;
    return Math.abs(Math.sin((N * u) / 2) / (N * den));
  }

  /* Element pattern for the array: mild cosine front, mirrored −12 dB back screen. */
  function elementRelDb(theta) {
    const a = Math.abs(wrapDeg(theta / D2R));
    const front = (deg) => {
      const c = Math.cos(deg * D2R);
      return 10 * Math.log10(0.12 + 0.88 * c * c);
    };
    return a <= 90 ? front(a) : front(180 - a) - 12;
  }

  function arrayGainDbi(theta, N, d, steerRad) {
    const af = arrayFactor(theta, N, d, steerRad);
    return 5 + 10 * Math.log10(N) + elementRelDb(theta) +
      20 * Math.log10(Math.max(af, 1e-8));
  }

  /* Sample gainDbi over the full circle, clamped at peak − 40 dB. */
  function sampleCurve(fn) {
    const out = new Float64Array(N_SAMPLES);
    let peak = -Infinity;
    for (let i = 0; i < N_SAMPLES; i++) {
      out[i] = fn(thetaDeg(i) * D2R);
      if (out[i] > peak) peak = out[i];
    }
    const floor = peak - FLOOR_DB;
    for (let i = 0; i < N_SAMPLES; i++) out[i] = Math.max(out[i], floor);
    return out;
  }

  /* Max sample; near-ties (symmetric multi-lobe patterns like the dipole's
     figure-8) resolve toward boresight so the wedge/dot sit on the front lobe. */
  function peakIndex(curve) {
    let p = 0;
    for (let i = 1; i < N_SAMPLES; i++) {
      if (curve[i] > curve[p] + 1e-9 ||
          (curve[i] >= curve[p] - 1e-9 && Math.abs(thetaDeg(i)) < Math.abs(thetaDeg(p)))) {
        p = i;
      }
    }
    return p;
  }

  function curvePeak(curve) {
    const p = peakIndex(curve);
    return { db: curve[p], index: p, deg: thetaDeg(p) };
  }

  /* −3 dB crossings around the peak, walked both ways with linear
     interpolation. Returns null for a flat curve (span < 0.5 dB). */
  function curveHpbwParts(curve) {
    const n = N_SAMPLES - 1; // 720 unique samples around the circle
    const p = peakIndex(curve);
    let mn = Infinity;
    for (let i = 0; i < N_SAMPLES; i++) if (curve[i] < mn) mn = curve[i];
    if (curve[p] - mn < 0.5) return null;
    const target = curve[p] - 3;
    const base = p % n;
    const half = (dir) => {
      let prev = curve[p];
      for (let k = 1; k <= n; k++) {
        const idx = (((base + dir * k) % n) + n) % n;
        const v = curve[idx];
        if (v <= target) {
          const drop = prev - v;
          const frac = drop > 1e-12 ? (prev - target) / drop : 1;
          return (k - 1 + frac) * STEP_DEG;
        }
        prev = v;
      }
      return null;
    };
    const right = half(1), left = half(-1);
    if (right == null || left == null) return null;
    return { peakIdx: p, peakDeg: thetaDeg(p), left, right, hpbw: left + right };
  }

  function curveHpbw(curve) {
    const parts = curveHpbwParts(curve);
    return parts ? parts.hpbw : null;
  }

  /* Front-to-back: peak minus the value 180° behind it; flat curve → 0. */
  function curveFb(curve) {
    const n = N_SAMPLES - 1;
    const p = peakIndex(curve);
    let mn = Infinity;
    for (let i = 0; i < N_SAMPLES; i++) if (curve[i] < mn) mn = curve[i];
    if (curve[p] - mn < 0.5) return 0;
    const back = ((p % n) + n / 2) % n;
    return curve[p] - curve[back];
  }

  window.LAB2_MATH = {
    N_SAMPLES, STEP_DEG, FLOOR_DB, thetaDeg, wrapDeg,
    isotropicDbi, dipoleDbi, patchDbi, sectorDbi, yagiDbi,
    arrayFactor, elementRelDb, arrayGainDbi,
    sampleCurve, peakIndex, curvePeak, curveHpbwParts, curveHpbw, curveFb,
  };

  /* ================================================================
     DOM — everything below needs a browser.
     ================================================================ */

  const canvasEl = document.getElementById("polar-canvas");
  if (!canvasEl) return;

  const DB = window.DB;
  const stPeak = document.getElementById("st-peak");
  const stHpbw = document.getElementById("st-hpbw");
  const stFb = document.getElementById("st-fb");
  const chipsBox = document.getElementById("preset-chips");
  const builder = document.getElementById("array-builder");
  const note = document.getElementById("pattern-note");
  const nEl = document.getElementById("arr-n");
  const dEl = document.getElementById("arr-d");
  const steerEl = document.getElementById("arr-steer");
  const nOut = document.getElementById("arr-n-out");
  const dOut = document.getElementById("arr-d-out");
  const steerOut = document.getElementById("arr-steer-out");

  const PRESETS = {
    isotropic: isotropicDbi,
    dipole: dipoleDbi,
    patch: patchDbi,
    sector: sectorDbi,
    yagi: yagiDbi,
  };

  const NOTES = {
    isotropic: "The reference: 0 dBi by definition, everywhere.",
    dipole: "Exact half-wave dipole cut: [cos(½π·sinθ)/cosθ]² — 2.15 dBi peak, true nulls off the ends.",
    patch: "Stylized microstrip patch: cos³·⁴⁸θ front hemisphere (≈70° beam), flat −22 dB back, 7 dBi.",
    sector: "3GPP-style sector: −min(12(θ/65°)², 25 dB), calibrated to 17 dBi.",
    yagi: "Stylized yagi: 46°-class main lobe, −13 dB sidelobes at ±60°, −15 dB back lobe, 12.5 dBi.",
    array: "Array factor × element. Watch for grating lobes past 0.5 λ when steered.",
  };

  const state = {
    preset: "sector",
    arr: { n: 8, d: 0.5, steer: 0 }, // steer in degrees (UI); math takes radians
    dispRel: null,                   // displayed rel-dB curve, [−40 … 0]
    stats: { peakDbi: 0, hpbw: null, fb: 0 },
    wedge: null,                     // {start, end, peakDeg, label} in degrees
    anim: null,
  };

  /* Element-only pattern for the array backscreen (independent of N/d/steer). */
  const elemRel = new Float64Array(N_SAMPLES);
  for (let i = 0; i < N_SAMPLES; i++) {
    elemRel[i] = Math.max(elementRelDb(thetaDeg(i) * D2R), -FLOOR_DB);
  }

  function currentGainFn() {
    if (state.preset === "array") {
      const { n, d, steer } = state.arr;
      const sr = steer * D2R;
      return (th) => arrayGainDbi(th, n, d, sr);
    }
    return PRESETS[state.preset];
  }

  /* ---------------- drawing ---------------- */

  let cv = null;

  function tracePath(ctx, rel, cx, cy, R, norm) {
    ctx.beginPath();
    for (let i = 0; i < N_SAMPLES; i++) {
      const r = R * (1 + Math.max(rel[i] - norm, -FLOOR_DB) / FLOOR_DB);
      const th = thetaDeg(i) * D2R;
      const x = cx + r * Math.sin(th);
      const y = cy - r * Math.cos(th);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function drawGrid(ctx, cx, cy, R) {
    ctx.lineWidth = 1;
    ctx.strokeStyle = DB.tokens.grid;
    const RINGS = [0, -10, -20, -30];
    for (const rel of RINGS) {
      const r = R * (1 + rel / FLOOR_DB);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let a = 0; a < 360; a += 30) {
      const th = a * D2R;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + R * Math.sin(th), cy - R * Math.cos(th));
      ctx.stroke();
    }
    // ring labels along the upper-right diagonal
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = DB.tokens.dim;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    const K = Math.SQRT1_2;
    RINGS.forEach((rel) => {
      const r = R * (1 + rel / FLOOR_DB);
      const label = rel === 0 ? "0" : DB.MINUS + String(-rel);
      ctx.fillText(label, cx + r * K + 3, cy - r * K - 2);
    });
    // compass labels
    ctx.font = '10.5px "JetBrains Mono", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("0°", cx, cy - R - 13);
    ctx.fillText("90°", cx + R + 17, cy);
    ctx.fillText("180°", cx, cy + R + 13);
    ctx.fillText(DB.MINUS + "90°", cx - R - 19, cy);
  }

  function drawWedge(ctx, cx, cy, R) {
    const wd = state.wedge;
    if (!wd) return;
    const a0 = (wd.start - 90) * D2R;
    const a1 = (wd.end - 90) * D2R;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R, a0, a1, false);
    ctx.closePath();
    ctx.fillStyle = "rgba(233,162,59,0.15)";
    ctx.fill();
    ctx.strokeStyle = "rgba(196,128,27,0.6)";
    ctx.lineWidth = 1;
    for (const deg of [wd.start, wd.end]) {
      const th = deg * D2R;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + R * Math.sin(th), cy - R * Math.cos(th));
      ctx.stroke();
    }
    const th = wd.peakDeg * D2R;
    const lr = 0.6 * R;
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = DB.tokens.amber;
    ctx.fillText(wd.label, cx + lr * Math.sin(th), cy - lr * Math.cos(th));
  }

  function drawMainCurve(ctx, cx, cy, R) {
    const rel = state.dispRel;
    if (!rel) return;
    // peakIndex, not a plain max scan: ties (dipole figure-8, isotropic)
    // must resolve to the boresight lobe, same as the wedge and stats
    const pi = peakIndex(rel);
    const m = rel[pi];
    const grad = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
    grad.addColorStop(0, DB.tokens.cyan);
    grad.addColorStop(0.5, DB.tokens.violet);
    grad.addColorStop(1, DB.tokens.pink);
    tracePath(ctx, rel, cx, cy, R, m); // normalized to its own peak
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = grad;
    ctx.shadowColor = DB.tokens.violet;
    ctx.shadowBlur = 16;
    ctx.stroke();
    ctx.shadowBlur = 0;
    // glowing dot at the peak direction, on the 0 dB ring
    const th = thetaDeg(pi) * D2R;
    const px = cx + R * Math.sin(th);
    const py = cy - R * Math.cos(th);
    ctx.beginPath();
    ctx.arc(px, py, 3.2, 0, Math.PI * 2);
    ctx.fillStyle = DB.tokens.cyan;
    ctx.shadowColor = DB.tokens.cyan;
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(px, py, 1.4, 0, Math.PI * 2);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
  }

  function draw() {
    if (!cv || cv.w < 2) return;
    const { ctx, w, h } = cv;
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;
    const R = Math.min(w, h) / 2 - 28;
    if (R < 20) return;
    drawGrid(ctx, cx, cy, R);
    if (state.preset === "array") {
      ctx.save();
      ctx.strokeStyle = "rgba(23,41,60,0.25)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 5]);
      tracePath(ctx, elemRel, cx, cy, R, 0);
      ctx.stroke();
      ctx.restore();
    }
    drawWedge(ctx, cx, cy, R);
    drawMainCurve(ctx, cx, cy, R);
  }

  /* ---------------- stats + morphing ---------------- */

  function renderStats() {
    const { peakDbi, hpbw, fb } = state.stats;
    stPeak.textContent = peakDbi.toFixed(1) + " dBi";
    stHpbw.textContent = hpbw == null ? "—" : hpbw.toFixed(1) + "°";
    stFb.textContent = fb === 0 ? "0 dB"
      : fb >= FLOOR_DB - 0.05 ? "> 40 dB"
      : fb.toFixed(1) + " dB";
  }

  function mixWedge(a, b, t) {
    if (!a || !b) return b;
    return {
      start: DB.lerp(a.start, b.start, t),
      end: DB.lerp(a.end, b.end, t),
      peakDeg: DB.lerp(a.peakDeg, b.peakDeg, t),
      label: b.label,
    };
  }

  /* Recompute the target curve, publish stats immediately, morph the display. */
  function retarget(dur) {
    const abs = sampleCurve(currentGainFn());
    const pk = curvePeak(abs);
    const parts = curveHpbwParts(abs);
    state.stats = {
      peakDbi: pk.db,
      hpbw: parts ? parts.hpbw : null,
      fb: curveFb(abs),
    };
    renderStats();

    const toRel = new Float64Array(N_SAMPLES);
    for (let i = 0; i < N_SAMPLES; i++) toRel[i] = abs[i] - pk.db;
    const wedgeTo = parts ? {
      start: parts.peakDeg - parts.left,
      end: parts.peakDeg + parts.right,
      peakDeg: parts.peakDeg,
      label: parts.hpbw.toFixed(1) + "°",
    } : null;

    if (state.anim) { state.anim.cancel(); state.anim = null; }

    if (!state.dispRel || dur <= 0) { // first paint / no motion
      state.dispRel = toRel;
      state.wedge = wedgeTo;
      draw();
      return;
    }

    const fromRel = Float64Array.from(state.dispRel);
    const wedgeFrom = state.wedge;
    state.dispRel = Float64Array.from(fromRel);
    state.anim = DB.tween({
      from: 0, to: 1, dur, ease: DB.easeInOutCubic,
      onUpdate: (t) => {
        const d = state.dispRel;
        for (let i = 0; i < N_SAMPLES; i++) {
          d[i] = Math.max(-FLOOR_DB, DB.lerp(fromRel[i], toRel[i], t));
        }
        state.wedge = mixWedge(wedgeFrom, wedgeTo, t);
        draw();
      },
      onDone: () => {
        state.anim = null;
        state.dispRel = toRel;
        state.wedge = wedgeTo;
        draw();
      },
    });
  }

  /* ---------------- controls ---------------- */

  const chips = Array.from(chipsBox.querySelectorAll("button[data-preset]"));

  function setPreset(name, dur) {
    if (name !== "array" && !PRESETS[name]) return;
    state.preset = name;
    chips.forEach((b) => b.classList.toggle("is-active", b.dataset.preset === name));
    builder.classList.toggle("is-disabled", name !== "array");
    // really disable — pointer-events:none alone leaves them keyboard-operable
    [nEl, dEl, steerEl].forEach((i) => { i.disabled = name !== "array"; });
    note.textContent = NOTES[name];
    retarget(dur == null ? 650 : dur);
  }

  function syncArrayOutputs(setInputs) {
    if (setInputs) {
      nEl.value = String(state.arr.n);
      dEl.value = String(state.arr.d);
      steerEl.value = String(state.arr.steer);
    }
    nOut.textContent = String(state.arr.n);
    dOut.textContent = state.arr.d.toFixed(2) + " λ";
    const s = state.arr.steer;
    steerOut.textContent = s === 0 ? "0°"
      : (s > 0 ? "+" : DB.MINUS) + Math.abs(s) + "°";
  }

  function setArray(opts) {
    opts = opts || {};
    if (opts.n != null) state.arr.n = DB.clamp(Math.round(opts.n), 2, 16);
    if (opts.d != null) state.arr.d = DB.clamp(opts.d, 0.15, 1);
    if (opts.steer != null) state.arr.steer = DB.clamp(Math.round(opts.steer), -60, 60);
    syncArrayOutputs(true);
    if (state.preset === "array") retarget(160);
  }

  chips.forEach((b) => {
    b.addEventListener("click", () => setPreset(b.dataset.preset));
  });

  const onArrInput = () => {
    state.arr.n = DB.clamp(parseInt(nEl.value, 10) || 8, 2, 16);
    state.arr.d = DB.clamp(parseFloat(dEl.value) || 0.5, 0.15, 1);
    state.arr.steer = DB.clamp(parseInt(steerEl.value, 10) || 0, -60, 60);
    syncArrayOutputs(false);
    if (state.preset === "array") retarget(160);
  };
  nEl.addEventListener("input", onArrInput);
  dEl.addEventListener("input", onArrInput);
  steerEl.addEventListener("input", onArrInput);

  /* ---------------- init ---------------- */

  cv = DB.canvas2d(canvasEl, () => { if (cv) draw(); });
  syncArrayOutputs(true);
  setPreset("sector", 0);

  window.LAB2 = {
    setPreset: (name) => setPreset(name),
    setArray,
    stats: () => ({
      peakDbi: state.stats.peakDbi,
      hpbw: state.stats.hpbw,
      fb: state.stats.fb,
      preset: state.preset,
    }),
  };
})();
