/* decibel — LAB 01 "the dial". Loads after main.js; consumes window.DB. */
(() => {
  "use strict";

  const DB = window.DB;

  /* ================= pure math / geometry ================= */

  const DB_MIN = -60, DB_MAX = 60, RANGE = 120, SWEEP = 270, A_START = 135;

  /* screen coords, y down, degrees clockwise from +x axis */
  function valueToAngle(db) {
    return A_START + SWEEP * (db - DB_MIN) / RANGE;
  }

  /* inverse; angles inside the 90° bottom gap split at 315° → nearest end */
  function angleToValue(angleDeg) {
    const rel = (((angleDeg - A_START) % 360) + 360) % 360;
    if (rel <= SWEEP) return DB_MIN + RANGE * rel / SWEEP;
    return rel < SWEEP + 45 ? DB_MAX : DB_MIN;
  }

  function polar(cx, cy, r, aDeg) {
    const a = (aDeg * Math.PI) / 180;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  }

  function arcPath(cx, cy, r, a0, a1) {
    if (Math.abs(a1 - a0) < 1e-4) return "";
    const p0 = polar(cx, cy, r, a0), p1 = polar(cx, cy, r, a1);
    const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
    return "M " + p0.x.toFixed(2) + " " + p0.y.toFixed(2) +
      " A " + r + " " + r + " 0 " + large + " 1 " +
      p1.x.toFixed(2) + " " + p1.y.toFixed(2);
  }

  function wedgePath(cx, cy, r, a0, a1) {
    if (a1 - a0 < 1e-4) return "";
    const p0 = polar(cx, cy, r, a0), p1 = polar(cx, cy, r, a1);
    const large = a1 - a0 > 180 ? 1 : 0;
    return "M " + cx + " " + cy +
      " L " + p0.x.toFixed(2) + " " + p0.y.toFixed(2) +
      " A " + r + " " + r + " 0 " + large + " 1 " +
      p1.x.toFixed(2) + " " + p1.y.toFixed(2) + " Z";
  }

  function hexRgb(hex) {
    const h = hex.replace("#", "");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  const G_STOPS = [hexRgb(DB.tokens.cyan), hexRgb(DB.tokens.violet), hexRgb(DB.tokens.pink)];

  /* cyan→violet→pink, interpolated in RGB, t in [0,1] */
  function gradColor(t, alpha) {
    t = DB.clamp(t, 0, 1);
    const seg = t < 0.5 ? 0 : 1;
    const u = (t - seg * 0.5) * 2;
    const a = G_STOPS[seg], b = G_STOPS[seg + 1];
    const r = Math.round(DB.lerp(a[0], b[0], u));
    const g = Math.round(DB.lerp(a[1], b[1], u));
    const bl = Math.round(DB.lerp(a[2], b[2], u));
    return alpha === undefined || alpha >= 1
      ? "rgb(" + r + "," + g + "," + bl + ")"
      : "rgba(" + r + "," + g + "," + bl + "," + alpha + ")";
  }

  /* horizontal log-power line: −60..+60 dBm ↔ pad..W−pad */
  function powerX(dbm, W, pad) {
    const p = pad === undefined ? 14 : pad;
    return p + ((dbm - DB_MIN) / RANGE) * (W - 2 * p);
  }

  /* scrolling ladder: current value pinned to W/2, span dB visible.
     150 dB keeps the far anchors (GPS −127, FM +80) reachable from a ±60 dial. */
  function ladderX(dbm, shown, W, span) {
    const s = span === undefined ? 150 : span;
    return W / 2 + ((dbm - shown) / s) * W;
  }

  window.LAB1_MATH = { valueToAngle, angleToValue, polar, arcPath, wedgePath, gradColor, powerX, ladderX };

  /* ================= DOM ================= */

  const stage = document.getElementById("dial-stage");
  if (!stage) return;

  const chipsWrap = document.getElementById("dial-chips");
  const roDb = document.getElementById("ro-db");
  const roRatio = document.getElementById("ro-ratio");
  const roWatts = document.getElementById("ro-watts");
  const powerEl = document.getElementById("power-bar");
  const ladderEl = document.getElementById("dbm-ladder");

  const T = DB.tokens;
  const MONO = '"JetBrains Mono", ui-monospace, monospace';
  const cl = (v) => DB.clamp(v, DB_MIN, DB_MAX);

  let target = 0;
  let shown = 0;
  let dragging = false;
  let activePointer = null;
  let tweening = false;
  let chipTween = null;
  let chipDest = null; // tween destination, so rapid chip clicks compound from it
  let lastAria = "";

  /* ---------- dial SVG (static geometry built once) ---------- */

  const SVGNS = "http://www.w3.org/2000/svg";
  function svgEl(name, attrs, parent) {
    const n = document.createElementNS(SVGNS, name);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  const svg = svgEl("svg", { viewBox: "0 0 400 400", "aria-hidden": "true", focusable: "false" }, stage);
  const defs = svgEl("defs", {}, svg);

  function glowFilter(id, dev) {
    const f = svgEl("filter", { id, x: "-60%", y: "-60%", width: "220%", height: "220%" }, defs);
    svgEl("feGaussianBlur", { in: "SourceGraphic", stdDeviation: dev, result: "b" }, f);
    const m = svgEl("feMerge", {}, f);
    svgEl("feMergeNode", { in: "b" }, m);
    svgEl("feMergeNode", { in: "SourceGraphic" }, m);
  }
  glowFilter("lab1-glow", 2.6);
  glowFilter("lab1-glow-strong", 6);

  const clip = svgEl("clipPath", { id: "lab1-vclip", clipPathUnits: "userSpaceOnUse" }, defs);
  const vclip = svgEl("path", { d: "M 200 200" }, clip);

  const ARC_R = 148;

  /* faint full track */
  svgEl("path", {
    d: arcPath(200, 200, ARC_R, A_START, A_START + SWEEP),
    fill: "none", stroke: "rgba(23,41,60,0.08)", "stroke-width": 10, "stroke-linecap": "round",
  }, svg);

  /* inner ring detail */
  svgEl("circle", { cx: 200, cy: 200, r: 126, fill: "none", stroke: T.grid, "stroke-width": 1 }, svg);

  /* conic-ish gradient: many short segments; faint pass + bright clipped pass */
  const SEG_N = 120, segStep = SWEEP / SEG_N;
  function buildSegments(width, opacity, parent) {
    for (let i = 0; i < SEG_N; i++) {
      const a0 = A_START + i * segStep;
      const a1 = a0 + segStep + (i < SEG_N - 1 ? 0.45 : 0); // overlap hides seams
      const attrs = {
        d: arcPath(200, 200, ARC_R, a0, a1), fill: "none",
        stroke: gradColor((i + 0.5) / SEG_N), "stroke-width": width, "stroke-opacity": opacity,
      };
      if (i === 0 || i === SEG_N - 1) attrs["stroke-linecap"] = "round";
      svgEl("path", attrs, parent);
    }
  }
  const gFaint = svgEl("g", {}, svg);
  buildSegments(10, 0.35, gFaint);

  /* ticks + labels */
  const gTicks = svgEl("g", {}, svg);
  for (let v = DB_MIN; v <= DB_MAX; v += 5) {
    const major = v % 10 === 0;
    const a = valueToAngle(v);
    const p1 = polar(200, 200, major ? 157 : 159, a);
    const p2 = polar(200, 200, major ? 170 : 166, a);
    svgEl("line", {
      x1: p1.x.toFixed(2), y1: p1.y.toFixed(2), x2: p2.x.toFixed(2), y2: p2.y.toFixed(2),
      stroke: major ? "rgba(23,41,60,0.45)" : "rgba(23,41,60,0.18)",
      "stroke-width": major ? 2 : 1, "stroke-linecap": "round",
    }, gTicks);
  }
  for (const v of [-60, -30, 0, 30, 60]) {
    const p = polar(200, 200, 186, valueToAngle(v));
    const t = svgEl("text", {
      x: p.x.toFixed(1), y: p.y.toFixed(1), dy: "0.35em", "text-anchor": "middle",
      fill: T.dim, "font-family": MONO, "font-size": 11,
    }, gTicks);
    t.textContent = (v > 0 ? "+" : v < 0 ? DB.MINUS : "") + Math.abs(v);
  }

  /* bright value arc: full gradient ring, revealed by a per-frame wedge clip */
  const gBright = svgEl("g", { "clip-path": "url(#lab1-vclip)", filter: "url(#lab1-glow)" }, svg);
  buildSegments(12, 1, gBright);

  /* needle group, built pointing at 0° (+x), rotated per frame.
     Tapered polygon, not a line — a horizontal line has a zero-height
     bbox and bbox-relative SVG filters render it as nothing. */
  const gNeedle = svgEl("g", { transform: "rotate(270 200 200)" }, svg);
  svgEl("path", {
    d: "M 230 196.6 L 316 198.9 L 316 201.1 L 230 203.4 Z",
    fill: "#17293C", filter: "url(#lab1-glow)",
  }, gNeedle);
  const tipHalo = svgEl("circle", { cx: 318, cy: 200, r: 8, fill: T.cyan, opacity: 0.55, filter: "url(#lab1-glow-strong)" }, gNeedle);
  const tipDot = svgEl("circle", { cx: 318, cy: 200, r: 5, fill: T.cyan, filter: "url(#lab1-glow)" }, gNeedle);

  /* hub */
  svgEl("circle", { cx: 200, cy: 200, r: 26, fill: "#FFFFFF", stroke: "rgba(23,41,60,0.22)", "stroke-width": 1 }, svg);
  const hubText = svgEl("text", {
    x: 200, y: 199, "text-anchor": "middle", fill: T.ink,
    "font-family": MONO, "font-size": 14, "font-weight": 700, "letter-spacing": "-0.03em",
  }, svg);
  hubText.textContent = "+0.0";
  const hubUnit = svgEl("text", {
    x: 200, y: 213, "text-anchor": "middle", fill: T.dim,
    "font-family": MONO, "font-size": 8, "letter-spacing": "0.18em",
  }, svg);
  hubUnit.textContent = "dB";

  /* ---------- power bar ---------- */

  let power = null;

  function drawPower() {
    if (!power || !power.w) return;
    const ctx = power.ctx, w = power.w, h = power.h;
    ctx.clearRect(0, 0, w, h);
    const pad = 14, x0 = pad, x1 = w - pad, trackY = h - 22;
    const mx = powerX(shown, w, pad);
    const c = gradColor((shown - DB_MIN) / RANGE);

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    /* faint track */
    ctx.strokeStyle = "rgba(23,41,60,0.08)";
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(x0, trackY); ctx.lineTo(x1, trackY); ctx.stroke();

    /* ticks + watt labels */
    const lblStep = w < 380 ? 40 : 20;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    for (let v = DB_MIN; v <= DB_MAX; v += 20) {
      const x = powerX(v, w, pad);
      ctx.strokeStyle = "rgba(23,41,60,0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, trackY + 7); ctx.lineTo(x, trackY + 11); ctx.stroke();
      if ((v - DB_MIN) % lblStep === 0) {
        ctx.fillStyle = T.dim;
        ctx.fillText(DB.fmtWatts(v, 1), x, h - 3);
      }
    }

    /* gradient, revealed from left edge to the marker */
    const grad = ctx.createLinearGradient(x0, 0, x1, 0);
    grad.addColorStop(0, T.cyan); grad.addColorStop(0.5, T.violet); grad.addColorStop(1, T.pink);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0 - 5, trackY - 10, Math.max(0, mx - x0 + 5), 20);
    ctx.clip();
    ctx.strokeStyle = grad;
    ctx.lineWidth = 6;
    ctx.globalAlpha = 0.95;
    ctx.shadowColor = c; ctx.shadowBlur = 9;
    ctx.beginPath(); ctx.moveTo(x0, trackY); ctx.lineTo(x1, trackY); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.restore();

    /* glowing marker */
    ctx.shadowColor = c; ctx.shadowBlur = 12;
    ctx.strokeStyle = "rgba(23,41,60,0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(mx, trackY - 11); ctx.lineTo(mx, trackY + 11); ctx.stroke();
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.arc(mx, trackY, 4, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;

    /* current value above the marker */
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.fillStyle = T.ink;
    const lbl = DB.fmtDb(shown, "dBm");
    const half = ctx.measureText(lbl).width / 2;
    ctx.fillText(lbl, DB.clamp(mx, x0 + half, x1 - half), 12);
  }

  /* ---------- dBm ladder ---------- */

  const ANCHORS = [
    { db: -127, txt: "GPS at the sidewalk" },
    { db: -100, txt: "LTE cell edge" },
    { db: -70, txt: "strong Wi-Fi" },
    { db: 0, txt: "1 mW · the anchor" },
    { db: 23, txt: "phone uplink" },
    { db: 47, txt: "macro cell" },
    { db: 80, txt: "FM transmitter" },
  ];
  const SPAN = 150;

  function anchorColor(db) { return db < 0 ? T.cyan : db === 0 ? T.amber : T.pink; }
  function fmtAnchorDb(db) { return (db > 0 ? "+" : db < 0 ? DB.MINUS : "") + Math.abs(db) + " dBm"; }

  let ladder = null;

  function drawLadder() {
    if (!ladder || !ladder.w) return;
    const ctx = ladder.ctx, w = ladder.w, h = ladder.h;
    ctx.clearRect(0, 0, w, h);
    const axisY = Math.round(h * 0.56);
    const fade = (x) => DB.clamp(Math.min(x, w - x) / (w * 0.08), 0, 1);

    ctx.lineCap = "round";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";

    /* axis */
    ctx.strokeStyle = T.grid;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, axisY); ctx.lineTo(w, axisY); ctx.stroke();
    ctx.strokeStyle = "rgba(23,41,60,0.20)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, axisY); ctx.lineTo(w, axisY); ctx.stroke();

    /* ruler ticks: density adapts to width so labels never collide */
    const tickStep = w < 700 ? 10 : 5;
    const labelEvery = w < 520 ? 30 : w < 900 ? 20 : 10;
    const lo = shown - SPAN / 2, hi = shown + SPAN / 2;
    for (let v = Math.ceil(lo / tickStep) * tickStep; v <= hi; v += tickStep) {
      const x = ladderX(v, shown, w, SPAN);
      const a = fade(x);
      if (a <= 0) continue;
      const major = v % 10 === 0;
      ctx.globalAlpha = a * (major ? 0.55 : 0.28);
      ctx.strokeStyle = "rgba(23,41,60,0.85)";
      ctx.lineWidth = 1;
      const th = major ? 7 : 4;
      ctx.beginPath(); ctx.moveTo(x, axisY - th); ctx.lineTo(x, axisY + th); ctx.stroke();
      if (v % labelEvery === 0 && !ANCHORS.some((an) => Math.abs(ladderX(an.db, shown, w, SPAN) - x) < 26)) {
        ctx.globalAlpha = a * 0.8;
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.fillStyle = T.dim;
        ctx.fillText(DB.fmtDb(v, "", 0), x, axisY + 19);
      }
    }
    ctx.globalAlpha = 1;

    /* center marker line (labels paint over it) */
    const mcx = w / 2;
    ctx.shadowColor = T.cyan; ctx.shadowBlur = 14;
    ctx.strokeStyle = T.cyan;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(mcx, 24); ctx.lineTo(mcx, h - 10); ctx.stroke();
    ctx.shadowBlur = 0;

    /* anchors, staggered above/below the axis */
    const halo = T.halo;
    for (let i = 0; i < ANCHORS.length; i++) {
      const an = ANCHORS[i];
      const x = ladderX(an.db, shown, w, SPAN);
      if (x < -140 || x > w + 140) continue;
      const a = fade(x);
      if (a <= 0) continue;
      const dir = i % 2 === 0 ? -1 : 1; // even index above, odd below
      const col = anchorColor(an.db);

      ctx.globalAlpha = a;
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = a * 0.5;
      ctx.beginPath(); ctx.moveTo(x, axisY + dir * 8); ctx.lineTo(x, axisY + dir * 27); ctx.stroke();

      ctx.globalAlpha = a;
      ctx.shadowColor = col; ctx.shadowBlur = 10;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(x, axisY + dir * 32, 3, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;

      /* two-line label: value adjacent to the dot, description outward.
         Clamp text x inside the canvas — a centered label at the edge would
         otherwise clip mid-glyph ("−70 dBm" reading as "0 dBm"). */
      ctx.shadowColor = halo; ctx.shadowBlur = 4;
      ctx.font = '10.5px "JetBrains Mono", monospace';
      ctx.fillStyle = col;
      const vTxt = fmtAnchorDb(an.db);
      const vHalf = ctx.measureText(vTxt).width / 2;
      ctx.fillText(vTxt, DB.clamp(x, vHalf + 2, w - vHalf - 2), axisY + (dir < 0 ? -44 : 48));
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = T.dim;
      const dHalf = ctx.measureText(an.txt).width / 2;
      ctx.fillText(an.txt, DB.clamp(x, dHalf + 2, w - dHalf - 2), axisY + (dir < 0 ? -58 : 62));
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;

    /* current value pinned top-center */
    ctx.font = '11.5px "JetBrains Mono", monospace';
    ctx.fillStyle = T.ink;
    ctx.shadowColor = halo; ctx.shadowBlur = 6;
    ctx.fillText(DB.fmtDb(shown, "dBm") + " · " + DB.fmtWatts(shown), mcx, 14);
    ctx.shadowBlur = 0;
  }

  /* ---------- per-frame render ---------- */

  function render() {
    const ang = valueToAngle(shown);
    const c = gradColor((shown - DB_MIN) / RANGE);

    gNeedle.setAttribute("transform", "rotate(" + ang.toFixed(3) + " 200 200)");
    tipDot.setAttribute("fill", c);
    tipHalo.setAttribute("fill", c);

    const lo = Math.min(270, ang), hi = Math.max(270, ang);
    vclip.setAttribute("d", wedgePath(200, 200, 176, lo, hi) || "M 200 200");

    hubText.textContent = DB.fmtDb(shown, "", 1);

    if (roDb) {
      roDb.textContent = DB.fmtDb(shown);
      roDb.classList.toggle("pos", shown > 0.05);
      roDb.classList.toggle("neg", shown < -0.05);
    }
    if (roRatio) roRatio.innerHTML = DB.fmtRatioHtml(shown);
    if (roWatts) roWatts.textContent = DB.fmtWatts(shown);

    const av = (Math.round(shown * 10) / 10).toFixed(1);
    if (av !== lastAria) {
      stage.setAttribute("aria-valuenow", av);
      stage.setAttribute("aria-valuetext", DB.fmtDb(shown));
      lastAria = av;
    }

    drawPower();
    drawLadder();
  }

  /* ---------- animation loop (self-stopping) ---------- */

  let running = false;

  function frame() {
    if (DB.REDUCED) {
      shown = target;
    } else {
      const d = target - shown;
      shown = Math.abs(d) < 0.005 ? target : shown + d * 0.16;
    }
    render();
    if (shown === target && !dragging && !tweening) {
      running = false;
      return;
    }
    requestAnimationFrame(frame);
  }

  function kick() {
    if (running) return;
    running = true;
    requestAnimationFrame(frame);
  }

  function cancelChipTween() {
    if (chipTween) { chipTween.cancel(); chipTween = null; }
    tweening = false;
    chipDest = null;
  }

  /* ---------- interaction ---------- */

  function pointToDb(e) {
    const r = stage.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    let a = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (a < 0) a += 360;
    return angleToValue(a);
  }

  stage.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (dragging) return; // one pointer drives the dial; ignore extra touches
    e.preventDefault();
    stage.focus({ preventScroll: true }); // preventDefault suppresses click-to-focus
    cancelChipTween();
    dragging = true;
    activePointer = e.pointerId;
    try { stage.setPointerCapture(e.pointerId); } catch (_) { /* capture unsupported */ }
    target = pointToDb(e);
    kick();
  });
  stage.addEventListener("pointermove", (e) => {
    if (dragging && e.pointerId === activePointer) target = pointToDb(e);
  });
  const endDrag = (e) => {
    if (e.pointerId !== activePointer) return;
    dragging = false;
    activePointer = null;
  };
  stage.addEventListener("pointerup", endDrag);
  stage.addEventListener("pointercancel", endDrag);

  stage.addEventListener("wheel", (e) => {
    e.preventDefault();
    const s = Math.sign(e.deltaY);
    if (!s) return;
    cancelChipTween();
    target = cl(target - s * 0.5);
    kick();
  }, { passive: false });

  const KEY_STEPS = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 10, PageDown: -10 };
  stage.addEventListener("keydown", (e) => {
    let next;
    if (e.key === "Home") next = DB_MIN;
    else if (e.key === "End") next = DB_MAX;
    else if (Object.prototype.hasOwnProperty.call(KEY_STEPS, e.key)) next = cl(target + KEY_STEPS[e.key]);
    else return;
    e.preventDefault();
    cancelChipTween();
    target = next;
    kick();
  });

  if (chipsWrap) {
    chipsWrap.querySelectorAll("[data-step]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const step = btn.getAttribute("data-step");
        // rapid clicks must compound from the tween's destination, not its
        // mid-flight value — +3 twice is +6, always
        const base = tweening && chipDest !== null ? chipDest : target;
        cancelChipTween();
        const to = step === "reset" ? 0 : cl(base + parseFloat(step));
        tweening = true;
        chipDest = to;
        chipTween = DB.tween({
          from: target, to, dur: 450, ease: DB.easeInOutCubic,
          onUpdate: (v) => { target = v; },
          onDone: () => { tweening = false; chipTween = null; chipDest = null; },
        });
        kick();
      });
    });
  }

  /* ---------- canvases + first paint ---------- */

  if (powerEl) power = DB.canvas2d(powerEl, () => drawPower());
  if (ladderEl) ladder = DB.canvas2d(ladderEl, () => drawLadder());

  kick();

  /* test hook */
  window.LAB1 = {
    set(v) { cancelChipTween(); target = cl(v); kick(); },
    get: () => ({ target, shown }),
  };
})();
