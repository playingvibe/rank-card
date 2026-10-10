import { createCanvas, Path2D } from "@napi-rs/canvas";
import TtlLruCache from "../../../shared/cache/TtlLruCache.js";

/**
 * The rank card's background: the ground, the user's colour, one of the pattern styles, and the veil that keeps
 * white text readable over any of it. Split from `RankCard.js` because the painters share only the frame's size
 * and `tint`; published with it to the `rank-card` mirror (`scripts/publish/manifest.js`).
 */

/** The frame, in logical units; `RankCard` draws it at its own SCALE. */
/** The card is drawn at this many pixels per logical unit, so it stays crisp on high-DPI screens. */
export const SCALE = 2;
export const W = 900;
export const H = 320;
export const GROUND = "#0b0b0d";

/** `rgba()`, because `addColorStop` rejects the `${hex}NN` short form. */
export function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/**
 * The Vibe mark in its 1254x1254 viewBox. Copied from `website/V_logo_vectorized.svg`, the source
 * of truth (the bot cannot read `website/`), and parsed into a `Path2D` once.
 */
const MARK_PATH = new Path2D(
  "M 827 325 C 868.97 325 903 359.03 903 401 C 903 413.94 899.76 426.12 894.06 436.78 L 670.14 879.51 C 655.86 908.81 625.79 929 591 929 C 552.33 929 519.49 904.06 507.68 869.39 L 357.44 462.88 C 353.28 452.39 351 440.96 351 429 C 351 378.19 392.19 337 443 337 C 483.8 337 518.39 363.56 530.44 400.33 L 587.22 563.06 C 591.77 575.19 603.47 583.81 617.19 583.81 C 628.96 583.81 639.24 577.46 644.79 568 L 760.11 364.9 C 772.96 341.14 798.09 325 827 325 Z"
);
const MARK_VIEWBOX = 1254;

/**
 * `${style}:${colour}:${fade}` -> rendered background canvas.
 *
 * The bound is a security control: the colour is user-chosen, each entry holds ~4.6 MB (the card's own pixels,
 * 1800 x 640), and `PUT /api/appearance` has no rate limit, so an unbounded map was a memory exhaustion on
 * demand. The TTL matters as much as the cap: `TtlLruCache` evicts an expired entry only when its key is read, so
 * without it a quiet process would hold all of them. Eight entries are the memory thirty-two half-size ones were.
 */
const backgroundCache = new TtlLruCache({ maxSize: 8, ttlMs: 30 * 60 * 1000 });

function tint(hex, alpha) {
  return hexToRgba(hex, alpha);
}

/** A soft light source, centred off-canvas so it never reads as an object in the picture. */
function bloom(ctx, { cx, cy, radius, colour, alpha }) {
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  gradient.addColorStop(0, tint(colour, alpha));
  gradient.addColorStop(1, tint(colour, 0));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);
}

/**
 * One continuous waveform: three summed sines, no jitter and no `Math.random()`, so a card never
 * differs between renders.
 */
function waveStroke(ctx, { phase, midY, amplitude, alpha, lineWidth }) {
  ctx.beginPath();
  for (let i = 0; i <= 200; i += 1) {
    const t = i / 200;
    const x = -20 + t * (W + 40);
    const y =
      midY +
      Math.sin(t * 5.1 + phase) * amplitude +
      Math.sin(t * 11.3 + phase * 1.7) * amplitude * 0.34 +
      Math.sin(t * 2.2 + phase * 0.6) * amplitude * 0.52;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();
}

/** The glyph's own bounds inside the 1254 viewBox, measured. */
const MARK_BBOX = { cx: 648, cy: 647, w: 544, h: 606 };

/**
 * The Vibe mark tiled across the frame.
 *
 * The whole plane is rotated, not each glyph: per-glyph rotation leaves the rows horizontal and
 * reads as stripes. So the tiled area covers the card's circumscribed circle (or the corners come
 * out bare), and each glyph is centred on its cell (`MARK_BBOX`), since the raw path sits low and
 * right in its viewBox. Alternate rows are offset by half a step.
 */
function markField(ctx) {
  // `step` < `size` on purpose: the glyph fills ~40% of its viewBox, so cells overlap while the
  // marks themselves never touch.
  const size = 132;
  const step = size * 0.82;
  const scale = size / MARK_VIEWBOX;
  // Half the diagonal plus a step: enough that a rotated grid still covers every corner.
  const reach = Math.hypot(W, H) / 2 + step;

  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.065)";
  ctx.translate(W / 2, H / 2);
  ctx.rotate(-0.28);

  let row = 0;
  for (let y = -reach; y <= reach; y += step, row += 1) {
    const offset = row % 2 ? step / 2 : 0;
    for (let x = -reach; x <= reach; x += step) {
      ctx.save();
      ctx.translate(x + offset, y);
      ctx.scale(scale, scale);
      ctx.translate(-MARK_BBOX.cx, -MARK_BBOX.cy);
      ctx.fill(MARK_PATH);
      ctx.restore();
    }
  }

  ctx.restore();
}

/**
 * An equaliser field along the bottom edge. Heights come from a sine-fract hash, not
 * `Math.random()`, so a cache miss never redraws someone's card differently.
 */
function barField(ctx) {
  const count = 46;
  const gap = 5;
  const width = (W + gap) / count - gap;

  ctx.fillStyle = "rgba(255,255,255,0.085)";
  for (let i = 0; i < count; i += 1) {
    const noise = Math.sin(i * 12.9898) * 43758.5453;
    const height = H * (0.05 + (noise - Math.floor(noise)) * 0.33);
    roundRect(ctx, i * (width + gap), H - height, width, height, width / 2);
    ctx.fill();
  }
}

/**
 * A faint ruled grid, axis-aligned so it reads as paper. The half-pixel offsets keep a 1px line on
 * one pixel instead of smeared across two.
 */
function gridField(ctx) {
  const step = 44;

  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = step; x < W; x += step) {
    ctx.moveTo(Math.round(x) + 0.5, 0);
    ctx.lineTo(Math.round(x) + 0.5, H);
  }
  for (let y = step; y < H; y += step) {
    ctx.moveTo(0, Math.round(y) + 0.5);
    ctx.lineTo(W, Math.round(y) + 0.5);
  }
  ctx.stroke();
  ctx.restore();
}

/** Two soft diagonal bands of light; white, so they tint with the user's colour. */
function auroraField(ctx) {
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(-0.42);

  for (const [offset, alpha, thickness] of [
    [-H * 0.22, 0.1, H * 0.3],
    [H * 0.16, 0.055, H * 0.22],
  ]) {
    const band = ctx.createLinearGradient(0, offset - thickness, 0, offset + thickness);
    band.addColorStop(0, "rgba(255,255,255,0)");
    band.addColorStop(0.5, `rgba(255,255,255,${alpha})`);
    band.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = band;
    ctx.fillRect(-W, offset - thickness, W * 2, thickness * 2);
  }

  ctx.restore();
}

/** Draws a background style, tinted, and caches it: the drawing is deterministic in its key. */
export function renderBackground(style, colour, faded) {
  const cacheKey = `${style}:${colour}:${faded ? "fade" : "even"}`;
  const cached = backgroundCache.get(cacheKey);
  if (cached) return cached;

  // At the card's own resolution, not at 1x: it is drawn into a context scaled by SCALE, and a 1x canvas was
  // stretched to twice its size, the one soft element on an otherwise crisp card.
  const canvas = createCanvas(W * SCALE, H * SCALE);
  const ctx = canvas.getContext("2d");
  ctx.scale(SCALE, SCALE);

  ctx.fillStyle = GROUND;
  ctx.fillRect(0, 0, W, H);

  // The fade is the user's switch, defaulting per style (see `resolveCardFade()`). Diagonal, since
  // a left-to-right ramp under left-weighted content reads as a lighting error.
  const marks = style === "marks";

  if (!faded) {
    ctx.fillStyle = tint(colour, 0.34);
    ctx.fillRect(0, 0, W, H);
  } else {
    const ramp = ctx.createLinearGradient(0, 0, W, H);
    ramp.addColorStop(0, tint(colour, 0.52));
    ramp.addColorStop(0.55, tint(colour, 0.2));
    ramp.addColorStop(1, tint(colour, 0.04));
    ctx.fillStyle = ramp;
    ctx.fillRect(0, 0, W, H);
  }

  bloom(ctx, { cx: W * 0.16, cy: -H * 0.35, radius: W * 0.55, colour, alpha: 0.26 });
  bloom(ctx, { cx: W * 0.82, cy: H * 1.3, radius: W * 0.5, colour, alpha: 0.17 });

  if (marks || style === "grid" || style === "bars") {
    // A third light on the right for the even styles, so the corner under a repeating pattern is
    // not left flat.
    bloom(ctx, { cx: W * 1.05, cy: H * 0.3, radius: W * 0.45, colour, alpha: 0.2 });
  }

  if (marks) markField(ctx);
  else if (style === "bars") barField(ctx);
  else if (style === "grid") gridField(ctx);
  else if (style === "aurora") auroraField(ctx);
  else {
    waveStroke(ctx, { phase: 0.9, midY: H * 0.74, amplitude: H * 0.075, alpha: 0.17, lineWidth: 2.6 });
    waveStroke(ctx, { phase: 2.6, midY: H * 0.83, amplitude: H * 0.05, alpha: 0.07, lineWidth: 1.6 });
  }

  backgroundCache.set(cacheKey, canvas);
  return canvas;
}

/**
 * Draws the chosen background, then the veil. The veil is what guarantees contrast for white text
 * over any hex the colour picker accepts. Left-weighted, since the content sits on the left.
 */
export function drawBackground(ctx, style, colour, faded) {
  ctx.drawImage(renderBackground(style, colour, faded), 0, 0, W, H);

  ctx.fillStyle = "rgba(11,11,13,0.34)";
  ctx.fillRect(0, 0, W, H);

  // An un-faded card gets a flatter veil: a left-weighted veil over no ramp would reintroduce the
  // fade in reverse. Keyed on `faded`, so the switch moves both layers together.
  const flat = !faded;
  const shade = ctx.createLinearGradient(0, 0, W, 0);
  shade.addColorStop(0, flat ? "rgba(11,11,13,0.24)" : "rgba(11,11,13,0.46)");
  shade.addColorStop(0.62, flat ? "rgba(11,11,13,0.18)" : "rgba(11,11,13,0.14)");
  shade.addColorStop(1, flat ? "rgba(11,11,13,0.16)" : "rgba(11,11,13,0.04)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);
}
