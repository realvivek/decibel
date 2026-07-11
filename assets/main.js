/* decibel — shared utilities. Exposed as window.DB. */
(() => {
  "use strict";

  const tokens = {
    bg: "#0A0F1A",
    ink: "#E8EEF9",
    dim: "#8A94AB",
    grid: "rgba(232,238,249,0.07)",
    cyan: "#38E1FF",
    violet: "#8B7CFF",
    pink: "#FF5CA8",
    amber: "#FFC24B",
    lime: "#B7F34D",
  };

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  const REDUCED = typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Tween a scalar; returns {cancel}. With reduced motion, jumps straight to the end. */
  function tween({ from = 0, to = 1, dur = 420, ease = easeInOutCubic, onUpdate, onDone }) {
    if (REDUCED || dur <= 0) {
      onUpdate && onUpdate(to, 1);
      onDone && onDone();
      return { cancel() {} };
    }
    let raf, t0 = null, cancelled = false;
    const step = (ts) => {
      if (cancelled) return;
      if (t0 === null) t0 = ts;
      const t = clamp((ts - t0) / dur, 0, 1);
      onUpdate && onUpdate(lerp(from, to, ease(t)), t);
      if (t < 1) raf = requestAnimationFrame(step);
      else onDone && onDone();
    };
    raf = requestAnimationFrame(step);
    return { cancel() { cancelled = true; cancelAnimationFrame(raf); } };
  }

  /* Hi-DPI canvas manager. Keeps state.w/state.h in CSS pixels, rescales the
     backing store on resize, and calls onResize(w, h) after each refit. */
  function canvas2d(el, onResize) {
    const ctx = el.getContext("2d");
    const state = { ctx, el, w: 0, h: 0 };
    const fit = () => {
      const r = el.getBoundingClientRect();
      if (r.width < 2) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      state.w = r.width;
      state.h = r.height;
      el.width = Math.round(r.width * dpr);
      el.height = Math.round(r.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      onResize && onResize(state.w, state.h);
    };
    if (typeof ResizeObserver !== "undefined") {
      new ResizeObserver(fit).observe(el);
    } else {
      window.addEventListener("resize", fit);
    }
    fit();
    state.refit = fit;
    return state;
  }

  /* ---------- formatting ---------- */

  const MINUS = "−"; // proper minus sign

  /* n significant figures, plain decimal */
  function sig(x, n = 3) {
    if (!isFinite(x)) return "∞";
    if (x === 0) return "0";
    const mag = Math.floor(Math.log10(Math.abs(x)));
    const d = clamp(n - 1 - mag, 0, 12);
    return x.toFixed(d);
  }

  function fmtDb(v, unit = "dB", digits = 1) {
    const s = v < 0 ? MINUS : "+";
    return s + Math.abs(v).toFixed(digits) + (unit ? " " + unit : "");
  }

  const SUP = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
  const sup = (n) => String(n).split("").map((c) => SUP[c] || c).join("");

  /* Power ratio for a dB value: plain decimal in a readable window,
     mantissa·10^exp outside it. */
  function fmtRatio(dB) {
    const r = Math.pow(10, dB / 10);
    if (r >= 0.001 && r < 10000) {
      return "×" + sig(r, 3);
    }
    const exp = Math.floor(Math.log10(r));
    const m = r / Math.pow(10, exp);
    return "×" + sig(m, 3) + "·10" + sup(exp);
  }

  /* dBm → watts with SI prefix, aW … MW. */
  const SI_WATTS = [
    { u: "aW", e: -18 }, { u: "fW", e: -15 }, { u: "pW", e: -12 },
    { u: "nW", e: -9 }, { u: "µW", e: -6 }, { u: "mW", e: -3 },
    { u: "W", e: 0 }, { u: "kW", e: 3 }, { u: "MW", e: 6 },
  ];

  function dbmToWatts(dBm) { return Math.pow(10, dBm / 10) / 1000; }

  /* Unit selection runs on the base-10 exponent (exact in the dB domain), so
     −60 dBm is 1.00 nW, never 1000 pW. Values that would round to "1000 x"
     roll over into the next unit. */
  function fmtSiExp(e10, w, digits) {
    let best = SI_WATTS[0];
    for (const s of SI_WATTS) if (e10 >= s.e - 1e-9) best = s;
    let m = w === null ? Math.pow(10, e10 - best.e) : w / Math.pow(10, best.e);
    const bi = SI_WATTS.indexOf(best);
    if (m >= 999.5 && bi < SI_WATTS.length - 1) {
      best = SI_WATTS[bi + 1];
      m = Math.max(m / 1000, 1);
    }
    return sig(m, digits) + " " + best.u;
  }

  function fmtWatts(dBm, digits = 3) {
    return fmtSiExp(dBm / 10 - 3, null, digits);
  }

  /* Raw watts (already linear) with SI prefix. */
  function fmtWattsLinear(w, digits = 3) {
    if (!isFinite(w) || w <= 0) return "0 W";
    return fmtSiExp(Math.log10(w), w, digits);
  }

  window.DB = {
    tokens, clamp, lerp, tween, easeOutCubic, easeInOutCubic, REDUCED,
    canvas2d, sig, sup, fmtDb, fmtRatio, fmtWatts, fmtWattsLinear, dbmToWatts,
    MINUS,
  };

  /* ---------- section reveal ---------- */
  if (typeof IntersectionObserver !== "undefined") {
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }),
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 }
    );
    document.querySelectorAll(".lab, .footer .notes").forEach((el) => io.observe(el));
  } else {
    document.querySelectorAll(".lab, .footer .notes").forEach((el) => el.classList.add("in"));
  }
})();
