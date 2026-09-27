(function () {
'use strict';
// ════════════════════════════════════════════════════════════════════
//  Screw Gauge (Micrometer) Simulator  —  app.js  v3
//  Dual-mode: SI (metric 0–15mm, LC 0.01mm) + Imperial (0–1", LC 0.001")
//  Features: Explore mode, Readout badges, Sound, IIFE
// ════════════════════════════════════════════════════════════════════

// [SG-DATA-BEGIN]
// ── SI instrument constants ───────────────────────────────────────
const SI = {
  pitch:    0.5,     // mm per full revolution
  csd:      50,      // circular scale divisions
  lc:       0.01,    // mm least count
  msdCount: 30,      // half-mm divisions on main scale
  maxMm:    15.0,    // usable range
  unit:     'mm',
};

// ── SI, 1 mm pitch ────────────────────────────────────────────────
// The same 0.01 mm least count reached the other way: a whole millimetre per
// revolution against 100 thimble divisions instead of half a millimetre
// against 50. That makes the sleeve carry ONLY whole-millimetre graduations —
// there is no half-millimetre mark to miss, which is the commonest way a
// metric micrometer is misread by exactly 0.5 mm. Put the two side by side and
// the mark stops being a trap and starts being a thing you can explain.
const SI100 = {
  pitch:    1.0,     // mm per full revolution
  csd:      100,     // circular scale divisions
  lc:       0.01,    // mm least count — identical to the 0.5 mm/50 instrument
  msdCount: 15,      // WHOLE-mm divisions on the main scale; no half-mm marks
  maxMm:    15.0,    // usable range
  unit:     'mm',
};

// ── Imperial instrument constants ─────────────────────────────────
const IMP = {
  pitch:    0.025,   // inches per revolution (40 TPI)
  csd:      25,      // circular scale divisions
  lc:       0.001,   // inches least count
  msdCount: 40,      // 0.025" divisions on main scale (1 inch)
  maxMm:    25.4,    // 1 inch in mm
  maxInch:  1.0,
  unit:     'in',
};

// ── Depth micrometer instruments ──────────────────────────────────
// A depth micrometer carries the SAME screw as an outside micrometer — 0.5 mm
// pitch against a 50-division thimble, or 40 TPI against 25 — so the least
// count is identical and the arithmetic TR = MSR + CSR x LC is unchanged.
// Two things differ, and both are the reason the instrument is worth its own
// mode rather than a relabelled outside micrometer:
//
//  1. THE GRADUATIONS RUN BACKWARDS. The screw drives the rod INTO the hole,
//     so the thimble travels TOWARDS the base as the reading grows and COVERS
//     the sleeve instead of uncovering it. The sleeve is therefore numbered
//     from the head towards the thimble, zero sits at FULL RETRACTION, and the
//     main-scale value is the first number HIDDEN by the thimble — the exact
//     inverse of an outside micrometer. Reading it the familiar way returns
//     (range − actual), which is the single commonest misread on this tool.
//  2. THE RANGE COMES FROM AN INTERCHANGEABLE ROD. One screw covers 25 mm (or
//     1 in); rods step the base range in 25 mm / 1 in increments and the rod's
//     base value ADDS to whatever the screw reads.
//
// `reversed` is the only new flag the engine needs — everything else is the
// same constants in the same shape, which is what keeps getInst() the single
// funnel it has always been.
const DEPTH_SI = {
  pitch:    0.5,     // mm per full revolution — the standard depth-mic screw
  csd:      50,      // circular scale divisions
  lc:       0.01,    // mm least count
  msdCount: 50,      // half-mm divisions: a full 25 mm of sleeve, not a stub
  maxMm:    25.0,    // usable range PER ROD
  unit:     'mm',
  reversed: true,
};

const DEPTH_IMP = {
  pitch:    0.025,   // inches per revolution (40 TPI)
  csd:      25,      // circular scale divisions
  lc:       0.001,   // inches least count
  msdCount: 40,      // 0.025in divisions — 1 inch of sleeve
  maxMm:    25.4,    // 1 inch in mm
  maxInch:  1.0,
  unit:     'in',
  reversed: true,
};


// ── Inside micrometer (caliper / jaw type) ────────────────────────
// The instrument in the photo: two carbide jaws, a lock knob, and the same
// screw again. It measures ACROSS a bore from the inside — ring IDs, cylinder
// bores, slot widths — and it shares BOTH of the depth micrometer's departures
// from the outside micrometer, which is why it costs constants rather than a
// renderer:
//
//  1. THE SLEEVE READS BACKWARDS, for the same reason: the spindle extends
//     away from the reading end as the jaws open. Published guidance is blunt
//     about it — "the scale is reading backwards (left to right) which is just
//     the opposite of a standard outside micrometer".
//  2. IT HAS A FIXED BASE OFFSET. The jaws have physical width, so a closed
//     instrument does not read zero: the standard metric caliper-type inside
//     micrometer is a 5–30 mm instrument (Starrett 700MA, Mitutoyo 145 series)
//     — 5 mm of jaw plus 25 mm of screw. Its inch counterpart is 0.2–1.2 in.
//
// So `base` here is the same term the extension rod contributes on a depth
// micrometer, and it goes through the same getBaseMm() funnel. The difference
// is that a rod is swapped and a jaw is not.
const INSIDE_SI = {
  pitch:    0.5,     // mm per revolution — the same screw again
  csd:      50,      // circular scale divisions
  lc:       0.01,    // mm least count
  msdCount: 50,      // 25 mm of sleeve
  maxMm:    25.0,    // SCREW travel; the instrument reads 5–30 mm
  unit:     'mm',
  reversed: true,
  base:     5.0,     // jaw width — the reading when the jaws are closed
};

const INSIDE_IMP = {
  pitch:    0.025,   // 40 TPI
  csd:      25,
  lc:       0.001,
  msdCount: 40,      // 1 inch of sleeve
  maxMm:    25.4,
  maxInch:  1.0,
  unit:     'in',
  reversed: true,
  base:     5.08,    // 0.200 in of jaw, in mm — the instrument reads 0.2–1.2 in
};

// Interchangeable extension rods. The value is the depth the rod contributes
// BEFORE the screw moves at all, so reported depth = rod base + screw travel.
// Real sets step in 25 mm / 1 in and a 0–25 rod is simply the one with no
// extension, which is why the first entry is 0 rather than a special case.
const RODS_SI  = [0, 25, 50, 75];        // mm    → ranges 0–25 … 75–100
const RODS_IMP = [0, 1, 2, 3];           // inch  → ranges 0–1 … 3–4
// [SG-DATA-END]

// [SG-OX-BEGIN]
// ── Original layout constants (world / image coordinate space) ────
const OX = {
  scaleX: 539, scaleY: 100, spindleX: 200, spindleY: 79,
  thimbleY1: 49, thimbleY3: 31, thimbleX2: 40, thimbleX3: 440,
};
const SCALE_WIN_W = OX.thimbleX3 - OX.thimbleX2 - 153;
const R1 = OX.scaleY - OX.thimbleY1;
const R2 = OX.scaleY - OX.thimbleY3;
// [SG-OX-END]

// ── Ratchet stop: hit zone + drag gain ────────────────────────────
// thimble.png is 442×138 and is drawn at (OX.scaleX + shift, OX.thimbleY3),
// so these are offsets INTO the sprite. The knurled ratchet drum begins where
// the silver collar ends (~383) and runs to the sprite edge; the bounds carry a
// few px of padding so the target is comfortable under a fingertip.
const RATCHET_X1 = 378, RATCHET_X2 = 442;
const RATCHET_Y1 = 12,  RATCHET_Y2 = 126;
// Pointer travel (CSS px, i.e. real screen px) per circular-scale division when
// a drag STARTS on the ratchet. The thimble keeps its 1:1 axial mapping — one
// drag pixel moves the sprite one pixel, which is the fast approach — while the
// ratchet is the fine control, exactly as on the real instrument: spin the
// thimble to close the gap, then drive the last part-turn with the ratchet.
// Measured in CSS px (not logical px) so the ratchet feels identical whether the
// canvas renders at full 900 px or squeezed onto a phone.
const RATCHET_PX_PER_DIV = 4;
// Drum geometry, measured off thimble.png: the chamfered silhouette spans
// x 382–440, the flat knurled face x 390–431, and the drum runs y 18–118 about
// its centre at y 68 — so the cylinder radius is 50 world px. The sprite's own
// knurl is painted flat, so the cap slides along the axis without ever looking
// like it turns; helices redrawn each frame at the live rotation
// angle are what actually sell the rotation.
const RD_X1 = 382, RD_X2 = 440;   // silhouette, sprite x
const RD_CH = 8;                  // chamfer width at each end
const RD_CY = 68;                 // drum centreline, sprite y
const RD_R  = 50;                 // drum radius, world px
const RD_R_END = 41;
// The thimble's knurled grip band, sprite x — the stretch the old scrolled
// texture covered (x 89 to SCALE_WIN_W), inset to leave plain shoulders.
const THIMBLE_KNURL_X1 = 92, THIMBLE_KNURL_X2 = 244;              // radius at the chamfered ends
// Knurl teeth around the circumference — deliberately coarser than the sprite's
// painted mesh, and tied to the instrument rather than fixed. One least-count
// division turns the drum by 1/csd of a revolution, so a division always
// advances RATCHET_TOOTH_FRAC of a tooth: about a third, which reads as
// unmistakable rotation. Any finer and a step approaches half a tooth, where
// the mesh strobes and can even appear to run backwards — which matters most in
// Imperial, where 25 divisions per revolution make each step twice as large.
const RATCHET_TOOTH_FRAC = 0.36;
function ratchetTeeth() { return Math.max(6, Math.round(getCsd() * RATCHET_TOOTH_FRAC)); }
const RATCHET_HELIX = 0.020;      // rad of twist per world px → ~45° diamonds

// ── Canvas ────────────────────────────────────────────────────────
const DS = 0.75;
const CW = Math.round(1200 * DS);
const CH = 240;

const QUIZ_TOTAL  = 5;
const ANIM_SPEED  = 5;
const MM_TO_IN = 1 / 25.4;

// ── State ─────────────────────────────────────────────────────────
const state = {
  mm: 5.25, mode: 'free', unit: 'si', thimble100: false,
  instrument: 'outside', rodIdx: 0,   // 'outside' | 'depth'; rodIdx indexes RODS_SI / RODS_IMP

  dragging: false, dragRefX: 0, dragRefMm: 0, dragFine: false,
  // Spindle lock. Instrument state, not a display preference: deliberately NOT
  // persisted, because reloading into a micrometer whose spindle refuses to
  // turn reads as a broken tool rather than as a remembered setting.
  locked: false, lockHover: false, lockFlash: 0, lockAnim: 0,
  zoomOpen: false, hinted: false,
  score: 0, attempts: 0, answered: false,
  playing: false, animDir: 1, animLast: 0, animRaf: null,
  quizQuestions: [], quizCurrent: 0, quizAnswers: [], quizAnswered: false,
  exploreCat: 0, exploreIdx: 0,
  audioCtx: null,
  zeOn: false, zeLc: 0,   // Zero Error: off by default; zeLc is signed integer count of LC units (±5)
  wp: null, wpRaf: null, pickerOpen: false,   // measure-an-object
  partIdx: 0, partPin: 0,                     // parts explorer
};

// ── DOM ───────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const canvas = $('gauge-canvas');
const ctx    = canvas.getContext('2d');

// ── Hi-DPI backing store ──────────────────────────────────────────
// Draw everything in logical CW×CH space; the backing store is CW*DPR ×
// CH*DPR so the vector scales/ticks/numbers render razor-sharp on Retina.
// Pointer mapping (getCanvasX) maps to this same logical space — keep them
// in lockstep (see correctness.md B1).
let DPR = 1;
function setupCanvas() {
  DPR = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
  canvas.width  = Math.round(CW * DPR);
  canvas.height = Math.round(CH * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
setupCanvas();

// ── Sprites ───────────────────────────────────────────────────────
const imgThimble = new Image(); imgThimble.src = 'assets/thimble.png';
const imgSpindle = new Image(); imgSpindle.src = 'assets/spindle.png';
const imgBase    = new Image(); imgBase.src    = 'assets/micrometer_base.png';

// ── Sprite shading ────────────────────────────────────────────────
// The four PNGs carry the instrument's true profile, so the standing rule is
// to keep them for the silhouette and never re-author it. What they do NOT
// carry is a hard machined edge: every part is a soft painted bevel, so
// nothing separates the spindle from the frame or the thimble from the sleeve
// except a tonal accident. These passes add that edge — and give the frame's
// heat-shield pad the form it never had — WITHOUT touching a single outline,
// because the outline is the input.
//
// Everything here runs ONCE, on load, into a cached canvas. None of it may
// ever reach the per-frame path (see correctness.md B5).

function spriteCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w); c.height = Math.max(1, h);
  return c;
}

// The band lying just INSIDE the silhouette, along the edge facing −dy/−dx.
// Derived from the sprite's own alpha, so it follows every taper and cut-out
// with no hand-authored coordinate. (techniques.md §4b)
function edgeLip(img, dx, dy, colour) {
  const c = spriteCanvas(img.width, img.height);
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = 'destination-out';
  g.drawImage(img, dx, dy);            // erase where the shifted copy is opaque
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = colour;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

// The frame's heat-shield pad ships as 62,700 pixels of ONE flat colour,
// rgb(66,0,137) — no gradient, no modelling, and a chroma high enough that it
// reads as a hole punched in the casting rather than as a moulded insert. The
// remap keeps its shape exactly (it scales with the antialiased edge pixels so
// the outline stays as soft as the artist made it) and replaces the flat fill
// with a shaded charcoal carrying a violet undertone.
const PAD_SRC   = [66, 0, 137];
const PAD_BASE  = [38, 34, 52];        // moulded charcoal, violet cast
function remapPad(c, padTopY, padBotY) {
  const g = c.getContext('2d');
  const im = g.getImageData(0, 0, c.width, c.height);
  const d = im.data, w = c.width;
  const span = Math.max(1, padBotY - padTopY);
  for (let p = 0; p < d.length; p += 4) {
    const R = d[p], G = d[p + 1], B = d[p + 2];
    if (d[p + 3] < 8 || !(B > 90 && B > G + 40 && R > G + 20)) continue;
    // How much of the pad colour this pixel actually carries (1 in the body,
    // < 1 on the antialiased rim) — blend by it so the edge stays feathered.
    const t = Math.min(1, B / PAD_SRC[2]);
    const y = ((p / 4) / w) | 0;
    // Form: the pad wraps a curved frame, so it takes light along its top lip
    // and falls away below. That top lip is the only part of it the framing
    // shows, which is exactly why the flat fill read as a blob.
    const f = Math.min(1, Math.max(0, (y - padTopY) / span));
    const lift = 1.34 - 0.62 * Math.pow(f, 0.55);
    const nr = PAD_BASE[0] * lift, ng = PAD_BASE[1] * lift, nb = PAD_BASE[2] * lift;
    d[p]     = R + (nr - R) * t;
    d[p + 1] = G + (ng - G) * t;
    d[p + 2] = B + (nb - B) * t;
  }
  g.putImageData(im, 0, 0);
}

// The artwork tints its bright metal: a brass-yellow spindle and anvil, a
// beige sleeve and a GREEN thimble. On the real instrument all of those are
// steel — hardened spindle and anvil, satin-chrome sleeve and thimble — and
// only the frame is painted. This keeps every pixel's luminance (so the
// artist's modelling survives) and takes the hue out of it, with the faint
// cool cast of chrome under a daylight lamp. `pick(x, r, g, b)` chooses which
// pixels are steel; the frame's enamel is left alone.
function chromeFinish(c, pick) {
  const g = c.getContext('2d');
  const im = g.getImageData(0, 0, c.width, c.height);
  const d = im.data, w = c.width;
  for (let p = 0; p < d.length; p += 4) {
    if (d[p + 3] < 4) continue;
    const R = d[p], G = d[p + 1], B = d[p + 2];
    if (!pick(((p / 4) % w), R, G, B)) continue;
    const v = 0.30 * R + 0.59 * G + 0.11 * B;
    d[p] = Math.max(0, v - 2); d[p + 1] = v; d[p + 2] = Math.min(255, v + 4);
  }
  g.putImageData(im, 0, 0);
}

// Build the shaded, cached version of one sprite.
//   lip – arris width in sprite px (0 disables)
//   pad – run the heat-shield remap (frame sprite only)
function shadeSprite(img, opts) {
  opts = opts || {};
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  if (!w || !h) return img;
  const c = spriteCanvas(w, h);
  const o = c.getContext('2d');
  o.drawImage(img, 0, 0, w, h);

  if (opts.pad) remapPad(c, opts.padTopY || 0, opts.padBotY || h);
  if (opts.chrome) chromeFinish(c, opts.chrome);

  const L = opts.lip || 0;
  if (L > 0) {
    // Lit lip on every up-facing edge, dark lip on every down-facing edge, and
    // a weaker pair on the verticals. Applied to the COMPOSITE — a lip taken
    // from a slice would trace that slice's own cut edge and paint a bright
    // line down the middle of the part (correctness.md B16).
    o.globalAlpha = 0.58; o.drawImage(edgeLip(c, 0,  L, 'rgba(255,255,255,1)'), 0, 0);
    o.globalAlpha = 0.44; o.drawImage(edgeLip(c, 0, -L, 'rgba(6,10,15,1)'),     0, 0);
    o.globalAlpha = 0.20; o.drawImage(edgeLip(c,  L, 0, 'rgba(255,255,255,1)'), 0, 0);
    o.globalAlpha = 0.20; o.drawImage(edgeLip(c, -L, 0, 'rgba(10,14,20,1)'),    0, 0);
    o.globalAlpha = 1;
  }
  return c;
}

// The shaded sprites the renderer actually draws. They fall back to the raw
// Image until the build has run, so a failed decode degrades to the old look
// rather than to a blank canvas.
let sprBase = imgBase, sprThimble = imgThimble, sprSpindle = imgSpindle;
let spritesShaded = false;

function buildShadedSprites() {
  if (spritesShaded) return;
  // remapPad reads pixels back, which throws a SecurityError on a canvas
  // tainted by a cross-origin image. The sprites are same-origin today, but a
  // future CDN rewrite that served assets from another host would otherwise
  // take this exception inside an image onload handler and leave the tool
  // with no picture at all. Fall back to the unshaded sprites instead.
  try {
    // Pad extent measured off micrometer_base.png: the insert runs y 212–538.
    // Base: the sleeve (everything right of the hub, x > 520) is steel, and so
    // are the anvil and spindle bush — the only WARM pixels on the casting
    // (R >= G, blue well below red). The frame's green enamel is never warm.
    sprBase    = shadeSprite(imgBase,    { lip: 2, pad: true, padTopY: 212, padBotY: 538,
      chrome: function (x, r, g, b) { return x > 520 || (r >= g - 4 && b <= r - 18); } });
    const allSteel = function () { return true; };
    sprThimble = shadeSprite(imgThimble, { lip: 2, chrome: allSteel });
    sprSpindle = shadeSprite(imgSpindle, { lip: 1, chrome: allSteel });
  } catch (err) {
    sprBase = imgBase; sprThimble = imgThimble; sprSpindle = imgSpindle;
  }
  spritesShaded = true;
}

const SPRITE_COUNT = 3;   // frame, thimble, spindle
let loadedCount = 0;
function onImgLoad() { if (++loadedCount === SPRITE_COUNT) { buildShadedSprites(); render(); } }
[imgThimble, imgSpindle, imgBase].forEach(img => { img.onload = onImgLoad; img.onerror = onImgLoad; });

// [SG-ENGINE-BEGIN]
// ── Scale helpers ─────────────────────────────────────────────────
function isImperial() { return state.unit === 'imperial'; }
function isDepth()    { return state.instrument === 'depth'; }
function isInside()   { return state.instrument === 'inside'; }
function isOutside()  { return !isDepth() && !isInside(); }
// The trait that actually matters at most call sites. Depth and inside are two
// patterns of the same idea: a reversed sleeve, a fixed base added to the screw
// reading, and a measurement taken INTO or WITHIN a feature rather than across
// a part held between two faces. Asking "is it a bore instrument" keeps those
// call sites honest; asking "is it the depth one" three dozen times would mean
// every one of them had to be revisited to add a third instrument.
function isBore()     { return !isOutside(); }
// One key for every three-way lookup — the parts catalogue, the picker, the
// diagram, the hint. Nested ternaries at each of those is how the third
// instrument would get forgotten at the fourth one.
function instKey()    { return isDepth() ? 'depth' : (isInside() ? 'inside' : 'outside'); }
// Every instrument this tool fits. setInstrument and the deep link both check
// against THIS, so adding a fourth is one edit rather than a hunt.
const INSTRUMENTS = ['outside', 'depth', 'inside'];
// A 100-division thimble is a metric option only: there is no inch equivalent
// (0.025in / 100 = 0.00025in is not a graduation anyone makes). It is also an
// OUTSIDE-micrometer option only — a depth micrometer is built on the 0.5 mm
// screw, and offering a 1 mm one here would invent an instrument.
function is100()      { return !isImperial() && isOutside() && !!state.thimble100; }
function getInst()    {
  if (isDepth())  return isImperial() ? DEPTH_IMP  : DEPTH_SI;
  if (isInside()) return isImperial() ? INSIDE_IMP : INSIDE_SI;
  return isImperial() ? IMP : (is100() ? SI100 : SI);
}
// Does this instrument's sleeve count backwards? Asked of the FITTED
// instrument, never of state.instrument, so the drawing and the labelling
// cannot disagree about which way the scale runs.
function isReversed() { return !!getInst().reversed; }

// ── Extension rods ────────────────────────────────────────────────
// The rod contributes a fixed base depth; the screw contributes the rest.
// Depth = rod base + screw travel, and the screw travel is what MSR/CSR
// describe — so the rod is added at the DISPLAY boundary and never inside the
// reading engine. Keeping it out of getMSR/getCSR is what lets the existing
// one-revolution and quantisation invariants keep applying unchanged.
function getRods()      { return isImperial() ? RODS_IMP : RODS_SI; }
function getRodIdx()    { const r = getRods(); return Math.max(0, Math.min(r.length - 1, state.rodIdx | 0)); }
// THE base term, whatever supplies it: a depth micrometer's interchangeable rod
// or an inside micrometer's fixed jaw width. One funnel, because the arithmetic
// downstream (total = base + screw, the graded answer, the readout split, the
// drawn geometry) is identical and a second spelling would be a second answer.
function getBaseMm() {
  if (isDepth())  return getRods()[getRodIdx()] * (isImperial() ? 25.4 : 1);
  if (isInside()) return getInst().base || 0;
  return 0;
}
// Total depth in mm for a given screw travel. On an outside micrometer the rod
// base is 0, so this is the identity and every caller can use it unconditionally.
function getTotalMm(screwMm) { return getBaseMm() + screwMm; }
function getMaxMm()   { return getInst().maxMm; }
function getCsd()     { return getInst().csd; }
// Pitch and least count in millimetres. Both come from the fitted instrument,
// so adding one is a matter of adding its constants — nothing downstream of
// here knows how many instruments there are.
function getPitch()   { return getInst().pitch * (isImperial() ? 25.4 : 1); }
function getLcMm()    { return getInst().lc    * (isImperial() ? 25.4 : 1); }
function getLcDisplay(){ return getInst().lc; }
function getMsdCount(){ return getInst().msdCount; }
function uLabel()     { return getInst().unit; }

// Pixels per half-mm division (world coords) — scale stays consistent
function getMsdPx() { return 200 / getMsdCount(); }

function getShiftPx(mm) {
  return (mm / getPitch()) * getMsdPx();
}

function getMSR(mm) {
  const p = getPitch();
  const lc = getLcMm();
  // Work on the LC-quantized value so MSR and CSR always agree: when the
  // rounded fraction reaches a full revolution it belongs to the next MSR.
  const q = Math.round(mm / lc) * lc;
  return Math.floor(q / p + 1e-9) * p;
}

function getCSR(mm) {
  const p = getPitch();
  const lc = getLcMm();
  const q = Math.round(mm / lc) * lc;
  // With q on the LC grid, (q − MSR)/lc is an integer 0..csd−1 by construction:
  // a fraction that would round to a full revolution has already carried into
  // getMSR's floor, so the modulo never silently drops a pitch.
  return ((Math.round((q - getMSR(q)) / lc) % getCsd()) + getCsd()) % getCsd();
}

function snapToLc(mm) {
  const lc = getLcMm();
  return Math.round(mm / lc) * lc;
}
// [SG-ENGINE-END]

// [SG-GEOM-BEGIN]
// ── Where the drawing puts things on the thimble cylinder ─────────
// Every circular-scale graduation is projected through cylY, on one radius, so
// the picture and the arithmetic cannot drift apart: a division is at
// 2*PI/csd of a turn from the datum whatever instrument is fitted. Keeping this
// in one place is what lets the harness MEASURE the drawn scale instead of
// restating the formula and proving nothing.
// One thimble division, as an angle. The drawing used to carry its own copy of
// this as (PI/2)/N; two spellings of one constant is one too many.
function divAngle() { return 2 * Math.PI / getCsd(); }
function cylY(divsFromDatum) {
  return OX.scaleY - R1 * Math.sin(divsFromDatum * divAngle());
}
// Same projection pushed out to the tick's far end, so graduations splay with
// the curvature instead of standing parallel.
function cylYOuter(divsFromDatum, ext) {
  return OX.scaleY - (R1 + ext) * Math.sin(divsFromDatum * divAngle());
}
// A micrometer thimble always parks ON a division: the instrument cannot stop
// between two, which is exactly why its least count is its least count.
function thimbleMarkPos(i) { return i; }

// How often a thimble graduation is numbered, and how often it gets a middle
// length. A 100-division thimble packs twice as many graduations into the same
// drum as a 50-division one, so it is numbered half as often — otherwise the
// numbers crowd the visible face and stop being readable. Kept out of the
// drawing so the harness can count what the face actually shows.
function thimbleLabelEvery() { return getCsd() >= 100 ? 10 : 5; }
function thimbleMidEvery()   { return getCsd() >= 100 ? 5  : 0; }
// How far either side of the datum a graduation is still numbered.
function thimbleLabelSpan()  { return Math.ceil(getCsd() / 4) - 1; }

// What the sleeve prints under graduation i, or null for an unnumbered line.
// A real 0–1in sleeve is numbered 0 at the datum then 1..9 for the tenths, and
// the 1.000in line is left BARE — numbering it would print a second "1" nine
// tenths away from the first and read as 0.100in. The metric sleeve numbers
// every whole millimetre. Kept here rather than inline in the drawing so the
// harness can read the printed labels back and check them for duplicates: a
// repeated glyph on a scale is invisible to every numeric assertion and is
// exactly what a student misreads.
function sleeveLabel(i) {
  // On a DEPTH micrometer the sleeve is numbered from the head towards the
  // thimble, so graduation i carries the number of the graduation msdCount−i
  // would carry on an outside micrometer. The reversal lives HERE, in the one
  // place the harness reads labels back from, rather than in the drawing —
  // a drawing that renumbers privately is a scale the assertions cannot see.
  //
  // Why this exact mapping: the thimble parks at FULL travel when the reading
  // is zero and uncovers the sleeve as the rod extends, so the graduation at
  // the thimble's edge has index msdCount − travel/pitch. Labelling that
  // graduation with (msdCount − i)·pitch makes the number at the edge equal
  // the reading, and makes the numbers DECREASE under the thimble — which is
  // what "the main-scale value is the first number hidden by the thimble"
  // means in arithmetic.
  var idx = isReversed() ? (getMsdCount() - i) : i;
  if (isImperial()) {
    if (idx === 0) return '0';
    if (idx % 4 === 0 && idx % 40 !== 0) return String(idx / 4);
    return null;
  }
  // 0.5 mm/50: graduation i is a HALF millimetre, so every tenth is a whole
  // 5 mm. 1 mm/100: graduation i is a whole millimetre, numbered every fifth.
  var every = is100() ? 5 : 10;
  return (idx % every === 0) ? String(idx * getInst().pitch) : null;
}

// Which way the drawn scale runs. +1 = an outside micrometer's thimble travels
// away from the frame as the reading grows; −1 = a depth micrometer's travels
// towards the base. Every drawn quantity that has a direction — the sprite
// shift, the drum rotation, the knurl scroll and the order the thimble numbers
// run in — takes its sign from here, so they cannot drift apart.
function scaleDir() { return isReversed() ? -1 : 1; }

// ── Depth axis: true depth (mm) -> drawn length (px) ──────────────
// A 75 mm rod is 600 px at true scale and the canvas has ~340. The first
// attempt scaled the WHOLE rod to fit, which is a trap in disguise:
//   drawn = rodPx * (AVAIL / rodPx) === AVAIL
// — identically constant. On the 50 and 75 mm rods the rod was pinned at 340 px
// for the entire 25 mm of travel, so turning the thimble moved nothing at all.
// A picture that does not move while the state moves is worse than no picture.
//
// Correct treatment, and the standard drafting one: the rod's FIXED base is the
// uninteresting part, so it is broken out into a constant stub, while the SCREW
// TRAVEL — the part the user is changing — is drawn at TRUE scale. Movement is
// then always wpPxPerMm per mm, on every rod.
const DEPTH_STUB_PX = 110;   // drawn allowance for the rod's fixed base
function depthStubPx() { return getBaseMm() > 0 ? DEPTH_STUB_PX : 0; }
function depthToDrawnPx(depthMm) {
  const rb = getBaseMm(), ppm = wpPxPerMm();
  if (rb <= 0) return Math.max(0, depthMm) * ppm;
  // Below the rod base the depth is inside the broken-out stub; above it the
  // scale is true. Continuous and strictly increasing across the join.
  if (depthMm <= rb) return Math.max(0, depthMm / rb) * depthStubPx();
  return depthStubPx() + (depthMm - rb) * ppm;
}

// WHERE THE THIMBLE SPRITE SITS, for a given reading. The single source of
// truth for the instrument's direction of travel: the renderer, the zoomed
// renderer and the RATCHET HIT ZONE all take the sprite's x from here.
//
// They did not, and that was the bug. isOnRatchet computed its own unflipped
// shift, so on a depth micrometer the hit zone sat at the mirror image of the
// drum — the ratchet could never be grabbed, state.dragFine was never set, and
// every drag silently stayed coarse. A second spelling of a position is a
// second position.
// HOW FAR DOWN THE WHOLE INSTRUMENT SITS. The inside micrometer's work is drawn
// ABOVE it — the jaws point up into the bore — so at the shared centreline the
// jaw tips and the bore walls crowded the top edge while the lower half of the
// canvas sat empty. Dropping the body re-centres the picture.
//
// It lives here, beside spriteShift, because the drawing and the RATCHET HIT
// ZONE must both use it. A translate applied only in the renderer would move
// the drum away from its own hit zone — the identical defect isOnRatchet had
// with the reversed shift.
const INSIDE_DROP_Y = 30;
// Every instrument also sits a little lower than the top of the frame. The
// canvas toolbar is an overlay in the top-right corner, and the instrument was
// drawn hard against the top edge underneath it; the drop buys clear air
// between the two on every body rather than on the one that complained.
const BODY_DROP_Y = 18;
function bodyOffsetY() { return BODY_DROP_Y + (isInside() ? INSIDE_DROP_Y : 0); }

function spriteShift(mm) {
  const maxShift = getShiftPx(getMaxMm());
  const travel   = Math.max(0, Math.min(maxShift, getShiftPx(mm)));
  return isReversed() ? (maxShift - travel) : travel;
}
// [SG-GEOM-END]

// A clamped part blocks the spindle from CLOSING past it: the anvil face is the
// fixed reference and the spindle tip stops on the part, exactly as on the real
// instrument. Every path that moves the spindle funnels through clampMm, so the
// stop cannot be bypassed. Snapping happens first, then the part stops the
// spindle — which is why a part can rest off the least-count grid, as in reality.
// [SG-FIT-BEGIN]
// An outside micrometer's part is a LOWER stop: the spindle cannot close past
// it. A depth micrometer's feature is an UPPER stop: the rod cannot sink past
// the bottom of the hole. Same idea, opposite end of the range — which is why
// both bounds are computed here rather than one being assumed.
function wpMinMm() { return (state.wp && isOutside()) ? state.wp.mm : 0; }

// The deepest the SCREW may travel with the current part and rod fitted.
// The part's depth is a TOTAL, so the rod's contribution comes off first.
function wpMaxMm() {
  if (isOutside() || !state.wp) return getMaxMm();
  return Math.max(0, Math.min(getMaxMm(), state.wp.mm - getBaseMm()));
}
const clampMm = mm => Math.max(wpMinMm(), Math.min(wpMaxMm(), mm));

// Can the fitted rod actually reach this feature? Getting this wrong is not a
// simulator edge case — it is the decision a machinist makes before picking the
// instrument up, so it is surfaced rather than silently clamped.
//   'short' — feature deeper than rod base + 25 mm of screw: fit a longer rod
//   'long'  — rod alone already exceeds the feature: fit a shorter one
function rodFit() {
  if (isOutside() || !state.wp) return 'ok';
  const need = state.wp.mm - getBaseMm();
  if (need < -1e-9) return 'long';
  if (need > getMaxMm() + 1e-9) return 'short';
  return 'ok';
}

// The rod that WOULD reach it — used for the on-canvas prompt.
function rodIdxFor(depthMm) {
  const rods = getRods(), k = isImperial() ? 25.4 : 1;
  for (let i = rods.length - 1; i >= 0; i--) {
    const need = depthMm - rods[i] * k;
    if (need >= -1e-9 && need <= getMaxMm() + 1e-9) return i;
  }
  return -1;
}
// [SG-FIT-END]

// ── Workpieces (measure a real object) ────────────────────────────
// World-coordinate geometry (drawGaugeContent runs inside the DS scale):
//   anvil measuring face → x = WP_FACE_X (base sprite's anvil rod ends there)
//   spindle tip          → x = WP_FACE_X + gap × px/mm  (probed: tip at 201+shift)
// so the gap drawn between the faces is exactly getDisplayMm-true px wide. A part
// rests against the ANVIL (as you would hold it) and is drawn exactly its true
// size wide; parts are centred on the measuring axis and extend above/below it,
// as real work does in a micrometer's throat.
const WP_FACE_X  = 200;   // anvil face, world px
const WP_AXIS_Y  = 100;   // measuring axis (spindle centreline), world px
const WP_MAX_HH  = 96;    // tallest half-height a part may draw, world px

function wpPxPerMm() { return getMsdPx() / getPitch(); }   // world px per mm

// Simulate set. True sizes are realistic, not tidy: stock is rolled or ground
// under nominal, and a 1/4″ ball is 6.35 mm exactly — which is why it reads a
// clean 0.250″ the moment you switch the instrument to Imperial.
const WORKPIECES = [
  { id: 'wire',  short: 'Wire',   name: 'Steel wire',          what: 'across the diameter',  mm: 1.62,  hMm: 22,   shape: 'cylV',
    note: '16 SWG wire, nominal 1.63 mm. Wire is the classic micrometer job &mdash; a vernier caliper cannot resolve the drawing tolerance on it.' },
  { id: 'sheet', short: 'Sheet',  name: 'Sheet metal strip',   what: 'across the thickness', mm: 1.22,  hMm: 20,   shape: 'bar',
    note: '18 SWG sheet = 1.219 mm nominal. Measure well inside the edge &mdash; shear rollover makes the first few millimetres thinner.' },
  { id: 'ball',  short: 'Ball',   name: 'Ball bearing',        what: 'across the diameter',  mm: 6.35,  hMm: 6.35, shape: 'ball',
    note: 'A 1/4&Prime; bearing ball = 6.35 mm exactly. Switch to Imperial and it reads a clean 0.250&Prime; &mdash; the same part, the same gap, two instruments.' },
  { id: 'pin',   short: 'Pin',    name: 'Dowel pin',           what: 'across the diameter',  mm: 7.98,  hMm: 20,   shape: 'cylV',
    note: 'An 8 mm h7 dowel: made 0&ndash;15 &micro;m under nominal so it presses into an 8 mm hole. Only a micrometer shows you that.' },
  { id: 'drill', short: 'Drill',  name: 'Drill shank',         what: 'across the diameter',  mm: 5.94,  hMm: 20,   shape: 'drill',
    note: 'A &Oslash;6 drill, shank ground a few hundredths under so it enters the chuck. Measure the plain shank, never across the flutes.' },
  { id: 'nut',   short: 'Hex nut', name: 'M5 hex nut',         what: 'across the flats',     mm: 7.92,  hMm: 9.15, shape: 'nut',
    note: 'ISO 4032 gives M5 a nominal 8.00 mm across flats, made to a minus tolerance. Measure across <em>flats</em>, never corners.' },
  { id: 'shim',  short: 'Shim',   name: 'Shim / feeler blade', what: 'across the thickness', mm: 0.48,  hMm: 16,   shape: 'bar',
    note: 'A 0.5 mm feeler blade, worn a shade under. Thin stock is the easiest thing to crush &mdash; close with the ratchet, never the thimble.' },
  { id: 'rod',   short: 'Rod',    name: 'Brass rod',           what: 'across the diameter',  mm: 9.52,  hMm: 20,   shape: 'cylV',
    note: '3/8&Prime; brass rod = 9.525 mm. Brass is soft: squeeze with the thimble and you can flatten a witness mark into it.' }
];

// Practice and Quiz draw from a SEPARATE catalogue. A student who has worked
// through Simulate has seen those eight sizes; graded exercises use different
// parts so the answer still has to be measured rather than recalled. Every size
// is an even number of hundredths (exact on the 0.01 mm grid, no half-LC ties)
// and the notes deliberately carry no dimensions.
const WP_EXERCISE = [
  { id: 'x1',  short: 'Wire',  name: 'Steel wire',        what: 'across the diameter',  mm: 2.36,  hMm: 22,   shape: 'cylV',
    note: 'Measure at three points along the wire — drawing dies wear, and the diameter drifts.' },
  { id: 'x2',  short: 'Wire',  name: 'Fine wire',         what: 'across the diameter',  mm: 0.90,  hMm: 22,   shape: 'cylV',
    note: 'Fine wire kinks under thimble pressure. Let the ratchet do the closing.' },
  { id: 'x3',  short: 'Sheet', name: 'Sheet strip',       what: 'across the thickness', mm: 1.58,  hMm: 20,   shape: 'bar',
    note: 'Keep the faces square to the anvil — a tilted strip reads thick.' },
  { id: 'x4',  short: 'Sheet', name: 'Plate offcut',      what: 'across the thickness', mm: 3.24,  hMm: 20,   shape: 'bar',
    note: 'Take the reading away from sheared edges.' },
  { id: 'x5',  short: 'Ball',  name: 'Bearing ball',      what: 'across the diameter',  mm: 4.76,  hMm: 4.76, shape: 'ball',
    note: 'A sphere between flat faces is always a diameter apart — angle cannot mislead you, squeeze can.' },
  { id: 'x6',  short: 'Ball',  name: 'Large ball',        what: 'across the diameter',  mm: 11.10, hMm: 11.10, shape: 'ball',
    note: 'Two readings at right angles should agree within a hundredth on a good ball.' },
  { id: 'x7',  short: 'Pin',   name: 'Dowel pin',         what: 'across the diameter',  mm: 6.52,  hMm: 20,   shape: 'cylV',
    note: 'Ground pins should read the same at both ends — taper means wear.' },
  { id: 'x8',  short: 'Pin',   name: 'Thick pin',         what: 'across the diameter',  mm: 9.98,  hMm: 20,   shape: 'cylV',
    note: 'Check the middle as well as the ends; centreless grinding can leave a barrel shape.' },
  { id: 'x9',  short: 'Drill', name: 'Drill shank',       what: 'across the diameter',  mm: 3.28,  hMm: 20,   shape: 'drill',
    note: 'The plain shank only — flutes give a false, smaller reading.' },
  { id: 'x10', short: 'Drill', name: 'Large drill shank', what: 'across the diameter',  mm: 7.44,  hMm: 20,   shape: 'drill',
    note: 'Shanks are ground under nominal so they enter the chuck.' },
  { id: 'x11', short: 'Hex nut', name: 'M4 hex nut',      what: 'across the flats',     mm: 6.86,  hMm: 7.92, shape: 'nut',
    note: 'Across FLATS, never corners — corners read about 15% larger.' },
  { id: 'x12', short: 'Hex nut', name: 'M8 hex nut',      what: 'across the flats',     mm: 12.88, hMm: 14.87, shape: 'nut',
    note: 'Nuts are made to a minus tolerance, so expect under nominal.' },
  { id: 'x13', short: 'Rod',   name: 'Silver-steel rod',  what: 'across the diameter',  mm: 11.94, hMm: 20,   shape: 'cylV',
    note: 'Precision-ground stock — this one should repeat to the last digit.' },
  { id: 'x14', short: 'Shim',  name: 'Shim blade',        what: 'across the thickness', mm: 0.64,  hMm: 16,   shape: 'bar',
    note: 'Hold thin stock flat against the anvil face before closing.' }
];

// EVERY catalogue, built from one list. Written as an explicit concat chain it
// silently omitted INSIDE_WORKPIECES the day a third instrument was added:
// clicking a bore tile found nothing, loaded nothing, and threw no error.
function allWpSets() { return [WORKPIECES, WP_EXERCISE, DEPTH_WORKPIECES, INSIDE_WORKPIECES]; }
function findWp(id) {
  const all = [].concat.apply([], allWpSets());
  for (let i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
  return null;
}

// Avoid handing out the same part twice in a row (or twice in one quiz).
function pickExerciseWp(exclude) {
  const pool = WP_EXERCISE.filter(function (w) { return !exclude || exclude.indexOf(w.id) < 0; });
  const from = pool.length ? pool : WP_EXERCISE;
  return from[Math.floor(Math.random() * from.length)];
}

// [SG-CONTACT-BEGIN]
function wpInContact() {
  if (!state.wp) return false;
  // Depth: the rod has bottomed when rod + screw reaches the feature depth.
  if (isBore()) return rodFit() === 'ok' && getTotalMm(state.mm) >= state.wp.mm - 1e-6;
  return state.mm <= state.wp.mm + 1e-6;
}
// [SG-CONTACT-END]

// In Simulate the true size is shown on contact as instant feedback. In a graded
// exercise that would BE the answer, so every reveal — the canvas caption, the
// object bar's size and its resolution note — waits until the attempt is marked.
function wpRevealAllowed() {
  if (state.mode === 'practice') return !!state.answered;
  if (state.mode === 'quiz')     return !!state.quizAnswered;
  return state.mode === 'free';
}

// ── Workpiece drawing (world coordinates, inside the DS transform) ──
function wpSteel(x0, x1) {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0.00, '#4e5661');
  g.addColorStop(0.10, '#8b95a3');
  g.addColorStop(0.30, '#eef3f8');
  g.addColorStop(0.42, '#c4ccd8');
  g.addColorStop(0.62, '#98a2b0');
  g.addColorStop(0.86, '#6d7683');
  g.addColorStop(1.00, '#454c56');
  return g;
}

// Each silhouette is EXACTLY w px wide — w is the true size in pixels, so what
// the faces close on is what the drawing shows. Nothing may overhang the faces.
const WP_SHAPES = {
  bar: function (x, y, w, h) {                    // sheet / shim, on edge
    ctx.fillStyle = wpSteel(x, x + w);
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, Math.max(1, w - 1), h - 1);
  },
  cylV: function (x, y, w, h) {                   // wire / pin / rod, axis vertical
    ctx.fillStyle = wpSteel(x, x + w);
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.30)';
    ctx.beginPath(); ctx.moveTo(x + w * 0.28, y + 2); ctx.lineTo(x + w * 0.28, y + h - 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.30)'; ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, Math.max(1, w - 1), h - 1);
  },
  ball: function (x, y, w, h) {
    const r = w / 2, cx = x + r, cy = y + h / 2;
    const g = ctx.createRadialGradient(cx - r * 0.34, cy - r * 0.40, r * 0.06, cx, cy, r);
    g.addColorStop(0.00, '#ffffff');
    g.addColorStop(0.16, '#e6edf5');
    g.addColorStop(0.48, '#a9b3c1');
    g.addColorStop(0.80, '#6d7683');
    g.addColorStop(1.00, '#3f464f');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath(); ctx.ellipse(cx - r * 0.36, cy - r * 0.44, r * 0.20, r * 0.13, -0.5, 0, Math.PI * 2); ctx.fill();
  },
  nut: function (x, y, w, h) {
    // Hexagon with FLATS vertical: width = across flats (= w), height = across
    // corners = w × 2/√3.
    const cx = x + w / 2, cy = y + h / 2, af = w / 2, ac = h / 2;
    ctx.fillStyle = wpSteel(x, x + w);
    ctx.beginPath();
    ctx.moveTo(cx - af, cy - ac / 2); ctx.lineTo(cx, cy - ac); ctx.lineTo(cx + af, cy - ac / 2);
    ctx.lineTo(cx + af, cy + ac / 2); ctx.lineTo(cx, cy + ac); ctx.lineTo(cx - af, cy + ac / 2);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.38)'; ctx.lineWidth = 1; ctx.stroke();
    const br = af * 0.55;
    ctx.fillStyle = '#2b313a';
    ctx.beginPath(); ctx.arc(cx, cy, br, 0, Math.PI * 2); ctx.fill();
  },
  drill: function (x, y, w, h) {
    const shankH = h * 0.42;
    ctx.fillStyle = wpSteel(x, x + w);
    ctx.fillRect(x, y, w, h);
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h - shankH); ctx.clip();
    ctx.strokeStyle = 'rgba(30,36,44,0.55)'; ctx.lineWidth = Math.max(1.4, w * 0.18);
    for (let k = -1; k < 6; k++) {
      ctx.beginPath();
      ctx.moveTo(x - w * 0.2, y + k * 14);
      ctx.bezierCurveTo(x + w * 0.5, y + k * 14 + 5, x + w * 0.5, y + k * 14 + 9, x + w * 1.2, y + k * 14 + 14);
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(x, y + h - shankH, w, 1.5);
    ctx.strokeStyle = 'rgba(0,0,0,0.30)'; ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, Math.max(1, w - 1), h - 1);
  }
};

function drawWorkpiece() {
  const wp = state.wp;
  if (!wp) return;
  const ppm = wpPxPerMm();
  const w = wp.mm * ppm;
  const h = Math.min(wp.hMm * ppm, WP_MAX_HH * 2);
  const x = WP_FACE_X;
  const y = WP_AXIS_Y - h / 2;          // centred on the measuring axis
  const contact = wpInContact();

  ctx.save();
  (WP_SHAPES[wp.shape] || WP_SHAPES.bar)(x, y, w, h);
  ctx.restore();

  // Contact marks — thin bright lines on the two faces being touched.
  if (contact) {
    ctx.save();
    ctx.strokeStyle = 'rgba(61,220,132,0.95)'; ctx.lineWidth = 2.2;
    ctx.shadowColor = 'rgba(61,220,132,0.9)'; ctx.shadowBlur = 6;
    const half = Math.min(h * 0.38, 16);
    ctx.beginPath(); ctx.moveTo(x + 0.8, WP_AXIS_Y - half); ctx.lineTo(x + 0.8, WP_AXIS_Y + half); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + w - 0.8, WP_AXIS_Y - half); ctx.lineTo(x + w - 0.8, WP_AXIS_Y + half); ctx.stroke();
    ctx.restore();
  }
}

function wpDimText(contact) {
  const wp = state.wp;
  if (!contact) return wp.what;
  if (!wpRevealAllowed()) return 'read the scale';
  return isImperial() ? (wp.mm * MM_TO_IN).toFixed(3) + '″' : wp.mm.toFixed(2) + ' mm';
}

// Dimension line beneath the part, spanning exactly the measured face-to-face
// distance — a technical-drawing cue for WHICH dimension the faces are on.
function drawWorkpieceDims() {
  const wp = state.wp;
  if (!wp) return;
  const ppm = wpPxPerMm();
  const w = wp.mm * ppm;
  const h = Math.min(wp.hMm * ppm, WP_MAX_HH * 2);
  const x = WP_FACE_X;
  const contact = wpInContact();
  const partBottom = WP_AXIS_Y + h / 2;
  const dy = Math.min(partBottom + 22, 258);

  ctx.save();
  ctx.strokeStyle = contact ? 'rgba(61,220,132,0.9)' : 'rgba(180,196,216,0.6)';
  ctx.fillStyle   = ctx.strokeStyle;
  ctx.lineWidth = 1.2;
  // Witness lines from the measured faces down to the dimension line.
  ctx.globalAlpha = 0.6;
  ctx.beginPath(); ctx.moveTo(x, partBottom + 3); ctx.lineTo(x, dy + 5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + w, partBottom + 3); ctx.lineTo(x + w, dy + 5); ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.beginPath(); ctx.moveTo(x, dy); ctx.lineTo(x + w, dy); ctx.stroke();
  if (w > 18) {   // arrowheads inward when they fit, outward for thin parts
    [[x, 1], [x + w, -1]].forEach(function (a) {
      ctx.beginPath();
      ctx.moveTo(a[0], dy); ctx.lineTo(a[0] + 8 * a[1], dy - 3.4); ctx.lineTo(a[0] + 8 * a[1], dy + 3.4);
      ctx.closePath(); ctx.fill();
    });
  } else {
    [[x, -1], [x + w, 1]].forEach(function (a) {
      ctx.beginPath();
      ctx.moveTo(a[0], dy); ctx.lineTo(a[0] + 8 * a[1], dy - 3.4); ctx.lineTo(a[0] + 8 * a[1], dy + 3.4);
      ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(a[0], dy); ctx.lineTo(a[0] + 16 * a[1], dy); ctx.stroke();
    });
  }
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const dimTxt = wpDimText(contact);
  const tw = ctx.measureText(dimTxt).width;
  const cx = Math.max(x + tw / 2 - 10, x + w / 2);
  ctx.fillStyle = 'rgba(6,12,18,0.78)';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(cx - tw / 2 - 7, dy + 9, tw + 14, 20, 4);
  else ctx.rect(cx - tw / 2 - 7, dy + 9, tw + 14, 20);
  ctx.fill();
  ctx.fillStyle = contact ? '#3ddc84' : 'rgba(190,206,224,0.85)';
  ctx.fillText(dimTxt, cx, dy + 19);
  ctx.restore();
}

// [SG-FMT-BEGIN]
// ── Display formatting ────────────────────────────────────────────
function fmtReading(mm) {
  if (isImperial()) return (mm * MM_TO_IN).toFixed(3);
  return mm.toFixed(2);
}

function fmtMsr(mm) {
  // For negative ZE near closed jaws, displayMm can be slightly < 0; the barrel
  // physically shows MSR = 0 in that case (the 0 mm line is still at thimble edge).
  const msrMm = Math.max(0, getMSR(mm));
  if (isImperial()) return (msrMm * MM_TO_IN).toFixed(3);
  return msrMm.toFixed(2);
}

function fmtLc() {
  // Read off the FITTED instrument. This used to name IMP and SI directly,
  // which was correct only while those were the only two: a depth micrometer
  // has its own constants and a hardcoded lookup would quote the wrong one the
  // moment the instruments stopped being interchangeable.
  return getLcDisplay().toFixed(isImperial() ? 3 : 2);
}

function fmtTr(mm) {
  // The TR formula card shows the literal arithmetic of the displayed cells:
  // TR = (clamped MSR) + CSR × LC. For positive readings this equals fmtReading.
  // For negative-ZE-near-closed (rare edge case), this shows the raw sum
  // (0 + 47 × 0.01 = 0.47); the signed/corrected interpretation appears in the ZE box.
  const msr = Math.max(0, getMSR(mm));
  const csr = getCSR(mm);
  const lc  = getLcDisplay();
  // The rod adds to the depth BEFORE the screw contributes anything, so it
  // belongs in the total the card resolves to. On an outside micrometer
  // getBaseMm() is 0 and this is the same arithmetic it always was.
  const rod = getBaseMm();
  if (isImperial()) return ((rod + msr) * MM_TO_IN + csr * lc).toFixed(3);
  return (rod + msr + csr * lc).toFixed(2);
}

// The value the student reports: rod + screw, in display units.
function fmtTotal(screwMm) {
  const t = getTotalMm(screwMm);
  return isImperial() ? (t * MM_TO_IN).toFixed(3) : t.toFixed(2);
}

function fmtPart(mm) {
  const csr = getCSR(mm);
  const lc = getLcDisplay();
  return (csr * lc).toFixed(isImperial() ? 3 : 2);
}

// ── Zero-error helpers ────────────────────────────────────────────
// Model: state.mm is the OBSERVED reading (what the canvas shows / the user reads).
// Corrected (true) reading = observed − zero error.
const ZE_MAX_LC = 5;
function getZeOffsetMm() { return state.zeOn ? state.zeLc * getLcMm() : 0; }
function clampZeLc(n) { return Math.max(-ZE_MAX_LC, Math.min(ZE_MAX_LC, n | 0)); }
function fmtZeSigned() {
  const dispVal = state.zeLc * getLcDisplay();
  const dp = isImperial() ? 3 : 2;
  if (state.zeLc === 0) return (0).toFixed(dp);
  const sign = state.zeLc > 0 ? '+' : '−';
  return sign + Math.abs(dispVal).toFixed(dp);
}
function parseNumericInput(raw) {
  const s = (raw || '').trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) return NaN;
  return parseFloat(s);
}
// [SG-FMT-END]

// ── Sound helpers ─────────────────────────────────────────────────
function getAudioCtx() {
  if (!state.audioCtx) state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return state.audioCtx;
}
function playTone(freq, dur, type, vol) {
  try {
    const ac = getAudioCtx();
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type || 'sine'; osc.frequency.value = freq;
    g.gain.value = vol || 0.08;
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    osc.connect(g); g.connect(ac.destination);
    osc.start(ac.currentTime); osc.stop(ac.currentTime + dur);
  } catch (e) { /* audio not available */ }
}
function playClick()   { playTone(800, 0.05, 'square', 0.04); }
function playTick()    { playTone(1200, 0.02, 'sine', 0.03); }
function playSuccess() { playTone(880, 0.12, 'sine', 0.1); setTimeout(() => playTone(1100, 0.15, 'sine', 0.1), 120); }
function playError()   { playTone(300, 0.2, 'sawtooth', 0.06); }
function playContact() { playTone(520, 0.06, 'square', 0.05); setTimeout(function(){ playTone(390, 0.09, 'square', 0.04); }, 55); }

// ── Core drawing ──────────────────────────────────────────────────
// [SG-DEPTH-BEGIN]
// ── Depth micrometer body ─────────────────────────────────────────
// Everything above the screw — thimble, sleeve graduations, ratchet drum,
// knurl — is drawn by the shared code from the same sprites, because on a real
// depth micrometer those ARE the same parts. What differs is below: a flat
// base whose underside is the reference plane, and an interchangeable rod that
// passes through it into the hole. Both are drawn here, procedurally, against
// the palette sampled off the sprites so the two halves read as one casting.
//
// Layout is horizontal to match the outside micrometer: the reference plane is
// the vertical face at DEPTH_FLANGE_X, the work lies to its LEFT, and the rod
// protrudes left into the hole while the thimble walks left towards the base.
const DEPTH_FLANGE_X = 400;   // reference-plane face, world px
const DEPTH_FLANGE_W = 42;    // base thickness
const DEPTH_FLANGE_HH = 88;   // base half-height — a depth mic base is WIDE
const DEPTH_BARREL_HH = 34;   // sleeve half-height
const DEPTH_BARREL_X2 = 792;  // sleeve runs past the last graduation
// Where the neck steps up to full sleeve diameter. Graduation 0 sits at
// OX.scaleX, so the step is set back from it and the whole graduated length
// lies on the full-diameter face.
const DEPTH_SLEEVE_X0 = OX.scaleX - 34;
const DEPTH_ROD_HH    = 7;    // rod half-thickness
const DEPTH_ROD_AVAIL = 340;  // longest rod we can draw before breaking it
const DEPTH_BLOCK_X0  = 24;   // left edge of the work
const DEPTH_BLOCK_HH  = 74;   // work half-height — below the base, as real work is
const DEPTH_BORE_HH   = 13;   // bore half-height: the rod must clear it visibly

// Cylinder shading sampled from the sprites, so procedural metal and painted
// metal sit at the same value. Used for the base, the sleeve and the rod.
function depthMetal(yTop, yBot, dark) {
  const g = ctx.createLinearGradient(0, yTop, 0, yBot);
  if (dark) {
    g.addColorStop(0.00, 'rgb(18,20,24)');
    g.addColorStop(0.18, 'rgb(100,102,106)');
    g.addColorStop(0.36, 'rgb(165,167,171)');
    g.addColorStop(0.50, 'rgb(206,208,212)');
    g.addColorStop(0.66, 'rgb(156,158,162)');
    g.addColorStop(0.84, 'rgb(87,89,93)');
    g.addColorStop(1.00, 'rgb(16,17,20)');
    return g;
  }
  g.addColorStop(0.00, 'rgb(4,3,3)');
  g.addColorStop(0.10, 'rgb(106,108,112)');
  g.addColorStop(0.20, 'rgb(178,180,184)');
  g.addColorStop(0.30, 'rgb(225,227,231)');
  g.addColorStop(0.45, 'rgb(196,198,202)');
  g.addColorStop(0.60, 'rgb(153,155,159)');
  g.addColorStop(0.75, 'rgb(109,111,115)');
  g.addColorStop(0.90, 'rgb(60,61,66)');
  g.addColorStop(1.00, 'rgb(5,3,3)');
  return g;
}

// ── THE SLEEVE IS ONE PART ON ALL THREE INSTRUMENTS ───────────────
// The outside micrometer's sleeve is painted into micrometer_base.png; the
// depth and inside micrometers draw theirs procedurally. They are the SAME
// component on the real tools, so they must look the same here, and the two
// procedural ones did not: the barrel was 34 px half-height against the
// sprite's 49, which put the 11 pt numerals (they reach 35 px above the centre)
// off the top edge of the casting, and NOTHING drew the reference line. A
// micrometer with no datum line cannot be read at all — that line is the one
// the thimble division is brought level with.
//
// Both numbers below are MEASURED off micrometer_base.png rather than chosen:
// the sprite's sleeve runs y 51-149 about its centreline at y 100 = OX.scaleY,
// and the engraved datum occupies rows 99-100.
const SLEEVE_HH       = 49;   // sleeve half-height, world px — sprite-measured
const SLEEVE_DATUM_W  = 2;    // engraved reference line thickness, sprite-measured

// The cylinder shading of the sleeve, sampled column-wise out of the sprite at
// x = 700 so procedural metal and painted metal sit at the same value. The
// highlight is ABOVE the centreline (0.316 of the height, i.e. sprite y 82),
// which is what makes the numerals read against a pale ground and the
// half-millimetre marks below the datum read against a darker one.
function sleeveMetal(yTop, yBot) {
  const g = ctx.createLinearGradient(0, yTop, 0, yBot);
  g.addColorStop(0.00, 'rgb(20,22,26)');
  g.addColorStop(0.04, 'rgb(117,119,123)');
  g.addColorStop(0.32, 'rgb(229,231,235)');
  g.addColorStop(0.50, 'rgb(189,191,195)');
  g.addColorStop(0.75, 'rgb(136,138,142)');
  g.addColorStop(0.96, 'rgb(55,57,61)');
  g.addColorStop(1.00, 'rgb(20,22,26)');
  return g;
}

// Draw the graduated sleeve between x0 and x1, centred on cy: the cylinder,
// then the engraved datum line running its whole length. Called by the depth
// and inside bodies so there is exactly one sleeve in this file; the outside
// micrometer gets the identical face from the sprite.
function drawSleeveFace(x0, x1, cy) {
  const yT = cy - SLEEVE_HH, yB = cy + SLEEVE_HH;
  ctx.save();
  depthRoundRect(x0, yT, x1 - x0, 2 * SLEEVE_HH, 6);
  ctx.fillStyle = sleeveMetal(yT, yB);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.stroke();

  // The reference line. Drawn INSIDE the sleeve path so it can never run out
  // past the casting, and in the sprite's own near-black rather than pure
  // black, so the two halves of the picture match.
  depthRoundRect(x0, yT, x1 - x0, 2 * SLEEVE_HH, 6);
  ctx.clip();
  ctx.fillStyle = 'rgb(72,73,76)';
  ctx.fillRect(x0, cy - SLEEVE_DATUM_W / 2, x1 - x0, SLEEVE_DATUM_W);
  ctx.restore();
}

function depthRoundRect(x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y,     x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x,     y + h, r);
  ctx.arcTo(x,     y + h, x,     y,     r);
  ctx.arcTo(x,     y,     x + w, y,     r);
  ctx.closePath();
}

// Fill a path, lay 45-degree section lining inside it, then outline it.
//
// The outline is the reason this is a function. ctx.save()/restore() restores
// the STATE but not the current PATH, so stroking after a clipped hatch loop
// strokes the last hatch LINE, not the shape — which drew a stray diagonal
// across the middle of the work. Rebuilding the path through a callback is the
// only way to be sure the outline is the outline.
function hatchedSection(buildPath, x0, y0, x1, y1, fill) {
  ctx.save();
  buildPath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.save(); ctx.clip();
  ctx.strokeStyle = 'rgba(20,26,34,0.34)'; ctx.lineWidth = 1;
  for (let d = -(y1 - y0); d < (x1 - x0) + (y1 - y0); d += 9) {
    ctx.beginPath(); ctx.moveTo(x0 + d, y1); ctx.lineTo(x0 + d + (y1 - y0), y0); ctx.stroke();
  }
  ctx.restore();
  buildPath();                    // <- rebuilt, so the outline IS the outline
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1.4; ctx.stroke();
  ctx.restore();
}

// A drafting break: the rod is longer than the canvas, so a zigzag stands in
// for the omitted middle rather than the drawing quietly lying about scale.
function depthRodBreak(x, cy, hh) {
  ctx.save();
  ctx.strokeStyle = 'rgba(10,12,16,0.95)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 7, cy - hh);
  ctx.lineTo(x + 4, cy - hh * 0.2);
  ctx.lineTo(x - 4, cy + hh * 0.2);
  ctx.lineTo(x + 7, cy + hh);
  ctx.stroke();
  ctx.restore();
}

// travelPx is the SCREW travel in world px; the rod base adds to it. Both are
// on the same px/mm as the workpiece scale, so the drawn hole really is as
// deep as the instrument says.
function drawDepthBody(travelPx) {
  const cy      = OX.scaleY;
  const ppm     = wpPxPerMm();
  // Rod and cavity share ONE mapping, so the rod can never appear to punch
  // through the floor it is resting on.
  const travelMm = travelPx / ppm;
  const drawn    = depthToDrawnPx(getBaseMm() + travelMm);
  const broken   = getBaseMm() > 0;                 // the base is broken out
  const tipX     = DEPTH_FLANGE_X - drawn;
  // The cavity is a property of the PART, not of where the rod happens to be:
  // a blind hole is still a hole when the rod is fully retracted. Clamped to the
  // block so a deliberately wrong rod (which is flagged separately) cannot draw
  // the floor off the left edge of the canvas.
  const camX     = state.wp
    ? Math.max(DEPTH_BLOCK_X0 + 10, DEPTH_FLANGE_X - depthToDrawnPx(state.wp.mm))
    : DEPTH_FLANGE_X;

  // 1. The work — only when a feature has been picked. By default the depth
  //    micrometer stands alone with its rod in free air, because a permanent
  //    slab of steel behind the instrument is scenery, not information: it
  //    hides the rod, it implies a measurement nobody asked for, and there is
  //    nothing to look at inside it.
  //
  //    When a feature IS loaded it is drawn in SECTION — hatched material with
  //    the cavity cut out of it — so the rod can be seen going in and bottoming
  //    on the floor, which is the one thing a photograph of a depth micrometer
  //    never shows you.
  if (state.wp) {
    const bx0 = DEPTH_BLOCK_X0, bx1 = DEPTH_FLANGE_X;
    const byT = cy - DEPTH_BLOCK_HH, byB = cy + DEPTH_BLOCK_HH;
    const fhh = Math.min(DEPTH_BLOCK_HH - 12, state.wp.hh || DEPTH_BORE_HH);

    ctx.save();
    // Material, as three regions around the cavity: over it, under it, and the
    // wall beyond its floor. One path, so the hatching runs continuous across
    // all three the way a real section view is lined.
    hatchedSection(function () {
      ctx.beginPath();
      ctx.moveTo(bx0, byT); ctx.lineTo(bx1, byT); ctx.lineTo(bx1, cy - fhh);
      ctx.lineTo(camX, cy - fhh); ctx.lineTo(camX, cy + fhh); ctx.lineTo(bx1, cy + fhh);
      ctx.lineTo(bx1, byB); ctx.lineTo(bx0, byB); ctx.closePath();
    }, bx0, byT, bx1, byB, wpSteel(bx0, bx1));

    // Cavity floor catches a highlight so the bottom is readable.
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(camX, cy - fhh); ctx.lineTo(camX, cy + fhh); ctx.stroke();
    // Mouth chamfers.
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(bx1, cy - fhh - 1.5); ctx.lineTo(bx1 - 5, cy - fhh);
    ctx.moveTo(bx1, cy + fhh + 1.5); ctx.lineTo(bx1 - 5, cy + fhh);
    ctx.stroke();
    ctx.restore();
  }

  // 2. Extension rod. Bright metal so it reads against the dark cavity — the
  //    whole point of the section is watching how far in it has gone.
  {
    ctx.save();
    ctx.fillStyle = depthMetal(cy - DEPTH_ROD_HH, cy + DEPTH_ROD_HH, false);
    ctx.fillRect(tipX, cy - DEPTH_ROD_HH, DEPTH_FLANGE_X - tipX, 2 * DEPTH_ROD_HH);
    // Lapped measuring end.
    ctx.fillStyle = 'rgba(238,248,242,0.92)';
    ctx.fillRect(tipX, cy - DEPTH_ROD_HH, 2.5, 2 * DEPTH_ROD_HH);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 0.9;
    ctx.strokeRect(tipX + 0.5, cy - DEPTH_ROD_HH + 0.5,
      Math.max(1, DEPTH_FLANGE_X - tipX - 1), 2 * DEPTH_ROD_HH - 1);
    // The break sits in the stub — the part of the rod that is NOT to scale.
    if (broken && drawn > 30) depthRodBreak(tipX + depthStubPx() * 0.5, cy, DEPTH_ROD_HH);
    // The rod's range, ETCHED ON THE ROD — which is where a real one carries it
    // (Starrett sells the part as "Depth Micrometer Replacement Rod, 25-50MM").
    // Without it the picture is genuinely ambiguous: a sleeve reading of 13.00
    // is 13 mm, 38 mm or 63 mm depending on a rod the drawing never showed.
    // The sleeve stays graduated 0-25 because that is what the instrument does;
    // the rod is what says which 25.
    if (drawn > 52) {
      const rods = getRods(), i = getRodIdx();
      const span = isImperial() ? 1 : 25;
      const lbl  = rods[i] + '\u2013' + (rods[i] + span) + (isImperial() ? '\u2033' : ' mm');
      ctx.font = 'bold 8pt sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillStyle = 'rgba(18,22,28,0.85)';
      ctx.fillText(lbl, tipX + drawn * 0.80, cy - DEPTH_ROD_HH - 2.5);
      ctx.fillStyle = 'rgba(226,238,246,0.92)';
      ctx.fillText(lbl, tipX + drawn * 0.80, cy - DEPTH_ROD_HH - 3.5);
    }
    // Contact flash when the rod bottoms in the feature.
    if (state.wp && wpInContact()) {
      ctx.strokeStyle = 'rgba(61,220,132,0.95)'; ctx.lineWidth = 2.4;
      ctx.shadowColor = 'rgba(61,220,132,0.9)'; ctx.shadowBlur = 7;
      ctx.beginPath();
      ctx.moveTo(tipX + 0.8, cy - DEPTH_ROD_HH - 3);
      ctx.lineTo(tipX + 0.8, cy + DEPTH_ROD_HH + 3);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 3. Base. Its LEFT face is the reference plane, so that face is drawn hard
  //    and square while the rest of the casting is rounded — the eye needs to
  //    know which surface the measurement is referred to.
  {
    const x = DEPTH_FLANGE_X, w = DEPTH_FLANGE_W;
    const yT = cy - DEPTH_FLANGE_HH, yB = cy + DEPTH_FLANGE_HH;
    ctx.save();
    depthRoundRect(x, yT, w, 2 * DEPTH_FLANGE_HH, 7);
    // Dark casting: the base must not be mistaken for more workpiece. On the
    // real instrument this is the one part that is NOT bright ground steel.
    ctx.fillStyle = depthMetal(yT, yB, true);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.1; ctx.stroke();
    // Square reference face.
    ctx.fillStyle = 'rgba(236,246,240,0.75)';
    ctx.fillRect(x, yT + 6, 2.5, 2 * DEPTH_FLANGE_HH - 12);
    ctx.restore();
  }

  // 4. Sleeve / barrel running back to the graduations, plus the lock ring.
  //    Two diameters, as on the real casting: a narrow neck out of the base
  //    carrying the lock ring, then the SLEEVE proper — full diameter, with the
  //    reference line the graduations are read against. The sleeve must be the
  //    sprite's own 49 px half-height or the numerals sit off the end of it.
  {
    const x = DEPTH_FLANGE_X + DEPTH_FLANGE_W - 6;
    const yT = cy - DEPTH_BARREL_HH, yB = cy + DEPTH_BARREL_HH;
    ctx.save();
    depthRoundRect(x, yT, DEPTH_SLEEVE_X0 + 8 - x, 2 * DEPTH_BARREL_HH, 5);
    ctx.fillStyle = depthMetal(yT, yB, false);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();

    drawSleeveFace(DEPTH_SLEEVE_X0, DEPTH_BARREL_X2, cy);

    ctx.save();
    // ROD CLAMP — the knurled ring that holds the extension rod in its seat.
    // This is NOT the spindle lock: a depth micrometer carries both, and the
    // parts explorer documents them as two separate things. It is pulled in
    // tight against the flange so the rest of the neck is free for the lock
    // lever drawLockLever() paints at x = flange + 28.
    const lx = DEPTH_FLANGE_X + DEPTH_FLANGE_W - 2, lw = 22;
    ctx.fillStyle = depthMetal(cy - DEPTH_BARREL_HH - 5, cy + DEPTH_BARREL_HH + 5, true);
    ctx.fillRect(lx, cy - DEPTH_BARREL_HH - 5, lw, 2 * (DEPTH_BARREL_HH + 5));
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 0.8;
    for (let i = 0; i <= lw; i += 3) {
      ctx.beginPath();
      ctx.moveTo(lx + i, cy - DEPTH_BARREL_HH - 5);
      ctx.lineTo(lx + i, cy + DEPTH_BARREL_HH + 5);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 5. Reference-plane datum line and the depth dimension, so the picture says
  //    WHICH distance the number on the readout refers to.
  {
    ctx.save();
    ctx.strokeStyle = 'rgba(245,200,66,0.55)';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(DEPTH_FLANGE_X, cy - 96); ctx.lineTo(DEPTH_FLANGE_X, cy + 128);
    ctx.moveTo(tipX,           cy + 40); ctx.lineTo(tipX,           cy + 128);
    ctx.stroke();
    ctx.setLineDash([]);

    const dy = cy + 118;
    ctx.strokeStyle = '#f5c842'; ctx.fillStyle = '#f5c842'; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(tipX, dy); ctx.lineTo(DEPTH_FLANGE_X, dy); ctx.stroke();
    [[tipX, 1], [DEPTH_FLANGE_X, -1]].forEach(function (a) {
      ctx.beginPath();
      ctx.moveTo(a[0], dy);
      ctx.lineTo(a[0] + a[1] * 8, dy - 3.5);
      ctx.lineTo(a[0] + a[1] * 8, dy + 3.5);
      ctx.closePath(); ctx.fill();
    });

    const totalMm = getTotalMm(state.mm);
    const txt = 'depth ' + (isImperial() ? (totalMm * MM_TO_IN).toFixed(3) + ' in'
                                         : totalMm.toFixed(2) + ' mm');
    // Rod-fit prompt. A feature the fitted rod cannot reach is not a glitch to
    // be clamped away silently — picking the rod is part of using the tool, so
    // the instrument says which one to fit.
    const fit = rodFit();
    if (fit !== 'ok') {
      const rods = getRods(), k = isImperial() ? 25.4 : 1, u = isImperial() ? 'in' : 'mm';
      const want = rodIdxFor(state.wp.mm);
      const span = isImperial() ? 1 : 25;
      const msg = want >= 0
        ? (fit === 'short' ? 'Rod too short \u2014 fit the ' : 'Rod too long \u2014 fit the ') +
          rods[want] + '\u2013' + (rods[want] + span) + ' ' + u + ' rod'
        : 'No rod in the set reaches this feature';
      ctx.font = 'bold 10pt sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const mw = ctx.measureText(msg).width;
      const mx = (DEPTH_BLOCK_X0 + DEPTH_FLANGE_X) / 2, my = cy - DEPTH_BLOCK_HH - 22;
      ctx.fillStyle = 'rgba(60,20,20,0.90)';
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(mx - mw / 2 - 9, my - 11, mw + 18, 22, 5); ctx.fill(); }
      else ctx.fillRect(mx - mw / 2 - 9, my - 11, mw + 18, 22);
      ctx.strokeStyle = 'rgba(255,120,120,0.65)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#ff9a9a';
      ctx.fillText(msg, mx, my);
    }
    ctx.font = 'bold 10pt sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    const tw = ctx.measureText(txt).width;
    const cxT = (tipX + DEPTH_FLANGE_X) / 2;
    ctx.fillStyle = 'rgba(10,13,19,0.82)';
    ctx.fillRect(cxT - tw / 2 - 5, dy - 20, tw + 10, 16);
    ctx.fillStyle = '#f5c842';
    ctx.fillText(txt, cxT, dy - 6);
    ctx.restore();
  }
}
// [SG-DEPTH-END]


// [SG-INSIDE-BEGIN]
// ── Inside micrometer body (caliper / jaw type) ───────────────────
// Drawn to the reference: a fixed jaw carried on the barrel, a moving jaw on
// the spindle, both tipped with carbide, a lock knob under the fixed block and
// the same sleeve/thimble/ratchet as every other pattern.
//
// The measurement is the distance between the jaws' OUTER faces — the surfaces
// that press against the bore — so those two faces are what the geometry is
// built from and what the drawn bore walls are placed against. Everything else
// hangs off them.
const INSIDE_FIXED_X  = 440;  // outer face of the FIXED jaw, world px
const INSIDE_BARREL_HH = 34;
const INSIDE_BARREL_X2 = 792;
// Where the neck steps up to full sleeve diameter — see DEPTH_SLEEVE_X0.
const INSIDE_SLEEVE_X0 = OX.scaleX - 34;
// JAW THICKNESS IS DERIVED, NOT CHOSEN. The reading is the distance between the
// jaws' OUTER faces, and the instrument's minimum reading is what you get when
// the jaws are touching each other — so that minimum IS the two jaw thicknesses
// added together, and each jaw is exactly half the base.
//
// This was a hardcoded 10 px, which at 8 px/mm made each jaw 1.25 mm and left a
// visible 2.5 mm gap between them at the 5.00 mm minimum. The picture then
// contradicted its own number: it showed jaws apart while claiming they could
// not close further. Deriving the thickness makes the drawing explain the
// reading without a word of text — at 5.00 mm the jaws are visibly in contact.
function insideJawW() { return (getInst().base || 0) * wpPxPerMm() / 2; }
const INSIDE_JAW_TOP  = 20;   // how high the carbide tips reach, world y
const INSIDE_BLOCK_HH = 27;   // the tapered jaw block
const INSIDE_CAP_W    = 34;   // spindle end cap
const INSIDE_WALL_T   = 44;   // drawn thickness of the bore wall in section

// Gap between the jaw faces, in world px, for a given screw travel. Same shape
// as the depth micrometer's mapping and for the same reason: the base (here the
// fixed jaw width, not a rod) plus the screw. No compression is needed — the
// widest this instrument opens is 30 mm, which is 240 px and fits.
function insideGapPx(travelPx) {
  return (getInst().base || 0) * wpPxPerMm() + travelPx;
}

// One tapered jaw block with its carbide post. `dir` is +1 for the fixed jaw
// (body to its right) and -1 for the moving one, so the taper leans the way the
// casting does on the real instrument.
function drawInsideJaw(faceX, dir, cy, contact) {
  const bodyTop = cy - INSIDE_BARREL_HH;
  const blkIn   = faceX + dir * 30;          // where the block meets the barrel
  const jawW    = insideJawW();
  const postX   = dir > 0 ? faceX - jawW : faceX;

  ctx.save();
  // Tapered block: wide at the barrel, narrow at the jaw.
  ctx.beginPath();
  ctx.moveTo(faceX,  bodyTop + 4);
  ctx.lineTo(faceX,  cy - INSIDE_BLOCK_HH - 14);
  ctx.lineTo(blkIn,  cy - INSIDE_BLOCK_HH + 2);
  ctx.lineTo(blkIn,  cy + INSIDE_BLOCK_HH);
  ctx.lineTo(faceX,  cy + INSIDE_BLOCK_HH);
  ctx.closePath();
  ctx.fillStyle = depthMetal(bodyTop - 14, cy + INSIDE_BLOCK_HH, false);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.1; ctx.stroke();

  // Carbide jaw post. The OUTER face is the measuring surface, so it is drawn
  // dead straight and lit; the inner side gets the shadow.
  const postTop = INSIDE_JAW_TOP;
  const g = ctx.createLinearGradient(postX, 0, postX + jawW, 0);
  g.addColorStop(0.00, dir > 0 ? 'rgb(96,104,112)' : 'rgb(214,232,226)');
  g.addColorStop(0.45, 'rgb(206,208,212)');
  g.addColorStop(1.00, dir > 0 ? 'rgb(214,232,226)' : 'rgb(96,104,112)');
  ctx.fillStyle = g;
  if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(postX, postTop, jawW, cy - INSIDE_BLOCK_HH - postTop + 16, 4); ctx.fill(); }
  else ctx.fillRect(postX, postTop, jawW, cy - INSIDE_BLOCK_HH - postTop + 16);
  ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 0.9; ctx.stroke();

  // The measuring face itself — a bright hairline the eye can follow to the wall.
  ctx.fillStyle = contact ? 'rgba(61,220,132,0.95)' : 'rgba(238,248,242,0.9)';
  ctx.fillRect(dir > 0 ? faceX - 2 : faceX, postTop + 2, 2, cy - INSIDE_BLOCK_HH - postTop + 8);
  if (contact) {
    ctx.save();
    ctx.shadowColor = 'rgba(61,220,132,0.9)'; ctx.shadowBlur = 7;
    ctx.fillRect(dir > 0 ? faceX - 2 : faceX, postTop + 2, 2, cy - INSIDE_BLOCK_HH - postTop + 8);
    ctx.restore();
  }
  ctx.restore();
}

// One wall of the work, in section. The PROFILE is what makes a valve guide
// look like a valve guide and a setting ring like a ring: six parts drawn as
// six identical rectangles are six parts a student cannot tell apart, however
// correct the numbers between them are.
//   tube      thin wall, rounded outside — a drawn tube or a guide
//   ring      thick wall, well rounded — a setting ring
//   cylinder  thick wall, chamfered mouth — a bore you would hone
//   shoulder  stepped: thinner above, thicker below — a bearing seat
//   slot      square-cut, open at the top — milled, not bored
// `side` is -1 for the left wall and +1 for the right, so asymmetric profiles
// (the chamfer, the shoulder) face into the bore on both sides.
function insideWallPath(x0, x1, yT, yB, profile, side) {
  const inner = side < 0 ? x1 : x0;          // the bore surface
  const outer = side < 0 ? x0 : x1;
  const r = Math.min(14, Math.abs(x1 - x0) * 0.5);
  ctx.beginPath();
  if (profile === 'slot') {
    // Open at the top: milled from the face, so no material above the mouth.
    ctx.moveTo(outer, yT + 6); ctx.lineTo(inner, yT + 6);
    ctx.lineTo(inner, yB); ctx.lineTo(outer, yB); ctx.closePath();
    return;
  }
  if (profile === 'shoulder') {
    const step = (yT + yB) / 2;
    const back = inner + side * -0.42 * (inner - outer);   // thinner above the step
    ctx.moveTo(outer, yT); ctx.lineTo(back, yT); ctx.lineTo(back, step);
    ctx.lineTo(inner, step); ctx.lineTo(inner, yB); ctx.lineTo(outer, yB);
    ctx.closePath();
    return;
  }
  if (profile === 'cylinder') {
    // Chamfered mouth at the top inner corner.
    ctx.moveTo(outer, yT); ctx.lineTo(inner + side * -9, yT);
    ctx.lineTo(inner, yT + 11); ctx.lineTo(inner, yB); ctx.lineTo(outer, yB);
    ctx.closePath();
    return;
  }
  // tube / ring: rounded on the OUTSIDE, square on the bore.
  if (ctx.roundRect) {
    ctx.roundRect(Math.min(x0, x1), yT, Math.abs(x1 - x0), yB - yT,
      side < 0 ? [r, 0, 0, r] : [0, r, r, 0]);
  } else {
    ctx.rect(Math.min(x0, x1), yT, Math.abs(x1 - x0), yB - yT);
  }
}

function drawInsideBody(travelPx) {
  const cy    = OX.scaleY;
  const gap   = insideGapPx(travelPx);
  const movX  = INSIDE_FIXED_X - gap;        // outer face of the MOVING jaw
  const contact = !!state.wp && wpInContact();

  // 1. The bore, in section — only when one has been picked. Two walls, and the
  //    jaws reach out between them. Same reasoning as the depth micrometer: a
  //    permanent ring behind the instrument would be scenery, and the default
  //    view is the instrument alone with its jaws in free air.
  if (state.wp) {
    const wp = state.wp;
    const prof = wp.profile || 'tube';
    const wallT = (wp.wall || 5.5) * wpPxPerMm();
    // THE BORE DOES NOT MOVE WITH THE JAWS. Its walls are set by the PART, so
    // the left wall sits at the part's own diameter from the fixed jaw and stays
    // there while the jaws open towards it. Drawing the left wall at movX made
    // the hole grow and shrink with the instrument, which is the same mistake
    // the depth micrometer's cavity made when it was keyed to the rod tip.
    const boreL = INSIDE_FIXED_X - state.wp.mm * wpPxPerMm();
    // The walls stop just above the jaw blocks: only the JAWS go into the hole,
    // the instrument's body stays outside it.
    const yB = cy - INSIDE_BLOCK_HH - 8;
    const yT = Math.max(4, yB - (yB - 8) * (wp.tall || 1));
    ctx.save();
    [[boreL - wallT, boreL, -1], [INSIDE_FIXED_X, INSIDE_FIXED_X + wallT, +1]].forEach(function (w) {
      hatchedSection(function () {
        insideWallPath(w[0], w[1], yT, yB, prof, w[2]);
      }, w[0], yT, w[1], yB, wpSteel(w[0], w[1]));
    });
    // Bore axis — a centre line makes the gap read as a HOLE rather than as a
    // space between two unrelated blocks.
    ctx.strokeStyle = 'rgba(120,140,170,0.40)'; ctx.lineWidth = 1;
    ctx.setLineDash([9, 5, 2, 5]);
    ctx.beginPath();
    ctx.moveTo(boreL - wallT - 10, (yT + yB) / 2);
    ctx.lineTo(INSIDE_FIXED_X + wallT + 10, (yT + yB) / 2);
    ctx.stroke();
    ctx.setLineDash([]);
    // The two bore surfaces the jaws are measuring between.
    ctx.strokeStyle = 'rgba(255,255,255,0.30)'; ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(boreL - 0.8, yT); ctx.lineTo(boreL - 0.8, yB);
    ctx.moveTo(INSIDE_FIXED_X + 0.8, yT); ctx.lineTo(INSIDE_FIXED_X + 0.8, yB);
    ctx.stroke();
    ctx.restore();
  }

  // 2. Spindle between the blocks, and the end cap beyond the moving jaw.
  {
    ctx.save();
    ctx.fillStyle = depthMetal(cy - 9, cy + 9, true);
    ctx.fillRect(movX, cy - 9, INSIDE_FIXED_X - movX, 18);
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 0.9;
    ctx.strokeRect(movX + 0.5, cy - 8.5, Math.max(1, INSIDE_FIXED_X - movX - 1), 17);
    // End cap.
    const cx0 = movX - INSIDE_CAP_W;
    depthRoundRect(cx0, cy - 20, INSIDE_CAP_W + 6, 40, 8);
    ctx.fillStyle = depthMetal(cy - 20, cy + 20, false);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.1; ctx.stroke();
    ctx.restore();
  }

  // 3. The two jaws.
  drawInsideJaw(movX, -1, cy, contact);
  drawInsideJaw(INSIDE_FIXED_X, +1, cy, contact);

  // 4. Barrel running back to the graduations, and the lock knob under the
  //    fixed block — the knob is what stops the reading moving as the
  //    instrument is worked out of the bore, so it earns its place.
  {
    const yT = cy - INSIDE_BARREL_HH, yB = cy + INSIDE_BARREL_HH;
    ctx.save();
    // The neck out of the fixed jaw block, then the SLEEVE at full diameter
    // carrying the reference line. Same two-diameter reasoning as the depth
    // micrometer, and the same sprite-measured sleeve.
    depthRoundRect(INSIDE_FIXED_X + 18, yT, INSIDE_SLEEVE_X0 + 8 - INSIDE_FIXED_X - 18, 2 * INSIDE_BARREL_HH, 5);
    ctx.fillStyle = depthMetal(yT, yB, false);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();

    drawSleeveFace(INSIDE_SLEEVE_X0, INSIDE_BARREL_X2, cy);

    // The lock itself is drawn by drawLockLever() as a working LEVER on the
    // barrel neck. A decorative knurled thumb screw used to sit under the jaw
    // block here; it was removed when the lever arrived, because an instrument
    // with two locks — one of which does nothing — is worse than one with the
    // lock in a slightly unexpected place.
  }

  // 5. The dimension being read, between the jaw faces.
  {
    const dy = cy + 92;
    ctx.save();
    ctx.strokeStyle = 'rgba(245,200,66,0.55)'; ctx.lineWidth = 1; ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(movX, INSIDE_JAW_TOP); ctx.lineTo(movX, dy);
    ctx.moveTo(INSIDE_FIXED_X, cy + INSIDE_BLOCK_HH); ctx.lineTo(INSIDE_FIXED_X, dy);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = '#f5c842'; ctx.fillStyle = '#f5c842'; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(movX, dy); ctx.lineTo(INSIDE_FIXED_X, dy); ctx.stroke();
    [[movX, 1], [INSIDE_FIXED_X, -1]].forEach(function (a) {
      ctx.beginPath();
      ctx.moveTo(a[0], dy); ctx.lineTo(a[0] + a[1] * 8, dy - 3.5); ctx.lineTo(a[0] + a[1] * 8, dy + 3.5);
      ctx.closePath(); ctx.fill();
    });

    const totalMm = getTotalMm(state.mm);
    const txt = 'bore ' + (isImperial() ? (totalMm * MM_TO_IN).toFixed(3) + ' in' : totalMm.toFixed(2) + ' mm');
    ctx.font = 'bold 10pt sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    const tw = ctx.measureText(txt).width;
    const cxT = (movX + INSIDE_FIXED_X) / 2;
    ctx.fillStyle = 'rgba(10,13,19,0.82)';
    ctx.fillRect(cxT - tw / 2 - 5, dy - 20, tw + 10, 16);
    ctx.fillStyle = '#f5c842';
    ctx.fillText(txt, cxT, dy - 6);

    // WHY IT DOES NOT READ ZERO. The jaws are 5 mm wide, so the outer faces are
    // 5 mm apart before the screw has moved at all — the instrument is a 5-30 mm
    // tool and simply cannot show less. Stating the base as its own labelled
    // segment of the same dimension is the difference between a student seeing
    // a bug and a student seeing the instrument.
    const jawPx = (getInst().base || 0) * wpPxPerMm();
    const jx0 = INSIDE_FIXED_X - jawPx, jy = dy + 20;
    ctx.strokeStyle = 'rgba(150,170,200,0.85)'; ctx.fillStyle = 'rgba(150,170,200,0.85)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(jx0, jy - 5); ctx.lineTo(jx0, jy + 5);
    ctx.moveTo(jx0, jy); ctx.lineTo(INSIDE_FIXED_X, jy);
    ctx.moveTo(INSIDE_FIXED_X, jy - 5); ctx.lineTo(INSIDE_FIXED_X, jy + 5);
    ctx.stroke();
    const halfTxt = isImperial() ? (getInst().base / 2 * MM_TO_IN).toFixed(3) + ' in'
                                : (getInst().base / 2).toFixed(2) + ' mm';
    const jawTxt = 'jaws ' + (isImperial() ? (getInst().base * MM_TO_IN).toFixed(3) + ' in'
                                           : getInst().base.toFixed(2) + ' mm') +
                   (state.mm <= 1e-9
                     ? ' \u2014 touching: 2 \u00D7 ' + halfTxt + ', so it cannot read less'
                     : '');
    ctx.font = '8.5pt sans-serif';
    ctx.textAlign = state.mm <= 1e-9 ? 'left' : 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(jawTxt, state.mm <= 1e-9 ? jx0 - 4 : (jx0 + INSIDE_FIXED_X) / 2, jy + 5);
    ctx.restore();
  }
}
// [SG-INSIDE-END]

// ── "Show me How?" guided reading ─────────────────────────────────
// [SG-TEACH-BEGIN]
//
// A position-aware walkthrough of the reading CURRENTLY on the instrument,
// ported from tools/vernier-caliper. It teaches nothing of its own: every
// number it shows comes from the same funnels the readout tiles use (getMSR,
// getCSR, fmtMsr, fmtLc, fmtPart, fmtTr, fmtTotal, fmtZeSigned), so it cannot
// drift from what the tool reports, and it works unchanged on all three screws
// (0.5 mm/50, 1 mm/100, 40 TPI/25) and all three instruments.
//
// A MICROMETER IS NOT A VERNIER, and the middle of the walkthrough is where
// that shows. A vernier's hard step is finding which of fifty lines coincides;
// a micrometer's is (a) not missing the half-millimetre mark on the sleeve and
// (b) not landing one division out on the thimble, then reading the thimble by
// its NUMERALS rather than counting from zero — nobody counts to 47 on a
// micrometer. So step 2 checks the datum line against its neighbours on both
// sides, and step 3 counts from the nearest NUMBERED graduation, which is how
// the instrument is actually read.
//
// Everything renders INSIDE the existing canvas and lights the existing tiles.
// draw() stays pure — teachOn() is false when idle and every branch is skipped,
// so a static frame is byte-identical to what it was before this existed.
const TEACH_SPEED    = 0.5;    // classroom pace: 1x reads as rushed
const TEACH_BAND_H   = 54;     // caption band height, output coords
const TEACH_BAND_PAD = 10;     // its inset from the canvas edge

const teach = {
  on: false, playing: true, t: 0, total: 0,
  raf: null, last: 0, stages: [], stepT: [], lit: null, reduced: false, zoom: null
};

function teachAllowed() {
  if (state.mode === 'quiz') return false;            // it would BE the answer
  if (state.mode === 'practice') return !!state.answered;
  return state.mode !== 'explore';                    // the canvas is not shown
}

// The observed reading — what the scales physically show — quantised to the
// least count, exactly as updateReadingPanel does. Every teach quantity is
// derived from this one value, so the walkthrough and the tiles cannot disagree.
function teachObsQ() { return snapToLc(state.mm + getZeOffsetMm()); }

// Per-step time for the thimble count. The first few steps must be felt, and
// the pace then quickens so the tail is not tedious.
//
// THE COUNT IS SHORT BY CONSTRUCTION, which is why there is no ceiling here.
// It walks from the nearest NUMBERED graduation to the datum, so it is at most
// thimbleLabelEvery() − 1 steps: four on a 50-division thimble, nine on a
// 100-division one. Nine steps come to about 2.1 s at 1x. A scaling clamp was
// written first and mutation testing showed it could never fire — a guard that
// cannot fire reads as load-bearing and is not, so it was removed rather than
// left to mislead the next person. The real bound is asserted in the gate,
// against the label spacing it actually comes from.
const TEACH_COUNT_LONGEST = 2.2;   // seconds — the worst count this can produce
function teachStepTimes(n) {
  const out = [];
  for (let k = 0; k < n; k++) out.push(Math.max(0.09, 0.45 * Math.pow(0.82, k)));
  return out;
}

// How many divisions separate the datum from the nearest NUMBERED graduation
// below it, and which numeral that is. This is the micrometer's own "bridge":
// the thimble is engraved every 5th (50-division) or 10th (100-division) line,
// so a reading of 47 is read as "45, then two more" and never as a count of 47.
function teachCsrBase() {
  const csr = getCSR(teachObsQ());
  const every = thimbleLabelEvery();
  const base  = Math.floor(csr / every) * every;
  return { csr: csr, base: base, rem: csr - base, every: every };
}

function teachBuild() {
  const br = teachCsrBase();
  teach.stepT = teachStepTimes(br.rem);
  const countT = teach.stepT.reduce((a, b) => a + b, 0);
  teach.stages = [
    { key: 'msr',   w: 3.4,                         tile: 'rcell-msr' },
    { key: 'datum', w: 3.2,                         tile: null        },
    { key: 'csr',   w: Math.max(1.2, countT) + 0.6, tile: 'rcell-csr' },
    { key: 'tr',    w: 2.6,                         tile: 'rcell-lc'  }
  ];
  // Only when there IS an error. Zero Error 'On' starts at zero until the user
  // bumps it, and a step that says "subtract 0.00" teaches nothing.
  if (state.zeOn && state.zeLc !== 0) teach.stages.push({ key: 'ze', w: 2.8, tile: null });
  teach.total = teach.stages.reduce((a, s) => a + s.w, 0);
  teach.zoom  = teachSolveView();
}

function teachEase(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// ── WHERE THE READING IS, in sleeve-local coordinates ─────────────
// Local x = 0 is main-scale graduation 0; the sleeve runs to msdCount * msdPx.
// These four are the whole geometry of a micrometer reading, and they live in
// one place because the framing, the drawing and the caption all need them and
// must never disagree about where the arrow goes.

// The thimble's leading silhouette edge — the micrometer's index line. This is
// the counterpart of the vernier's zero: the reading is decided by which
// main-scale graduation it has passed (or, on a reversed sleeve, covered).
function teachEdgeX() { return spriteShift(state.mm + getZeOffsetMm()); }

// How many whole pitches the MSR is worth.
function teachMsrDivs() {
  return Math.max(0, Math.round(getMSR(teachObsQ()) / getPitch()));
}

// WHICH GRADUATION carries that value.
//
// On an outside micrometer it is the last graduation the thimble edge has
// uncovered, index = MSR / pitch, and it sits just LEFT of the edge.
//
// On a depth or inside micrometer the sleeve is numbered backwards — graduation
// i prints (msdCount − i) x pitch — so the graduation carrying the MSR is the
// FIRST ONE COVERED, index msdCount − MSR/pitch, tucked just under the thimble's
// lip. That is not a quirk of the drawing: "the main-scale value is the first
// number hidden by the thimble" is what reversed numbering MEANS, and it is the
// single commonest misread on this instrument. The walkthrough points at it.
function teachMsrIdx() {
  const n = teachMsrDivs();
  return isReversed() ? (getMsdCount() - n) : n;
}
function teachMsrX() { return teachMsrIdx() * getMsdPx(); }

// Where the stage-1 measuring line starts. An outside micrometer measures out
// from graduation 0; a reversed sleeve measures the length the thimble has
// COVERED, so the line grows back from the far end of the scale. Either way its
// drawn length is the reading at true scale, and it lands on the thimble edge.
function teachLineOrigin() { return isReversed() ? getMsdCount() * getMsdPx() : 0; }

// ── Stage timing ─────────────────────────────────────────────────
// Stage 1 is four beats: grow, point, ANSWER, then move the camera — in that
// order, with a beat between each, so no two events compete to be noticed.
const TEACH_GROW_TO      = 0.46;   // the measuring line lands
const TEACH_MSR_VALUE_AT = 0.62;   // "read it here" becomes "MSR = 11.50 mm"
const TEACH_ZOOM_AT      = 0.78;   // camera starts, once the answer has been seen
const TEACH_ZOOM_OVER    = 0.18;   // and eases rather than snapping
const TEACH_SCAN_TO      = 0.58;   // stage 2: scan ends, dwell on the match begins

// Where the stage-1 pointer starts. The MSR label sits just under this point,
// in the clear band below the sleeve, so the arrow reads as coming OUT of the
// label and landing on the graduation it names.
const ARROW_TAIL_DX = -46;
const ARROW_TAIL_DY =  40;

// How far the stage-1 measuring line has grown, 0..1. One expression, because
// the drawn line and the MSR tile must count up together — a tile that reaches
// 11.50 before the line does is telling the student the answer early.
function teachGrowFrac(at) {
  if (!at || at.key !== 'msr') return 1;
  return clamp(teachEase(clamp(at.phase / TEACH_GROW_TO, 0, 1)), 0, 1);
}

// What the readout tiles should show RIGHT NOW, or null when idle.
//
// Pressing "Show me How?" empties MSR and CSR and lets the walkthrough fill them
// in as it derives them. Leaving the finished answer on the tiles while the
// animation works towards it is the pedagogical equivalent of printing the
// solution above the worked example.
function teachLive() {
  if (!teachOn()) return null;
  const at   = teachAt();
  const full = teachMsrDivs();
  if (at.key === 'msr') {
    // The last graduation the growing line has actually reached.
    const len = Math.abs(teachEdgeX() - teachLineOrigin()) * teachGrowFrac(at);
    const reached = getMsdPx() > 0 ? Math.floor(len / getMsdPx() + 1e-9) : 0;
    return { msrDivs: clamp(reached, 0, full), csr: 0, counting: true };
  }
  if (at.key === 'datum') return { msrDivs: full, csr: 0, counting: true };
  return { msrDivs: full, csr: teachCounted(), counting: at.key === 'csr' };
}

// Where the walkthrough is now: which stage, and how far through it.
function teachAt() {
  let t = teach.t, i = 0;
  // >= AND an epsilon, for the same reason twice over. Next sets teach.t to the
  // exact SUM of the preceding stage widths, so it lands on a boundary — a
  // strict compare leaves it in the previous stage at phase 1 and the
  // walkthrough looks frozen on that step however many times you press Next.
  //
  // A bare >= is not enough either, because that sum is not exact in binary:
  // 3.4 + 3.2 = 6.6000000000000005, and taking 3.4 off it gives
  // 3.1999999999999997 — a hair UNDER the 3.2 it is being compared against. The
  // walkthrough then wedges on step 2 for exactly one combination of stage
  // widths, which is precisely the kind of bug that ships. The tolerance is far
  // below one frame at 0.5x speed, so it can never swallow a real step.
  const EPS = 1e-9;
  while (i < teach.stages.length - 1 && t >= teach.stages[i].w - EPS) { t -= teach.stages[i].w; i++; }
  const s = teach.stages[i];
  return { i: i, key: s.key, phase: clamp(t / s.w, 0, 1), stage: s };
}
function teachOn() { return teach.on && teach.stages.length > 0; }

// Which division number the count has reached. It starts at the nearest NUMBERED
// graduation, never at zero: that is how a thimble is read.
function teachCounted() {
  const at = teachAt();
  const br = teachCsrBase();
  if (!teachOn() || at.key === 'msr' || at.key === 'datum') return 0;
  if (at.key !== 'csr') return br.csr;
  let t = at.phase * teach.stages[at.i].w, k = 0;
  while (k < br.rem && t >= teach.stepT[k]) { t -= teach.stepT[k]; k++; }
  return br.base + k;
}

// How many of the stage-2 probe divisions have been revealed. It deliberately
// runs ONE division PAST the datum, so the match ends with a rejection on both
// sides of it — that is what shows the reading is unique rather than merely the
// first line tried, and being one division out is the misread this step exists
// to prevent. Extracted so it can be asserted without racing a timer.
const TEACH_PROBE = [3, 2, 1, 0, -1];
function teachProbeExtent(ph) {
  return clamp(Math.round(ph * (TEACH_PROBE.length - 1)), 0, TEACH_PROBE.length - 1);
}
// [SG-TEACH-END]

// [SG-TEACHVIEW-BEGIN]
// The walkthrough's OWN view, and deliberately not the Zoom button's.
//
// Zoom centres the whole instrument at a fixed 3x. The walkthrough needs
// something else: from stage 2 on it must hold BOTH ends of the reading on
// screen at once — the sleeve graduation claimed as the MSR and the thimble
// division sitting on the datum — because the whole point is that the two are
// read together.
//
// It frames only the divisions NEAR the datum rather than the whole drum: a
// thimble is 2 x R1 tall and framing all of it would spend the entire zoom
// budget on curvature nobody reads. The vertical extent is what binds here, and
// that is honest — it is the height of the thing being read.
//
// A pure function of teach.t: no per-frame easing state, so a teacher pressing
// Next while paused gets the settled view for that stage rather than a
// transition frozen half way.
const TEACH_ZOOM_MAX  = 3.0;
const TEACH_ZOOM_PAD  = 40;    // breathing room left of the span
const TEACH_VIEW_DIVS = 4;     // thimble divisions either side of the datum kept in frame
const TEACH_VIEW_RIGHT = 150;  // room right of the thimble edge: ticks, numerals, chips
const TEACH_BAND_LINE = 30;    // the MSR measuring line, local y below the datum
const TEACH_BAND_MSR  = 52;    // its label

function teachSolveView() {
  const ox   = OX.scaleX;
  const oy   = OX.scaleY + bodyOffsetY();
  const edge = teachEdgeX();
  const msrX = teachMsrX();

  const x0 = ox + Math.min(msrX, edge) - TEACH_ZOOM_PAD;
  const x1 = ox + edge + TEACH_VIEW_RIGHT;
  // Vertically: the sleeve numerals above, the thimble divisions the datum is
  // read against, and the MSR label below. Crop any of the three and the
  // framing defeats the step it exists to serve.
  const arc = R1 * Math.sin(Math.min(TEACH_VIEW_DIVS * divAngle(), Math.PI / 2));
  const y0 = oy - Math.max(arc, 34) - 8;
  const y1 = oy + Math.max(arc, TEACH_BAND_MSR) + 14;

  // The caption band is permanent furniture while the walkthrough runs, so the
  // usable height is what is ABOVE it, measured in world units.
  const DEST_TOP = 8 / DS;
  const DEST_BOT = (CH - TEACH_BAND_H - TEACH_BAND_PAD - 8) / DS;
  const WW = CW / DS;
  const k = Math.min(WW / (x1 - x0), (DEST_BOT - DEST_TOP) / (y1 - y0), TEACH_ZOOM_MAX);
  const srcW = WW / k;
  return {
    k: k,
    srcX: clamp((x0 + x1) / 2 - srcW / 2, 0, Math.max(0, WW - srcW)),
    // Anchor the TOP of the region at DEST_TOP rather than centring: centring
    // is what lets the bottom of it slide under the caption band.
    srcY: y0 - DEST_TOP / k
  };
}

// 0 before the zoom, 1 after. The move happens in the LAST quarter of stage 1 —
// after the measuring line has landed and before stage 2 needs it — so stepping
// to stage 2 lands on the settled, zoomed view.
function teachZoomBlend() {
  if (!teachOn() || !teach.zoom) return 0;
  const w1 = teach.stages[0].w;
  if (teach.t >= w1) return 1;
  return clamp((teach.t - w1 * TEACH_ZOOM_AT) / (w1 * TEACH_ZOOM_OVER), 0, 1);
}
function teachScaleNow() {
  const b = teachZoomBlend();
  return b <= 0 ? 1 : 1 + (teach.zoom.k - 1) * b;
}

function drawGaugeTeachZoom() {
  const b = teachZoomBlend();
  const k = teachScaleNow();
  ctx.save();
  ctx.scale(k, k);
  ctx.translate(-teach.zoom.srcX * b, -teach.zoom.srcY * b);
  drawGaugeContent();
  ctx.restore();
}
// [SG-TEACHVIEW-END]

// [SG-TEACHDRAW-BEGIN] — the guided layer, drawn INSIDE the instrument's own
// coordinate space so the walkthrough's framing magnifies it along with the
// scales. Called as the last layer of drawGaugeContent(); returns immediately
// when idle, which is what keeps draw() pure.
function drawTeachLayer() {
  if (!teachOn()) return;
  const at  = teachAt();
  const ph  = teach.reduced ? 1 : teachEase(at.phase);

  const msdPx  = getMsdPx();
  const edge   = teachEdgeX();
  const origin = teachLineOrigin();
  const msrX   = teachMsrX();
  const dth    = divAngle();
  const csd    = getCsd();
  const dir    = scaleDir();
  const br     = teachCsrBase();

  ctx.save();
  ctx.translate(OX.scaleX, OX.scaleY);

  // ── Stage 1 — the main scale reading ────────────────────────────
  // A measuring line grows along the sleeve to the thimble's leading edge, then
  // the graduation carrying the MSR is claimed. Drawn in the clear band below
  // the sleeve, dimension-line style, so it never fights the graduations.
  if (at.key === 'msr' || at.i > 0) {
    const done = at.key !== 'msr';
    const grow = origin + (edge - origin) * (done ? 1 : teachGrowFrac(at));
    const y    = TEACH_BAND_LINE;
    ctx.strokeStyle = '#4fc3f7'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(origin, y); ctx.lineTo(grow, y); ctx.stroke();
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(origin, y + 6); ctx.lineTo(origin, 0); ctx.stroke();

    // THE INDEX LINE — a thin red line standing on the thimble's leading edge
    // and carried up through the sleeve. This is how the reading is actually
    // taken: you look at where the thimble edge falls and read the last
    // graduation it has passed. Red, because it is a pointer, not a
    // measurement — the measuring line and its label stay in the MSR tile's blue.
    const landed = done || Math.abs(grow - edge) < 0.01;
    if (landed) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,85,85,0.95)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(edge, TEACH_BAND_LINE + 6); ctx.lineTo(edge, -34);
      ctx.stroke();
      ctx.restore();
    }
    if (!done) {                            // the pen at the leading edge
      ctx.fillStyle = '#4fc3f7';
      ctx.shadowColor = 'rgba(79,195,247,0.9)'; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(grow, y, 3.4, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }
    // The claimed graduation: a sketched arrow standing under it, so "which one
    // is the MSR" is answered by a shape pointing at it rather than by a bar the
    // eye has to align. A sketched pointer, not a CAD one — the instrument's own
    // marks are the precise things on this canvas, and a pointer that looks
    // equally precise competes with them.
    const reached = done || (origin < edge ? grow >= msrX : grow <= msrX);
    if (reached) {
      teachSketchArrow(msrX, 1);
      // Ask before answering: the instruction comes first and the value only
      // once the student has had a moment to look where it points.
      const told = done || at.phase >= TEACH_MSR_VALUE_AT;
      teachChip(msrX + ARROW_TAIL_DX - 16, ARROW_TAIL_DY + 16,
        told ? ('MSR = ' + fmtMsr(teachObsQ()) + ' ' + uLabel())
             : (isReversed() ? 'read the last number the thimble covers'
                             : 'read the main scale here'),
        told ? '#4fc3f7' : '#8b9dc3');
    }
  }

  // ── Stage 2 — which thimble division is ON the datum ────────────
  // The datum line is extended in gold and the divisions either side of it are
  // probed in turn: above the line, above, above, LEVEL, below. A micrometer is
  // misread by one division far more often than by anything else, and the only
  // cure is seeing the neighbours rejected.
  if (at.key === 'datum') {
    const scanPh  = clamp(ph / TEACH_SCAN_TO, 0, 1);
    const settled = ph >= TEACH_SCAN_TO;
    const upto    = settled ? TEACH_PROBE.length - 1 : teachProbeExtent(scanPh);
    const mk      = 4.2;

    // The datum line itself, extended across the thimble face.
    ctx.save();
    ctx.strokeStyle = 'rgba(255,215,0,0.9)'; ctx.lineWidth = 1.6;
    ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(msrX - 30, 0); ctx.lineTo(edge + 92, 0); ctx.stroke();
    ctx.restore();

    // TWO PASSES. Drawing in probe order paints the far-side rejection AFTER the
    // match, and the marks are deliberately oversized — on a 100-division
    // thimble the next X lands on top of the very tick the step exists to
    // celebrate. It reads as "found it… no it isn't".
    for (let j = 0; j <= upto; j++) {
      const i  = TEACH_PROBE[j];
      if (Math.abs(i * dth) > Math.PI / 2) continue;
      const vy = cylY(i) - OX.scaleY;
      if (i !== 0) teachSketchX(edge + 46, vy, mk, j === upto ? 0.95 : 0.42);
    }
    if (upto >= TEACH_PROBE.indexOf(0)) {
      ctx.save();
      ctx.fillStyle = 'rgba(10,22,29,0.92)';
      ctx.beginPath(); ctx.arc(edge + 46, 0, mk * 2.1, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      teachSketchTick(edge + 46, 0, mk * 1.9);
      teachPulse(edge + 46, 0);
    }

    // What the probe under test is doing. A division is above the datum, below
    // it, or level with it — three states, and only one of them is a reading.
    const i  = TEACH_PROBE[upto];
    const vy = cylY(i) - OX.scaleY;
    if (settled) {
      teachChip(edge + 96, 0, 'level with the line', '#FFD700');
    } else if (i === 0) {
      teachChip(edge + 96, 0, 'level with the line', '#FFD700');
    } else {
      const div = ((br.csr + dir * i) % csd + csd) % csd;
      teachChip(edge + 96, vy,
        'no — ' + div + ' sits ' + (vy < 0 ? 'above' : 'below') + ' it', '#ff8f8f');
    }
  }

  // ── Stage 3 — read the number, do not count to it ───────────────
  // The count starts at the nearest NUMBERED graduation and walks the few
  // divisions from there to the datum. That is how a thimble is read; counting
  // forty-seven divisions from zero is not a thing anyone does, and an animation
  // that did it would be teaching a method the instrument does not use.
  if (at.key === 'csr' || at.i > 2) {
    const shown = teachCounted();
    const steps = shown - br.base;
    // The numbered graduation the count started from, lit and labelled.
    const iBase = -dir * br.rem;
    if (Math.abs(iBase * dth) <= Math.PI / 2) {
      ctx.strokeStyle = 'rgba(129,199,132,0.85)'; ctx.lineWidth = 1.6;
      const yb = cylY(iBase) - OX.scaleY;
      ctx.beginPath(); ctx.moveTo(edge, yb); ctx.lineTo(edge + 34, yb); ctx.stroke();
    }
    // every counted division stays lit, so the count is visible as a run
    ctx.strokeStyle = 'rgba(129,199,132,0.85)'; ctx.lineWidth = 1.4;
    for (let k = 1; k <= steps; k++) {
      const i = -dir * (br.rem - k);
      if (Math.abs(i * dth) > Math.PI / 2) continue;
      const vy = cylY(i) - OX.scaleY;
      ctx.beginPath(); ctx.moveTo(edge, vy); ctx.lineTo(edge + 26, vy); ctx.stroke();
    }
    const iNow = -dir * (br.rem - steps);
    const yNow = cylY(iNow) - OX.scaleY;
    // the marker that walks
    ctx.fillStyle = '#FFD700';
    ctx.shadowColor = 'rgba(255,215,0,0.9)'; ctx.shadowBlur = 9;
    ctx.beginPath();
    ctx.moveTo(edge + 38, yNow); ctx.lineTo(edge + 48, yNow - 4.5); ctx.lineTo(edge + 48, yNow + 4.5);
    ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0;
    // The division number above, and what it is WORTH below, accumulating one
    // least count at a time. This is the whole of CSR x LC, shown as the
    // multiplication it actually is, landing on the number the TR row prints.
    teachChip(edge + 96, yNow - 12,
      'division ' + shown + (steps === 0 ? ' (numbered)' : ''), '#FFD700');
    teachChip(edge + 96, yNow + 12,
      fmtPart(getMSR(teachObsQ()) + shown * getLcMm()) + ' ' + uLabel(), '#81c784');
  }

  // ── Stage 4/5 — the arithmetic lives in the tiles, not on the metal ──
  if (at.key === 'tr' || at.key === 'ze') teachPulse(edge + 46, 0);

  ctx.restore();
}

// Ticks SHOULD magnify with the scales — that is the point of drawing the guided
// layer inside the instrument's space. Labels should NOT: at 3x a 9pt chip
// becomes 27pt and swallows the caption band. Everything textual therefore draws
// at an inverse scale about its own anchor, so it stays pinned to the feature it
// names while keeping one size on screen at every zoom factor.
function teachLabelScale() {
  return 1 / (teachZoomBlend() > 0 ? teachScaleNow() : 1);
}

// Deterministic +-1 wobble, derived from the anchor and never from Math.random:
// a per-frame random would make the ink crawl, and these run every frame.
function teachInk(x, n) {
  const v = Math.sin((x + n * 61.3) * 12.9898) * 43758.5453;
  return (v - Math.floor(v)) * 2 - 1;
}

// A pointer drawn the way a hand draws one — a curved shaft into the tick with a
// two-stroke head, inked twice with a small offset so the strokes do not sit
// perfectly on each other. Drawn in the INSTRUMENT's coordinates, unlike the
// chips: a pointer is tied to a place on the metal, so it grows with the metal.
function teachSketchArrow(x, yTip) {
  const j = (n) => teachInk(x, n * 0.61);
  ctx.save();
  ctx.translate(x, yTip);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let pass = 0; pass < 2; pass++) {
    const dx = pass * 0.8, dy = pass * 0.6;
    ctx.strokeStyle = pass ? 'rgba(255,193,7,0.40)' : 'rgba(255,208,70,1)';
    ctx.lineWidth = pass ? 1.6 : 2.4;
    ctx.beginPath();
    ctx.moveTo(ARROW_TAIL_DX + dx + j(pass), ARROW_TAIL_DY + dy + j(pass + 1));
    ctx.quadraticCurveTo(ARROW_TAIL_DX + 12 + dx, ARROW_TAIL_DY * 0.42 + dy,
                         -2 + dx + j(pass + 2), 5 + dy);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(dx, 2 + dy); ctx.lineTo(-10 + dx + j(pass + 3), 6 + dy);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(dx, 2 + dy); ctx.lineTo(-4 + dx, 15 + dy + j(pass + 4));
    ctx.stroke();
  }
  ctx.restore();
}

function teachSketchX(x, y, r, alpha) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,120,120,' + alpha + ')';
  ctx.lineWidth = Math.max(1, r * 0.34);
  ctx.lineCap = 'round';
  const w = teachInk(x + y, 1) * 0.6, v = teachInk(x + y, 2) * 0.6;
  ctx.beginPath();
  ctx.moveTo(x - r + w, y - r); ctx.lineTo(x + r, y + r + v); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + r, y - r + v); ctx.lineTo(x - r + w, y + r); ctx.stroke();
  ctx.restore();
}

function teachSketchTick(x, y, r) {
  ctx.save();
  ctx.strokeStyle = '#FFD700';
  ctx.lineWidth = Math.max(1.6, r * 0.30);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(255,215,0,0.85)'; ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.moveTo(x - r, y);
  ctx.lineTo(x - r * 0.25 + teachInk(x, 3) * 0.4, y + r * 0.75);
  ctx.lineTo(x + r, y - r * 0.85 + teachInk(x, 4) * 0.4);
  ctx.stroke();
  ctx.restore();
}

// A small rounded label, centred on (x, y).
function teachChip(x, y, txt, colour) {
  const k = teachLabelScale();
  ctx.save();
  ctx.translate(x, y); ctx.scale(k, k);
  ctx.font = 'bold 9pt sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w = ctx.measureText(txt).width + 14;
  // Only clamp at 1x: when zoomed, the canvas edge is not where CW says it is.
  const cx = teachZoomBlend() > 0 ? 0
    : clamp(x, w / 2 + 2 - OX.scaleX, CW / DS - OX.scaleX - w / 2 - 2) - x;
  ctx.fillStyle = 'rgba(8,12,18,0.9)';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(cx - w / 2, -9, w, 18, 5);
  else ctx.rect(cx - w / 2, -9, w, 18);
  ctx.fill();
  ctx.strokeStyle = colour; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = colour; ctx.fillText(txt, cx, 0);
  ctx.restore();
}

function teachPulse(x, y) {
  const k = teachLabelScale();
  const r = 5 + 3 * Math.sin(teach.t * 6);
  ctx.save();
  ctx.translate(x, y); ctx.scale(k, k);
  ctx.strokeStyle = 'rgba(255,215,0,0.9)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}
// [SG-TEACHDRAW-END]

// [SG-TEACHBANNER-BEGIN]
// The caption band. Drawn at IDENTITY, after the instrument, so the walkthrough
// transform does not magnify it — and pinned to the canvas's bottom edge rather
// than floating over the middle, because a centred card would cover the
// instrument the caption is describing.
function teachCaption() {
  const at = teachAt(), u = uLabel(), br = teachCsrBase();
  const obsQ = teachObsQ();
  switch (at.key) {
    case 'msr': {
      // Which sleeve this student is looking at decides what the trap IS.
      const which = isImperial()
        ? 'Each sleeve line is 0.025 in; every fourth is numbered in tenths.'
        : (is100()
            ? 'Every sleeve line here is a whole millimetre — this screw has no half-millimetre mark to miss.'
            : 'Lines ABOVE the datum are whole millimetres, lines BELOW it are the half-millimetres. Missing one is the classic 0.5 mm error.');
      const how = isReversed()
        ? 'The sleeve is numbered backwards and the thimble COVERS it as the reading grows, so the MSR is the last number the thimble has hidden.'
        : 'The RED line is the thimble edge. The ARROW is the last sleeve line it has passed — that is the MSR.';
      return ['Step 1 — Main Scale Reading', how + ' ' + which];
    }
    case 'datum':
      return ['Step 2 — Find the division on the datum',
        'The long line running down the sleeve is the datum. Exactly one thimble division is level with it; its neighbours sit above and below. Being one division out is the commonest micrometer misread — check both sides before you commit.'];
    case 'csr': {
      // "step 0 divisions from it" is not a sentence anyone would say. When the
      // datum lands on a numbered line there is nothing to step, and saying so
      // is the shorter and truer reading.
      const walk = br.rem === 0
        ? 'Here the datum lands exactly on the numbered line ' + br.base + ', so CSR = ' + br.csr + ' straight off the drum.'
        : 'Take the nearest NUMBERED graduation — ' + br.base + ' — and step ' + br.rem +
          ' division' + (br.rem === 1 ? '' : 's') + ' from it to the datum: CSR = ' + br.csr + '.';
      return ['Step 3 — Read the thimble',
        'You do not count from zero on a micrometer. ' + walk +
        ' The lower box is CSR × LC — ' + br.csr + ' × ' + fmtLc() + ' ' + u + '.'];
    }
    case 'tr': {
      const head = isBore()
        ? (isInside() ? 'Bore = Jaws + MSR + (CSR × LC) = ' : 'Depth = Rod + MSR + (CSR × LC) = ')
        : 'TR = MSR + (CSR × LC) = ';
      const base = isBore()
        ? (isImperial() ? (getBaseMm() * MM_TO_IN).toFixed(3) : getBaseMm().toFixed(2)) + ' + '
        : '';
      return ['Step 4 — Total Reading',
        head + base + fmtMsr(obsQ) + ' + (' + br.csr + ' × ' + fmtLc() + ') = ' + fmtTr(obsQ) + ' ' + u + '.'];
    }
    case 'ze':
      return ['Step 5 — Correct the zero error',
        'This micrometer has a zero error of ' + fmtZeSigned() + ' ' + u +
        '. Subtract it from what you read: the corrected size is ' + fmtTotal(state.mm) + ' ' + u + '.'];
  }
  return ['', ''];
}

function drawTeachBanner() {
  if (!teachOn()) return;
  const at = teachAt();
  const cap = teachCaption(), title = cap[0], body = cap[1];
  const PAD = TEACH_BAND_PAD, H = TEACH_BAND_H;
  const x = PAD, y = CH - H - PAD, w = CW - PAD - 14 - 138 - 10;  // stop clear of .teach-bar

  ctx.save();
  ctx.fillStyle = 'rgba(8,12,18,0.92)';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, H, 9); else ctx.rect(x, y, w, H);
  ctx.fill();
  ctx.strokeStyle = 'rgba(79,142,247,0.5)'; ctx.lineWidth = 1; ctx.stroke();

  // progress along the whole walkthrough, not just this stage
  ctx.fillStyle = 'rgba(79,142,247,0.85)';
  ctx.fillRect(x, y + H - 3, w * clamp(teach.t / teach.total, 0, 1), 3);

  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.fillStyle = '#4f8ef7'; ctx.font = 'bold 9.5pt sans-serif';
  ctx.fillText(title, x + 12, y + 14);
  ctx.fillStyle = '#9fb0cc'; ctx.font = '8.5pt sans-serif';
  const lines = teachWrap(body, w - 24, 2);
  for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], x + 12, y + 31 + i * 14);

  ctx.fillStyle = '#6b7a99'; ctx.font = '8pt sans-serif'; ctx.textAlign = 'right';
  ctx.fillText((at.i + 1) + ' / ' + teach.stages.length, x + w - 12, y + 14);
  ctx.restore();
}

// Wrap to at most `max` lines, ellipsing the last. The band is a FIXED height:
// it may not grow, or the caption would start pushing the instrument around.
function teachWrap(txt, maxW, max) {
  const words = txt.split(' ');
  const lines = [];
  let line = '', i = 0;
  while (i < words.length) {
    const test = line ? line + ' ' + words[i] : words[i];
    if (ctx.measureText(test).width <= maxW) { line = test; i++; continue; }
    if (!line) { line = words[i]; i++; }          // a single word wider than the box
    lines.push(line); line = '';
    if (lines.length === max) break;
  }
  if (lines.length < max && line) { lines.push(line); line = ''; i = words.length; }
  if (i < words.length && lines.length) {
    lines[lines.length - 1] = teachFit(lines[lines.length - 1] + ' ' + words.slice(i).join(' '), maxW);
  }
  return lines;
}

// One line, trimmed to fit.
function teachFit(txt, maxW) {
  if (ctx.measureText(txt).width <= maxW) return txt;
  let lo = 0, hi = txt.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(txt.slice(0, mid) + '…').width <= maxW) lo = mid; else hi = mid - 1;
  }
  return txt.slice(0, lo).replace(/[\s,.]+$/, '') + '…';
}
// [SG-TEACHBANNER-END]

// [SG-TEACHRUN-BEGIN]
function teachStart() {
  setLocked(false, true);
  if (!teachAllowed()) return;
  stopAnim();                      // the sweep and the walkthrough cannot share the instrument
  cancelGlide();
  state.dragging = false;
  // Two zooms competing for the same canvas is a confusing picture, and the
  // walkthrough's own framing is solved from the reading.
  if (state.zoomOpen) closeZoom();
  teach.reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  teachBuild();
  teach.on = true; teach.playing = !teach.reduced; teach.t = 0; teach.last = 0;
  teachSyncUi();
  if (teach.playing) teach.raf = requestAnimationFrame(teachTick);
  render();
}
function teachStop() {
  if (teach.raf) cancelAnimationFrame(teach.raf);
  teach.raf = null; teach.on = false; teach.playing = false;
  teachLight(null);
  teachSyncUi();
  render();
}
// Every path that moves the instrument or swaps it calls this: the stages were
// built for a reading that no longer exists, and a walkthrough narrating the
// wrong number is worse than none.
function teachAbort() { if (teach.on) teachStop(); }

function teachTick(ts) {
  if (!teach.on || !teach.playing) return;
  if (teach.last) {
    // Never backwards: a frame stamped earlier than the last would rewind the
    // walkthrough and re-fire stages already narrated.
    teach.t += (Math.max(0, ts - teach.last) / 1000) * TEACH_SPEED;
    if (teach.t >= teach.total) { teach.t = teach.total; teach.playing = false; }
  }
  teach.last = ts;
  teachSyncUi();
  render();
  if (teach.playing) teach.raf = requestAnimationFrame(teachTick);
}
function teachPlayPause() {
  if (!teach.on) return;
  if (teach.t >= teach.total) { teach.t = 0; teach.playing = true; }
  else teach.playing = !teach.playing;
  teach.last = 0;
  if (teach.playing) teach.raf = requestAnimationFrame(teachTick);
  teachSyncUi(); render();
}
// Step to the START of the next/previous stage — a teacher holding a step wants
// the stage boundary, not an arbitrary slice of tween.
function teachStep(dir) {
  if (!teach.on) return;
  const at = teachAt();
  let i = at.i + (dir > 0 ? 1 : (at.phase > 0.06 ? 0 : -1));
  i = clamp(i, 0, teach.stages.length - 1);
  let t = 0; for (let k = 0; k < i; k++) t += teach.stages[k].w;
  teach.t = (dir > 0 && i === at.i) ? teach.total : t;
  teach.playing = false; teach.last = 0;
  teachSyncUi(); render();
}

// Stage 4 is the arithmetic, so the arithmetic is what animates: the TR box's
// own rows are held back and revealed one at a time, in the order a student
// would write them. The rows are the EXISTING markup — no second copy of the sum
// is created, so it cannot disagree with the tile it lives in.
function teachRowEls() {
  const box = $('tr-formula');
  if (!box) return null;
  const out = [$('tr-step1'), $('tr-step2')];
  // The rod/jaw row only exists on a bore instrument, and only then is it shown.
  const rod = $('tr-step-rod');
  if (rod && isBore()) out.push(rod);
  out.push(box.querySelector('.tr-result'));
  return { box: box, els: out };
}
function teachRows(at) {
  const r = teachRowEls();
  if (!r) return;
  const trIdx = teach.stages.findIndex(s => s.key === 'tr');
  if (!teach.on || trIdx < 0 || at.i < trIdx) {
    // Before the arithmetic stage — and whenever idle — the box is untouched.
    r.els.forEach(el => el && el.classList.remove('teach-hold', 'teach-pop'));
    r.box.classList.remove('teach-lit');
    return;
  }
  const on = at.key === 'tr';
  r.box.classList.toggle('teach-lit', on);
  const shown = on ? Math.min(r.els.length, Math.floor(at.phase * r.els.length) + 1) : r.els.length;
  r.els.forEach((el, i) => {
    if (!el) return;
    el.classList.toggle('teach-hold', i >= shown);
    el.classList.toggle('teach-pop', on && i === shown - 1);
  });
}

// Light the tile that belongs to the current stage. The Practice blur must
// survive this: lighting a tile may not reveal a value the student owes.
function teachLight(cls) {
  if (teach.lit === cls) return;
  document.querySelectorAll('.rcell.teach-lit, .tr-formula.teach-lit')
    .forEach(el => el.classList.remove('teach-lit'));
  if (cls) {
    const el = document.querySelector('.' + cls);
    if (el) el.classList.add('teach-lit');
  }
  teach.lit = cls;
}
// [SG-TEACHRUN-END]

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

// Knurl: two crossing helix families on a cylinder of radius R about y = cy,
// turned to rotA. cos θ > 0 keeps the front of the cylinder only, so teeth
// appear at one rim and vanish at the other. Each groove is stroked twice — a
// lit upper lip, then the dark cut below it — which is what makes the mesh read
// as raised diamonds rather than a grid. `helix` is rad of twist per world px.
function drawKnurl(xa, xb, cy, R, rotA, teeth, helix) {
  const dth = 2 * Math.PI / teeth;
  ctx.lineCap = 'round';
  for (let s = -1; s <= 1; s += 2) {
    for (let j = 0; j < teeth; j++) {
      const th0 = j * dth + rotA;
      const pts = [];
      let run = [];
      for (let x = xa; x <= xb; x += 3) {
        const th = th0 + s * helix * (x - xa);
        if (Math.cos(th) <= 0.04) { if (run.length > 1) pts.push(run); run = []; continue; }
        run.push([x, cy + R * Math.sin(th)]);
      }
      if (run.length > 1) pts.push(run);
      if (!pts.length) continue;
      for (let pass = 0; pass < 2; pass++) {
        ctx.beginPath();
        for (const seg of pts) {
          ctx.moveTo(seg[0][0], seg[0][1] - (pass ? 0 : 1.3));
          for (let k = 1; k < seg.length; k++) ctx.lineTo(seg[k][0], seg[k][1] - (pass ? 0 : 1.3));
        }
        ctx.strokeStyle = pass ? 'rgba(12,14,18,0.50)' : 'rgba(255,255,255,0.20)';
        ctx.lineWidth   = pass ? 1.5 : 1.0;
        ctx.stroke();
      }
    }
  }
}

function drawGaugeContent() {
  // ── displayMm is the OBSERVED reading on the instrument = state.mm (TRUE) + ZE ──
  // For negative ZE near the closed jaws, displayMm can be slightly negative;
  // CSR/texture maths handle it via modular arithmetic, while spindle/thimble
  // translation is clamped so the thimble never moves past the anvil.
  const displayMm = state.mm + getZeOffsetMm();
  const csr       = getCSR(snapToLc(displayMm));
  const msdPx     = getMsdPx();
  const msdCount  = getMsdCount();
  const csd       = getCsd();
  const imperial  = isImperial();
  const N         = csd / 4;

  const rawShift  = getShiftPx(displayMm);
  const maxShift  = getShiftPx(getMaxMm());
  const travel    = Math.max(0, Math.min(maxShift, rawShift));
  // On a DEPTH micrometer the thimble runs the other way: zero is FULL travel
  // (rod retracted, sleeve completely covered) and the thimble walks back
  // towards the base as the rod extends. spriteShift() owns that flip, and the
  // ratchet hit zone reads the same function, so the picture and the pointer
  // cannot disagree about where the drum is.
  const shift     = spriteShift(displayMm);
  const dir       = scaleDir();

  ctx.save();
  ctx.translate(0, bodyOffsetY());

  // 0. Workpiece — drawn FIRST so the anvil (base) and spindle overlap its
  //    edges and it reads as gripped between the measuring faces.
  if (isOutside()) drawWorkpiece();

  // 1. Spindle — the outside micrometer's measuring spindle. On the depth
  //    micrometer the extension rod IS the spindle's working end, and it is
  //    drawn with the base in drawDepthBody, so this sprite would only float
  //    across the work.
  if (isOutside()) {
    ctx.drawImage(sprSpindle, OX.spindleX + shift, OX.spindleY,
      imgSpindle.naturalWidth, imgSpindle.naturalHeight);
  }

  // 2. Base frame — the U-frame sprite, or the depth micrometer's base and rod.
  //    The thimble, sleeve, spindle and ratchet are the SAME parts on a real
  //    depth micrometer, so those sprites carry over untouched; only the frame
  //    below the screw is a different casting, and that is what is drawn here.
  if (isDepth()) drawDepthBody(travel);
  else if (isInside()) drawInsideBody(travel);
  else ctx.drawImage(sprBase, 0, 0, imgBase.naturalWidth, imgBase.naturalHeight);

  // 3. Main scale ticks
  {
    ctx.save();
    ctx.translate(OX.scaleX, OX.scaleY);
    ctx.strokeStyle = '#1a1a1a';
    ctx.fillStyle   = '#1a1a1a';
    ctx.lineWidth   = 1.5;
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'bottom';

    const MAJ = 18, MED = 12, MIN = 9;

    if (imperial) {
      // Imperial 40 TPI: every 0.025" tick; all ticks ABOVE the datum line.
      // Major every 0.1" (i%4===0) labelled 1..9; inch boundaries bold.
      for (let i = 0; i <= msdCount; i++) {
        const x = i * msdPx;
        const isInch  = (i % 40 === 0);
        const isTenth = (i % 4  === 0);
        // A real inch sleeve carries ONE length for every 0.025in line; only the
        // numbered 0.100in lines are longer. Giving the 0.050in lines a third,
        // intermediate length invents a hierarchy the instrument does not have
        // and invites a student to read them as major graduations.
        let len, lw;
        if (isInch)       { len = MAJ; lw = 1.8; }
        else if (isTenth) { len = MAJ; lw = 1.4; }
        else              { len = MIN; lw = 0.9; }
        ctx.lineWidth = lw;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, -len); ctx.stroke();

        // A real 0–1in sleeve is numbered 0 at the datum then 1..9 for the
        // tenths, and the 1.000in line is left BARE — numbering it would print a
        // second "1" nine tenths away from the first and read as 0.100in.
        const lbl = sleeveLabel(i);
        if (lbl !== null) {
          ctx.font = (i === 0) ? 'bold 11pt sans-serif' : '9pt sans-serif';
          ctx.fillText(lbl, x, -MAJ - 2);
        }
      }
    } else {
      // SI: original metric scale
      // 0.5 mm/50: whole millimetres above the datum, HALF millimetres below —
      // the half-mm mark being separated by side is the only thing telling you
      // to add 0.5 mm, and missing it is the classic 0.5 mm misreading.
      // 1 mm/100: every graduation IS a whole millimetre, so they all sit above
      // the line and there is no half-mm mark to miss.
      const every = is100() ? 5 : 10;
      for (let i = 0; i <= msdCount; i++) {
        const x = i * msdPx;
        let len;
        if (is100())            len = (i % every === 0) ? MAJ : MED;
        else if (i % 2 === 1)   len = -MIN;
        else if (i % every === 0) len = MAJ;
        else len = MED;
        ctx.lineWidth = (i % every === 0) ? 1.5 : 1.0;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, -len); ctx.stroke();
        const lbl = sleeveLabel(i);
        if (lbl !== null) {
          ctx.font = 'bold 11pt sans-serif';
          ctx.fillText(lbl, x, -MAJ - 2);
        }
      }
    }
    ctx.restore();
  }

  // 4. Thimble image
  ctx.drawImage(sprThimble, OX.scaleX + shift, OX.thimbleY3,
    imgThimble.naturalWidth, imgThimble.naturalHeight);

  // 5. Knurled grip. The thimble and ratchet are one part turning at one angle,
  //    so the grip is knurled by the SAME helices the ratchet uses, wrapped on
  //    the thimble's own radius — foreshortened at the rims as a cylinder is.
  //    It replaced a flat diagonal-line texture scrolled vertically, which slid
  //    at the same speed at the rim as at the centre: a pattern moving up a
  //    flat card, not a drum turning.
  {
    const xa = OX.scaleX + shift + THIMBLE_KNURL_X1;
    const xb = OX.scaleX + shift + THIMBLE_KNURL_X2;
    const cy = OX.scaleY, R = R2 - 2;
    const rotA = dir * (snapToLc(displayMm) / getPitch()) * 2 * Math.PI;
    ctx.save();
    ctx.beginPath(); ctx.rect(xa, cy - R, xb - xa, 2 * R); ctx.clip();
    const gd = ctx.createLinearGradient(0, cy - R, 0, cy + R);
    gd.addColorStop(0.00, 'rgb(12,14,18)');
    gd.addColorStop(0.10, 'rgb(106,108,112)');
    gd.addColorStop(0.24, 'rgb(190,192,196)');
    gd.addColorStop(0.32, 'rgb(225,227,231)');
    gd.addColorStop(0.46, 'rgb(196,198,202)');
    gd.addColorStop(0.62, 'rgb(153,155,159)');
    gd.addColorStop(0.78, 'rgb(109,111,115)');
    gd.addColorStop(0.92, 'rgb(59,61,65)');
    gd.addColorStop(1.00, 'rgb(10,12,16)');
    ctx.fillStyle = gd;
    ctx.fillRect(xa, cy - R, xb - xa, 2 * R);
    // Straight knurl is cut finer than the ratchet's diamond; the tooth count is
    // the ratchet's (the aliasing rule), the twist is scaled so both meshes cut
    // at the same 45 degrees on their different radii.
    drawKnurl(xa, xb, cy, R, rotA, ratchetTeeth(), RATCHET_HELIX * RD_R / R);
    const rim = ctx.createLinearGradient(0, cy - R, 0, cy + R);
    rim.addColorStop(0,    'rgba(0,0,0,0.65)');
    rim.addColorStop(0.15, 'rgba(0,0,0,0)');
    rim.addColorStop(0.85, 'rgba(0,0,0,0)');
    rim.addColorStop(1,    'rgba(0,0,0,0.65)');
    ctx.fillStyle = rim;
    ctx.fillRect(xa, cy - R, xb - xa, 2 * R);
    ctx.restore();
    // The shoulders where the knurl starts and stops: a cut edge, lit on the
    // side facing the lamp.
    ctx.save();
    ctx.lineWidth = 1;
    [xa, xb].forEach(function (x, k) {
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath(); ctx.moveTo(x + (k ? -0.5 : 0.5), cy - R + 3); ctx.lineTo(x + (k ? -0.5 : 0.5), cy + R - 3); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath(); ctx.moveTo(x + (k ? 0.5 : -0.5), cy - R + 3); ctx.lineTo(x + (k ? 0.5 : -0.5), cy + R - 3); ctx.stroke();
    });
    ctx.restore();
  }

  // 6b. Ratchet cap — the knurled drum turns with the spindle. It is rigidly
  //     coupled to the thimble, so it shares the same rotation angle; the teeth
  //     are helices sampled at y = cy + R·sin(θ), which foreshortens them into
  //     the silhouette exactly as a real cylinder does.
  {
    const x0   = OX.scaleX + shift;
    const cy   = OX.thimbleY3 + RD_CY;
    const yTop = OX.thimbleY3 + RD_CY - RD_R;
    const yBot = OX.thimbleY3 + RD_CY + RD_R;
    const rotA = dir * (snapToLc(displayMm) / getPitch()) * 2 * Math.PI;
    const xa = x0 + RD_X1, xb = x0 + RD_X2;

    ctx.save();

    // Clip to the drum's chamfered silhouette so nothing spills past its outline.
    ctx.beginPath();
    ctx.moveTo(xa, cy - RD_R_END);
    ctx.lineTo(xa + RD_CH, yTop);
    ctx.lineTo(xb - RD_CH, yTop);
    ctx.lineTo(xb, cy - RD_R_END);
    ctx.lineTo(xb, cy + RD_R_END);
    ctx.lineTo(xb - RD_CH, yBot);
    ctx.lineTo(xa + RD_CH, yBot);
    ctx.lineTo(xa, cy + RD_R_END);
    ctx.closePath();
    ctx.clip();

    // Bare metal, sampled from the sprite: dark rim, highlight above centre.
    const gd = ctx.createLinearGradient(0, yTop, 0, yBot);
    gd.addColorStop(0.00, 'rgb(4,3,3)');
    gd.addColorStop(0.10, 'rgb(106,108,112)');
    gd.addColorStop(0.20, 'rgb(178,180,184)');
    gd.addColorStop(0.30, 'rgb(225,227,231)');
    gd.addColorStop(0.45, 'rgb(196,198,202)');
    gd.addColorStop(0.60, 'rgb(153,155,159)');
    gd.addColorStop(0.75, 'rgb(109,111,115)');
    gd.addColorStop(0.90, 'rgb(60,61,66)');
    gd.addColorStop(1.00, 'rgb(5,3,3)');
    ctx.fillStyle = gd;
    ctx.fillRect(xa, yTop, xb - xa, yBot - yTop);

    // Knurl: two crossing helix families (see drawKnurl).
    drawKnurl(xa, xb, cy, RD_R, rotA, ratchetTeeth(), RATCHET_HELIX);

    // Just the rims sunk back down; the base gradient already carries the
    // cylinder shading, so anything more here only muddies the metal.
    const sh = ctx.createLinearGradient(0, yTop, 0, yBot);
    sh.addColorStop(0,    'rgba(0,0,0,0.70)');
    sh.addColorStop(0.16, 'rgba(0,0,0,0)');
    sh.addColorStop(0.84, 'rgba(0,0,0,0)');
    sh.addColorStop(1,    'rgba(0,0,0,0.70)');
    ctx.fillStyle = sh;
    ctx.fillRect(xa, yTop, xb - xa, yBot - yTop);

    ctx.restore();
  }

  // 7. Circular scale ticks
  {
    const dth  = divAngle();
    const refX = OX.scaleX + shift;
    const MAJ_T = 28, MIN_T = 16;

    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(refX, OX.thimbleY1 - 2);
    ctx.lineTo(refX, OX.thimbleY1 + 2 * R1 + 2);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = '#111'; ctx.fillStyle = '#111';
    ctx.lineWidth = 1.2;
    ctx.font = '9pt sans-serif';
    ctx.textBaseline = 'middle';

    // A 50-division thimble shows every 5th numbered. A 100-division one packs
    // twice as many graduations into the same drum, so numbering every 5th
    // would collide: number every 10th and give every 5th a middle length, the
    // way a real fine-graduated thimble is engraved.
    const labelEvery = thimbleLabelEvery();
    const midEvery   = thimbleMidEvery();
    ctx.textAlign = 'left';

    // One signed sweep either side of the datum. Divisions past the cylinder's
    // horizon are not drawn at all — a real thimble hides them round the back.
    const lim = Math.ceil(N) + 1;
    for (let i = -lim; i <= lim; i++) {
      const pos = thimbleMarkPos(i);
      const th  = pos * dth;
      if (Math.abs(th) > Math.PI / 2) continue;
      const aSin = Math.abs(Math.sin(th));
      ctx.globalAlpha = aSin > 0.70 ? Math.max(0, 1 - 3 * (aSin - 0.70)) : 1;

      const div   = ((csr + dir * i) % csd + csd) % csd;
      const isMaj = div % labelEvery === 0;
      const isMid = midEvery > 0 && !isMaj && div % midEvery === 0;
      const len   = isMaj ? MAJ_T : (isMid ? (MAJ_T + MIN_T) / 2 : MIN_T);
      const y1    = cylY(pos);
      const y2    = cylYOuter(pos, isMaj ? 8 : (isMid ? 6 : 4));

      ctx.lineWidth = isMaj ? 1.2 : (csd >= 100 ? 0.8 : 1.2);
      ctx.beginPath(); ctx.moveTo(refX, y1); ctx.lineTo(refX + len, y2); ctx.stroke();
      if (isMaj && Math.abs(i) < thimbleLabelSpan()) {
        ctx.fillText(String(div), refX + len + 3, y2);
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  // 8. LC badge (free mode only)
  if (state.mode === 'free') {
    const lcTxt = 'LC = ' + fmtLc() + ' ' + uLabel();
    ctx.save();
    ctx.font = 'bold 8.5pt sans-serif';
    ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    const tw = ctx.measureText(lcTxt).width;
    // On the outside micrometer the badge tucks in just ahead of the thimble.
    // On a bore instrument the work is drawn UP at the top of the canvas, which
    // is exactly where that puts it — the badge sat on the bore wall. Park it
    // over the ratchet end instead, where nothing else reaches y = 12.
    // The top-right corner belongs to the canvas toolbar (Zoom + Lock), which
    // is a DOM overlay and therefore invisible to anything measured in world
    // px. Reserve its footprint explicitly — converted from CSS px, since the
    // canvas is drawn through DS and then scaled again to fit the card — or the
    // badge slides under the buttons as the toolbar grows.
    const WW  = CW / DS;
    const TOOLBAR_CSS_W = 215;
    const reserved = TOOLBAR_CSS_W * canvasScale() / DS;
    const half = tw / 2 + 6;
    let bx = isBore() ? 1010
                      : Math.min(OX.scaleX + shift - 40, WW * 0.97 - 70);
    let by = 12;
    const limit = WW - reserved - half;
    if (limit >= half) bx = Math.max(half, Math.min(bx, limit));
    else { bx = Math.max(half, Math.min(bx, WW - half)); by = 54; }  // no room beside it: go under
    const bxC = bx - tw / 2 - 6;
    ctx.fillStyle = 'rgba(0,0,0,0.58)';
    // A fresh path, or the badge's gold outline also strokes whatever path is
    // still open — the last thimble graduation drawn above, which then showed
    // as a gold line along the top of the bevel.
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bxC, by, tw + 12, 18, 4);
    else ctx.rect(bxC, by, tw + 12, 18);
    ctx.fill();
    ctx.strokeStyle = 'rgba(245,200,66,0.55)'; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.fillStyle = '#f5c842';
    ctx.fillText(lcTxt, bxC + tw / 2 + 6, by + 9);
    ctx.restore();
  }

  // 9. Workpiece dimension annotation, on top of everything.
  if (isOutside()) drawWorkpieceDims();

  // 9b. The spindle lock lever, on the casting it belongs to.
  drawLockLever();

  // 10. The guided reading, INSIDE the instrument's own space so it magnifies
  //     with the scales. Returns immediately when idle — draw() stays pure.
  drawTeachLayer();

  ctx.restore();
}

// Black granite surface plate — the bench a micrometer is laid on in a
// metrology room, and the same plate the vernier caliper lies on. Built once
// per backing-store size at DEVICE resolution, with deterministic grain (a
// seeded generator) so a resize rebuilds the same stone. Blitted at identity,
// so neither Zoom nor the walkthrough camera magnifies the grain into blobs.
let plateCache = null, plateFadeCache = null;
function getPlate() {
  const W = canvas.width, H = canvas.height;
  if (plateCache && plateCache.width === W && plateCache.height === H) return plateCache;
  const c = spriteCanvas(W, H);
  const g = c.getContext('2d');
  let seed = 0x5eed1234;
  const rnd = function () {                       // mulberry32
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  g.fillStyle = '#15191e';
  g.fillRect(0, 0, W, H);
  // Grain: small ANGULAR crystals — near-black pyroxene, sparse pale feldspar.
  // Round dots read as bubbles, not stone.
  function grain(n, lo, hi, colour) {
    g.fillStyle = colour;
    for (let i = 0; i < n; i++) {
      const x = rnd() * W, y = rnd() * H;
      const sz = (lo + rnd() * (hi - lo)) * DPR;
      const k = rnd() * Math.PI;
      g.beginPath();
      for (let v = 0; v < 4; v++) {
        const ang = k + v * Math.PI / 2 + (rnd() - 0.5) * 0.9;
        const rr = sz * (0.55 + rnd() * 0.6);
        g.lineTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr);
      }
      g.fill();
    }
  }
  grain(W * H / 700, 1.0, 2.6, 'rgba(0,0,0,0.30)');
  grain(W * H / 1400, 0.8, 2.0, 'rgba(96,106,118,0.10)');
  grain(W * H / 2600, 0.5, 1.3, 'rgba(176,186,198,0.20)');
  for (let i = 0; i < W * H / 260; i++) {
    const x = rnd() * W, y = rnd() * H, v = rnd();
    g.fillStyle = 'rgba(170,180,192,' + (0.03 + v * 0.07).toFixed(3) + ')';
    g.fillRect(x, y, 0.7 * DPR, 0.7 * DPR);
  }
  // One broad sheen of the lamp on the lapped surface, and a gentle falloff.
  const sheen = g.createRadialGradient(W * 0.5, H * 0.15, 20 * DPR, W * 0.5, H * 0.15, W * 0.62);
  sheen.addColorStop(0, 'rgba(160,190,215,0.12)');
  sheen.addColorStop(1, 'rgba(160,190,215,0)');
  g.fillStyle = sheen; g.fillRect(0, 0, W, H);
  const vig = g.createRadialGradient(W * 0.5, H * 0.45, H * 0.4, W * 0.5, H * 0.45, W * 0.62);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.40)');
  g.fillStyle = vig; g.fillRect(0, 0, W, H);
  plateCache = c; plateFadeCache = null;
  return c;
}

// The bottom strip of the SAME plate, faded in from transparent: laid over
// the cropped C-frame so its legs sink into the stone instead of into a band
// of flat colour that would stand out against the grain.
function getPlateFade(bandCss) {
  const plate = getPlate();
  if (plateFadeCache) return plateFadeCache;
  const W = plate.width, bh = Math.round(bandCss * DPR);
  const c = spriteCanvas(W, bh);
  const g = c.getContext('2d');
  g.drawImage(plate, 0, plate.height - bh, W, bh, 0, 0, W, bh);
  g.globalCompositeOperation = 'destination-in';
  const m = g.createLinearGradient(0, 0, 0, bh);
  m.addColorStop(0,    'rgba(0,0,0,0)');
  m.addColorStop(0.55, 'rgba(0,0,0,0.62)');
  m.addColorStop(1,    'rgba(0,0,0,1)');
  g.fillStyle = m; g.fillRect(0, 0, W, bh);
  plateFadeCache = c;
  return c;
}

function drawSceneBackground() {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(getPlate(), 0, 0);
  ctx.restore();
}

function drawGauge() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (loadedCount < SPRITE_COUNT) {
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, CW, CH);
    ctx.fillStyle = '#6b7a99'; ctx.font = '14px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Loading sprites\u2026', CW / 2, CH / 2);
    return;
  }
  drawSceneBackground();
  ctx.save(); ctx.scale(DS, DS);
  if (teachZoomBlend() > 0) drawGaugeTeachZoom(); else drawGaugeContent();
  ctx.restore();

  // The C-frame is taller than this canvas by design — the bottom of the arc
  // carries nothing a student reads, so the framing spends the height on the
  // scales instead. What it must not do is end in a straight horizontal CUT,
  // which is what a hard canvas edge through a solid casting looks like. A
  // short fade into the scene colour lets the legs fall out of frame instead
  // of appearing sawn off. Outside only: the depth and inside bodies are drawn
  // to fit and have no cropped member to hide.
  if (isOutside()) {
    const fade = getPlateFade(34);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(fade, 0, canvas.height - fade.height);
    ctx.restore();
  }
}

// One spelling of the magnifier, because the walkthrough has to be able to
// close it: two copies of the toggle meant two places that could disagree
// about whether it was open.
function setZoom(open) {
  state.zoomOpen = !!open;
  $('btn-zoom').classList.toggle('active', state.zoomOpen);
  $('btn-zoom').innerHTML = state.zoomOpen ? '\u2715<span class="zt-lbl">&nbsp;Close</span>' : '\uD83D\uDD0D<span class="zt-lbl">&nbsp;Zoom</span>';
  render();
}
function closeZoom() { if (state.zoomOpen) setZoom(false); }

function drawGaugeZoomed() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  drawSceneBackground();
  if (loadedCount < SPRITE_COUNT) return;
  const ZDS = DS * 3.0;
  const displayMm = state.mm + getZeOffsetMm();
  const rawShift  = getShiftPx(displayMm);
  const maxShift  = getShiftPx(getMaxMm());
  const shift     = spriteShift(displayMm);
  const offX = ZDS * (OX.scaleX + shift) - CW / 2;
  const offY = ZDS * (OX.scaleY + bodyOffsetY()) - CH / 2;
  ctx.save(); ctx.scale(ZDS, ZDS); ctx.translate(-offX / ZDS, -offY / ZDS);
  drawGaugeContent(); ctx.restore();
}

// ── Reading panel + badges ────────────────────────────────────────
// SEMANTICS:
//   state.mm  = TRUE measurement (physical gap between jaws)
//   obsMm     = OBSERVED reading on the canvas = state.mm + ZE (signed)
//   Corrected = state.mm  (=  Observed − ZE, by industry/NCERT convention)
function updateReadingPanel() {
  const u     = uLabel();
  const obsMm = state.mm + getZeOffsetMm();
  // MSR / CSR / TR describe what the student READS off the canvas → observed
  // values, QUANTIZED to the least count first. A workpiece can hold the spindle
  // off the LC grid (a 9.52 mm rod on a 0.001″ micrometer), and computing MSR and
  // CSR independently from the raw value lets a fraction that rounds up to a
  // full revolution (CSR = 25 → 0) drop a whole pitch from the reading. One
  // rounded value, everything derived from it.
  const obsQ    = snapToLc(obsMm);
  // While the guided reading runs, the tiles show what it has DERIVED so far
  // rather than the finished answer: MSR and CSR start empty and fill in as the
  // measuring line grows and the thimble count walks, so the formula card adds
  // up live. Every value still comes from the tool's own formatters — this
  // decides WHICH numbers to hand them, never how to write one.
  const live    = teachLive();
  // The walkthrough's partial state, expressed as a reading the formatters can
  // take: whole pitches for the MSR, plus the divisions counted so far.
  const liveQ   = live ? (live.msrDivs * getPitch() + live.csr * getLcMm()) : obsQ;
  const csr     = live ? live.csr : getCSR(obsQ);
  const msrStr  = fmtMsr(liveQ);
  const csrStr  = String(csr);
  const lcStr   = fmtLc();
  const partStr = fmtPart(liveQ);
  const totStr  = fmtTr(liveQ);

  $('msr-val').textContent = msrStr;
  $('csr-val').textContent = csrStr;
  $('lc-val').textContent  = lcStr;

  $('f-msr').textContent  = msrStr;
  $('f-csr').textContent  = csrStr;
  $('f-lc').textContent   = lcStr;
  $('f-msr2').textContent = msrStr;
  $('f-part').textContent = partStr;
  $('f-tr').textContent   = totStr;

  // Big readout = the corrected (true) value — what the student should report
  // after applying ZE correction. On a depth micrometer that value INCLUDES the
  // extension rod, because the rod is part of the depth, not part of the
  // instrument's error.
  // While the walkthrough runs this tracks it, exactly as the MSR and CSR tiles
  // do. Leaving the finished measurement sitting in the biggest, brightest
  // element on the page while the animation works towards it defeats the whole
  // point: the student reads the answer off the readout and never watches the
  // scales. It shows the OBSERVED total the walkthrough is building (rod or
  // jaws included, zero error still in it) and lands on the corrected value the
  // moment the walkthrough ends — which is what step 5 is for.
  //
  // The rod/screw split directly underneath follows the same value, so the two
  // lines always add up; that is asserted, and reconstructing one of them from
  // a different quantity is how they came to disagree by exactly the zero error
  // once before.
  $('readout-display').textContent = live ? fmtTr(liveQ) : fmtTotal(state.mm);

  // The trigger is hidden in Quiz, and in Practice until the attempt is marked:
  // a step-by-step reading of the instrument IS the answer the student owes.
  // updateReadingPanel runs on every render, which is the only place that sees
  // every path into a mode change, a new question and a marked answer.
  { var howBtn = $('btn-how'); if (howBtn) howBtn.hidden = !teachAllowed(); }

  // ── Depth micrometer: the rod + screw split under the total ─────
  // The big readout is the DEPTH, and on a depth micrometer that number is two
  // things added. Showing only the total makes the rod invisible at exactly the
  // moment the student is looking at the answer. Hidden while a graded attempt
  // is unanswered, for the same reason the zero-error box is: the split is most
  // of the answer.
  var splitEl = $('dr-split');
  var hideSplit = (state.mode === 'practice' && !state.answered) ||
                  (state.mode === 'quiz'     && !state.quizAnswered) ||
                  state.mode === 'explore';
  if (splitEl) {
    if (isBore() && !hideSplit) {
      var rMm = getBaseMm();
      // The CORRECTED screw travel, not the observed one. This split sits
      // directly under the big readout, which is the corrected measurement, so
      // its two terms have to add to that number. Reconstructing the screw from
      // the OBSERVED scales made them disagree by exactly the zero error — a
      // depth micrometer showed "0.00 rod + 5.28 screw" beneath a readout of
      // 5.25. The observed decomposition is already on the TR formula card,
      // which is where it belongs; two adjacent numbers that do not add up are
      // worse than either one alone.
      // Idle: the CORRECTED screw travel, because the readout above is the
      // corrected measurement and these two terms have to add to it.
      // Mid-walkthrough: the screw the walkthrough has derived SO FAR, because
      // the readout above is now that. One rule either way — the number under
      // the readout is always the decomposition OF the readout.
      var sMm = live ? (Math.max(0, getMSR(liveQ)) + getCSR(liveQ) * getLcMm())
                     : state.mm;
      var f   = function (v) { return isImperial() ? (v * MM_TO_IN).toFixed(3) : v.toFixed(2); };
      // Just the arithmetic. Which rod is fitted is already said twice — on the
      // Rod pills and etched on the rod in the drawing — and a third copy here
      // pushes the two numbers that matter apart.
      splitEl.innerHTML =
        '<span class="drs-rod">' + f(rMm) + '</span> ' + (isInside() ? 'jaws' : 'rod') +
        '<span class="drs-op">+</span>' +
        f(sMm) + ' screw';
      splitEl.style.display = '';
    } else {
      splitEl.style.display = 'none';
    }
  }

  // ── Depth micrometer: show the rod as its own term ──────────────
  // The rod is a constant the student must remember to add, and it is the
  // second commonest depth-micrometer mistake after reading the scale the
  // wrong way. Making it a visible term in the formula is the whole point.
  var rodRow = $('tr-step-rod');
  var trTitle = $('tr-title');
  if (rodRow) rodRow.style.display = isBore() ? '' : 'none';
  if (trTitle) {
    trTitle.innerHTML = { depth:   'Depth = Rod + MSR + (CSR \u00D7 LC)',
                          inside:  'Bore = Jaws + MSR + (CSR \u00D7 LC)',
                          outside: 'TR = MSR + (CSR \u00D7 LC)' }[instKey()];
  }
  if (isBore()) {
    var rodMm  = getBaseMm();
    var screwQ = Math.max(0, getMSR(liveQ)) + getCSR(liveQ) * getLcMm();
    var fRod = $('f-rod');
    var fScr = $('f-screw');
    var bl = $('f-base-lbl');
    if (bl) bl.textContent = isInside() ? '(jaws)' : '(rod)';
    if (fRod) fRod.textContent = isImperial() ? (rodMm  * MM_TO_IN).toFixed(3) : rodMm.toFixed(2);
    if (fScr) fScr.textContent = isImperial() ? (screwQ * MM_TO_IN).toFixed(3) : screwQ.toFixed(2);
  }

  // Unit labels
  document.querySelectorAll('.rcell-msr .rcell-unit, .rcell-lc .rcell-unit').forEach(el => el.textContent = u);
  document.querySelector('.dr-unit').textContent = u;
  document.querySelector('.tr-unit').textContent = u;

  // LC badge in controls
  var lcBadge = $('lc-badge');
  if (lcBadge) lcBadge.textContent = lcStr + ' ' + u;

  // The page subtitle and the formula legend both quote the least count; they
  // are wrong the moment the instrument is switched if they are left static.
  var subLc = $('sub-lc');
  if (subLc) subLc.innerHTML = lcStr + '\u00A0' + u;
  var legLc = $('legend-lc');
  if (legLc) legLc.textContent = lcStr + ' ' + u;

  // ── Zero error readout (visible when state.zeOn, hidden during un-answered practice/quiz) ──
  var zeBox = $('ze-readout');
  var hideUnanswered = (state.mode === 'practice' && !state.answered) ||
                       (state.mode === 'quiz'     && !state.quizAnswered);
  // The zero-error box prints Observed, Error and Corrected side by side — it
  // IS step 5. Held back until the walkthrough gets there, for the same reason
  // the tiles start empty: the correction is the last thing the student is
  // asked to work out, and it cannot already be on screen when they are asked.
  var zeHeldByTeach = teachOn() && teachAt().key !== 'ze';
  var zeVisible = state.zeOn && state.mode !== 'explore' && !hideUnanswered && !zeHeldByTeach;
  if (zeBox) zeBox.style.display = zeVisible ? '' : 'none';
  if (zeVisible) {
    var obs = $('ze-observed');   if (obs) obs.textContent = fmtTotal(obsMm);
    var ze  = $('ze-error');      if (ze)  ze.textContent  = fmtZeSigned();
    var cor = $('ze-corrected');  if (cor) cor.textContent = fmtTotal(state.mm);
    document.querySelectorAll('#ze-readout .ze-cell-unit').forEach(function(el){ el.textContent = u; });
  }
  var zeVal = $('ze-val');
  if (zeVal) zeVal.textContent = fmtZeSigned() + ' ' + u;
  var zeStep = $('ze-stepper');
  if (zeStep) zeStep.style.display = state.zeOn ? '' : 'none';
}

function render() {
  updateReadingPanel();
  updateObjBar();
  syncExerciseUi();
  if (state.zoomOpen) drawGaugeZoomed();
  else drawGauge();
  // The caption band is a HUD: drawn after every zoom transform has been undone,
  // so it stays legible at every factor instead of being magnified off-screen.
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  drawTeachBanner();
}

// ── Animation ─────────────────────────────────────────────────────
function animStep(ts) {
  if (!state.playing) return;
  if (state.animLast) {
    const dt = Math.max(0, ts - state.animLast) / 1000;   // never backwards
    let next = state.mm + state.animDir * ANIM_SPEED * dt;
    const maxMm = getMaxMm();
    if (next >= maxMm) { next = maxMm; state.animDir = -1; }
    const minMm = wpMinMm();
    if (next <= minMm) { next = minMm; state.animDir =  1; }
    state.mm = clampMm(snapToLc(next));
  }
  state.animLast = ts;
  render();
  state.animRaf = requestAnimationFrame(animStep);
}

function startAnim() {
  setLocked(false, true);   // the Play sweep is the tool turning the spindle
  teachAbort();
  if (state.animRaf) cancelAnimationFrame(state.animRaf);
  state.playing  = true;
  state.animLast = 0;
  state.animDir  = Math.random() < 0.5 ? 1 : -1;
  $('btn-play').innerHTML = '&#9646;&#9646;&nbsp; Pause';
  $('btn-play').classList.add('playing');
  $('btn-check').disabled   = true;
  $('practice-input').value = '';
  $('feedback').textContent = '';
  $('feedback').className   = 'feedback';
  state.animRaf = requestAnimationFrame(animStep);
}

function stopAnim() {
  state.playing = false;
  if (state.animRaf) { cancelAnimationFrame(state.animRaf); state.animRaf = null; }
  state.animLast = 0;
  state.answered = false;
  $('btn-play').innerHTML = '&#9654;&nbsp; Play';
  $('btn-play').classList.remove('playing');
  $('btn-check').disabled   = false;
  $('practice-input').value = '';
  $('practice-input').focus();
  playClick();
}

// ── Practice mode ─────────────────────────────────────────────────
function randomZeLc() {
  // Pick a nonzero ze in {±1..±ZE_MAX_LC}
  const mag = 1 + Math.floor(Math.random() * ZE_MAX_LC);
  return (Math.random() < 0.5 ? -1 : 1) * mag;
}

function newPractice() {
  if (state.playing) stopAnim();
  if (state.wp) clearWorkpiece();
  if (isDepth()) {
    // Refit the rod each round — see the note in startQuiz.
    state.rodIdx = Math.floor(Math.random() * getRods().length);
    buildRodPills();
  }
  // The rod IS the base of the reading, so refitting one moves the full scale
  // (a 75-100 mm rod reads to 100). The answer box's range has to follow it,
  // and this runs AFTER setInstrument/setUnit have had their turn.
  syncAnswerInput();
  $('btn-play').disabled = false;
  $('caliper-card').style.cursor = 'default';
  const maxMm = getMaxMm();
  const lcMm = getLcMm();
  // state.mm is the TRUE value (what the student must enter). Pick well inside the
  // usable range so the OBSERVED (state.mm + ze) also stays in [0, maxMm].
  if (state.zeOn) {
    state.zeLc = randomZeLc();
    const zeM  = state.zeLc * lcMm;
    const lo   = Math.max(lcMm * 10, -zeM + lcMm);          // observed > 0
    const hi   = Math.min(maxMm - lcMm * 10, maxMm - zeM - lcMm); // observed < maxMm
    state.mm   = snapToLc(lo + Math.random() * Math.max(lcMm, hi - lo));
  } else {
    state.mm   = clampMm(snapToLc(lcMm * 10 + Math.random() * (maxMm - lcMm * 20)));
  }
  state.answered = false;
  $('feedback').textContent = '';
  $('feedback').className   = 'feedback';
  $('reading-cells').classList.add('cells-hidden');
  $('tr-formula').classList.add('formula-hidden');
  $('readout-display').style.display = 'none';
  $('practice-input').style.display  = 'block';
  $('practice-input').value          = '';
  $('dr-label').textContent          = 'Your Reading';
  $('btn-play').innerHTML            = '&#9654;&nbsp; Play';
  $('btn-play').classList.remove('playing');
  $('btn-check').disabled = false;
  setTimeout(() => $('practice-input').focus(), 50);
  render();
}

// [SG-GRADE-BEGIN]
// The answer the student must type. On a depth micrometer that is the DEPTH —
// rod plus screw travel — not the screw travel alone, because the depth is the
// thing being measured and forgetting the rod is the mistake worth catching.
function getCorrectDisplay(mmVal) {
  // Grade what the SCALES SHOW, then correct it — not the true value quantised.
  // The two are different numbers whenever a part sits half a least count from
  // a graduation and a zero error is set: a 2.545 mm part with a +1 LC error
  // draws its thimble line at 2.56, so the student writes 2.55, while
  // snapToLc(2.545) lands on 2.54 and marked that correct reading wrong. The
  // zero error is an exact multiple of the least count, so subtracting it
  // leaves q on the grid, and with no zero error this is the identity.
  const zeMm = getZeOffsetMm();
  const q   = snapToLc(mmVal + zeMm) - zeMm;
  const rod = getBaseMm();
  if (isImperial()) {
    const msrMm = getMSR(q);
    const csr   = getCSR(q);
    return ((rod + msrMm) * MM_TO_IN + csr * getLcDisplay()).toFixed(3);
  }
  return (rod + q).toFixed(2);
}
// [SG-GRADE-END]

// Echo what was GRADED in a Wrong verdict. The answer box is hidden on Check,
// so without this a value changed after typing (see shared/number-input-guard.js)
// reads as "I typed the answer and it said wrong".
function escHtml(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function checkAnswer() {
  if (state.answered || state.playing) return;
  if (state.wp && !wpInContact()) return;   // object drill: not on the part yet
  const raw   = ($('practice-input').value || '').trim();
  const input = parseNumericInput(raw);
  if (isNaN(input)) {
    $('feedback').textContent = 'Enter a valid number (e.g. 5.73).';
    $('feedback').className   = 'feedback err';
    return;
  }
  state.attempts++;
  const targetMm   = state.mm;   // state.mm IS the TRUE value the student must enter
  const correctStr = getCorrectDisplay(targetMm);
  const correctVal = parseFloat(correctStr);
  const tolerance = getLcDisplay() / 2 + 1e-6;
  // Two answers that PRINT the same are the same reading: the tool grades to
  // the instrument's own precision, so a typed value that renders as the very
  // string quoted back as the answer can never be marked wrong.
  const ok = Math.abs(input - correctVal) <= tolerance ||
             input.toFixed(isImperial() ? 3 : 2) === correctStr;
  state.answered = true;

  $('reading-cells').classList.remove('cells-hidden');
  $('tr-formula').classList.remove('formula-hidden');
  $('readout-display').textContent   = fmtTotal(targetMm);
  $('readout-display').style.display = 'block';
  $('practice-input').style.display  = 'none';
  $('dr-label').textContent          = 'Measurement';
  $('btn-check').disabled            = true;

  if (ok) {
    state.score++;
    $('feedback').innerHTML = `&#10003; Correct! &nbsp;<strong>${correctStr} ${uLabel()}</strong>`;
    $('feedback').className = 'feedback ok';
    playSuccess();
  } else {
    $('feedback').innerHTML = `&#10007; Incorrect &nbsp;|&nbsp; You entered: <strong>${escHtml(raw)} ${uLabel()}</strong> &nbsp;|&nbsp; Answer: <strong>${correctStr} ${uLabel()}</strong>`;
    $('feedback').className = 'feedback err';
    playError();
  }
  $('score').textContent    = state.score;
  $('attempts').textContent = state.attempts;
  render();
}

// ── Quiz mode ─────────────────────────────────────────────────────
const QUIZ_OBJ_MIN = 2;   // at least this many of the five are real parts

function startQuiz() {
  if (state.wp) clearWorkpiece();
  const maxMm = getMaxMm();
  const lcMm = getLcMm();
  // Self-contained questions — robust to mid-quiz toggle changes.
  //   kind 'scale'  → { trueMm, zeLc }: the spindle is preset, just read it.
  //   kind 'object' → { wp, trueMm, zeLc }: close the spindle on a part first.
  // Two or three of the five are always objects, at shuffled positions.
  // A depth micrometer measures INTO a feature, not across a part, so the
  // object drill has no meaning here and every question is a scale reading.
  const objCount = isBore() ? 0 : QUIZ_OBJ_MIN + (Math.random() < 0.5 ? 0 : 1);
  const slots = [];
  for (let i = 0; i < QUIZ_TOTAL; i++) slots.push(i < objCount ? 'object' : 'scale');
  for (let i = slots.length - 1; i > 0; i--) {     // Fisher–Yates
    const j = Math.floor(Math.random() * (i + 1));
    const t = slots[i]; slots[i] = slots[j]; slots[j] = t;
  }

  state.quizQuestions = [];
  const used = new Set();
  const usedWp = [];
  slots.forEach(function (kind) {
    let z = state.zeOn ? randomZeLc() : 0;
    // Fit a random rod per question on a depth micrometer. Checking which rod
    // is in the instrument before reporting a depth is part of the procedure,
    // and a rod that never changes lets a student ignore it for five questions
    // and still score full marks.
    const rIdx = isDepth() ? Math.floor(Math.random() * getRods().length) : 0;
    if (kind === 'object') {
      const wp = pickExerciseWp(usedWp);
      usedWp.push(wp.id);
      state.quizQuestions.push({ kind: 'object', wp: wp, trueMm: wp.mm, zeLc: z, rodIdx: 0 });
      return;
    }
    const zeM = z * lcMm;
    const lo  = Math.max(lcMm * 10, -zeM + lcMm);
    const hi  = Math.min(maxMm - lcMm * 10, maxMm - zeM - lcMm);
    if (hi <= lo) { z = 0; }
    let trueMm, key, guard = 0;
    do {
      trueMm = snapToLc(lo + Math.random() * Math.max(lcMm, hi - lo));
      key = trueMm.toFixed(4) + '_' + z;
    } while (used.has(key) && ++guard < 50);
    used.add(key);
    state.quizQuestions.push({ kind: 'scale', trueMm: Math.max(0, Math.min(maxMm, trueMm)), zeLc: z, rodIdx: rIdx });
  });
  state.quizCurrent   = 0;
  state.quizAnswers   = [];
  state.quizAnswered  = false;
  $('quiz-result').style.display = 'none';
  $('quiz-bar').style.display    = '';
  $('quiz-q-total').textContent  = QUIZ_TOTAL;
  showQuizQuestion(0);
}

function showQuizQuestion(idx) {
  const q = state.quizQuestions[idx];
  state.zeLc = q.zeLc;
  // The question carries its own rod, so switching units or instruments
  // mid-quiz cannot silently re-key an answer that has already been asked.
  state.rodIdx = q.rodIdx || 0;
  buildRodPills();
  syncAnswerInput();
  state.quizAnswered = false;

  const isObj = q.kind === 'object';
  const hint = document.querySelector('.qbar-hint');
  if (isObj) {
    // The part is the question: the spindle arrives backed off and the student
    // has to close onto it before the scales mean anything.
    state.mm = getMaxMm();
    loadWorkpieceObj(q.wp, true);
    $('caliper-card').style.cursor = 'grab';
    if (hint) hint.innerHTML = 'Close the spindle onto the part &middot; then read the scales&nbsp;&uarr;';
  } else {
    if (state.wp) clearWorkpiece();
    state.mm = q.trueMm;
    $('caliper-card').style.cursor = 'default';
    if (hint) hint.innerHTML = 'Read the gauge &middot; type your answer above&nbsp;&uarr;';
  }

  $('quiz-q-num').textContent    = idx + 1;
  $('quiz-feedback').textContent = '';
  $('quiz-feedback').className   = 'quiz-feedback';
  $('btn-quiz-submit').style.display = '';
  $('btn-quiz-submit').disabled      = isObj;   // enabled by syncExerciseUi on contact
  $('btn-quiz-next').style.display   = 'none';
  $('reading-cells').classList.add('cells-hidden');
  $('tr-formula').classList.add('formula-hidden');
  $('readout-display').style.display = 'none';
  $('practice-input').style.display  = 'block';
  $('practice-input').value          = '';
  $('dr-label').textContent          = 'Your Reading';
  if (!isObj) setTimeout(() => $('practice-input').focus(), 50);
  render();
}

function submitQuizAnswer() {
  if (state.quizAnswered) return;
  if ($('btn-quiz-submit').disabled) return;   // object question: not on the part yet
  const raw   = ($('practice-input').value || '').trim();
  const input = parseNumericInput(raw);
  if (isNaN(input)) {
    $('quiz-feedback').textContent = 'Enter a valid number (e.g. 5.73).';
    $('quiz-feedback').className   = 'quiz-feedback err';
    return;
  }
  const q = state.quizQuestions[state.quizCurrent];
  const correctMm = q.trueMm;
  const correctStr = getCorrectDisplay(correctMm);
  const correctVal = parseFloat(correctStr);
  const tolerance = getLcDisplay() / 2 + 1e-6;
  // Two answers that PRINT the same are the same reading: the tool grades to
  // the instrument's own precision, so a typed value that renders as the very
  // string quoted back as the answer can never be marked wrong.
  const ok = Math.abs(input - correctVal) <= tolerance ||
             input.toFixed(isImperial() ? 3 : 2) === correctStr;

  state.quizAnswers.push({ given: input, correctMm, correctStr, ok });
  state.quizAnswered = true;

  $('readout-display').textContent   = fmtTotal(correctMm);
  $('readout-display').style.display = 'block';
  $('practice-input').style.display  = 'none';
  $('dr-label').textContent          = 'Measurement';
  $('reading-cells').classList.remove('cells-hidden');
  $('tr-formula').classList.remove('formula-hidden');
  $('btn-quiz-submit').style.display = 'none';

  if (ok) {
    $('quiz-feedback').innerHTML = '&#10003; Correct!';
    $('quiz-feedback').className = 'quiz-feedback ok';
    playSuccess();
  } else {
    $('quiz-feedback').innerHTML = `&#10007; Incorrect &nbsp;|&nbsp; You entered: <strong>${escHtml(raw)} ${uLabel()}</strong> &nbsp;|&nbsp; Answer: <strong>${correctStr} ${uLabel()}</strong>`;
    $('quiz-feedback').className = 'quiz-feedback err';
    playError();
  }
  const isLast = state.quizCurrent + 1 >= QUIZ_TOTAL;
  $('btn-quiz-next').innerHTML     = isLast ? '&#128202;&nbsp;Results' : 'Next &rarr;';
  $('btn-quiz-next').style.display = '';
  render();
}

function nextQuizQuestion() {
  state.quizCurrent++;
  if (state.quizCurrent >= QUIZ_TOTAL) showQuizResult();
  else showQuizQuestion(state.quizCurrent);
}

function showQuizResult() {
  if (state.wp) clearWorkpiece();
  $('caliper-card').style.cursor = 'default';
  $('quiz-bar').style.display    = 'none';
  $('quiz-result').style.display = '';

  const u = uLabel();
  const score     = state.quizAnswers.filter(a => a.ok).length;
  const filled    = n => '\u2605'.repeat(n) + '\u2606'.repeat(QUIZ_TOTAL - n);
  const scoreEl   = $('qr-score');
  const starsEl   = $('qr-stars');
  const verdictEl = $('qr-verdict');
  scoreEl.textContent = `${score} / ${QUIZ_TOTAL}`;

  if (score === QUIZ_TOTAL) { scoreEl.className='qr-score perfect'; starsEl.textContent=filled(QUIZ_TOTAL); starsEl.style.color='var(--gold)'; verdictEl.textContent='Perfect score! \uD83C\uDFAF'; }
  else if (score >= Math.ceil(QUIZ_TOTAL*0.8)) { scoreEl.className='qr-score good'; starsEl.textContent=filled(score); starsEl.style.color='var(--green)'; verdictEl.textContent='Great job! \uD83D\uDC4D'; }
  else if (score >= Math.ceil(QUIZ_TOTAL*0.6)) { scoreEl.className='qr-score good'; starsEl.textContent=filled(score); starsEl.style.color='var(--green)'; verdictEl.textContent='Good effort! \uD83D\uDCAA'; }
  else if (score >= 1) { scoreEl.className='qr-score poor'; starsEl.textContent=filled(score); starsEl.style.color='#ffb74d'; verdictEl.textContent='Keep practising! \uD83D\uDCAA'; }
  else { scoreEl.className='qr-score poor'; starsEl.textContent=filled(0); starsEl.style.color='var(--red)'; verdictEl.textContent='Try again! \uD83D\uDCAA'; }

  const rowsEl = $('qr-rows');
  rowsEl.innerHTML = '';
  state.quizAnswers.forEach((ans, i) => {
    const row = document.createElement('div');
    row.className = `qr-row ${ans.ok ? 'ok' : 'err'}`;
    row.innerHTML = `<span class="qr-qnum">Q${i+1}</span><span class="qr-correct">Correct: <strong>${ans.correctStr} ${u}</strong></span><span class="qr-given">Your answer: <strong>${ans.given} ${u}</strong></span><span class="qr-mark">${ans.ok ? '&#10003;' : '&#10007;'}</span>`;
    rowsEl.appendChild(row);
  });

  $('readout-display').textContent   = fmtTotal(state.mm);
  $('readout-display').style.display = 'block';
  $('reading-cells').classList.remove('cells-hidden');
  $('tr-formula').classList.remove('formula-hidden');
  $('dr-label').textContent = 'Measurement';
}

// ── Parts & Components explorer ───────────────────────────────────
// A labelled, hoverable anatomy diagram drawn as inline SVG (side view of an
// outside micrometer). One shared axis (y = 168) keeps anvil face, spindle,
// sleeve and thimble collinear, the way the real instrument is built.
const PARTS_DATA = [
  { z: 1, name: 'U-Frame (C-Frame)', sub: 'Rigid backbone of the instrument',
    hl: '<path {A} d="M118 138 H196 V202 H160 C96 202 74 262 96 302 C118 338 190 344 232 316 L252 336 C192 376 66 366 42 296 C24 240 56 168 118 168 Z"/>',
    b: [70, 150], lead: ['M70 150 L92 220'], dots: [[92, 220]],
    info: '<span class="pi-tag">Structure</span><h3>U-Frame (C-Frame)</h3>' +
      '<p>The drop-forged steel arc that carries everything else. Its whole job is <strong>rigidity</strong>: any flex between anvil and spindle appears directly in the reading, so the frame is deep, ribbed and deliberately heavy for its size.</p>' +
      '<ul><li>Holds the anvil and the barrel assembly in one rigid line</li><li>Plastic heat-insulating pads keep hand warmth out of the steel &mdash; a 1&nbsp;&deg;C rise in a 25&nbsp;mm frame is a couple of microns</li><li>Frame size fixes the range: 0&ndash;25, 25&ndash;50, 50&ndash;75&nbsp;mm are separate instruments</li></ul>' +
      '<div class="pi-tip"><strong>Workshop habit:</strong> hold the frame by the insulator pads, not the bare steel &mdash; and never clamp it in a vice without soft jaws.</div>' },
  { z: 2, name: 'Anvil', sub: 'Fixed measuring face',
    hl: '<rect {A} x="196" y="152" width="26" height="32" rx="2"/>',
    b: [166, 96], lead: ['M166 96 L206 148'], dots: [[206, 148]],
    info: '<span class="pi-tag">Measuring</span><h3>Anvil</h3>' +
      '<p>The <strong>fixed</strong> measuring face, pressed into the left end of the frame. The workpiece rests against it while the spindle closes in from the other side.</p>' +
      '<dl class="pi-spec"><dt>Face material</dt><dd>Tungsten carbide tip</dd><dt>Face finish</dt><dd>Lapped optically flat</dd><dt>Face &Oslash;</dt><dd>&asymp; 6.5 mm</dd></dl>' +
      '<div class="pi-tip"><strong>Check it:</strong> a worn or dinged anvil face shows as a zero error that no amount of careful reading will remove &mdash; test with an optical flat or a gauge block.</div>' },
  { z: 2, name: 'Spindle', sub: 'Moving measuring face',
    hl: '<rect {A} x="262" y="156" width="164" height="24" rx="3"/>',
    b: [318, 96], lead: ['M318 96 L330 152'], dots: [[330, 152]],
    info: '<span class="pi-tag">Measuring</span><h3>Spindle</h3>' +
      '<p>The moving face. Inside the barrel its shank carries a precision-ground <strong>0.5&nbsp;mm pitch thread</strong> &mdash; one full turn of the thimble advances it exactly half a millimetre. That screw is the measuring element; everything else just reads it.</p>' +
      '<ul><li>Face carbide-tipped and lapped, parallel to the anvil at every rotation</li><li>Hardened, ground and stabilised steel</li><li>Never spin the spindle onto the work &mdash; drive the last part-turn with the ratchet</li></ul>' +
      '<div class="pi-tip"><strong>Why 0.5 mm pitch:</strong> LC = pitch &divide; thimble divisions = 0.5 &divide; 50 = <strong>0.01 mm</strong>. The screw IS the instrument.</div>' },
  { z: 3, name: 'Lock Nut / Lock Lever', sub: 'Freezes the spindle',
    hl: '<rect {A} x="426" y="148" width="26" height="40" rx="4"/>',
    b: [430, 96], lead: ['M430 96 L439 144'], dots: [[439, 144]],
    info: '<span class="pi-tag">Control</span><h3>Lock Nut (Spindle Clamp)</h3>' +
      '<p>A knurled ring (a lever on some patterns) that clamps the spindle so the reading cannot drift while you take the instrument off the work and hold it up to read.</p>' +
      '<ul><li>Lock <em>after</em> the ratchet clicks, then withdraw and read</li><li>Also holds a size for comparative (go / no-go) checks</li><li>Clamp gently &mdash; it grips a precision screw, not a bolt</li></ul>' +
      '<div class="pi-tip"><strong>Habit to build:</strong> ratchet &rarr; lock &rarr; withdraw &rarr; read at eye level. It removes both drift and parallax in one move.</div>' },
  { z: 1, name: 'Sleeve / Barrel', sub: 'Carries main scale + datum',
    hl: '<rect {A} x="452" y="140" width="212" height="56" rx="4"/>',
    b: [520, 96], lead: ['M520 96 L540 138'], dots: [[540, 138]],
    info: '<span class="pi-tag">Scale</span><h3>Sleeve (Barrel)</h3>' +
      '<p>The stationary tube fixed to the frame. It is engraved with the <strong>datum line</strong> along its axis and the <strong>main scale</strong>, and the thimble sweeps over it as the spindle screws in and out.</p>' +
      '<ul><li>Stationary: everything on it is the fixed reference</li><li>On adjustable micrometers the sleeve can be rotated slightly with a C-spanner to zero the instrument</li></ul>' +
      '<div class="pi-tip"><strong>Reading rule:</strong> the thimble edge is the cursor. Read the last main-scale mark it has fully exposed &mdash; never the next one.</div>' },
  { z: 4, name: 'Main Scale', sub: 'mm above, half-mm below',
    hl: '<path {A} d="M456 144 H600 V166 H456 Z M456 170 H600 V192 H456 Z"/>',
    b: [575, 250], lead: ['M575 250 L560 196'], dots: [[560, 196]],
    info: '<span class="pi-tag">Scale</span><h3>Main Scale (Sleeve Scale)</h3>' +
      '<p>Whole millimetres are engraved <strong>above</strong> the datum line and the <strong>half-millimetre</strong> marks below it (layouts vary by maker). The Main Scale Reading is everything the thimble edge has uncovered.</p>' +
      '<div class="formula-box">MSR = whole mm + (0.5 mm if the half-mm mark is exposed)</div>' +
      '<p>Missing an exposed half-mm mark is <em>the</em> classic micrometer error &mdash; it puts you out by exactly 0.50&nbsp;mm, because the same thimble number returns every half millimetre.</p>' },
  { z: 5, name: 'Datum (Index) Line', sub: 'The reference line',
    hl: '<rect {A} x="456" y="164" width="208" height="8" rx="2"/>',
    b: [634, 96], lead: ['M634 96 L640 162'], dots: [[640, 162]],
    info: '<span class="pi-tag">Reading</span><h3>Datum (Reference) Line</h3>' +
      '<p>The single horizontal line engraved along the sleeve. The thimble division that sits on this line <em>is</em> the Circular Scale Reading &mdash; nothing else on the thimble matters.</p>' +
      '<ul><li>CSR = the thimble division aligned with this line</li><li>Read square-on: viewing at an angle shifts the apparent alignment (parallax)</li></ul>' +
      '<div class="pi-tip"><strong>Between divisions?</strong> A micrometer is read to its least count &mdash; take the nearer division, never interpolate tenths by eye (that is a vernier micrometer’s job).</div>' },
  { z: 1, name: 'Thimble', sub: 'Rotates with the spindle',
    hl: '<path {A} d="M664 118 H780 V218 H664 Z"/>',
    b: [722, 76], lead: ['M722 76 L722 114'], dots: [[722, 114]],
    info: '<span class="pi-tag">Structure</span><h3>Thimble</h3>' +
      '<p>The knurled sleeve your fingers turn. It is fixed to the spindle, so one revolution = one pitch = <strong>0.5&nbsp;mm</strong> of spindle travel, and its bevelled edge doubles as the cursor for the main scale.</p>' +
      '<ul><li>Bevelled edge carries the 50-division circular scale</li><li>Knurling gives fine fingertip control</li><li>Use it for the approach &mdash; hand feel varies; the final contact belongs to the ratchet</li></ul>' },
  { z: 4, name: 'Circular (Thimble) Scale', sub: '50 divisions × 0.01 mm',
    hl: '<path {A} d="M652 118 H676 V218 H652 Z"/>',
    b: [664, 260], lead: ['M664 260 L662 222'], dots: [[662, 222]],
    info: '<span class="pi-tag">Scale</span><h3>Circular Scale (Thimble Scale)</h3>' +
      '<p>Fifty divisions around the thimble’s bevel. Each division the datum line crosses is one least count of spindle travel.</p>' +
      '<div class="formula-box">LC = pitch &divide; divisions = 0.5 mm &divide; 50 = <strong>0.01 mm</strong></div>' +
      '<dl class="pi-spec"><dt>Metric</dt><dd>50 div &times; 0.01 mm = 0.5 mm/rev</dd><dt>Metric (fine)</dt><dd>100 div &times; 0.01 mm = 1 mm/rev</dd><dt>Imperial</dt><dd>25 div &times; 0.001&Prime; = 0.025&Prime;/rev</dd></dl>' +
      '<p>Because one revolution is only half a millimetre, the circular scale repeats twice per millimetre &mdash; which is exactly why the half-mm mark on the sleeve must never be missed.</p>' },
  { z: 2, name: 'Ratchet Stop', sub: 'Constant measuring force',
    hl: '<path {A} d="M780 148 H836 V188 H780 Z M836 154 H852 V182 H836 Z"/>',
    b: [822, 96], lead: ['M822 96 L816 144'], dots: [[816, 144]],
    info: '<span class="pi-tag">Control</span><h3>Ratchet Stop</h3>' +
      '<p>The small spring-loaded cap at the end of the thimble. Turn <em>it</em> for the final closing: when the measuring force reaches its preset value (roughly 5&ndash;10&nbsp;N) the ratchet slips and clicks instead of tightening further.</p>' +
      '<ul><li>Close on the work with <strong>2&ndash;3 clicks</strong>, every time, every operator</li><li>Removes the biggest human variable &mdash; grip strength</li><li>Skipping it flattens soft parts and springs the frame: both read wrong</li></ul>' +
      '<div class="pi-tip"><strong>Repeatability test:</strong> measure the same gauge block five times with the ratchet. The spread should be zero at 0.01 mm resolution.</div>' }
];

// Build the instrument artwork (static layer) as an SVG string.


// ── Inside micrometer: parts explorer ─────────────────────────────
// Callouts taken from the reference: carbide jaws, spindle, locking knob,
// sleeve, thimble, ratchet stop — plus the two things a photograph cannot
// label, which are the reversed sleeve scale and the fact that the jaws have
// width and so the instrument does not start at zero.
const PARTS_DATA_INSIDE = [
  { z: 3, name: 'Carbide jaws', sub: 'The two measuring faces',
    hl: '<rect {A} x="150" y="72" width="14" height="80" rx="3"/><rect {A} x="316" y="72" width="14" height="80" rx="3"/>',
    b: [214, 56], lead: ['M214 56 L162 78', 'M214 56 L322 78'], dots: [[162, 78], [322, 78]],
    info: '<span class="pi-tag">Measuring</span><h3>Carbide jaws</h3>' +
      '<p>Two hardened jaws that press <strong>outwards</strong> against the bore. What the instrument reads is the distance between their <em>outer</em> faces, so those two surfaces are the whole measurement &mdash; everything else just carries them.</p>' +
      '<ul><li>Tungsten carbide tips, lapped flat, for wear life in abrasive bores</li><li>The jaws have <strong>width</strong>: a closed instrument reads 5&nbsp;mm, not zero</li><li>Rock the instrument gently through the bore and take the <em>largest</em> reading &mdash; that is the true diameter</li></ul>' +
      '<div class="pi-tip"><strong>Why the largest reading:</strong> any tilt measures a chord, not the diameter, and every chord is shorter. The maximum you can find is the only reading that can be right.</div>' },

  { z: 1, name: 'Moving jaw', sub: 'Driven by the spindle',
    hl: '<path {A} d="M110 152 L110 196 L176 196 L176 150 L164 138 L150 138 Z"/>',
    b: [96, 250], lead: ['M96 250 L138 198'], dots: [[138, 198]],
    info: '<span class="pi-tag">Structure</span><h3>Moving jaw</h3>' +
      '<p>The jaw block on the end of the screw. Turning the thimble drives it away from the fixed jaw, so the jaws <strong>open</strong> as the reading grows &mdash; the opposite sense to an outside micrometer, whose faces close.</p>' +
      '<p>That reversal of direction is why the sleeve is engraved backwards; see <em>Scale on sleeve</em>.</p>' },

  { z: 2, name: 'Spindle', sub: 'The precision screw',
    hl: '<rect {A} x="176" y="160" width="124" height="20" rx="3"/>',
    b: [238, 268], lead: ['M238 268 L238 186'], dots: [[238, 186]],
    info: '<span class="pi-tag">Adjustment</span><h3>Spindle</h3>' +
      '<p>The same 0.5&nbsp;mm-pitch screw as every other micrometer in this family (40&nbsp;TPI in the inch instrument). One turn opens the jaws by exactly one pitch, and 25&nbsp;mm of travel is all the screw has &mdash; the range comes from the jaws, not the screw.</p>' +
      '<dl class="pi-spec"><dt>Pitch</dt><dd>0.5 mm (40 TPI imperial)</dd><dt>Travel</dt><dd>25 mm / 1 in</dd><dt>Least count</dt><dd>0.01 mm / 0.001 in</dd></dl>' },

  { z: 4, name: 'Locking lever', sub: 'Holds the reading',
    hl: '<circle {A} cx="330" cy="228" r="15"/>',
    b: [382, 300], lead: ['M382 300 L340 240'], dots: [[340, 240]],
    info: '<span class="pi-tag">Adjustment</span><h3>Locking lever</h3>' +
      '<p>A small lever on the barrel neck that clamps the spindle, so the setting survives being worked back out of the bore. On an inside micrometer this matters more than on any other pattern: you cannot read the scales while the jaws are down a hole.</p>' +
      '<div class="pi-tip"><strong>Sequence:</strong> find the largest reading, lock, withdraw, then read. Withdrawing an unlocked instrument drags the jaws on the bore and moves the setting.</div>' },

  { z: 1, name: 'Sleeve (barrel)', sub: 'Carries the main scale',
    hl: '<rect {A} x="365" y="140" width="299" height="56" rx="4"/>',
    b: [474, 322], lead: ['M474 322 L474 200'], dots: [[474, 200]],
    info: '<span class="pi-tag">Reading</span><h3>Sleeve (barrel)</h3>' +
      '<p>The fixed tube the thimble screws along, carrying the main scale. As on the depth micrometer, the thimble <strong>covers</strong> it as the reading grows.</p>' +
      '<dl class="pi-spec"><dt>Graduated</dt><dd>0.5 mm per division</dd><dt>Span</dt><dd>25 mm of screw travel</dd><dt>Direction</dt><dd>Numbered in reverse</dd></dl>' },

  { z: 5, name: 'Scale on sleeve', sub: 'Numbered BACKWARDS',
    hl: '<rect {A} x="380" y="146" width="266" height="26" rx="3"/>',
    b: [430, 76], lead: ['M430 76 L500 150'], dots: [[500, 150]],
    info: '<span class="pi-tag">Reading</span><h3>Scale on sleeve &mdash; and why it runs backwards</h3>' +
      '<p>The spindle extends <em>away</em> from the reading end as the jaws open, so the thimble travels towards the jaws and covers the sleeve. The sleeve is engraved to suit, and the main scale value is <strong>the first number hidden by the thimble</strong> &mdash; exactly as on a depth micrometer, and exactly the opposite of an outside one.</p>' +
      '<ul><li>Reading it the familiar way returns <strong>range &minus; actual</strong></li><li>Switch this simulator between Outside and Inside at the same setting and watch the numbering reverse</li></ul>' },

  { z: 1, name: 'Thimble', sub: 'Turned to open the jaws',
    hl: '<path {A} d="M676 118 H780 V218 H676 Z"/>',
    b: [726, 332], lead: ['M726 332 L726 220'], dots: [[726, 220]],
    info: '<span class="pi-tag">Adjustment</span><h3>Thimble</h3>' +
      '<p>50 divisions of 0.01&nbsp;mm around the bevel (25 of 0.001&Prime; in the inch instrument). Identical to the outside micrometer&rsquo;s &mdash; the arithmetic TR = MSR + (CSR &times; LC) is unchanged; only the direction and the jaw offset differ.</p>' },

  { z: 2, name: 'Ratchet stop', sub: 'Repeatable jaw pressure',
    hl: '<rect {A} x="780" y="148" width="72" height="40" rx="5"/>',
    b: [846, 300], lead: ['M846 300 L812 192'], dots: [[812, 192]],
    info: '<span class="pi-tag">Adjustment</span><h3>Ratchet stop</h3>' +
      '<p>Slips at a set torque so the jaws are opened against the bore with the same force every time. Over-tighten an inside micrometer and you do not compress the work &mdash; you spring the frame and bell-mouth the reading.</p>' +
      '<div class="pi-tip"><strong>Feel matters here:</strong> rock for the maximum while the ratchet is slipping, not before.</div>' },
];

// Same drawing grid as the other two diagrams, so the family reads as a family.
function partsInstrumentSvgInside() {
  let g = '';
  // End cap on the spindle.
  g += '<rect class="vc-metal" fill="url(#sgHead)" x="60" y="150" width="54" height="46" rx="8"/>';
  // Moving jaw block + its carbide jaw.
  g += '<path class="vc-metal" fill="url(#sgSteel)" d="M110 152 L110 196 L176 196 L176 150 L164 138 L150 138 Z"/>';
  g += '<rect class="vc-metal" fill="#dfe9e4" x="150" y="72" width="14" height="80" rx="3"/>';
  // Spindle between the blocks.
  g += '<rect class="vc-metal" fill="url(#sgSteel)" x="176" y="160" width="124" height="20" rx="3"/>';
  // Fixed jaw block + its carbide jaw.
  g += '<path class="vc-metal" fill="url(#sgSteel)" d="M300 150 L300 196 L366 196 L366 152 L330 138 L316 138 Z"/>';
  g += '<rect class="vc-metal" fill="#dfe9e4" x="316" y="72" width="14" height="80" rx="3"/>';
  // Locking knob.
  g += '<rect class="vc-metal" fill="url(#sgHead)" x="325" y="196" width="10" height="18"/>';
  g += '<circle class="vc-metal" fill="url(#sgHead)" cx="330" cy="228" r="15"/>';
  for (let a = 0; a < 180; a += 30) {
    const r1 = 15, x1 = 330 + r1 * Math.cos(a * Math.PI / 180), y1 = 228 + r1 * Math.sin(a * Math.PI / 180);
    g += '<line class="vc-etch" x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' +
         (660 - x1).toFixed(1) + '" y2="' + (456 - y1).toFixed(1) + '"/>';
  }
  // Sleeve.
  g += '<rect class="vc-metal" fill="url(#sgSteel)" x="365" y="140" width="299" height="56" rx="4"/>';
  g += '<line class="vc-tick-b" x1="392" y1="168" x2="662" y2="168"/>';
  // Main scale, REVERSED numbering — same generator as the depth diagram.
  for (let i = 0; i <= 12; i++) {
    const x = 400 + i * 20;
    const n = 12 - i;
    const maj = n % 5 === 0;
    g += '<line class="' + (maj ? 'vc-tick-b' : 'vc-tick') + '" x1="' + x + '" y1="168" x2="' + x + '" y2="' + (168 - (maj ? 16 : 11)) + '"/>';
    if (maj) g += '<text class="vc-num" font-size="11" text-anchor="middle" x="' + x + '" y="147">' + n + '</text>';
    if (i < 12) g += '<line class="vc-tick" x1="' + (x + 10) + '" y1="168" x2="' + (x + 10) + '" y2="179"/>';
  }
  // Thimble + bevel, ratchet — identical parts, identical drawing.
  g += '<path class="vc-metal" fill="url(#sgHead)" d="M676 118 H780 V218 H676 Z"/>';
  g += '<path class="vc-metal" fill="url(#sgSteel)" d="M652 128 L676 118 V218 L652 208 Z"/>';
  for (let i = 0; i <= 10; i++) {
    const y = 128 + i * 8;
    g += '<line class="' + (i % 5 === 0 ? 'vc-tick-b' : 'vc-tick') + '" x1="654" y1="' + y + '" x2="' + (i % 5 === 0 ? 672 : 666) + '" y2="' + y + '"/>';
  }
  g += '<text class="vc-num" font-size="10" text-anchor="middle" x="663" y="112">5</text>';
  g += '<text class="vc-num" font-size="10" text-anchor="middle" x="663" y="236">10</text>';
  for (let x = 682; x < 778; x += 6) g += '<line class="vc-etch" x1="' + x + '" y1="122" x2="' + x + '" y2="214"/>';
  g += '<rect class="vc-metal" fill="url(#sgHead)" x="780" y="148" width="56" height="40" rx="5"/>';
  for (let x = 784; x < 834; x += 5) g += '<line class="vc-etch" x1="' + x + '" y1="151" x2="' + x + '" y2="185"/>';
  g += '<rect class="vc-metal" fill="url(#sgSteel)" x="836" y="154" width="16" height="28" rx="4"/>';
  return g;
}

// ── Depth micrometer: parts explorer ──────────────────────────────
// Same drawing grid as the outside micrometer's diagram, so the two read as
// the same instrument family. The screw half (sleeve, thimble, ratchet) is
// deliberately drawn identically, because on the real tools it IS identical —
// what changes is the frame below it and which way the sleeve counts.
const PARTS_DATA_DEPTH = [
  { z: 1, name: 'Base', sub: 'Bridges the reference surface',
    hl: '<rect {A} x="196" y="108" width="56" height="192" rx="6"/>',
    b: [300, 336], lead: ['M300 336 L228 302'], dots: [[228, 302]],
    info: '<span class="pi-tag">Structure</span><h3>Base</h3>' +
      '<p>The flat casting that spans the hole or slot and rests on the surface you are measuring <em>from</em>. Everything the instrument reports is referred to this one face, so its flatness is the accuracy of the measurement.</p>' +
      '<ul><li>Typical bases run 63.5&nbsp;mm or 101.6&nbsp;mm long &mdash; longer bridges span wider slots but need a flatter surface</li><li>Must sit on a surface that is flat and clean; a chip under the base is a direct error</li><li>Held down by hand pressure only &mdash; rocking it changes the reading</li></ul>' +
      '<div class="pi-tip"><strong>Workshop habit:</strong> press the base down firmly at BOTH ends before turning the ratchet. A base that lifts at one end reads shallow.</div>' },

  { z: 4, name: 'Reference plane', sub: 'The face the depth is measured from',
    hl: '<rect {A} x="192" y="108" width="8" height="192" rx="2"/>',
    b: [126, 336], lead: ['M126 336 L196 288'], dots: [[196, 288]],
    info: '<span class="pi-tag">Measuring</span><h3>Reference plane</h3>' +
      '<p>The lapped underside of the base. Zero is set when the rod tip is exactly flush with this plane, which is why a depth micrometer is zeroed <strong>on a surface plate or a gauge block</strong>, never in mid-air.</p>' +
      '<dl class="pi-spec"><dt>Finish</dt><dd>Lapped flat</dd><dt>Zero check</dt><dd>Rod flush on a surface plate</dd><dt>Reads</dt><dd>0.00 mm at full retraction</dd></dl>' +
      '<div class="pi-tip"><strong>Check it:</strong> stand the base on a surface plate and run the rod down to contact. It must read exactly zero &mdash; anything else is a zero error to be applied to every reading.</div>' },

  { z: 2, name: 'Extension rod', sub: 'Interchangeable &mdash; sets the range',
    hl: '<rect {A} x="60" y="158" width="136" height="20" rx="4"/>',
    b: [86, 106], lead: ['M86 106 L120 156'], dots: [[120, 156]],
    info: '<span class="pi-tag">Measuring</span><h3>Extension rod</h3>' +
      '<p>The screw itself only travels <strong>25&nbsp;mm (or 1&nbsp;inch)</strong>. Range beyond that comes from swapping the rod, in 25&nbsp;mm / 1&nbsp;in steps &mdash; 0&ndash;25, 25&ndash;50, 50&ndash;75, 75&ndash;100&nbsp;mm and so on.</p>' +
      '<ul><li>The rod&rsquo;s base value <strong>adds</strong> to whatever the screw reads: a 50&ndash;75&nbsp;mm rod showing 12.34 on the scales is a depth of <strong>62.34&nbsp;mm</strong></li><li>The lapped end is the measuring face &mdash; never let it strike the bottom of the hole</li><li>Rods are clamped by the lock ring and must be seated fully before the cap is tightened</li></ul>' +
      '<div class="pi-tip"><strong>The classic slip:</strong> reading the scales perfectly and then forgetting the rod. Check which rod is fitted <em>before</em> you write the number down.</div>' },

  { z: 3, name: 'Lock ring', sub: 'Clamps the rod and the setting',
    hl: '<rect {A} x="276" y="132" width="28" height="72" rx="4"/>',
    b: [286, 82], lead: ['M286 82 L290 130'], dots: [[290, 130]],
    info: '<span class="pi-tag">Adjustment</span><h3>Lock ring</h3>' +
      '<p>The knurled collar that clamps the extension rod in its seat. It is not the spindle lock &mdash; that is the separate lever further along the barrel, which is what freezes a reading so it can be carried away from the work.</p>' +
      '<ul><li>Finger-tight only &mdash; a rod over-clamped can be pushed off its seat</li><li>Loosen fully before changing rods, or the seat is scored</li></ul>' +
      '<div class="pi-tip"><strong>After every rod change:</strong> re-zero on a surface plate. A rod that is not fully seated is a constant error on every reading that follows.</div>' },

  { z: 1, name: 'Sleeve (barrel)', sub: 'Carries the main scale',
    hl: '<rect {A} x="262" y="140" width="402" height="56" rx="4"/>',
    b: [466, 332], lead: ['M466 332 L466 200'], dots: [[466, 200]],
    info: '<span class="pi-tag">Reading</span><h3>Sleeve (barrel)</h3>' +
      '<p>The fixed tube the thimble screws along. It carries the main scale, and on a depth micrometer the thimble <strong>covers</strong> it as the rod goes deeper &mdash; the opposite of an outside micrometer, where the thimble uncovers the sleeve.</p>' +
      '<dl class="pi-spec"><dt>Graduated</dt><dd>0.5 mm per division (metric)</dd><dt>Span</dt><dd>25 mm / 1 in per rod</dd><dt>Direction</dt><dd>Numbered head &rarr; thimble</dd></dl>' },

  { z: 5, name: 'Scale on sleeve', sub: 'Numbered BACKWARDS',
    hl: '<rect {A} x="286" y="146" width="360" height="26" rx="3"/>',
    b: [430, 76], lead: ['M430 76 L500 150'], dots: [[500, 150]],
    info: '<span class="pi-tag">Reading</span><h3>Scale on sleeve &mdash; and why it runs backwards</h3>' +
      '<p>The single thing that makes a depth micrometer different to read. The screw drives the rod <em>into</em> the hole, so the thimble travels <strong>towards the base</strong> as the depth grows. The sleeve is therefore numbered from the head towards the thimble, and the main scale reading is <strong>the first number hidden by the thimble</strong> &mdash; not the last one revealed.</p>' +
      '<ul><li>Zero sits at <strong>full retraction</strong>, with the thimble at the far end of the sleeve</li><li>Read it like an outside micrometer and you get <strong>range &minus; actual</strong>: on a 25&nbsp;mm instrument a true 6&nbsp;mm depth reads as 19&nbsp;mm</li><li>The thimble numbers run the opposite way too, so turning to go deeper still counts up</li></ul>' +
      '<div class="pi-tip"><strong>This is the commonest depth-micrometer error there is.</strong> Switch this simulator between Outside and Depth at the same setting and watch the sleeve numbers reverse.</div>' },

  { z: 1, name: 'Thimble', sub: 'Turned to drive the rod',
    hl: '<path {A} d="M676 118 H780 V218 H676 Z"/>',
    b: [726, 332], lead: ['M726 332 L726 220'], dots: [[726, 220]],
    info: '<span class="pi-tag">Adjustment</span><h3>Thimble</h3>' +
      '<p>The knurled drum fixed to the screw. One full turn advances the rod by exactly one pitch &mdash; 0.5&nbsp;mm on the metric instrument, 0.025&nbsp;in on the 40&nbsp;TPI inch one.</p>' +
      '<dl class="pi-spec"><dt>Pitch</dt><dd>0.5 mm (40 TPI imperial)</dd><dt>Divisions</dt><dd>50 (25 imperial)</dd><dt>Least count</dt><dd>0.01 mm / 0.001 in</dd></dl>' +
      '<div class="pi-tip"><strong>Same screw as an outside micrometer.</strong> The arithmetic TR = MSR + (CSR &times; LC) is unchanged &mdash; only the direction of travel and the numbering differ.</div>' },

  { z: 4, name: 'Circumferential scale', sub: '50 divisions on the thimble',
    hl: '<path {A} d="M652 128 L676 118 V218 L652 208 Z"/>',
    b: [614, 80], lead: ['M614 80 L658 130'], dots: [[658, 130]],
    info: '<span class="pi-tag">Reading</span><h3>Circumferential scale</h3>' +
      '<p>The 50 divisions engraved round the thimble bevel. Each one is 0.01&nbsp;mm of rod travel, read against the datum line on the sleeve exactly as on an outside micrometer.</p>' +
      '<ul><li>Metric: 0.5&nbsp;mm &divide; 50 = <strong>0.01&nbsp;mm</strong></li><li>Imperial: 0.025&Prime; &divide; 25 = <strong>0.001&Prime;</strong></li><li>Numbered in the reverse rotational sense, so sinking the rod still counts up</li></ul>' },

  { z: 2, name: 'Ratchet stop', sub: 'Sets a repeatable contact force',
    hl: '<rect {A} x="780" y="148" width="72" height="40" rx="5"/>',
    b: [844, 300], lead: ['M844 300 L812 192'], dots: [[812, 192]],
    info: '<span class="pi-tag">Adjustment</span><h3>Ratchet stop</h3>' +
      '<p>Slips at a preset torque so every operator lands the rod on the bottom of the hole with the same force &mdash; about 5&ndash;10&nbsp;N. On a depth micrometer it matters more than on an outside one, because you cannot feel the contact through the frame.</p>' +
      '<div class="pi-tip"><strong>Always finish on the ratchet.</strong> Driving the rod down by the thimble can lift the base off the reference surface, which reads deep and can bruise the rod tip.</div>' },
];

// The depth micrometer's diagram. Screw half identical to the outside one by
// design; frame half replaced; sleeve numbered in reverse.
function partsInstrumentSvgDepth() {
  let g = '';
  // Base casting.
  g += '<rect class="vc-metal" fill="url(#sgHead)" x="196" y="108" width="56" height="192" rx="6"/>';
  // Lapped reference plane on its left face.
  g += '<rect class="vc-metal" fill="#e8f2ec" x="192" y="108" width="8" height="192" rx="2"/>';
  // Extension rod running out to the left, lapped end at the tip.
  g += '<rect class="vc-metal" fill="url(#sgSteel)" x="60" y="158" width="136" height="20" rx="4"/>';
  g += '<rect class="vc-metal" fill="#e8f2ec" x="60" y="158" width="6" height="20" rx="2"/>';
  // Sleeve / barrel.
  g += '<rect class="vc-metal" fill="url(#sgSteel)" x="262" y="140" width="402" height="56" rx="4"/>';
  // Lock ring.
  g += '<rect class="vc-metal" fill="url(#sgHead)" x="276" y="132" width="28" height="72" rx="4"/>';
  for (let x = 280; x < 302; x += 4) g += '<line class="vc-etch" x1="' + x + '" y1="135" x2="' + x + '" y2="201"/>';
  // Datum line.
  g += '<line class="vc-tick-b" x1="312" y1="168" x2="662" y2="168"/>';
  // Main scale — REVERSED numbering: graduation i carries (12 - i), so the
  // numbers fall left to right and the value at the thimble edge is the one
  // about to be hidden. Same generator as the outside diagram otherwise.
  for (let i = 0; i <= 12; i++) {
    const x = 460 + i * 16 - 144;
    const n = 12 - i;
    const maj = n % 5 === 0;
    g += '<line class="' + (maj ? 'vc-tick-b' : 'vc-tick') + '" x1="' + x + '" y1="168" x2="' + x + '" y2="' + (168 - (maj ? 16 : 11)) + '"/>';
    if (maj) g += '<text class="vc-num" font-size="11" text-anchor="middle" x="' + x + '" y="147">' + n + '</text>';
    if (i < 12) g += '<line class="vc-tick" x1="' + (x + 8) + '" y1="168" x2="' + (x + 8) + '" y2="179"/>';
  }
  // Thimble body + bevel with circular-scale ticks (identical to the outside).
  g += '<path class="vc-metal" fill="url(#sgHead)" d="M676 118 H780 V218 H676 Z"/>';
  g += '<path class="vc-metal" fill="url(#sgSteel)" d="M652 128 L676 118 V218 L652 208 Z"/>';
  for (let i = 0; i <= 10; i++) {
    const y = 128 + i * 8;
    g += '<line class="' + (i % 5 === 0 ? 'vc-tick-b' : 'vc-tick') + '" x1="654" y1="' + y + '" x2="' + (i % 5 === 0 ? 672 : 666) + '" y2="' + y + '"/>';
  }
  g += '<text class="vc-num" font-size="10" text-anchor="middle" x="663" y="112">5</text>';
  g += '<text class="vc-num" font-size="10" text-anchor="middle" x="663" y="236">10</text>';
  for (let x = 682; x < 778; x += 6) g += '<line class="vc-etch" x1="' + x + '" y1="122" x2="' + x + '" y2="214"/>';
  // Ratchet stop.
  g += '<rect class="vc-metal" fill="url(#sgHead)" x="780" y="148" width="56" height="40" rx="5"/>';
  for (let x = 784; x < 834; x += 5) g += '<line class="vc-etch" x1="' + x + '" y1="151" x2="' + x + '" y2="185"/>';
  g += '<rect class="vc-metal" fill="url(#sgSteel)" x="836" y="154" width="16" height="28" rx="4"/>';
  return g;
}

// Which catalogue the Explore panel is describing. Everything downstream asks
// this rather than naming PARTS_DATA, so the panel cannot show one instrument's
// callouts over the other's drawing.
function partsData()    { return { depth: PARTS_DATA_DEPTH, inside: PARTS_DATA_INSIDE, outside: PARTS_DATA }[instKey()]; }
function partsSvgBody() { return { depth: partsInstrumentSvgDepth, inside: partsInstrumentSvgInside, outside: partsInstrumentSvg }[instKey()](); }

function partsInstrumentSvg() {
  let g = '';
  // Frame: C-arc from the anvil block down and round to under the sleeve.
  g += '<path class="vc-metal" fill="url(#sgSteel)" d="M118 138 H196 V202 H160 C96 202 74 262 96 302 C118 338 190 344 232 316 L252 336 C192 376 66 366 42 296 C24 240 56 168 118 168 Z"/>';
  // Insulating pad on the frame arc.
  g += '<path class="vc-metal" fill="#2f3542" d="M60 250 C58 282 78 314 104 326 L96 338 C62 322 44 284 48 248 Z"/>';
  // Anvil block + face.
  g += '<rect class="vc-metal" fill="url(#sgSteel)" x="196" y="152" width="26" height="32" rx="2"/>';
  // Spindle rod (gap left deliberately between anvil face 222 and spindle tip 262).
  g += '<rect class="vc-metal" fill="url(#sgSteel)" x="262" y="156" width="164" height="24" rx="3"/>';
  // Lock nut.
  g += '<rect class="vc-metal" fill="url(#sgHead)" x="426" y="148" width="26" height="40" rx="4"/>';
  for (let x = 429; x < 450; x += 4) g += '<line class="vc-etch" x1="' + x + '" y1="151" x2="' + x + '" y2="185"/>';
  // Sleeve/barrel.
  g += '<rect class="vc-metal" fill="url(#sgSteel)" x="452" y="140" width="212" height="56" rx="4"/>';
  // Datum line.
  g += '<line class="vc-tick-b" x1="458" y1="168" x2="662" y2="168"/>';
  // Main scale: mm ticks above the datum (numbered 0,5,10), half-mm below.
  for (let i = 0; i <= 12; i++) {
    const x = 460 + i * 16;
    g += '<line class="' + (i % 5 === 0 ? 'vc-tick-b' : 'vc-tick') + '" x1="' + x + '" y1="168" x2="' + x + '" y2="' + (168 - (i % 5 === 0 ? 16 : 11)) + '"/>';
    if (i % 5 === 0) g += '<text class="vc-num" font-size="11" text-anchor="middle" x="' + x + '" y="147">' + i + '</text>';
    if (i < 12) g += '<line class="vc-tick" x1="' + (x + 8) + '" y1="168" x2="' + (x + 8) + '" y2="179"/>';
  }
  // Thimble body + bevel with circular-scale ticks.
  g += '<path class="vc-metal" fill="url(#sgHead)" d="M676 118 H780 V218 H676 Z"/>';
  g += '<path class="vc-metal" fill="url(#sgSteel)" d="M652 128 L676 118 V218 L652 208 Z"/>';
  for (let i = 0; i <= 10; i++) {
    const y = 128 + i * 8;
    g += '<line class="' + (i % 5 === 0 ? 'vc-tick-b' : 'vc-tick') + '" x1="654" y1="' + y + '" x2="' + (i % 5 === 0 ? 672 : 666) + '" y2="' + y + '"/>';
  }
  g += '<text class="vc-num" font-size="10" text-anchor="middle" x="663" y="112">45</text>';
  g += '<text class="vc-num" font-size="10" text-anchor="middle" x="663" y="236">40</text>';
  // Thimble knurling.
  for (let x = 682; x < 778; x += 6) g += '<line class="vc-etch" x1="' + x + '" y1="122" x2="' + x + '" y2="214"/>';
  // Ratchet stop: knurled drum + end cap.
  g += '<rect class="vc-metal" fill="url(#sgHead)" x="780" y="148" width="56" height="40" rx="5"/>';
  for (let x = 784; x < 834; x += 5) g += '<line class="vc-etch" x1="' + x + '" y1="151" x2="' + x + '" y2="185"/>';
  g += '<rect class="vc-metal" fill="url(#sgSteel)" x="836" y="154" width="16" height="28" rx="4"/>';
  return g;
}

function partOverlaySvg(p, num) {
  let s = '<g class="vc-part" data-num="' + num + '" tabindex="0" role="button" aria-label="' + p.name + '">';
  s += p.hl.replace(/\{A\}/g, 'class="vc-hl"');
  s += p.hl.replace(/\{A\}/g, 'class="vc-out"');
  p.lead.forEach(function (d) { s += '<path class="vc-lead" d="' + d + '"/>'; });
  p.dots.forEach(function (pt) { s += '<circle class="vc-dot" cx="' + pt[0] + '" cy="' + pt[1] + '" r="3.2"/>'; });
  s += '<circle class="vc-badge-bg" cx="' + p.b[0] + '" cy="' + p.b[1] + '" r="14"/>';
  s += '<text class="vc-badge-tx" x="' + p.b[0] + '" y="' + p.b[1] + '">' + num + '</text>';
  s += '</g>';
  return s;
}

// Records WHICH instrument's diagram is currently in the DOM, not merely that
// one is. A boolean here left the outside micrometer's ten callouts sitting
// over the depth micrometer's drawing.
let partsBuilt = null;

function buildPartsPanel() {
  const svgHost = $('parts-svg');
  const listEl  = $('parts-list');

  const wantKind = instKey();
  if (partsBuilt !== wantKind) {
    // Overlays paint largest-first (by z) so a small hotspot such as the datum
    // line always wins the pointer over the sleeve beneath it.
    const DATA = partsData();
    const order = DATA.map(function (p, i) { return { p: p, i: i }; })
      .sort(function (a, b) { return a.p.z - b.p.z || a.i - b.i; });

    let svg = '<svg viewBox="20 40 860 330" role="img" ' +
      'aria-label="Labelled diagram of ' + { depth: 'a depth micrometer showing its nine main parts',
        inside: 'a caliper-type inside micrometer showing its eight main parts',
        outside: 'a micrometer screw gauge showing its ten main parts' }[instKey()] + '" ' +
      'xmlns="http://www.w3.org/2000/svg">';
    svg += '<defs>' +
      '<linearGradient id="sgSteel" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="#8d95a3"/><stop offset="0.26" stop-color="#c3cbd6"/>' +
        '<stop offset="0.36" stop-color="#eef2f6"/><stop offset="0.56" stop-color="#aeb7c3"/>' +
        '<stop offset="0.80" stop-color="#cad2dc"/><stop offset="1" stop-color="#6d7583"/>' +
      '</linearGradient>' +
      '<linearGradient id="sgHead" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="#7c8492"/><stop offset="0.3" stop-color="#c8d0da"/>' +
        '<stop offset="0.55" stop-color="#9aa3b1"/><stop offset="1" stop-color="#626a77"/>' +
      '</linearGradient>' +
      '</defs>';
    svg += '<g>' + partsSvgBody() + '</g>';
    svg += '<g>';
    order.forEach(function (o) { svg += partOverlaySvg(o.p, o.i + 1); });
    svg += '</g></svg>';
    svgHost.innerHTML = svg;

    // The panel heading names the instrument it is describing. Left static it
    // told a student looking at a depth micrometer that they were looking at a
    // screw gauge, which is the one thing this section must not do.
    var ph = $('parts-heading');
    if (ph) ph.textContent = { depth:   'Parts of a Depth Micrometer',
                               inside:  'Parts of an Inside Micrometer',
                               outside: 'Parts of a Micrometer Screw Gauge' }[instKey()];

    listEl.innerHTML = '';
    DATA.forEach(function (p, i) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'part-row';
      row.setAttribute('role', 'listitem');
      row.innerHTML = '<span class="part-num">' + (i + 1) + '</span>' +
        '<span class="part-txt"><span class="part-name">' + p.name + '</span>' +
        '<span class="part-sub">' + p.sub + '</span></span>';
      row.addEventListener('click', function () { selectPart(i, true); });
      row.addEventListener('mouseenter', function () { selectPart(i, false); });
      listEl.appendChild(row);
    });
    listEl.addEventListener('mouseleave', function () { selectPart(state.partPin, false); });

    // Hover previews the part; click (and tap) pins it.
    svgHost.addEventListener('mouseover', function (e) {
      const g = e.target.closest ? e.target.closest('.vc-part') : null;
      if (g) selectPart(+g.getAttribute('data-num') - 1, false);
    });
    svgHost.addEventListener('mouseleave', function () { selectPart(state.partPin, false); });
    svgHost.addEventListener('click', function (e) {
      const g = e.target.closest ? e.target.closest('.vc-part') : null;
      if (g) { selectPart(+g.getAttribute('data-num') - 1, true); playClick(); }
    });
    svgHost.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const g = e.target.closest ? e.target.closest('.vc-part') : null;
      if (g) { e.preventDefault(); selectPart(+g.getAttribute('data-num') - 1, true); }
    });

    partsBuilt = wantKind;
  }

  selectPart(state.partPin, true);
}

function selectPart(idx, pin) {
  if (idx == null || idx < 0 || idx >= partsData().length) idx = 0;
  if (pin) state.partPin = idx;
  state.partIdx = idx;

  $('parts-svg').querySelectorAll('.vc-part').forEach(function (g) {
    g.classList.toggle('on', +g.getAttribute('data-num') - 1 === idx);
  });
  $('parts-list').querySelectorAll('.part-row').forEach(function (r, i) {
    r.classList.toggle('active', i === idx);
  });

  $('parts-info').innerHTML = partsData()[idx].info;
}

// ── Explore mode ──────────────────────────────────────────────────
const EXPLORE_DATA = [
  { cat: 'Parts & Components', parts: true, items: [] },
  { cat: 'Micrometer Types', items: [
    { icon: '\uD83D\uDD27', label: 'Outside Micrometer', sub: 'External dimensions',
      info: '<h3>Outside Micrometer</h3><p>The most common type, used to measure <strong>external dimensions</strong> — shaft diameters, plate thickness, wire gauge. Features an anvil, spindle, barrel (sleeve), thimble, and ratchet stop.</p><ul><li>Standard range: 0\u201325 mm (metric) or 0\u20131\u2033 (imperial)</li><li>Available in sets: 0\u201325, 25\u201350, 50\u201375 mm etc.</li><li>LC: 0.01 mm (metric) or 0.001\u2033 (imperial)</li></ul>' },
    { icon: '\u2B55', label: 'Inside Micrometer', sub: 'Internal dimensions',
      info: '<h3>Inside Micrometer</h3><p>Measures <strong>internal dimensions</strong> — bore diameters, slot widths, hole sizes. The jaws expand outward against the internal surface.</p><ul><li>Caliper type: small bores (5\u201330 mm)</li><li>Rod type: larger bores with extension rods</li><li>Reading technique is same as outside micrometer</li></ul>' },
    { icon: '\u2195\uFE0F', label: 'Depth Micrometer', sub: 'Depth measurement',
      info: '<h3>Depth Micrometer</h3><p>Measures <strong>depth of slots, steps, and holes</strong>. A flat base sits on the reference surface while the spindle drives a rod into the cavity.</p><ul><li>Base width: 63 mm or 100 mm</li><li>Interchangeable rods in 25 mm / 1&Prime; steps &mdash; the rod\'s base value <strong>adds</strong> to the scale reading</li><li>The sleeve is numbered <strong>backwards</strong>: the main scale value is the first number <em>hidden</em> by the thimble, not the last one revealed</li></ul><div class="pi-tip"><strong>This one is simulated.</strong> Set the <strong>Instrument</strong> pills to <strong>Depth</strong> in the controls bar to fit it, pick a rod, and read it for yourself.</div>' },
    { icon: '\uD83D\uDCDF', label: 'Digital Micrometer', sub: 'Electronic display',
      info: '<h3>Digital Micrometer</h3><p>Uses an <strong>electronic encoder</strong> and LCD display for direct reading. Eliminates parallax and interpolation errors.</p><ul><li>Resolution: 0.001 mm (10\u00D7 finer than mechanical)</li><li>Features: mm/inch toggle, zero-set, data output (SPC)</li><li>Battery-powered; requires careful handling</li></ul>' }
  ]},
  { cat: 'Least Count', items: [
    { icon: '50', label: '0.01 mm LC', sub: 'Metric 50-division',
      info: '<h3>0.01 mm Least Count (Metric)</h3><p>The standard metric micrometer. Pitch = <strong>0.5 mm</strong>, thimble has <strong>50 divisions</strong>.</p><div class="formula-box">LC = Pitch \u00F7 CSD = 0.5 mm \u00F7 50 = <strong>0.01 mm</strong></div><p><strong>Example:</strong> MSR = 5.50 mm, CSR = 23<br>TR = 5.50 + (23 \u00D7 0.01) = <strong>5.73 mm</strong></p>' },
    { icon: '25', label: '0.001\u2033 LC', sub: 'Imperial 25-division',
      info: '<h3>0.001\u2033 Least Count (Imperial)</h3><p>The standard imperial micrometer. Pitch = <strong>0.025\u2033</strong> (40 TPI), thimble has <strong>25 divisions</strong>.</p><div class="formula-box">LC = Pitch \u00F7 CSD = 0.025\u2033 \u00F7 25 = <strong>0.001\u2033</strong></div><p><strong>Example:</strong> MSR = 0.275\u2033, CSR = 14<br>TR = 0.275 + (14 \u00D7 0.001) = <strong>0.289\u2033</strong></p>' },
    { icon: '100', label: '1 mm \u00D7 100', sub: 'Metric, no half-mm mark',
      info: '<h3>1 mm Pitch, 100-Division Thimble</h3><p>The <em>same</em> least count as the usual metric micrometer, reached the other way round.</p><div class="formula-box">LC = Pitch \u00F7 CSD = 1 mm \u00F7 100 = <strong>0.01 mm</strong></div><p>Because the spindle advances a <strong>whole millimetre</strong> per turn, the sleeve carries <strong>only whole-millimetre graduations</strong> \u2014 there is no half-millimetre mark below the datum line at all.</p><p><strong>The same size, split two ways.</strong> A part measuring 5.73 mm reads:</p><dl class="pi-spec"><dt>0.5 mm \u00D7 50</dt><dd>5.50 + (23 \u00D7 0.01)</dd><dt>1 mm \u00D7 100</dt><dd>5.00 + (73 \u00D7 0.01)</dd></dl><div class="pi-tip">Switch between the two with the <strong>Screw</strong> pills and watch the barrel reading jump while the total stays put. Missing the half-millimetre mark \u2014 and reading 5.23 instead of 5.73 \u2014 is the commonest metric micrometer error there is; on this instrument it cannot happen.</div>' },
    { icon: '\uD83D\uDCD0', label: 'LC Formula', sub: 'General formula',
      info: '<h3>Least Count \u2014 General Formula</h3><div class="formula-box">LC = Pitch \u00F7 Number of Circular Scale Divisions</div><p>Where:<br>\u2022 <strong>Pitch</strong> = distance spindle moves per full revolution<br>\u2022 <strong>CSD</strong> = number of divisions on the thimble</p><p>Metric: 0.5 mm \u00F7 50 = 0.01 mm<br>Metric: 1 mm \u00F7 100 = 0.01 mm<br>Imperial: 0.025\u2033 \u00F7 25 = 0.001\u2033</p><p>Two different screws can reach the same least count \u2014 what changes is how the reading is <em>split</em> between the barrel and the thimble.</p>' },
    { icon: '\u2728', label: 'Vernier Micrometer', sub: '0.001 mm LC',
      info: '<h3>Vernier Micrometer (0.001 mm)</h3><p>Adds a <strong>vernier scale</strong> on the barrel with 10 divisions to further subdivide the thimble reading by 10\u00D7.</p><div class="formula-box">LC = 0.01 mm \u00F7 10 = <strong>0.001 mm</strong></div><p>Used in precision metrology labs where 0.01 mm is not sufficient. The vernier lines on the barrel indicate which thimble division is most closely aligned.</p>' }
  ]},
  { cat: 'Zero Error', items: [
    { icon: '\u2705', label: 'No Zero Error', sub: 'Perfect alignment',
      info: '<h3>No Zero Error</h3><p>When the spindle closes onto the anvil, the <strong>thimble zero aligns exactly</strong> with the datum line, and the barrel zero mark is just visible at the thimble edge.</p><ul><li>Close jaws gently using the ratchet stop</li><li>Check: thimble 0 aligns with datum line</li><li>Check: barrel shows exactly 0.00 mm</li></ul>' },
    { icon: '\u2795', label: 'Positive Error', sub: 'Thimble zero below datum',
      info: '<h3>Positive Zero Error</h3><p>When closed, the thimble zero is <strong>below the datum line</strong> (reading > 0). The micrometer over-reads.</p><div class="formula-box">Corrected = Observed \u2212 Zero Error</div><p><strong>Example:</strong> Zero error = +0.03 mm. Observed = 5.76 mm.<br>Corrected = 5.76 \u2212 0.03 = <strong>5.73 mm</strong>.</p>' },
    { icon: '\u2796', label: 'Negative Error', sub: 'Thimble zero above datum',
      info: '<h3>Negative Zero Error</h3><p>When closed, the thimble zero is <strong>above the datum line</strong> (reading < 0). The micrometer under-reads.</p><div class="formula-box">Corrected = Observed + |Zero Error|</div><p><strong>Example:</strong> Zero error = \u22120.02 mm (thimble shows 48).<br>ZE = \u2212(50 \u2212 48) \u00D7 0.01 = \u22120.02 mm.<br>Observed = 5.71 mm. Corrected = 5.71 + 0.02 = <strong>5.73 mm</strong>.</p>' },
    { icon: '\uD83D\uDD04', label: 'Zero Correction', sub: 'How to correct',
      info: '<h3>Zero Error Correction</h3><ol><li>Close the spindle onto the anvil using the <strong>ratchet stop</strong>.</li><li>Read the thimble division aligned with the datum line.</li><li>If thimble reads 0 \u2014 no error.</li><li>If thimble reads a positive number (e.g., 3) \u2014 ZE = +3 \u00D7 LC.</li><li>If thimble reads near max (e.g., 48 on 50-div) \u2014 ZE = \u2212(50\u221248) \u00D7 LC.</li><li>Apply: Corrected = Observed \u2212 ZE.</li></ol>' }
  ]},
  { cat: 'Reading Method', items: [
    { icon: '1\uFE0F\u20E3', label: 'Step 1: MSR', sub: 'Main Scale Reading',
      info: '<h3>Step 1 \u2014 Main Scale Reading (MSR)</h3><p>Look at the <strong>barrel scale</strong>. Count the whole millimetre (or 0.025\u2033) marks <strong>exposed by the thimble edge</strong>. Pay special attention to the <strong>half-millimetre mark</strong> (SI) \u2014 if it\'s visible, add 0.5 mm to your reading.</p><p><strong>SI:</strong> MSR = whole mm + (0.5 if half-mm mark visible).<br><strong>Imperial:</strong> MSR = count of 0.025\u2033 marks visible.</p>' },
    { icon: '2\uFE0F\u20E3', label: 'Step 2: CSR', sub: 'Circular Scale Reading',
      info: '<h3>Step 2 \u2014 Circular Scale Reading (CSR)</h3><p>Find the thimble division that aligns with the <strong>datum (reference) line</strong> on the barrel. This is the CSR.</p><p><strong>Tip:</strong> Use Zoom to magnify the reading area. In this simulator, the aligned division is clearly visible where the thimble edge meets the barrel.</p>' },
    { icon: '3\uFE0F\u20E3', label: 'Step 3: Calculate', sub: 'TR = MSR + CSR \u00D7 LC',
      info: '<h3>Step 3 \u2014 Calculate Total Reading</h3><div class="formula-box">TR = MSR + (CSR \u00D7 LC)</div><p><strong>SI:</strong> MSR = 5.50, CSR = 23 \u2192 TR = 5.50 + 0.23 = <strong>5.73 mm</strong></p><p><strong>Imperial:</strong> MSR = 0.275\u2033, CSR = 14 \u2192 TR = 0.275 + 0.014 = <strong>0.289\u2033</strong></p>' },
    { icon: '\u26A0\uFE0F', label: 'Common Errors', sub: 'Mistakes to avoid',
      info: '<h3>Common Reading Errors</h3><ul><li><strong>Missing the half-mm mark:</strong> The most common error \u2014 causes a 0.50 mm mistake. Always check if the half-mm line is visible.</li><li><strong>Parallax error:</strong> Reading the thimble at an angle. Look straight at the datum line.</li><li><strong>Over-tightening:</strong> Always use the ratchet stop to apply consistent force.</li><li><strong>Ignoring zero error:</strong> Check and correct before every measurement session.</li><li><strong>Wrong thimble division:</strong> Read the division aligned with the datum, not the nearest number.</li></ul>' }
  ]}
];

function buildExplorePanel() {
  var catEl  = $('explore-cats');
  var gridEl = $('explore-grid');
  var infoEl = $('explore-info');
  catEl.innerHTML = '';

  EXPLORE_DATA.forEach(function(cat, ci) {
    var btn = document.createElement('button');
    btn.className = 'pill' + (ci === state.exploreCat ? ' active' : '');
    btn.textContent = cat.cat;
    btn.addEventListener('click', function() {
      state.exploreCat = ci;
      state.exploreIdx = 0;
      buildExplorePanel();
    });
    catEl.appendChild(btn);
  });

  // The "Parts & Components" category swaps the icon grid for the interactive
  // anatomy diagram.
  var cat = EXPLORE_DATA[state.exploreCat];
  var wrap = $('parts-wrap');
  if (cat.parts) {
    gridEl.style.display = 'none';
    infoEl.style.display = 'none';
    wrap.style.display = '';
    buildPartsPanel();
    return;
  }
  wrap.style.display = 'none';
  gridEl.style.display = '';
  infoEl.style.display = '';

  var items = cat.items;
  gridEl.innerHTML = '';
  items.forEach(function(item, ii) {
    var btn = document.createElement('button');
    btn.className = 'is-btn' + (ii === state.exploreIdx ? ' active' : '');
    btn.innerHTML = '<span class="is-btn-icon">' + item.icon + '</span><span class="is-btn-label">' + item.label + '</span><span class="is-btn-sub">' + item.sub + '</span>';
    btn.addEventListener('click', function() {
      state.exploreIdx = ii;
      buildExplorePanel();
    });
    gridEl.appendChild(btn);
  });

  infoEl.innerHTML = items[state.exploreIdx].info;
}

// ── Workpiece picker / object bar / glide ─────────────────────────
// [SG-DEPTHWP-BEGIN]
// ── Depth features (measure a real feature) ───────────────────────
// `mm` is the TOTAL feature depth, so it is what the student must report —
// rod plus screw. `hh` is the cavity half-height in the section view, chosen
// so a keyway reads as a narrow notch and a bore as a wide one. Sizes are
// realistic shop values, not tidy ones, and two of them deliberately need a
// longer rod than the one the tool starts with.
const DEPTH_WORKPIECES = [
  { id: 'keyway', short: 'Keyway', name: 'Keyway in a 25 mm shaft', what: 'the keyway depth',
    mm: 4.00,  hh: 11, shape: 'keyway',
    note: 'DIN 6885 keyway for a 25 mm shaft: 8 mm wide, <strong>4.0 mm</strong> deep from the OD. The base bridges the shaft and the rod drops into the slot.' },
  { id: 'cbore', short: 'C\u2019bore', name: 'Counterbore, M8 cap screw', what: 'the counterbore depth',
    mm: 9.00,  hh: 16, shape: 'cbore',
    note: 'An ISO 4762 M8 socket head is 8 mm tall, so the counterbore is cut <strong>9.0 mm</strong> deep to bury it just below flush.' },
  { id: 'blind', short: 'Blind hole', name: 'Blind hole in a plate', what: 'the hole depth',
    mm: 12.50, hh: 15, shape: 'blind',
    note: 'A flat-bottomed blind hole, <strong>12.50 mm</strong> deep. Depth to the FLAT is what a drawing calls out \u2014 not to the drill point.' },
  { id: 'slot',  short: 'Slot', name: 'Slot in a fixture plate', what: 'the slot depth',
    mm: 18.00, hh: 22, shape: 'slot',
    note: 'A milled slot <strong>18.00 mm</strong> deep. Take the reading at several points along it \u2014 a worn cutter leaves the far end shallow.' },
  { id: 'housing', short: 'Housing', name: 'Bearing housing bore', what: 'the bore depth',
    mm: 32.00, hh: 34, shape: 'bore',
    note: 'A 6205 bearing seat, <strong>32.00 mm</strong> to the shoulder. Deeper than one screw travel \u2014 fit the <strong>25\u201350 mm</strong> rod.' },
  { id: 'die',   short: 'Die pocket', name: 'Pocket in a die block', what: 'the pocket depth',
    mm: 58.00, hh: 38, shape: 'pocket',
    note: 'A roughed die pocket <strong>58.00 mm</strong> deep. Needs the <strong>50\u201375 mm</strong> rod, and the base must span the pocket without rocking.' },
];


// ── Inside-micrometer bores ───────────────────────────────────────
// `mm` is the bore or slot size the jaws must span, so it is what the student
// reports. All six sit inside the instrument's real 5–30 mm range, and every
// value is a size the part is actually made to.
const INSIDE_WORKPIECES = [
  { id: 'guide',   short: 'Valve guide', name: 'Valve guide bore', what: 'the guide bore',
    mm: 7.00,  hh: 30, shape: 'bore-round', wall: 4.5, profile: 'tube', tall: 1.25,
    note: 'A 7 mm valve guide. Wear here is measured in hundredths \u2014 the guide is scrap long before the wear is visible.' },
  { id: 'slotw',   short: 'Slot', name: 'Slot in a fixture plate', what: 'the slot width',
    mm: 12.00, hh: 26, shape: 'bore-slot', wall: 11, profile: 'slot',
    note: 'A 12.00 mm milled slot. An inside micrometer spans the width where a caliper\u2019s inside jaws would rock.' },
  { id: 'brgid',   short: 'Bearing ID', name: '6203 bearing seat', what: 'the seat bore',
    mm: 17.00, hh: 34, shape: 'bore-round', wall: 8, profile: 'shoulder',
    note: 'A 6203 deep-groove bearing has a <strong>17.00 mm</strong> bore, so its housing seat is cut to suit.' },
  { id: 'tube',    short: 'Tube ID', name: 'Steel tube bore', what: 'the inside diameter',
    mm: 21.00, hh: 38, shape: 'bore-round', wall: 2, profile: 'tube', tall: 1.1,
    note: 'A 25 mm x 2 mm wall tube: 25 \u2212 2 \u2212 2 = <strong>21.00 mm</strong> inside. Take two readings at right angles \u2014 drawn tube is rarely round.' },
  { id: 'ring',    short: 'Ring gauge', name: 'Setting ring gauge', what: 'the certified bore',
    mm: 25.00, hh: 40, shape: 'bore-round', wall: 12, profile: 'ring',
    note: 'A <strong>25.000 mm</strong> setting ring. This is what an inside micrometer is ZEROED against \u2014 it has no anvil to close on.' },
  { id: 'cyl',     short: 'Cylinder', name: 'Small engine cylinder', what: 'the bore diameter',
    mm: 28.50, hh: 44, shape: 'bore-round', wall: 9, profile: 'cylinder',
    note: 'A 28.50 mm bore. Measure at top, middle and bottom: a worn cylinder is a taper, not a circle.' },
];
// [SG-DEPTHWP-END]

// Which catalogue the picker and the drawing are working from.
function wpSet() { return { depth: DEPTH_WORKPIECES, inside: INSIDE_WORKPIECES, outside: WORKPIECES }[instKey()]; }

// Does the fitted part belong on the instrument now selected? Each catalogue
// belongs to exactly one instrument — a bore is measured from inside it, a
// depth feature down from a reference face, an outside part across its faces —
// so the question is answered by the tool's own data rather than by a list
// repeated here. The outside micrometer additionally holds WP_EXERCISE,
// because Practice and Quiz fit those parts.
function wpFitsInstrument(wp) {
  if (!wp) return true;
  const own = wpSet() || [];
  for (let i = 0; i < own.length; i++) if (own[i].id === wp.id) return true;
  if (isOutside()) for (let i = 0; i < WP_EXERCISE.length; i++) if (WP_EXERCISE[i].id === wp.id) return true;
  return false;
}

let pickerBuilt = null;

// Never index WP_THUMBS directly. A shape with no entry produced an empty SVG —
// a tile with no icon, no error and no clue which catalogue was at fault.
function WP_THUMB(shape) {
  return WP_THUMBS[shape] || '<rect x="6" y="6" width="28" height="26" rx="3"/>';
}

const WP_THUMBS = {
  // Bores, for the inside micrometer. These were missing entirely: the tiles
  // rendered an EMPTY <svg> because WP_THUMBS[shape] was undefined, and nothing
  // errored. Hence WP_THUMB() below — a missing icon now shows a placeholder
  // rather than a blank square.
  'bore-round': '<circle cx="20" cy="19" r="16"/><circle cx="20" cy="19" r="9" fill="#0d1117"/>',
  'bore-slot':  '<rect x="4" y="5" width="32" height="28" rx="2"/><rect x="13" y="5" width="14" height="21" rx="1" fill="#0d1117"/>',
  keyway: '<rect x="4" y="6" width="32" height="26" rx="2"/><rect x="16" y="6" width="8" height="9" fill="#0d1117"/>',
  cbore:  '<rect x="4" y="6" width="32" height="26" rx="2"/><rect x="14" y="6" width="12" height="11" fill="#0d1117"/>',
  blind:  '<rect x="4" y="6" width="32" height="26" rx="2"/><rect x="15" y="6" width="10" height="15" fill="#0d1117"/>',
  slot:   '<rect x="4" y="6" width="32" height="26" rx="2"/><rect x="13" y="6" width="14" height="19" fill="#0d1117"/>',
  bore:   '<rect x="4" y="6" width="32" height="26" rx="2"/><rect x="11" y="6" width="18" height="21" fill="#0d1117"/>',
  pocket: '<rect x="4" y="4" width="32" height="30" rx="2"/><rect x="9" y="4" width="22" height="26" fill="#0d1117"/>',
  cylV:  '<rect x="16" y="4" width="8" height="30" rx="2"/>',
  bar:   '<rect x="17" y="5" width="6" height="28" rx="1"/>',
  ball:  '<circle cx="20" cy="19" r="12"/>',
  nut:   '<path d="M20 5 30 12 30 26 20 33 10 26 10 12 Z"/><circle cx="20" cy="19" r="5" fill="#0d1117"/>',
  drill: '<path d="M17 4 H23 V22 L20 34 L17 22 Z"/>'
};

function buildPicker() {
  const grid = $('obj-grid');
  if (!grid) return;
  // Rebuilt when the instrument changes: a depth micrometer measures features,
  // not parts, so the tiles are a different catalogue rather than the same one
  // relabelled. `pickerBuilt` records WHICH, for the same reason partsBuilt does.
  const want = instKey();
  if (pickerBuilt === want) return;
  pickerBuilt = want;
  grid.innerHTML = '';
  wpSet().forEach(function (wp) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'obj-tile';
    b.setAttribute('data-id', wp.id);
    const full = wp.name + ' — measure ' + wp.what;
    b.title = full;
    b.setAttribute('aria-label', full);
    b.innerHTML =
      '<svg viewBox="0 0 40 38" aria-hidden="true" fill="#aab6c8">' + WP_THUMB(wp.shape) + '</svg>' +
      '<span class="obj-tile-name">' + wp.short + '</span>';
    b.addEventListener('click', function () { loadWorkpiece(wp.id); });
    grid.appendChild(b);
  });
}

function togglePicker(open) {
  const pop = $('obj-picker');
  const fab = $('obj-fab');
  if (!pop) return;
  state.pickerOpen = (open === undefined) ? !state.pickerOpen : !!open;
  buildPicker();
  pop.style.display = state.pickerOpen ? '' : 'none';
  fab.classList.toggle('active', state.pickerOpen);
  fab.setAttribute('aria-expanded', String(state.pickerOpen));
  syncPickerSelection();
}

function syncPickerSelection() {
  const grid = $('obj-grid');
  if (!grid) return;
  grid.querySelectorAll('.obj-tile').forEach(function (t) {
    t.classList.toggle('active', !!state.wp && t.getAttribute('data-id') === state.wp.id);
  });
}

// Any hands-on input wins over an in-flight glide.
function cancelGlide() {
  if (state.wpRaf) { cancelAnimationFrame(state.wpRaf); state.wpRaf = null; }
}

// Ease the spindle to a target opening. Used to back it fully off when a part
// is dropped in, and to run it down onto the part from the object bar.
function glideJawsTo(target, onDone) {
  // A programmatic move is the tool driving the instrument, not the visitor's
  // hand. Blocking it would deadlock loading a part; release the lever instead.
  setLocked(false, true);
  cancelGlide();
  const from = state.mm;
  const dist = Math.abs(target - from);
  // A hidden tab suspends requestAnimationFrame; jump straight to the target.
  if (dist < 1e-6 || document.hidden) {
    state.mm = clampMm(target); render(); if (onDone) onDone(); return;
  }
  const dur = Math.max(280, Math.min(950, 260 + dist * 42));
  const t0 = performance.now();
  (function step(t) {
    // Clamped BELOW as well as above. A rAF timestamp is the frame's start
    // time, which can precede the performance.now() taken in the click handler
    // that started the glide; a negative k through the cubic ease throws the
    // spindle PAST its starting point, beyond full scale, for a frame.
    const k = Math.max(0, Math.min(1, (t - t0) / dur));
    const e = 1 - Math.pow(1 - k, 3);
    state.mm = from + (target - from) * e;
    render();
    if (k < 1) state.wpRaf = requestAnimationFrame(step);
    else { state.wpRaf = null; state.mm = clampMm(target); render(); if (onDone) onDone(); }
  })(t0);
}

function loadWorkpieceObj(wp, silent) {
  teachAbort();
  if (!wp) return;
  state.wp = wp;
  // Fit the rod the feature needs. Choosing a rod is setup, not the lesson —
  // the lesson is reading a backwards scale and remembering to ADD the rod, and
  // making someone re-pick a rod for every part buries that under errands. The
  // wrong-rod state is still fully reachable (change the rod by hand and the
  // instrument tells you), and Practice/Quiz still randomise it deliberately.
  if (isDepth() && state.mode === 'free') {
    const want = rodIdxFor(wp.mm);
    if (want >= 0) { state.rodIdx = want; buildRodPills(); }
  }
  // The part has to be in shot to be closed onto. The zoomed view is framed on
  // the thimble, with the anvil out of frame, and a press never starts a drag
  // while zoomed — so a zoom carried over from a Quiz scale question left the
  // next object question with no visible part and a dead thimble.
  closeZoom();
  // Bring the spindle inside the new part's legal range at once.
  state.mm = clampMm(state.mm);
  if (!silent) playClick();
  $('drag-hint').classList.add('hidden');
  state.hinted = true;
  objBarSig = '';
  updateObjBar();
  syncPickerSelection();
  // Real sequence: the instrument arrives fully backed off, then you run it
  // down onto the work with the ratchet. "Backed off" is opposite ends of the
  // range on the two instruments — spindle wide open on an outside micrometer,
  // rod fully RETRACTED (zero) on a depth one.
  glideJawsTo(isBore() ? 0 : getMaxMm(), updateObjBar);
}

function loadWorkpiece(id) {
  const wp = findWp(id);
  if (!wp) return;
  togglePicker(false);
  loadWorkpieceObj(wp);
}

function clearWorkpiece() {
  teachAbort();
  cancelGlide();
  state.wp = null;
  objBarSig = '';
  // Taking the part out hands Practice back to the Play/Pause drill.
  if (state.mode === 'practice') {
    $('btn-play').disabled = false;
    $('caliper-card').style.cursor = 'default';
  }
  updateObjBar();
  syncPickerSelection();
  render();
}

function snapToContact() {
  if (!state.wp) return;
  // wp.mm is the part's SIZE on an outside micrometer and the feature's TOTAL
  // DEPTH on a depth one — and the depth includes the rod, which the screw does
  // not travel. Gliding to wp.mm on a depth micrometer with a 25 mm rod fitted
  // would drive 25 mm past the floor of the hole.
  if (isBore() && rodFit() !== 'ok') return;
  glideJawsTo(isBore() ? wpMaxMm() : state.wp.mm,
    function () { playContact(); updateObjBar(); });
}

// The spindle is draggable in Simulate, and in a graded mode whenever a part is
// loaded — otherwise the student could not close onto it.
function canDragJaws() {
  return !state.locked && (state.mode === 'free' || !!state.wp);
}

// Called every frame: a graded answer may only be submitted once the spindle is
// actually on the part, so the button follows the contact state.
function syncExerciseUi() {
  if (!state.wp) return;
  const contact = wpInContact();
  if (state.mode === 'practice' && !state.answered) {
    const btn = $('btn-check');
    if (btn && btn.disabled === contact) btn.disabled = !contact;
  } else if (state.mode === 'quiz' && !state.quizAnswered) {
    const btn = $('btn-quiz-submit');
    if (btn && btn.disabled === contact) btn.disabled = !contact;
  }
}

let objBarSig = '';
function updateObjBar() {
  const bar = $('obj-bar');
  if (!bar) return;
  const wp = state.wp;
  const fab = $('obj-fab');
  if (fab) fab.classList.toggle('loaded', !!wp);
  if (!wp || state.mode === 'explore') { bar.style.display = 'none'; objBarSig = ''; return; }
  bar.style.display = '';

  const contact = wpInContact();
  const reveal = wpRevealAllowed();
  // Rebuilt from innerHTML — skip unless something shown has actually changed,
  // otherwise a drag would re-render it at 60 fps.
  const sig = [wp.id, contact, reveal, state.mode, state.unit, state.zeOn, state.zeLc,
               state.instrument, state.rodIdx, rodFit(),
               (contact && reveal) ? fmtTr(state.mm + getZeOffsetMm()) : ''].join('|');
  if (sig === objBarSig) return;
  objBarSig = sig;

  const u = uLabel();
  const trueDisp = isImperial() ? (wp.mm * MM_TO_IN).toFixed(3) : wp.mm.toFixed(2);
  const readDisp = fmtTr(state.mm + getZeOffsetMm());
  // What the instrument can actually resolve: the true size rounded to the LC.
  const resolvable = Math.round(wp.mm / getLcMm()) * getLcMm();
  const resDisp = isImperial() ? (resolvable * MM_TO_IN).toFixed(3) : resolvable.toFixed(2);
  const unresolved = Math.abs((isImperial() ? resolvable * MM_TO_IN : resolvable) -
                              (isImperial() ? wp.mm * MM_TO_IN : wp.mm)) > (isImperial() ? 4e-4 : 4e-3);

  // The two instruments do different things, so they say different things. A
  // depth micrometer has no "faces in contact" and no "spindle open" — its rod
  // bottoms in a feature, and the wrong rod is a state the outside micrometer
  // simply does not have.
  const bore = isBore();
  const fit   = rodFit();
  const contactLbl = bore ? (isInside() ? '&#10003; Jaws on the bore' : '&#10003; Rod bottomed')
                          : '&#10003; Faces in contact';
  let status;
  if (bore && fit !== 'ok') {
    const rods = getRods(), want = rodIdxFor(wp.mm);
    const span = isImperial() ? 1 : 25;
    status = '<span class="ob-state ob-open">Wrong rod fitted</span>' +
      '<span class="ob-msg">This feature is <strong>' + trueDisp + ' ' + u +
      '</strong> deep' + (want >= 0
        ? ' &mdash; fit the <strong>' + rods[want] + '&ndash;' + (rods[want] + span) + ' ' + u +
          '</strong> rod, then sink it.'
        : ', beyond every rod in the set.') + '</span>';
  } else if (!contact) {
    status = '<span class="ob-state ob-open">' + (bore ? (isInside() ? 'Jaws closed' : 'Rod retracted') : 'Spindle open') + '</span>' +
      '<span class="ob-msg">Drag the thimble <strong>left</strong> (or press <strong>&larr;</strong>) until ' +
      { depth:   'the rod bottoms in the feature.',
        inside:  'the jaws touch both walls of the bore.',
        outside: 'the spindle stops on the part.' }[instKey()] + '</span>';
  } else if (!reveal) {
    status = '<span class="ob-state ob-contact">' + contactLbl + '</span>' +
      '<span class="ob-msg">Now read the scales' + (bore ? (isInside() ? ', add the jaw width,' : ', add the rod,') : '') + ' and type your answer' +
      (state.zeOn ? ', applying the zero-error correction.' : '.') + '</span>';
  } else {
    status = '<span class="ob-state ob-contact">' + contactLbl + '</span>' +
      '<span class="ob-msg">Read the scales: <strong>' + readDisp + ' ' + u + '</strong>' +
      (state.zeOn ? ' &mdash; then apply the zero-error correction.' : '.') + '</span>';
  }

  let lesson = '';
  if (!reveal) {
    lesson = '';
  } else if (contact && unresolved) {
    lesson = '<div class="ob-lesson"><strong>Resolution limit:</strong> the part is truly ' +
      trueDisp + ' ' + u + ', but a ' + fmtLc() + ' ' + u +
      ' micrometer resolves it to <strong>' + resDisp + ' ' + u + '</strong>.</div>';
  } else if (contact && state.zeOn) {
    lesson = '<div class="ob-lesson"><strong>Zero error is on:</strong> the scales show ' + readDisp +
      ' ' + u + '. Subtract the zero error and you are back to the true ' + trueDisp + ' ' + u + '.</div>';
  }

  bar.innerHTML =
    '<div class="ob-head">' +
      '<svg class="ob-thumb" viewBox="0 0 40 38" aria-hidden="true" fill="#aab6c8">' + WP_THUMB(wp.shape) + '</svg>' +
      '<div class="ob-id"><span class="ob-name">' + wp.name + '</span>' +
      '<span class="ob-what">Measuring ' + wp.what + '</span></div>' +
      '<div class="ob-status">' + status + '</div>' +
      '<div class="ob-actions">' +
        '<button type="button" class="ob-btn" id="ob-snap"' +
          ((contact || (bore && fit !== 'ok')) ? ' disabled' : '') + '>&#8677; ' +
          (bore ? (isInside() ? 'Open onto the bore' : 'Sink the rod') : 'Close onto part') + '</button>' +
        // In Quiz the question owns the part, so it cannot be taken out.
        (state.mode === 'quiz' ? '' :
          '<button type="button" class="ob-btn ob-btn-x" id="ob-clear">Remove</button>') +
      '</div>' +
    '</div>' +
    '<div class="ob-note">' + wp.note + '</div>' + lesson;

  var sBtn = $('ob-snap'); if (sBtn) sBtn.addEventListener('click', snapToContact);
  var cBtn = $('ob-clear'); if (cBtn) cBtn.addEventListener('click', clearWorkpiece);
}

// Practice: two drills share the bar and never overlap — Play/Pause freezes the
// spindle at a random opening, Measure-an-object clamps a real part in it.
// Starting either one ends the other, so there is only ever a single target.
function practiceMeasureObject() {
  if (state.playing) stopAnim();
  if (state.zeOn) state.zeLc = randomZeLc();
  const wp = pickExerciseWp(state.wp ? [state.wp.id] : null);
  state.answered = false;
  $('practice-input').value = '';
  $('feedback').textContent = '';
  $('feedback').className   = 'feedback';
  $('reading-cells').classList.add('cells-hidden');
  $('tr-formula').classList.add('formula-hidden');
  $('readout-display').style.display = 'none';
  $('practice-input').style.display  = 'block';
  $('dr-label').textContent = 'Your Reading';
  $('btn-check').disabled = true;      // until the spindle is on the part
  $('btn-play').disabled  = true;      // Play would fight the clamp
  $('btn-play').innerHTML = '&#9654;&nbsp; Play';
  $('btn-play').classList.remove('playing');
  $('caliper-card').style.cursor = 'grab';
  loadWorkpieceObj(wp);
}

// ── Mode / unit management ────────────────────────────────────────
function setMode(mode) {
  teachAbort();
  if (state.playing) stopAnim();
  state.playing = false;
  if (state.animRaf) { cancelAnimationFrame(state.animRaf); state.animRaf = null; }

  state.mode = mode;
  $('practice-bar').style.display = 'none';
  $('quiz-bar').style.display     = 'none';
  $('quiz-result').style.display  = 'none';
  $('sec-explore').style.display  = 'none';

  var showCanvas = (mode !== 'explore');
  $('caliper-card').style.display = showCanvas ? '' : 'none';
  document.querySelector('.info-row').style.display = showCanvas ? '' : 'none';

  // The picker FAB is Simulate-only: Practice loads parts from its own button
  // and Quiz assigns them per question, so neither needs a free-choice picker.
  togglePicker(false);
  $('obj-fab').style.display = (mode === 'free') ? '' : 'none';
  if (mode !== 'free' && state.wp) clearWorkpiece();
  updateObjBar();

  if (mode === 'explore') {
    buildExplorePanel();
    $('sec-explore').style.display = '';
  } else if (mode === 'practice') {
    $('practice-bar').style.display = '';
    $('caliper-card').style.cursor  = 'default';
    state.dragging = false;
    state.score = 0; state.attempts = 0;
    $('score').textContent = '0'; $('attempts').textContent = '0';
    newPractice();
  } else if (mode === 'quiz') {
    $('caliper-card').style.cursor = 'default';
    state.dragging = false;
    startQuiz();
  } else {
    $('caliper-card').style.cursor = 'grab';
    $('readout-display').style.display = 'block';
    $('practice-input').style.display  = 'none';
    $('dr-label').textContent = 'Measurement';
    $('reading-cells').classList.remove('cells-hidden');
    $('tr-formula').classList.remove('formula-hidden');
    render();
  }
}

// The 100-division thimble is a metric-only instrument, so its selector is
// meaningless in Imperial and is hidden there rather than left to sit inert.
function syncThimbleUi() {
  var g = $('thimble-group');
  // Hidden in Imperial (no 100-division inch thimble exists) and on the depth
  // micrometer (which is built on the 0.5 mm screw). A pill that cannot change
  // the instrument is worse than no pill: it invites a student to believe in a
  // tool that is not made.
  if (g) g.style.display = (isImperial() || isBore()) ? 'none' : '';
  document.querySelectorAll('#thimble-toggle .pill').forEach(function (b) {
    b.classList.toggle('active', b.dataset.value === (is100() ? '100' : '50'));
  });
}

function setThimble(v) {
  teachAbort();
  state.thimble100 = (v === '100');
  // Both metric instruments read to 0.01 mm, so nothing needs re-snapping —
  // but a part held off the grid still has to be brought onto it, and the
  // spindle must stay inside the range whichever screw is fitted.
  state.mm   = clampMm(snapToLc(state.mm));
  state.zeLc = clampZeLc(state.zeLc);
  syncThimbleUi();
  if      (state.mode === 'practice') newPractice();
  else if (state.mode === 'quiz')     startQuiz();
  else                                render();
}

function setUnit(unit) {
  teachAbort();
  state.unit = unit;
  state.mm = clampMm(snapToLc(state.mm));
  state.zeLc = clampZeLc(state.zeLc);
  // The rod SET is unit-specific — 25 mm steps against 1 in steps — so the
  // pills are rebuilt rather than relabelled, and the fitted rod resets to the
  // base one instead of silently indexing into a different catalogue.
  state.rodIdx = 0;
  syncThimbleUi();
  buildRodPills();
  syncAnswerInput();
  if      (state.mode === 'practice') newPractice();
  else if (state.mode === 'quiz')     startQuiz();
  else                                render();
}

// ── Instrument + extension rod ────────────────────────────────────
// Captured on first use so the outside micrometer's hint survives a trip
// through Depth mode without being duplicated as a literal here.
let hintDefaultHtml = null;

function syncInstrumentUi() {
  document.querySelectorAll('#instrument-toggle .pill').forEach(function (b) {
    b.classList.toggle('active', b.dataset.value === state.instrument);
  });
  var rg = $('rod-group');
  if (rg) rg.style.display = isBore() ? '' : 'none';
  syncThimbleUi();
  buildRodPills();
  // The picker stays on both instruments, but its catalogue changes: an outside
  // micrometer measures parts, a depth micrometer measures FEATURES. Rebuilt
  // rather than relabelled.
  pickerBuilt = null;
  buildPicker();
  var fab = $('obj-fab');
  if (fab) {
    // Simulate-only, the same rule setMode applies. Showing it on every
    // instrument switch put a free-choice picker into Quiz, where it could
    // swap the question's part or take it out altogether ("None"), leaving an
    // object question whose Submit never re-enables.
    fab.style.display = (state.mode === 'free') ? '' : 'none';
    var tip = fab.querySelector('.obj-fab-tip');
    if (tip) tip.textContent = { depth: 'Measure a feature', inside: 'Measure a bore', outside: 'Measure an object' }[instKey()];
    fab.title = { depth: 'Measure a real feature', inside: 'Measure a real bore', outside: 'Measure a real object' }[instKey()];
  }
  // Both texts, both directions. Writing only the depth text left the hint
  // telling an outside micrometer's user to "sink the rod" for the rest of the
  // session — a one-way UI update is a bug that only shows on the way back.
  var hint = $('drag-hint');
  if (hint) {
    if (hintDefaultHtml === null) hintDefaultHtml = hint.innerHTML;
    var tail = '&nbsp;&nbsp;|&nbsp;&nbsp;Drag <strong>ratchet</strong> for fine&nbsp;&nbsp;|&nbsp;&nbsp;\u2191/\u2193 Arrow keys';
    hint.innerHTML = { depth:  '\u2190&nbsp;Drag <strong>thimble</strong> to sink the rod&nbsp;\u2192' + tail,
                       inside: '\u2190&nbsp;Drag <strong>thimble</strong> to open the jaws&nbsp;\u2192' + tail,
                       outside: hintDefaultHtml }[instKey()];
  }
}

// The answer box is a type=number, so it carries its own range contract:
// min/max/step decide what the spinner can reach and what the browser calls a
// valid value. Those three were written into index.html as SI outside-micrometer
// literals (step 0.01, max 15) and never moved again — so on the DEPTH
// micrometer, which reads to 25 mm, the field capped at 15 ("Value must be less
// than or equal to 15" for a correct 24.99 mm answer), and in Imperial the step
// stayed 0.01 in against a least count of 0.001 in, putting nine of every ten
// legal readings — 0.237 in among them — outside the step grid and out of the
// spinner's reach. Typed answers always graded correctly; it is the control
// that was lying about what it would accept. Derive all three from the
// instrument now in the student's hand.
function syncAnswerInput() {
  var el = $('practice-input');
  if (!el) return;
  var f    = isImperial() ? 25.4 : 1;          // mm per displayed unit
  var lcD  = getLcMm() / f;                    // one least count, displayed
  var maxD = (getBaseMm() + getMaxMm()) / f;   // full-scale READING, displayed
  var dp   = isImperial() ? 3 : 2;
  el.step        = String(+lcD.toFixed(6));
  el.min         = '0';
  el.max         = String(+maxD.toFixed(dp));
  el.placeholder = '?.' + new Array(dp + 1).join('?');
}

function buildRodPills() {
  var box = $('rod-toggle');
  if (!box) return;
  var rods = getRods();
  var u    = isImperial() ? 'in' : 'mm';
  var span = isImperial() ? 1 : 25;
  var idx  = getRodIdx();
  // The unit goes on the GROUP LABEL, not on every pill. Four pills each ending
  // in "mm" is 96 px of repeated noise two groups away from the SI/Imperial
  // toggle that already says it — and it was exactly the 96 px that pushed the
  // shortcuts onto a third line at every desktop width.
  var lbl = $('rod-label');
  box.innerHTML = '';

  // An inside micrometer's jaws are not interchangeable — the base is a fixed
  // property of the instrument. This row therefore STATES it rather than
  // offering a choice: a pill that cannot be pressed is worse than a readout.
  if (isInside()) {
    if (lbl) lbl.textContent = 'Jaws';
    var jb = getBaseMm(), jmax = getMaxMm();
    var jf = function (v) { return isImperial() ? (v * MM_TO_IN).toFixed(1) : v.toFixed(0); };
    var chip = document.createElement('span');
    chip.className = 'jaw-chip'; chip.id = 'jaw-chip';
    chip.textContent = jf(jb) + '\u2013' + jf(jb + jmax) + ' ' + u;
    chip.title = 'The jaws are ' + jf(jb) + ' ' + u + ' wide, so a closed instrument reads ' +
                 jf(jb) + ' ' + u + ', not zero. Bore = jaws + screw travel.';
    box.appendChild(chip);
    return;
  }

  if (lbl) lbl.textContent = 'Rod (' + u + ')';
  rods.forEach(function (base, i) {
    var b = document.createElement('button');
    b.className = 'pill' + (i === idx ? ' active' : '');
    b.type = 'button';
    b.dataset.value = String(i);
    b.textContent = base + '\u2013' + (base + span);
    b.title = 'Extension rod adding ' + base + ' ' + u +
              ' before the screw moves. Depth = rod + screw travel.';
    b.addEventListener('click', function () { setRod(i); });
    box.appendChild(b);
  });
}

function setRod(i) {
  teachAbort();
  state.rodIdx = i;
  buildRodPills();
  syncAnswerInput();
  if      (state.mode === 'practice') newPractice();
  else if (state.mode === 'quiz')     startQuiz();
  else                                render();
}

function setInstrument(v) {
  if (INSTRUMENTS.indexOf(v) < 0) return;
  teachAbort();
  state.instrument = v;
  // A part clamped in an outside micrometer has no meaning on a depth one, and
  // leaving it set would keep clampMm pinned to its width.
  //
  // This used to read `isBore() && state.wp`, which is evaluated AFTER
  // state.instrument has already changed — so it only ever fired on the way TO
  // a bore instrument. Coming back the other way the part survived: a 58 mm
  // die stayed clamped in a 0-15 mm outside micrometer, the readout printed
  // "58.00" against a sleeve graduated to 15, the status bar said "Faces in
  // contact - read the scales: 58.00 mm", and the thimble was drawn 180 px past
  // the end of the sleeve. Ask instead whether the part belongs on the
  // instrument now in the student's hand, which is symmetric by construction.
  if (state.wp && !wpFitsInstrument(state.wp)) clearWorkpiece();
  state.rodIdx = 0;
  // Re-seat the spindle: the two instruments have different ranges (15 mm of
  // usable outside travel against 25 mm of depth screw), so a reading valid on
  // one can sit outside the other.
  state.mm   = clampMm(snapToLc(state.mm));
  state.zeLc = clampZeLc(state.zeLc);
  syncInstrumentUi();
  syncAnswerInput();
  // The Explore panel caches its diagram; switching instrument must invalidate
  // it, and rebuild it now if the student is looking at it.
  state.partIdx = 0; state.partPin = 0;
  if (state.mode === 'explore') { buildPartsPanel(); buildExplorePanel(); }
  if      (state.mode === 'practice') newPractice();
  else if (state.mode === 'quiz')     startQuiz();
  else                                render();
}

function setZeroError(on) {
  teachAbort();
  state.zeOn = !!on;
  if (!state.zeOn) state.zeLc = 0;
  // Reflect toggle UI state
  document.querySelectorAll('#ze-toggle .pill').forEach(function(b){
    b.classList.toggle('active', b.dataset.value === (state.zeOn ? 'on' : 'off'));
  });
  if      (state.mode === 'practice') newPractice();
  else if (state.mode === 'quiz')     startQuiz();
  else                                render();
}

function bumpZe(delta) {
  if (!state.zeOn) return;
  teachAbort();
  state.zeLc = clampZeLc(state.zeLc + delta);
  if      (state.mode === 'practice') newPractice();
  else if (state.mode === 'quiz')     startQuiz();
  else                                render();
}

// ── Interaction ───────────────────────────────────────────────────
function getCanvasX(e) {
  var r = canvas.getBoundingClientRect();
  var cx = e.clientX !== undefined ? e.clientX
         : e.touches && e.touches.length ? e.touches[0].clientX
         : e.changedTouches[0].clientX;
  // Map CSS px → logical canvas px (CW), so drag deltas are in the same
  // units as pxPerMm (which is logical px/mm). This also corrects drag
  // sensitivity when the canvas renders narrower than CW (mobile / padding).
  return (cx - r.left) * (CW / r.width);
}

function getCanvasY(e) {
  var r = canvas.getBoundingClientRect();
  var cy = e.clientY !== undefined ? e.clientY
         : e.touches && e.touches.length ? e.touches[0].clientY
         : e.changedTouches[0].clientY;
  return (cy - r.top) * (CH / r.height);
}

// True when the pointer is on the knurled ratchet cap. drawGaugeContent runs
// inside the DS scale, so map the pointer back through DS to compare in world
// coords, and rebuild `shift` exactly as the renderer does so the zone tracks
// the thimble as it travels.
function isOnRatchet(e) {
  var shift = spriteShift(state.mm + getZeOffsetMm());
  var wx = getCanvasX(e) / DS;
  var wy = getCanvasY(e) / DS - bodyOffsetY();
  var x0 = OX.scaleX + shift;
  return wx >= x0 + RATCHET_X1 && wx <= x0 + RATCHET_X2 &&
         wy >= OX.thimbleY3 + RATCHET_Y1 && wy <= OX.thimbleY3 + RATCHET_Y2;
}

// Logical canvas px per CSS px — getCanvasX has already multiplied the pointer
// delta by this, so undo it where a gain is meant to be felt in screen px.
function canvasScale() {
  const w = canvas.getBoundingClientRect().width;
  return w > 0 ? CW / w : 1;
}

// mm of spindle travel per logical canvas px of drag. Fine = the drag began on
// the ratchet; otherwise the original 1:1 thimble mapping, untouched.
// Signed by scaleDir(), so the thimble always follows the pointer. On a depth
// micrometer the sprite travels the opposite way to the reading, so an
// unsigned mapping sent the thimble LEFT when the hand went right — direct
// manipulation that fights the hand is worse than no direct manipulation.
function dragMmPerPx() {
  const mag = state.dragFine
    ? getLcMm() / (RATCHET_PX_PER_DIV * canvasScale())
    : getPitch() / (getMsdPx() * DS);
  return mag * scaleDir();
}

// A first-run tip is in the way the moment the visitor has started, however
// they started. This used to fire only from the pointer path, so anyone driving
// the instrument from the keyboard read the tip for the whole session.
function dismissHint() {
  if (state.hinted) return;
  state.hinted = true;
  var h = $('drag-hint');
  if (h) h.classList.add('hidden');
}

// [SG-LOCK-BEGIN]
// ── The spindle lock, as a real control ───────────────────────────
// A micrometer's lock is a LEVER, not a nut: it pivots on the frame boss beside
// the spindle and lays back when clamped. Rotation is what makes the state
// readable at a glance — hardware that can only change colour cannot. All
// three instruments carry the same lever, so the control looks and behaves
// identically whichever one is fitted.
//
// ONE geometry funnel (lockAnchor -> lockLeverRect) and ONE state funnel
// (setLocked). Everything here is authored in WORLD coordinates, the same space
// drawGaugeContent draws in, so hit-testing maps the pointer back through DS
// and bodyOffsetY() exactly the way isOnRatchet() already does. A second
// mapping is how the ring ends up somewhere the lever is not.
const LOCK_R_PIVOT = 12;      // boss the lever turns on
const LOCK_R_TIP   = 6;       // rounded end of the teardrop
const LOCK_A_FREE  = Math.PI * 0.50;   // hangs straight down when released
const LOCK_A_LOCK  = Math.PI * 0.16;   // swung up and back when clamped
const LOCK_ANIM_MS = 190;     // the lever throws, it does not teleport
const LOCK_FLASH_MS = 900;

// Where the lever pivots on each casting. ONE lock on all three instruments,
// the same part in the same shape — the outside micrometer's frame boss beside
// the spindle, and on the two bodies with no frame the BARREL NECK between the
// base (or the fixed jaw) and the sleeve, which is where a depth or inside
// micrometer's lock actually sits. Each neck is wide enough to pivot on, and
// each pivot is on the barrel CENTRELINE so the tail clears the barrel's lower
// edge by a few px: a lever reads as sticking out of the casting, and only
// floats beside it when the pivot itself is off the metal.
function lockAnchor() {
  const cy = OX.scaleY;
  // Neck between the reference-plane flange and the sleeve.
  if (isDepth())  return { x: DEPTH_FLANGE_X + DEPTH_FLANGE_W + 44, y: cy, len: 40 };
  // Neck between the fixed jaw block and the sleeve.
  if (isInside()) return { x: INSIDE_FIXED_X + 32, y: cy, len: 40 };
  return { x: 470, y: 150, len: 44 };
}

// Eased 0 (free) -> 1 (locked). Read by the drawing AND by the hit box, so the
// target follows the lever through its throw instead of jumping ahead of it.
function lockAnimK() {
  const k = state.lockAnim;
  return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
}
function lockAngle() {
  return LOCK_A_FREE + (LOCK_A_LOCK - LOCK_A_FREE) * lockAnimK();
}

// World-space rect covering the pivot boss AND the swung tail, so the whole
// lever is the target however far through its throw it is.
function lockLeverRect() {
  const a  = lockAnchor();
  const an = lockAngle();
  const px = a.x, py = a.y;
  const tx = a.x + Math.cos(an) * a.len;
  const ty = a.y + Math.sin(an) * a.len;
  const x0 = Math.min(a.x - LOCK_R_PIVOT, tx - LOCK_R_TIP);
  const x1 = Math.max(a.x + LOCK_R_PIVOT, tx + LOCK_R_TIP);
  const y0 = Math.min(a.y - LOCK_R_PIVOT, ty - LOCK_R_TIP);
  const y1 = Math.max(a.y + LOCK_R_PIVOT, ty + LOCK_R_TIP);
  // Padded to the site's 44px tap floor, measured in CSS px: the canvas is
  // drawn through DS and then scaled again to fit the card, so a rect that is
  // comfortable in world units can be a 12px target on a phone.
  const padX = Math.max(0, (44 * canvasScale() / DS - (x1 - x0)) / 2);
  const padY = Math.max(0, (44 * canvasScale() / DS - (y1 - y0)) / 2);
  return { x: x0 - padX, y: y0 - padY, w: x1 - x0 + 2 * padX, h: y1 - y0 + 2 * padY,
           px: px, py: py, tx: tx, ty: ty };
}

// The lever is a control only at 1x and outside the walkthrough — the same
// states the spindle itself is driveable in. Zoomed, the world rect points at
// pixels that are no longer under it.
function lockLive() {
  return !teach.on && !state.zoomOpen && teachZoomBlend() === 0 && loadedCount >= SPRITE_COUNT;
}

function hitLockLever(e) {
  if (!lockLive()) return false;
  const r  = lockLeverRect();
  const wx = getCanvasX(e) / DS;
  const wy = getCanvasY(e) / DS - bodyOffsetY();
  return wx >= r.x && wx <= r.x + r.w && wy >= r.y && wy <= r.y + r.h;
}

// The ONLY writer of state.locked. The lever on the canvas and the toolbar
// button both come through here, so the two cannot disagree about whether the
// spindle is clamped.
let lockAnimRaf = null;
function setLocked(v, silent) {
  v = !!v;
  if (state.locked === v) { syncLockUi(); return; }
  state.locked    = v;
  state.dragging  = false;
  state.dragFine  = false;
  state.lockFlash = 0;
  if (!silent) { playClick(); announceLock(v ? 'Spindle locked.' : 'Spindle released.'); }
  syncLockUi();
  animateLock();
}

// The throw. A lock that snaps between two frames reads as a redraw glitch;
// 190ms reads as a lever being thrown.
function animateLock() {
  const from = state.lockAnim, to = state.locked ? 1 : 0;
  if (lockAnimRaf) { cancelAnimationFrame(lockAnimRaf); lockAnimRaf = null; }
  // A hidden tab suspends rAF, which would strand the lever mid-throw.
  if (document.hidden) { state.lockAnim = to; render(); return; }
  const t0 = performance.now();
  (function step(t) {
    const k = Math.max(0, Math.min(1, (t - t0) / LOCK_ANIM_MS));   // see glideJawsTo
    state.lockAnim = from + (to - from) * k;
    render();
    if (k < 1) lockAnimRaf = requestAnimationFrame(step);
    else { lockAnimRaf = null; state.lockAnim = to; render(); }
  })(t0);
}

function announceLock(msg) {
  const live = $('teach-live');
  if (live) live.textContent = msg;
}

function syncLockUi() {
  const btn = $('btn-lock');
  if (btn) {
    btn.classList.toggle('active', state.locked);
    btn.setAttribute('aria-pressed', state.locked ? 'true' : 'false');
    btn.title = state.locked
      ? 'Release the lock lever so the spindle can turn'
      : 'Throw the lock lever to freeze the reading';
    btn.setAttribute('aria-label', state.locked ? 'Unlock spindle' : 'Lock spindle');
    btn.innerHTML = (state.locked ? '&#128274;' : '&#128275;') +
      '<span class="zt-lbl">&nbsp;' + (state.locked ? 'Locked' : 'Lock') + '</span>';
  }
}

// A silent refusal is the confusion this exists to remove: every blocked
// attempt says so on the canvas AND to a screen reader. All FOUR movement
// paths — thimble drag, ratchet drag, wheel and arrow keys — come here.
let lockFlashRaf = null;
function nudgeLocked() {
  state.lockFlash = performance.now();
  announceLock('The spindle is locked. Release the lock lever to turn it.');
  if (lockFlashRaf) return;
  (function step() {
    const k = (performance.now() - state.lockFlash) / LOCK_FLASH_MS;
    if (k >= 1) { lockFlashRaf = null; state.lockFlash = 0; render(); return; }
    render();
    lockFlashRaf = requestAnimationFrame(step);
  })();
}

function lockFlashK() {
  if (!state.lockFlash) return 0;
  return Math.max(0, 1 - (performance.now() - state.lockFlash) / LOCK_FLASH_MS);
}

// The teardrop lever: the hull of the pivot boss and the smaller tip circle.
// Built from the two EXTERNAL tangents rather than as a tapered rectangle, so
// the casting keeps a continuous outline at every angle of the throw.
function lockLeverPath(px, py, tx, ty, r0, r1) {
  const L = Math.hypot(tx - px, ty - py);
  const a = Math.atan2(ty - py, tx - px);
  // Both tangent points share one normal direction when the tangent is
  // external, which is what keeps the outline smooth as r0 and r1 differ.
  const b  = Math.asin(Math.max(-1, Math.min(1, (r0 - r1) / L)));
  const nP = a + Math.PI / 2 + b;
  const nM = a - Math.PI / 2 - b;
  ctx.beginPath();
  ctx.arc(px, py, r0, nM, nP, true);
  ctx.arc(tx, ty, r1, nP, nM, true);
  ctx.closePath();
}

function drawLockLever() {
  if (!lockLive()) return;
  const r     = lockLeverRect();
  const flash = lockFlashK();

  ctx.save();

  // Seat shadow, so the lever reads as sitting proud of the casting.
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 3;
  lockLeverPath(r.px, r.py, r.tx, r.ty, LOCK_R_PIVOT, LOCK_R_TIP);
  ctx.fillStyle = '#20252d';
  ctx.fill();
  ctx.restore();

  // Body: a top-lit steel lever, darker than the frame so it reads as a
  // separate hardened part rather than more casting.
  lockLeverPath(r.px, r.py, r.tx, r.ty, LOCK_R_PIVOT, LOCK_R_TIP);
  const g = ctx.createLinearGradient(0, r.py - LOCK_R_PIVOT, 0, r.py + LOCK_R_PIVOT);
  g.addColorStop(0,    '#8a929e');
  g.addColorStop(0.35, '#cfd6df');
  g.addColorStop(0.62, '#79818d');
  g.addColorStop(1,    '#4b525c');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.60)'; ctx.lineWidth = 1; ctx.stroke();

  // Cross-slot pivot screw, as on the reference photographs.
  ctx.beginPath(); ctx.arc(r.px, r.py, 6.5, 0, Math.PI * 2);
  const sg = ctx.createLinearGradient(0, r.py - 6.5, 0, r.py + 6.5);
  sg.addColorStop(0, '#e6ebf1'); sg.addColorStop(1, '#6d747f');
  ctx.fillStyle = sg; ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 0.9; ctx.stroke();
  ctx.strokeStyle = 'rgba(20,24,30,0.85)'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
  // The slot turns WITH the lever: a screw head that stays upright while the
  // lever swings is the detail that makes the whole part look pasted on.
  const sa = lockAngle();
  for (const d of [0, Math.PI / 2]) {
    ctx.beginPath();
    ctx.moveTo(r.px + Math.cos(sa + d) * 4.2, r.py + Math.sin(sa + d) * 4.2);
    ctx.lineTo(r.px - Math.cos(sa + d) * 4.2, r.py - Math.sin(sa + d) * 4.2);
    ctx.stroke();
  }

  // State ring: gold when clamped, blue on hover, red while refusing.
  if (state.locked || state.lockHover || flash > 0) {
    const warn = flash > 0;
    const al = warn ? 0.35 + 0.65 * Math.abs(Math.sin(performance.now() / 110))
                    : (state.locked ? 0.92 : 0.65);
    ctx.strokeStyle = warn ? 'rgba(255,107,107,' + al + ')'
                    : state.locked ? 'rgba(255,193,7,' + al + ')'
                                   : 'rgba(79,142,247,' + al + ')';
    ctx.lineWidth = warn ? 2.6 : 2;
    lockLeverPath(r.px, r.py, r.tx, r.ty, LOCK_R_PIVOT + 3, LOCK_R_TIP + 3);
    ctx.stroke();
  }

  // Padlock on the pivot while clamped — the state has to survive the pointer
  // leaving the canvas, and read on a phone where there is no hover at all.
  if (state.locked && lockAnimK() > 0.55) {
    ctx.save();
    ctx.translate(r.px, r.py);
    ctx.fillStyle = 'rgba(12,16,22,0.78)';
    ctx.beginPath(); ctx.arc(0, 0, 8.6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ffd970'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, -2.0, 2.9, Math.PI, 0); ctx.stroke();
    ctx.fillStyle = '#ffd970';
    ctx.fillRect(-4.1, -2.0, 8.2, 6.4);
    ctx.restore();
  }
  ctx.restore();
  drawLockChip(r, flash);
}

// Chip: what a click will do, or why the spindle did not turn. The words are
// about the SPINDLE rather than about the hardware, so they read correctly on
// every instrument.
function drawLockChip(r, flash) {
  let chip = null, tone = '#8ab4ff';
  if (flash > 0)            { chip = 'Spindle locked — click to release'; tone = '#ff6b6b'; }
  else if (state.lockHover) { chip = state.locked ? 'Click to unlock' : 'Click to lock';
                              tone = state.locked ? '#ffd970' : '#8ab4ff'; }
  if (!chip) return;

  ctx.save();
  ctx.font = 'bold 12pt sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w  = ctx.measureText(chip).width + 20;
  // World space is CW/DS wide, not CW — holding the chip inside CW would let it
  // run off the right-hand edge on the depth and inside bodies.
  const WW = CW / DS;
  const cx = Math.max(w / 2 + 6, Math.min(WW - w / 2 - 6, r.px));
  // Above the pivot boss, and never off the top of the world.
  const cy = Math.max(15, r.py - LOCK_R_PIVOT - 20);
  ctx.fillStyle = 'rgba(8,12,18,0.92)';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(cx - w / 2, cy - 13, w, 26, 7);
  else ctx.rect(cx - w / 2, cy - 13, w, 26);
  ctx.fill();
  ctx.strokeStyle = tone; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.fillStyle = tone; ctx.fillText(chip, cx, cy);
  ctx.restore();
}
// [SG-LOCK-END]

function onDragStart(e) {
  teachAbort();
  // Zoomed, a press never started a drag, so it must not start a refusal
  // either — explaining something that was not attempted is just noise.
  if (state.zoomOpen) return;
  // The lever sits ON the instrument, so it has to claim the press BEFORE the
  // drag does, or clicking it would grab the thimble instead of the lever.
  if (hitLockLever(e)) { setLocked(!state.locked); e.preventDefault(); return; }
  if (state.locked) { nudgeLocked(); e.preventDefault(); return; }
  if (!canDragJaws()) return;
  cancelGlide();
  e.preventDefault();
  state.dragging  = true;
  state.dragFine  = isOnRatchet(e);
  state.dragRefX  = getCanvasX(e);
  state.dragRefMm = state.mm;
  dismissHint();
  playClick();
}

function onDragMove(e) {
  if (!state.dragging) return;
  var dx = getCanvasX(e) - state.dragRefX;
  var oldMm = state.mm;
  var wasContact = wpInContact();
  state.mm = clampMm(snapToLc(state.dragRefMm + dx * dragMmPerPx()));
  if (state.mm !== oldMm) playTick();
  if (!wasContact && wpInContact()) playContact();
  render();
  e.preventDefault();
}

function onDragEnd() { state.dragging = false; state.dragFine = false; }

// Hover feedback so the ratchet reads as its own control rather than more
// thimble. Only the canvas cursor is touched; the card's own cursor stands.
function onHoverMove(e) {
  if (state.dragging) return;
  // The lever outranks the thimble: it is a control even when the spindle is
  // locked, which is exactly when the visitor most needs to find it.
  const overLock = hitLockLever(e);
  if (overLock !== state.lockHover) { state.lockHover = overLock; render(); }
  if (overLock)       { canvas.style.cursor = 'pointer'; return; }
  if (state.locked)   { canvas.style.cursor = 'not-allowed'; return; }
  if (state.zoomOpen || !canDragJaws()) { canvas.style.cursor = ''; return; }
  canvas.style.cursor = isOnRatchet(e) ? 'ew-resize' : 'grab';
}

function onWheel(e) {
  teachAbort();
  // The wheel is a third way to turn the spindle, and a lock it walks straight
  // through is not a lock.
  if (state.locked && !state.zoomOpen) { nudgeLocked(); e.preventDefault(); return; }
  if (!canDragJaws()) return;
  cancelGlide();
  var lcMm = getLcMm();
  state.mm = clampMm(snapToLc(state.mm + (e.deltaY > 0 ? lcMm : -lcMm)));
  playTick();
  render();
  e.preventDefault();
}

function onKeyDown(e) {
  var inInput = document.activeElement === $('practice-input');
  // With a workpiece loaded, the arrows belong to the spindle even while the
  // answer input has focus — otherwise a keyboard user could never close onto
  // the part in a graded question (the branches preventDefault, so the number
  // input's own caret/spinner never reacts).
  var arrows = (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown');
  if (inInput && e.key !== 'Enter' && !(state.wp && arrows)) return;

  if (teach.on) return;
  if (e.key === 'Enter') {
    if (state.mode === 'practice') checkAnswer();
    else if (state.mode === 'quiz') submitQuizAnswer();
    return;
  }
  if (e.key === 'z' || e.key === 'Z') {
    setZoom(!state.zoomOpen);
    return;
  }
  // The fourth way to turn the spindle. Guarded here rather than inside the
  // four arrow branches, so a fifth key added later cannot slip past the lock.
  if (state.locked && arrows) { nudgeLocked(); e.preventDefault(); return; }
  if (!canDragJaws()) return;
  teachAbort();

  dismissHint();
  var step = e.shiftKey ? getPitch() : getLcMm();
  // Up/Down are VALUE keys — up is always more depth. Left/Right are SPATIAL:
  // they move the thimble the way it is drawn, which is the opposite sense on
  // a reversed instrument. Mapping both pairs to the value made Right disagree
  // with the drag it sits next to in the hint.
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    var spatial = (e.key === 'ArrowRight') ? scaleDir() : -scaleDir();
    cancelGlide();
    var wasC = wpInContact();
    state.mm = clampMm(snapToLc(state.mm + spatial * step));
    playTick();
    if (!wasC && wpInContact()) playContact();
    render(); e.preventDefault();
    return;
  }
  if (e.key === 'ArrowUp') {
    cancelGlide();
    state.mm = clampMm(snapToLc(state.mm + step));
    playTick(); render(); e.preventDefault();
  } else if (e.key === 'ArrowDown') {
    cancelGlide();
    var wasContact = wpInContact();
    state.mm = clampMm(snapToLc(state.mm - step));
    playTick();
    if (!wasContact && wpInContact()) playContact();
    render(); e.preventDefault();
  }
}

// ── Event wiring ──────────────────────────────────────────────────
canvas.addEventListener('mouseleave', function () {
  if (!state.lockHover) return;
  state.lockHover = false; canvas.style.cursor = ''; render();
});
canvas.addEventListener('mousedown',  onDragStart);
canvas.addEventListener('mousemove',  onHoverMove);
window.addEventListener('mousemove',  onDragMove);
window.addEventListener('mouseup',    onDragEnd);
canvas.addEventListener('touchstart', onDragStart, { passive: false });
canvas.addEventListener('touchmove',  onDragMove,  { passive: false });
canvas.addEventListener('touchend',   onDragEnd);
canvas.addEventListener('wheel',      onWheel,     { passive: false });
window.addEventListener('keydown',    onKeyDown);

document.querySelectorAll('#mode-tabs .pill').forEach(function(btn) {
  btn.addEventListener('click', function() {
    document.querySelectorAll('#mode-tabs .pill').forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active');
    setMode(btn.dataset.value);
  });
});

document.querySelectorAll('#unit-toggle .pill').forEach(function(btn) {
  btn.addEventListener('click', function() {
    document.querySelectorAll('#unit-toggle .pill').forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active');
    setUnit(btn.dataset.value);
  });
});

document.querySelectorAll('#thimble-toggle .pill').forEach(function(btn) {
  btn.addEventListener('click', function() { setThimble(btn.dataset.value); });
});

document.querySelectorAll('#instrument-toggle .pill').forEach(function(btn) {
  btn.addEventListener('click', function() { setInstrument(btn.dataset.value); });
});

// ── Deep link: open straight into an instrument ───────────────────
// /tools/screw-gauge/?instrument=depth  (also accepts #depth)
// The landing page carries a Depth Micrometer tile pointing here, and a tile
// that dropped you on the outside micrometer would be a bounce. Only the
// instrument is accepted — this is a shortcut into a mode, not a general state
// loader, and anything it does not recognise is ignored rather than guessed at.
//
// Read BEFORE the first syncInstrumentUi() so the page paints once, in the
// right instrument, instead of flashing the outside micrometer first.
(function applyDeepLink() {
  var want = null;
  try {
    var q = new URLSearchParams(location.search).get('instrument');
    if (q) want = String(q).toLowerCase();
    else if (location.hash === '#depth' || location.hash === '#outside') want = location.hash.slice(1);
  } catch (e) { /* URLSearchParams is everywhere we support; never break the page over a URL */ }
  // Checked against the instrument list rather than a hand-written pair. The
  // pair form silently dropped ?instrument=inside the day a third instrument
  // was added — the deep link fell back to the outside micrometer and nothing
  // failed. A whitelist that has to be edited per instrument is a whitelist
  // that will be forgotten.
  if (INSTRUMENTS.indexOf(want) < 0) return;
  state.instrument = want;
  state.rodIdx = 0;
  state.mm = clampMm(snapToLc(state.mm));
})();

syncInstrumentUi();
syncAnswerInput();   // derive the answer box's range from the opening instrument

$('btn-zoom').addEventListener('click', function() { setZoom(!state.zoomOpen); });

$('btn-play').addEventListener('click', function() {
  // Disabled while a part is clamped, but if one is somehow loaded, take it out
  // rather than animate against the stop.
  if (state.wp) { clearWorkpiece(); newPractice(); return; }
  if (state.playing) stopAnim(); else startAnim();
});
var btnObj = $('btn-obj');
if (btnObj) btnObj.addEventListener('click', practiceMeasureObject);

// ── Workpiece picker wiring ───────────────────────────────────────
var objFab = $('obj-fab');
if (objFab) objFab.addEventListener('click', function () { togglePicker(); });
var objClose = $('obj-picker-close');
if (objClose) objClose.addEventListener('click', function () { togglePicker(false); });
var objNone = $('obj-none');
if (objNone) objNone.addEventListener('click', function () { clearWorkpiece(); togglePicker(false); });
window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && state.pickerOpen) togglePicker(false); });
$('btn-new').addEventListener('click', newPractice);
$('btn-check').addEventListener('click', checkAnswer);

$('btn-quiz-submit').addEventListener('click', submitQuizAnswer);
$('btn-quiz-next').addEventListener('click', nextQuizQuestion);
$('btn-quiz-retry').addEventListener('click', function() {
  $('quiz-result').style.display = 'none';
  $('quiz-bar').style.display    = '';
  startQuiz();
});

$('practice-input').addEventListener('keydown', function(e) {
  if (e.key !== 'Enter') return;
  if (state.mode === 'practice') checkAnswer();
  else if (state.mode === 'quiz') submitQuizAnswer();
});

$('practice-input').addEventListener('input', function() {
  if (state.mode === 'practice' && !state.playing && !state.answered) {
    // With a part loaded, contact — not typing — is what arms the button.
    $('btn-check').disabled = state.wp ? !wpInContact()
                                       : $('practice-input').value === '';
  }
});

// ── Zero Error controls ───────────────────────────────────────────
document.querySelectorAll('#ze-toggle .pill').forEach(function(btn) {
  btn.addEventListener('click', function() {
    setZeroError(btn.dataset.value === 'on');
  });
});
var zeDec = $('ze-dec'); if (zeDec) zeDec.addEventListener('click', function(){ bumpZe(-1); });
var zeInc = $('ze-inc'); if (zeInc) zeInc.addEventListener('click', function(){ bumpZe(+1); });

// [SG-TEACHUI-BEGIN]
// Keeps the DOM in step with the walkthrough. Called from every tick, so it is
// guarded against redundant writes: a textContent write per frame on the live
// region would make a screen reader announce the same line sixty times a second.
var _teachLive = '';
function teachSyncUi() {
  var bar  = $('teach-bar'), how = $('btn-how');
  var live = $('teach-live'), play = $('btn-teach-play');
  if (bar) bar.hidden = !teach.on;
  if (how) {
    how.hidden = !teachAllowed();
    how.classList.toggle('running', teach.on);
  }
  // The instrument is frozen while the walkthrough runs; the drag hint and the
  // object FAB would both sit under the caption band, so they stand down.
  var card = $('caliper-card');
  if (card) card.classList.toggle('teach-running', teach.on);

  if (!teach.on) {
    teachLight(null); teachRows({ i: -1, key: '' });
    if (live && _teachLive) { live.textContent = ''; _teachLive = ''; }
    return;
  }

  var at = teachAt();
  teachLight(at.stage.tile);
  teachRows(at);
  if (play) {
    var done = teach.t >= teach.total;
    play.textContent = done ? '\u21BB' : (teach.playing ? '\u23F8' : '\u25B6');
    play.setAttribute('aria-label', done ? 'Replay' : (teach.playing ? 'Pause' : 'Play'));
  }
  if (live) {
    var cap = teachCaption();
    var say = cap[0] + '. ' + cap[1];
    if (say !== _teachLive) { live.textContent = say; _teachLive = say; }
  }
}

var btnHow = $('btn-how');
if (btnHow) btnHow.addEventListener('click', function () {
  if (teach.on) teachStop(); else teachStart();
});
var _tb;
if ((_tb = $('btn-teach-play'))) _tb.addEventListener('click', teachPlayPause);
if ((_tb = $('btn-teach-next'))) _tb.addEventListener('click', function () { teachStep(1); });
if ((_tb = $('btn-teach-prev'))) _tb.addEventListener('click', function () { teachStep(-1); });
if ((_tb = $('btn-teach-exit'))) _tb.addEventListener('click', teachStop);

document.addEventListener('keydown', function (e) {
  if (!teach.on) return;
  // Never swallow a key the user meant for a field.
  var t = e.target, tag = t && t.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (e.key === 'Escape')           { teachStop(); e.preventDefault(); }
  else if (e.key === ' ')           { teachPlayPause(); e.preventDefault(); }
  else if (e.key === 'ArrowRight')  { teachStep(1); e.preventDefault(); }
  else if (e.key === 'ArrowLeft')   { teachStep(-1); e.preventDefault(); }
});
teachSyncUi();
// [SG-TEACHUI-END]

window.addEventListener('resize', function () {
  setupCanvas();
  // The framing is solved against the canvas's own dimensions; those do not
  // change with the CSS width, but rebuilding costs nothing and keeps the view
  // honest if they ever do.
  if (teach.on) teach.zoom = teachSolveView();
  render();
});

// ── Spindle lock ──────────────────────────────────────────────────
var btnLock = $('btn-lock');
if (btnLock) btnLock.addEventListener('click', function () { setLocked(!state.locked); });

// ── Boot ──────────────────────────────────────────────────────────
syncLockUi();
setMode('free');
})();
