/* decibel — LAB 03 "the link budget". Loads after main.js; consumes window.DB. */
(() => {
  "use strict";

  const DB = window.DB;

  /* ================= pure model ================= */

  /* band keys double as carrier frequency in MHz */
  const BANDS = {
    900:   { bwHz: 10e6,  rainDbPerKm: 0.01, label: "900 MHz" },
    3600:  { bwHz: 100e6, rainDbPerKm: 0.1,  label: "3.6 GHz" },
    28000: { bwHz: 400e6, rainDbPerKm: 10,   label: "28 GHz" },
  };

  function fsplDb(km, MHz) {
    return 32.44 + 20 * Math.log10(km) + 20 * Math.log10(MHz);
  }

  function rainDb(km, band, on) {
    return on ? BANDS[band].rainDbPerKm * km : 0;
  }

  /* kTB in dBm/Hz + bandwidth + 7 dB noise figure */
  function noiseFloorDbm(band) {
    return -174 + 10 * Math.log10(BANDS[band].bwHz) + 7;
  }

  /* fixed 3 dB required SNR */
  function sensitivityDbm(band) {
    return noiseFloorDbm(band) + 3;
  }

  /* distance slider: t ∈ [0,1] → 0.1..30 km on a log scale */
  const KM_MIN = 0.1, KM_RANGE = 300;
  function tToKm(t) { return KM_MIN * Math.pow(KM_RANGE, t); }
  function kmToT(km) { return Math.log(km / KM_MIN) / Math.log(KM_RANGE); }

  /* cfg = {tx, cable, txg, km, band, rain, rxg} */
  function linkBudget(cfg) {
    const fspl = fsplDb(cfg.km, cfg.band);
    const rain = rainDb(cfg.km, cfg.band, cfg.rain);
    const floor = noiseFloorDbm(cfg.band);
    const sens = sensitivityDbm(cfg.band);
    const txOut = cfg.tx;
    const afterCable = txOut - cfg.cable;
    const afterTxG = afterCable + cfg.txg;
    const afterPath = afterTxG - fspl - rain;
    const afterRxG = afterPath + cfg.rxg;
    return {
      levels: [txOut, afterCable, afterTxG, afterPath, afterRxG],
      fspl, rain, floor, sens,
      rx: afterRxG,
      margin: afterRxG - sens,
    };
  }

  /* smallest 10·2ⁿ dB grid step that keeps the horizontal line count ≤ 8 */
  function gridStep(span) {
    let s = 10;
    while (span / s > 8) s *= 2;
    return s;
  }

  function fmtKm(km) {
    return km < 1 ? Math.round(km * 1000) + " m" : km.toFixed(1) + " km";
  }

  /* honest size-of comparison vs a 60 W bulb, e.g. "about 6 trillionths" */
  const FRACS = ["thousandth", "millionth", "billionth", "trillionth",
    "quadrillionth", "quintillionth", "sextillionth"];
  function bulbCoda(watts) {
    const ratio = watts / 60;
    if (!(ratio > 0)) return "";
    let idx = 0, mult = ratio * 1e3;
    while (mult < 0.95 && idx < FRACS.length - 1) { idx++; mult *= 1000; }
    let n = Math.round(mult);
    if (n >= 1000 && idx > 0) { idx--; n = 1; }
    if (n < 1) return " — less than a " + FRACS[idx] + " of a 60 W bulb, and it's plenty.";
    const qty = n === 1 ? "a " + FRACS[idx] : n + " " + FRACS[idx] + "s";
    return " — about " + qty + " of a 60 W bulb, and it's plenty.";
  }

  window.LAB3_MATH = {
    fsplDb, BANDS, rainDb, noiseFloorDbm, sensitivityDbm,
    tToKm, kmToT, linkBudget, gridStep, fmtKm, bulbCoda,
  };

  /* ================= DOM ================= */

  const wfEl = document.getElementById("waterfall");
  if (!wfEl) return;

  const el = {
    tx: document.getElementById("lb-tx"),
    txOut: document.getElementById("lb-tx-out"),
    cable: document.getElementById("lb-cable"),
    cableOut: document.getElementById("lb-cable-out"),
    txg: document.getElementById("lb-txg"),
    txgOut: document.getElementById("lb-txg-out"),
    rxg: document.getElementById("lb-rxg"),
    rxgOut: document.getElementById("lb-rxg-out"),
    dist: document.getElementById("lb-dist"),
    distOut: document.getElementById("lb-dist-out"),
    pathOut: document.getElementById("lb-path-out"),
    bandChips: document.getElementById("band-chips"),
    rain: document.getElementById("lb-rain"),
    verdict: document.getElementById("lb-verdict"),
    arriving: document.getElementById("lb-arriving"),
  };

  const T = DB.tokens;
  const MONOF = '"JetBrains Mono", monospace';
  const HALO = T.halo;
  const NAMES = ["TX OUT", "CABLE", "TX ANT", "PATH", "RX"];
  const NAMES_S = ["TX", "CBL", "ANT", "PATH", "RX"];

  const state = {
    tx: el.tx ? +el.tx.value : 30,
    cable: el.cable ? +el.cable.value : 2,
    txg: el.txg ? +el.txg.value : 17,
    rxg: el.rxg ? +el.rxg.value : 0,
    km: tToKm(el.dist ? +el.dist.value : 0.522),
    band: 3600,
    rain: false,
  };

  if (el.bandChips) {
    const act = el.bandChips.querySelector(".chip.is-active");
    if (act && BANDS[+act.getAttribute("data-band")]) state.band = +act.getAttribute("data-band");
  }

  /* the street strip above the stage cards: receiver walks a log-scale street */
  const strip = {
    person: document.getElementById("strip-person"),
    beam: document.getElementById("strip-beam"),
    label: document.getElementById("strip-label"),
  };

  function updateStrip(b) {
    if (!strip.person) return;
    const t = DB.clamp(kmToT(state.km), 0, 1);
    const x = 200 + t * 930;
    const col = b.margin >= 3 ? "#4C9F45" : b.margin >= 0 ? "#D98E1B" : "#E5548E";
    strip.person.setAttribute("transform", "translate(" + x.toFixed(1) + " 168)");
    if (strip.beam) {
      strip.beam.setAttribute("d",
        "M 94 28 Q " + ((94 + x) / 2).toFixed(1) + " 6 " + (x + 12).toFixed(1) + " 140");
      strip.beam.setAttribute("stroke", col);
    }
    if (strip.label) {
      strip.label.setAttribute("x", String(DB.clamp(x, 150, 1080)));
      strip.label.setAttribute("fill", col);
      strip.label.textContent = fmtKm(state.km) + " · " + DB.fmtDb(b.rx, "dBm");
    }
  }

  /* path-loss breakdown line, created once inside the stage-path card */
  let pathHint = null;
  if (el.bandChips && el.bandChips.parentElement) {
    pathHint = document.createElement("p");
    pathHint.className = "hint mono";
    el.bandChips.parentElement.appendChild(pathHint);
  }

  /* ---------- stage colors: cyan → violet → pink ---------- */

  function hexRgb(hex) {
    const h = hex.replace("#", "");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const STOPS = [hexRgb(T.cyan), hexRgb(T.violet), hexRgb(T.pink)];

  function stageColor(t) {
    t = DB.clamp(t, 0, 1);
    const seg = t < 0.5 ? 0 : 1;
    const u = (t - seg * 0.5) * 2;
    const a = STOPS[seg], b = STOPS[seg + 1];
    return "rgb(" + Math.round(DB.lerp(a[0], b[0], u)) + "," +
      Math.round(DB.lerp(a[1], b[1], u)) + "," + Math.round(DB.lerp(a[2], b[2], u)) + ")";
  }

  /* ---------- waterfall ---------- */

  let view = null;   // canvas2d state
  let disp = null;   // displayed (tweened) levels + scale
  let cur = null;    // latest computed budget (snapped)
  let anim = null;

  function draw() {
    if (!view || !view.w || !disp) return;
    const ctx = view.ctx, w = view.w, h = view.h;
    ctx.clearRect(0, 0, w, h);

    const small = w < 480;
    const GUT = 56, PADR = 14, PADT = 20, PADB = 26;
    const x0 = GUT, x1 = w - PADR;
    const y0 = PADT, y1 = h - PADB;
    const span = disp.hi - disp.lo;
    const yOf = (v) => y0 + ((disp.hi - v) / span) * (y1 - y0);
    const slotW = (x1 - x0) / 5;
    const inset = Math.min(12, slotW * 0.16);
    const pxa = (i) => x0 + slotW * i + inset;
    const pxb = (i) => x0 + slotW * (i + 1) - inset;
    const fBase = small ? "9px " : "10px ";

    function line(xa, ya, xb, yb) {
      ctx.beginPath(); ctx.moveTo(xa, ya); ctx.lineTo(xb, yb); ctx.stroke();
    }

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    /* grid + dBm axis in the left gutter */
    const step = gridStep(span);
    ctx.font = fBase + MONOF;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let v = Math.ceil(disp.lo / step) * step; v <= disp.hi; v += step) {
      const y = yOf(v);
      ctx.strokeStyle = T.grid;
      ctx.lineWidth = 1;
      line(x0, y, x1, y);
      ctx.fillStyle = T.dim;
      ctx.fillText(DB.fmtDb(v, "", 0), x0 - 8, y);
    }
    ctx.globalAlpha = 0.55;
    ctx.font = "9px " + MONOF;
    ctx.fillStyle = T.dim;
    ctx.fillText("dBm", x0 - 8, 9);
    ctx.globalAlpha = 1;

    /* nothing survives below the noise floor: faint pink wash */
    const yFloor = yOf(disp.floor), ySens = yOf(disp.sens);
    ctx.fillStyle = "rgba(229,84,142,0.06)";
    ctx.fillRect(x0, yFloor, x1 - x0, Math.max(0, y1 - yFloor));

    ctx.setLineDash([5, 5]);
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 1;
    ctx.strokeStyle = T.pink;
    line(x0, yFloor, x1, yFloor);
    ctx.strokeStyle = T.amber;
    line(x0, ySens, x1, ySens);
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.85;
    ctx.font = fBase + MONOF;
    /* left side: the RX stage lives at the right edge, and in the MARGINAL
       band its labels would overprint right-aligned line labels */
    ctx.textAlign = "left";
    ctx.fillStyle = T.pink;
    ctx.textBaseline = "top";
    ctx.fillText("floor " + DB.fmtDb(disp.floor, "dBm", 0), x0 + 6, yFloor + 4);
    ctx.fillStyle = T.amber;
    ctx.textBaseline = "alphabetic";
    ctx.fillText("sens " + DB.fmtDb(disp.sens, "dBm", 0), x0 + 6, ySens - 5);
    ctx.globalAlpha = 1;

    /* stepped connectors; labels are deferred to a pass after the plateau
       bars so glow strokes never overpaint them */
    const L = disp.levels;
    const deltaLabels = [];
    for (let i = 0; i < 4; i++) {
      const d = L[i + 1] - L[i];
      const bx = x0 + slotW * (i + 1);
      const ya = yOf(L[i]), yb = yOf(L[i + 1]);
      const col = d > 0.05 ? T.lime : d < -0.05 ? T.pink : T.dim;

      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(pxb(i), ya);
      ctx.lineTo(bx, ya);
      ctx.lineTo(bx, yb);
      ctx.lineTo(pxa(i + 1), yb);
      ctx.stroke();
      ctx.globalAlpha = 1;

      let my = DB.clamp((ya + yb) / 2, y0 + 8, y1 - 8);
      // short steps: hoist the label above the step so it can't share a pixel
      // row with the destination plateau's value/name labels
      if (Math.abs(ya - yb) < 40) my = Math.max(y0 + 8, Math.min(ya, yb) - 26);
      const right = i === 3;
      deltaLabels.push({
        x: right ? bx - 5 : bx + 5, y: my, col, right,
        text: DB.fmtDb(d, "", 1),
        sub: i === 2 && cur && cur.rain > 0 ? "rain " + DB.MINUS + cur.rain.toFixed(1) : null,
      });
    }

    /* glowing plateaus + labels */
    const names = small ? NAMES_S : NAMES;
    ctx.textAlign = "center";
    for (let i = 0; i < 5; i++) {
      const y = yOf(L[i]);
      const c = stageColor(i / 4);
      const xa = pxa(i), xb = pxb(i), cx = (xa + xb) / 2;

      ctx.strokeStyle = c;
      ctx.globalAlpha = 0.16;
      ctx.lineWidth = 8;
      line(xa, y, xb, y);
      ctx.globalAlpha = 1;
      ctx.shadowColor = c; ctx.shadowBlur = 12;
      ctx.lineWidth = 3;
      line(xa, y, xb, y);
      ctx.shadowBlur = 0;

      ctx.textBaseline = "alphabetic";
      ctx.shadowColor = HALO; ctx.shadowBlur = 4;
      ctx.font = "700 " + (small ? "9px " : "10.5px ") + MONOF;
      ctx.fillStyle = T.ink;
      ctx.fillText(DB.fmtDb(L[i], "", 1), cx, Math.max(12, y - 8));
      ctx.font = (small ? "8.5px " : "9.5px ") + MONOF;
      ctx.fillStyle = T.dim;
      ctx.fillText(names[i], cx, Math.min(h - 5, y + (small ? 15 : 17)));
      ctx.shadowBlur = 0;
    }

    /* deferred delta labels, over the plateau glow */
    ctx.textBaseline = "middle";
    ctx.font = fBase + MONOF;
    for (const lb of deltaLabels) {
      ctx.textAlign = lb.right ? "right" : "left";
      ctx.shadowColor = HALO; ctx.shadowBlur = 4;
      ctx.fillStyle = lb.col;
      ctx.fillText(lb.text, lb.x, lb.y);
      if (lb.sub) {
        ctx.fillStyle = T.amber;
        ctx.fillText(lb.sub, lb.x, lb.y + (small ? 11 : 13));
      }
      ctx.shadowBlur = 0;
    }

    /* RX endpoint: the verdict, as a dot */
    if (cur) {
      const mcol = cur.margin >= 3 ? T.lime : cur.margin >= 0 ? T.amber : T.pink;
      const dx = pxb(4), dy = yOf(L[4]);
      ctx.fillStyle = mcol;
      ctx.shadowColor = mcol; ctx.shadowBlur = 18;
      ctx.globalAlpha = 0.35;
      ctx.beginPath(); ctx.arc(dx, dy, 8, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(dx, dy, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  /* ---------- readouts (snap) ---------- */

  function updateReadouts(b) {
    if (el.txOut) el.txOut.textContent = DB.fmtDb(state.tx, "dBm");
    if (el.cableOut) el.cableOut.textContent = DB.MINUS + state.cable.toFixed(1) + " dB";
    if (el.txgOut) el.txgOut.textContent = DB.fmtDb(state.txg, "dBi");
    if (el.rxgOut) el.rxgOut.textContent = DB.fmtDb(state.rxg, "dBi");
    if (el.distOut) el.distOut.textContent = fmtKm(state.km);
    if (el.pathOut) el.pathOut.textContent = DB.MINUS + (b.fspl + b.rain).toFixed(1) + " dB";
    if (pathHint) {
      pathHint.textContent = "FSPL " + b.fspl.toFixed(1) + " · rain " + b.rain.toFixed(1) +
        " · floor " + DB.fmtDb(b.floor, "dBm", 0);
    }

    if (el.verdict) {
      let cls, txt;
      if (b.margin >= 3) {
        cls = "ok"; txt = "LINK CLOSES · " + DB.fmtDb(b.margin, "dB") + " margin";
      } else if (b.margin >= 0) {
        cls = "marginal"; txt = "MARGINAL · " + DB.fmtDb(b.margin, "dB") + " margin";
      } else {
        cls = "fail"; txt = "LINK FAILS · " + Math.abs(b.margin).toFixed(1) + " dB short";
      }
      el.verdict.classList.remove("ok", "marginal", "fail");
      el.verdict.classList.add(cls);
      el.verdict.textContent = txt;
    }

    if (el.arriving) {
      const watts = DB.dbmToWatts(b.rx);
      let coda;
      if (b.margin < 0) coda = " — below what this radio can tell apart from thermal noise. No software fixes physics.";
      else if (b.margin < 3) coda = " — one wet leaf from silence.";
      else if (b.rx >= -50) coda = " — a firehose, as radio goes.";
      else coda = bulbCoda(watts);
      // innerHTML: sub-attowatt powers render as mantissa·10<sup>−exp</sup> W
      el.arriving.innerHTML = "physically arriving: " + DB.fmtWattsLinearHtml(watts) + coda;
    }
  }

  /* ---------- recompute + tween the waterfall ---------- */

  function retarget() {
    const b = linkBudget(state);
    cur = b;
    updateReadouts(b);
    updateStrip(b);

    const lo = Math.min(Math.min.apply(null, b.levels), b.floor) - 6;
    const hi = Math.max(Math.max.apply(null, b.levels), b.sens) + 6;
    const to = { levels: b.levels.slice(), floor: b.floor, sens: b.sens, lo, hi };

    if (anim) { anim.cancel(); anim = null; }
    if (!disp) { disp = to; draw(); return; }

    const from = {
      levels: disp.levels.slice(),
      floor: disp.floor, sens: disp.sens, lo: disp.lo, hi: disp.hi,
    };
    anim = DB.tween({
      from: 0, to: 1, dur: 260, ease: DB.easeOutCubic,
      onUpdate: (t) => {
        for (let i = 0; i < 5; i++) disp.levels[i] = DB.lerp(from.levels[i], to.levels[i], t);
        disp.floor = DB.lerp(from.floor, to.floor, t);
        disp.sens = DB.lerp(from.sens, to.sens, t);
        disp.lo = DB.lerp(from.lo, to.lo, t);
        disp.hi = DB.lerp(from.hi, to.hi, t);
        draw();
      },
      onDone: () => { anim = null; },
    });
  }

  /* ---------- controls ---------- */

  function syncBandChips() {
    if (!el.bandChips) return;
    el.bandChips.querySelectorAll("[data-band]").forEach((c) => {
      c.classList.toggle("is-active", +c.getAttribute("data-band") === state.band);
    });
  }

  function syncRain() {
    if (!el.rain) return;
    el.rain.setAttribute("aria-pressed", state.rain ? "true" : "false");
    el.rain.textContent = "heavy rain · " + (state.rain ? "on" : "off");
  }

  function syncSliders() {
    if (el.tx) el.tx.value = state.tx;
    if (el.cable) el.cable.value = state.cable;
    if (el.txg) el.txg.value = state.txg;
    if (el.rxg) el.rxg.value = state.rxg;
    if (el.dist) el.dist.value = DB.clamp(kmToT(state.km), 0, 1);
  }

  if (el.tx) el.tx.addEventListener("input", () => { state.tx = +el.tx.value; retarget(); });
  if (el.cable) el.cable.addEventListener("input", () => { state.cable = +el.cable.value; retarget(); });
  if (el.txg) el.txg.addEventListener("input", () => { state.txg = +el.txg.value; retarget(); });
  if (el.rxg) el.rxg.addEventListener("input", () => { state.rxg = +el.rxg.value; retarget(); });
  if (el.dist) el.dist.addEventListener("input", () => { state.km = tToKm(+el.dist.value); retarget(); });

  if (el.bandChips) {
    el.bandChips.querySelectorAll("[data-band]").forEach((chip) => {
      chip.addEventListener("click", () => {
        const b = +chip.getAttribute("data-band");
        if (!BANDS[b] || b === state.band) return;
        state.band = b;
        syncBandChips();
        retarget();
      });
    });
  }

  if (el.rain) {
    el.rain.addEventListener("click", () => {
      state.rain = !state.rain;
      syncRain();
      retarget();
    });
  }

  /* ---------- first paint ---------- */

  syncBandChips();
  syncRain();
  view = DB.canvas2d(wfEl, () => draw());
  retarget();

  /* test hook */
  window.LAB3 = {
    set(p) {
      p = p || {};
      if (p.tx !== undefined) state.tx = DB.clamp(+p.tx, 0, 46);
      if (p.cable !== undefined) state.cable = DB.clamp(+p.cable, 0, 10);
      if (p.txg !== undefined) state.txg = DB.clamp(+p.txg, 0, 30);
      if (p.rxg !== undefined) state.rxg = DB.clamp(+p.rxg, 0, 30);
      if (p.km !== undefined) state.km = DB.clamp(+p.km, KM_MIN, 30);
      if (p.band !== undefined && BANDS[+p.band]) state.band = +p.band;
      if (p.rain !== undefined) state.rain = !!p.rain;
      syncSliders();
      syncBandChips();
      syncRain();
      retarget();
    },
    get: () => ({
      tx: state.tx, cable: state.cable, txg: state.txg, km: state.km,
      band: state.band, rain: state.rain, rxg: state.rxg,
      fspl: cur.fspl, rainLoss: cur.rain, floor: cur.floor, sens: cur.sens,
      rx: cur.rx, margin: cur.margin,
    }),
  };
})();
