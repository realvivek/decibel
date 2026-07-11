# decibel

An interactive playground for decibel math — the logarithmic bookkeeping behind every
radio link, audio chain, and RF datasheet.

**Live demo:** _(deploy pending)_

## The three labs

**LAB 01 — the dial.** A draggable 270° dial from −60 to +60 dB. Readouts convert live
between decibels, linear power ratio, and absolute watts (read as dBm). Below it, a
scrolling dBm ladder pins the numbers to real signals: GPS at the sidewalk (−127 dBm),
the LTE cell edge (−100), strong Wi-Fi (−70), your phone's uplink (+23), a macro cell
(+47), an FM transmitter (+80).

**LAB 02 — the shape of gain.** A polar pattern explorer. Morph between an isotropic
reference, an exact half-wave dipole, a patch, a 65°/17 dBi sector (the 3GPP model),
and a yagi — or build a uniform linear phased array (2–16 elements, 0.15–1 λ spacing,
±60° steering) driven by the real array factor `sin(Nu/2)/(N·sin(u/2))`. The amber
wedge is the −3 dB half-power beamwidth, measured from the plotted curve; stats show
peak dBi, HPBW, and front-to-back ratio.

**LAB 03 — the link budget.** Stage cards from transmitter to receiver: TX power, cable
loss, antenna gains, and a path governed by free-space loss
`FSPL = 32.44 + 20·log₁₀(d_km) + 20·log₁₀(f_MHz)` with selectable band
(900 MHz / 3.6 GHz / 28 GHz), 0.1–30 km distance, and a heavy-rain toggle. A stepped
waterfall shows every gain and loss against the thermal noise floor, ending in a
verdict pill and the honest number: how many watts physically arrive.

All formulas and model constants are listed in the MODEL NOTES footer on the page.

## Running it

No build, no dependencies — it's static files.

```
python3 -m http.server 8000
# open http://localhost:8000
```

## Tech

Vanilla HTML/CSS/JS with hand-rolled canvas 2D and SVG rendering. Fully self-contained —
fonts (Space Grotesk, JetBrains Mono; both OFL-licensed) are served locally, and there are
no external requests at all. Math self-tests live in `tests/` and run in plain Node.
