/* decibel — street scene life: cursor parallax on the hero, and pausing the
   CSS scene animations while they're offscreen. Purely decorative; every
   entry point bails cleanly when the DOM (or motion) isn't there. */
(() => {
  "use strict";

  const DB = window.DB;
  if (!DB) return;

  /* pause scene animations while their card is out of view */
  if (typeof IntersectionObserver !== "undefined" && typeof document.querySelectorAll === "function") {
    const cards = document.querySelectorAll(".scene-anim");
    if (cards.length) {
      const io = new IntersectionObserver(
        (entries) => entries.forEach((en) => en.target.classList.toggle("paused", !en.isIntersecting)),
        { rootMargin: "80px 0px" }
      );
      cards.forEach((el) => io.observe(el));
    }
  }

  if (DB.REDUCED) return;

  /* hero parallax: layers drift opposite the cursor, eased */
  const card = document.getElementById("hero-scene-card");
  const svg = document.getElementById("hero-scene");
  if (!card || !svg) return;

  const layers = ["px-sky", "px-back", "px-mid", "px-front"]
    .map((id) => document.getElementById(id));
  const depth = [3, 7, 12, 18];

  let goal = 0, cur = 0, raf = null;

  function step() {
    cur += (goal - cur) * 0.08;
    for (let i = 0; i < layers.length; i++) {
      if (layers[i]) layers[i].setAttribute("transform", "translate(" + (cur * depth[i]).toFixed(2) + " 0)");
    }
    if (Math.abs(goal - cur) > 0.0015) raf = requestAnimationFrame(step);
    else raf = null;
  }

  function kick() { if (!raf) raf = requestAnimationFrame(step); }

  card.addEventListener("pointermove", (e) => {
    const r = card.getBoundingClientRect();
    if (!r.width) return;
    goal = (0.5 - (e.clientX - r.left) / r.width);
    kick();
  });
  card.addEventListener("pointerleave", () => { goal = 0; kick(); });
})();
