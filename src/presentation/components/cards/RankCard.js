import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createCanvas, loadImage, GlobalFonts, Path2D } from "@napi-rs/canvas";
import { formatListeningSpan } from "../../../shared/format/duration.js";
import { getEarnedBadgeTiers } from "../../../domain/badges.js";
import { getLevel, formatLevelProgress } from "../../../shared/format/level.js";
import Emojis from "../../../domain/constants/Emojis.js";
import TtlLruCache from "../../../shared/cache/TtlLruCache.js";
import { resolveAccent } from "../../../domain/constants/InstanceTheme.js";
import {
  isCardBackground,
  normaliseCardColor,
  resolveCardFade,
  DEFAULT_BACKGROUND_COLOR,
} from "../../../domain/constants/CardBackgrounds.js";

/**
 * `/rank`'s image card, in the Activity's visual language and per-instance accent.
 *
 * The accent is a parameter so the caller decides it; every caller passes the instance default for
 * now. Layout is in logical units and drawn at SCALE, so it stays crisp on high-DPI screens.
 */

const SCALE = 2;
const W = 900;
const H = 320;

const PAD = 44;
const AVATAR = 112;
const COLUMN_X = 180;
/** The username's baseline. Named because the crown is positioned against it by measurement. */
const NAME_BASELINE = 84;
const RIGHT = W - PAD;

const GROUND = "#0b0b0d";
const INK = "#f5f2f3";
const TRACK = "rgba(255,255,255,0.14)";

const dim = (alpha) => `rgba(245,242,243,${alpha})`;

/** `rgba()`, because `addColorStop` rejects the `${hex}NN` short form. */
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * A bundled font from resource/fonts/, if any: a minimal container has almost no fonts, so a
 * generic sans-serif renders differently (or loses its bold) from host to host.
 */
const FONT_DIR = fileURLToPath(new URL("../../../../resource/fonts/", import.meta.url));
const EMOJI_DIR = fileURLToPath(new URL("../../../../resource/emojis/", import.meta.url));

/** Decoded badge art for the process lifetime; a missing file caches as `null`, looked up once. */
const iconCache = new Map();

async function loadBadgeIcons(tiers) {
  await Promise.all(
    tiers.map(async ({ icon }) => {
      if (iconCache.has(icon)) return;
      const file = `${EMOJI_DIR}${icon}.png`;
      // Never throws: drawBadges() falls back to a colour chip when an asset is missing.
      iconCache.set(icon, existsSync(file) ? await loadImage(file).catch(() => null) : null);
    })
  );
  return iconCache;
}

function registerBundledFont() {
  if (!existsSync(FONT_DIR)) return null;

  const faces = readdirSync(FONT_DIR).filter((file) => /\.(ttf|otf)$/i.test(file));
  if (faces.length === 0) return null;

  for (const face of faces) GlobalFonts.registerFromPath(`${FONT_DIR}${face}`, "Vibe");
  return "Vibe";
}

// Once at module load, not per render.
const BUNDLED = registerBundledFont();
const FAMILY = BUNDLED ?? "system-ui, Segoe UI, Helvetica, Arial, sans-serif";

const font = (size, weight = 400) => `${weight} ${size}px ${FAMILY}`;

/**
 * Where each pill starts, given measured widths; pure so it tests without a canvas. A pill that
 * would cross `maxX` is dropped with every pill after it, so the rest never reorder.
 */
export function layoutPills(widths, startX, maxX, gap = 10) {
  const positions = [];
  let x = startX;

  for (const width of widths) {
    if (x + width > maxX) break;
    positions.push(x);
    x += width + gap;
  }

  return positions;
}

/** Ellipsises `text` to fit `maxWidth`; `measure` is injected so it tests without a canvas. */
export function truncateToWidth(text, maxWidth, measure) {
  if (measure(text) <= maxWidth) return text;

  let cut = text.length;
  while (cut > 1 && measure(`${text.slice(0, cut)}…`) > maxWidth) cut -= 1;

  return `${text.slice(0, cut)}…`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/**
 * The Vibe mark in its 1254x1254 viewBox. Copied from `website/V_logo_vectorized.svg`, the source
 * of truth (the bot cannot read `website/`), and parsed into a `Path2D` once.
 */
const MARK_PATH = new Path2D(
  "M 877 349 L 858 344 L 835 344 L 817 348 L 792 361 L 773 379 L 765 390 L 754 410 L 666 623 L " +
    "653 646 L 646 653 L 641 655 L 632 653 L 624 643 L 620 634 L 550 415 L 538 390 L 527 377 L " +
    "518 370 L 506 364 L 490 360 L 464 360 L 449 363 L 424 373 L 406 385 L 392 399 L 380 419 L " +
    "376 434 L 376 452 L 379 465 L 409 537 L 436 608 L 536 884 L 548 909 L 563 930 L 575 940 L " +
    "589 947 L 608 950 L 626 948 L 650 938 L 669 925 L 690 904 L 705 885 L 731 843 L 753 799 L " +
    "910 457 L 917 439 L 920 424 L 920 404 L 916 388 L 905 369 L 892 357 Z"
);
const MARK_VIEWBOX = 1254;

/**
 * `${style}:${colour}:${fade}` -> rendered background canvas.
 *
 * The bound is a security control: the colour is user-chosen, each entry holds ~1.15 MB, and
 * `PUT /api/appearance` has no rate limit, so an unbounded map was a memory exhaustion on demand.
 * The TTL matters as much as the cap: `TtlLruCache` evicts an expired entry only when its key is
 * read, so without it a quiet process would hold all 32 canvases.
 */
const backgroundCache = new TtlLruCache({ maxSize: 32, ttlMs: 30 * 60 * 1000 });

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
function renderBackground(style, colour, faded) {
  const cacheKey = `${style}:${colour}:${faded ? "fade" : "even"}`;
  const cached = backgroundCache.get(cacheKey);
  if (cached) return cached;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

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
function drawBackground(ctx, style, colour, faded) {
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

/** The accent wash behind the avatar, echoing the Activity's ambient glow. */
function drawGlow(ctx, accent) {
  const cx = PAD + AVATAR / 2;
  const glow = ctx.createRadialGradient(cx, 40, 0, cx, 40, W * 0.62);
  glow.addColorStop(0, hexToRgba(accent, 0.22));
  glow.addColorStop(0.45, hexToRgba(accent, 0.06));
  glow.addColorStop(1, hexToRgba(accent, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
}

/** How long `/rank` waits for an avatar before drawing the initial instead. */
const AVATAR_TIMEOUT_MS = 5_000;

/** The avatar asked for is 256 px; anything past this is not an avatar. */
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

/**
 * Downloads an avatar, bounded in time and size (like `thumbnailProxy.js`): Node's `fetch()` has no
 * default timeout, and a stalled CDN would leave `/rank` thinking until the token expired.
 * `null` on any failure, a timeout, or a response too large.
 */
export async function fetchAvatar(url, { timeoutMs = AVATAR_TIMEOUT_MS } = {}) {
  try {
    // The signal covers reading the body as well as the headers.
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return null;
    if (Number(response.headers.get("content-length")) > MAX_AVATAR_BYTES) return null;

    const bytes = Buffer.from(await response.arrayBuffer());
    return bytes.length > MAX_AVATAR_BYTES ? null : bytes;
  } catch {
    return null;
  }
}

async function drawAvatar(ctx, avatarUrl, username) {
  const x = PAD;
  const y = PAD;

  ctx.save();
  ctx.beginPath();
  ctx.arc(x + AVATAR / 2, y + AVATAR / 2, AVATAR / 2, 0, Math.PI * 2);
  ctx.clip();

  let drawn = false;
  if (avatarUrl) {
    try {
      const bytes = await fetchAvatar(avatarUrl);
      if (bytes) {
        const image = await loadImage(bytes);
        ctx.drawImage(image, x, y, AVATAR, AVATAR);
        drawn = true;
      }
    } catch {
      // A CDN hiccup must never fail the command; fall through to the drawn initial.
      drawn = false;
    }
  }

  if (!drawn) {
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(x, y, AVATAR, AVATAR);
    ctx.fillStyle = dim(0.75);
    ctx.font = font(48, 700);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText((username || "?").charAt(0).toUpperCase(), x + AVATAR / 2, y + AVATAR / 2);
  }

  ctx.restore();

  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x + AVATAR / 2, y + AVATAR / 2, AVATAR / 2, 0, Math.PI * 2);
  ctx.stroke();
}

/**
 * Which streak marker a run of days earns: the same five metals as the badges (art from
 * `scripts/assets/generate-badges.js`), larger with each tier. No marker below three days.
 */
const STREAK_TIERS = [
  { min: 100, icon: Emojis.BADGE_STREAK_RUBY, scale: 1.26 },
  { min: 30, icon: Emojis.BADGE_STREAK_DIAMOND, scale: 1.17 },
  { min: 14, icon: Emojis.BADGE_STREAK_GOLD, scale: 1.1 },
  { min: 7, icon: Emojis.BADGE_STREAK_SILVER, scale: 1.04 },
  { min: 3, icon: Emojis.BADGE_STREAK_BRONZE, scale: 1 },
];

/**
 * Exported for tests: a render cannot isolate the thresholds, since the streak also changes the
 * number drawn.
 */
export function flameFor(streak) {
  return STREAK_TIERS.find((tier) => (streak ?? 0) >= tier.min) ?? null;
}

/** One badge PNG by name, sharing `iconCache` with the pills; `null` if it will not load. */
async function loadIcon(name) {
  if (iconCache.has(name)) return iconCache.get(name);
  let image = null;
  try {
    image = await loadImage(`${EMOJI_DIR}${name}.png`);
  } catch {
    // Cached as null, so a bad name is not retried from disk per render.
    image = null;
  }
  iconCache.set(name, image);
  return image;
}

/** The stat row. Each value is centred over its own label; the columns start left. */
async function drawStats(ctx, stats) {
  const tier = flameFor(stats.currentStreak);
  const streakIcon = tier ? await loadIcon(tier.icon) : null;
  const cells = [
    [formatListeningSpan(stats.totalListeningTime), "Listening time", null],
    [`${stats.currentStreak}`, "Day streak", streakIcon ? tier : null],
    [`${stats.longestStreak}`, "Best streak", null],
    [`${stats.sessionCount ?? 0}`, "Tracks", null],
  ];

  const span = (RIGHT - PAD) / cells.length;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  for (const [i, [value, label, cellTier]] of cells.entries()) {
    const x = PAD + span * i;
    const upper = label.toUpperCase();

    ctx.font = font(12, 500);
    const labelW = ctx.measureText(upper).width;

    ctx.font = font(26, 700);
    const valueW = ctx.measureText(value).width;
    const iconSize = cellTier ? 30 * cellTier.scale : 0;
    // The number is centred on its label and the marker hangs off its right, so the numbers line
    // up across the row.
    const valueX = x + (labelW - valueW) / 2;

    ctx.fillStyle = INK;
    ctx.fillText(value, valueX, 205);

    if (cellTier && streakIcon) {
      ctx.drawImage(streakIcon, valueX + valueW + 6, 196 - iconSize / 2, iconSize, iconSize);
    }

    ctx.fillStyle = dim(0.45);
    ctx.font = font(12, 500);
    ctx.fillText(upper, x, 226);
  }
}

async function drawBadges(ctx, stats) {
  const tiers = getEarnedBadgeTiers(stats);
  if (tiers.length === 0) return;

  const icons = await loadBadgeIcons(tiers);

  const PILL_H = 26;
  const PILL_PAD = 13;
  const ICON = 18;
  const CHIP_ROOM = ICON + 4;
  // Below the stat labels, with room.
  const y = 250;

  ctx.font = font(13, 500);
  const widths = tiers.map(
    (tier) => ctx.measureText(tier.name).width + PILL_PAD * 2 + CHIP_ROOM
  );
  const positions = layoutPills(widths, PAD, RIGHT);

  positions.forEach((x, i) => {
    const tier = tiers[i];

    ctx.fillStyle = `${tier.color}22`;
    roundRect(ctx, x, y, widths[i], PILL_H, PILL_H / 2);
    ctx.fill();
    ctx.strokeStyle = `${tier.color}55`;
    ctx.lineWidth = 1;
    ctx.stroke();

    // The tier's own artwork, the PNG the embed uses as its emoji.
    const icon = icons.get(tier.icon);
    if (icon) {
      ctx.drawImage(icon, x + PILL_PAD - 1, y + (PILL_H - ICON) / 2, ICON, ICON);
    } else {
      // Only if the file is missing, so the pill never has a gap.
      ctx.fillStyle = tier.color;
      ctx.beginPath();
      ctx.arc(x + PILL_PAD + 3, y + PILL_H / 2, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Set explicitly: the icon branch sets no fill, and inheriting the pill's 13%-alpha fill hides
    // the label.
    ctx.fillStyle = tier.color;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(tier.name, x + PILL_PAD + CHIP_ROOM, y + PILL_H / 2 + 1);
  });
}

/**
 * Renders the card as PNG bytes. `stats` is `UserRepository.getListeningStats()`'s result.
 * `accent` defaults to this process's instance (`CLIENT_ID`). `premium` draws the crown; the caller
 * decides it (the bot uses `isPremiumActive()`), so the card holds no entitlement logic. An unknown
 * `background` degrades to the plain card. `backgroundColor` falls back to the brand colour when a style is set; a
 * `null`/`undefined` `fade` means the style's default (`resolveCardFade()`).
 */
export default async function renderRankCard(
  target,
  stats,
  accent = resolveAccent(process.env.CLIENT_ID),
  background = null,
  backgroundColor = null,
  fade = null,
  premium = false
) {
  // Validated like the other appearance fields, since a non-colour accent would throw inside the
  // gradient.
  accent = normaliseCardColor(accent) ?? resolveAccent(process.env.CLIENT_ID);

  const canvas = createCanvas(W * SCALE, H * SCALE);
  const ctx = canvas.getContext("2d");
  ctx.scale(SCALE, SCALE);

  ctx.fillStyle = GROUND;
  roundRect(ctx, 0, 0, W, H, 24);
  ctx.fill();
  ctx.save();
  ctx.clip();

  // The accent glow is default-card only: over a background it becomes a
  // second light source in the same corner. The accent still colours the bar and the level.
  const style = isCardBackground(background) ? background : null;
  if (style) {
    drawBackground(
      ctx,
      style,
      normaliseCardColor(backgroundColor) ?? DEFAULT_BACKGROUND_COLOR,
      resolveCardFade(style, fade)
    );
  } else {
    drawGlow(ctx, accent);
  }
  await drawAvatar(ctx, target.avatarUrl, target.username);

  const levelState = getLevel(stats.totalListeningTime);
  const { level, progress } = levelState;

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = INK;
  ctx.font = font(32, 700);
  const crownRoom = premium ? 32 : 0;

  // Discord allows 32 characters; a wide-glyph name would run under the level readout.
  const nameRoom = RIGHT - COLUMN_X - 90 - crownRoom;
  const shownName = truncateToWidth(target.username, nameRoom, (candidate) =>
    ctx.measureText(candidate).width
  );
  ctx.fillText(shownName, COLUMN_X, NAME_BASELINE);

  if (premium) {
    const crown = await loadIcon(Emojis.BADGE_PREMIUM);
    if (crown) {
      // Measured, not fixed: `actualBoundingBoxAscent` gives this string's real cap band, so the
      // crown is sized and centred against the letters.
      const metrics = ctx.measureText(shownName);
      const capTop = NAME_BASELINE - metrics.actualBoundingBoxAscent;
      const band = metrics.actualBoundingBoxAscent;
      // A little larger than the cap band, centred on it so the overhang is symmetric.
      const size = band * 1.14;
      ctx.drawImage(
        crown,
        COLUMN_X + metrics.width + 10,
        capTop + band / 2 - size / 2,
        size,
        size
      );
    }
  }

  ctx.fillStyle = accent;
  ctx.font = font(15, 700);
  ctx.fillText(`LEVEL ${level}`, COLUMN_X, 112);

  ctx.fillStyle = dim(0.45);
  ctx.font = font(13, 500);
  ctx.textAlign = "right";
  // Uppercased here, not in the formatter: the embed wants the same sentence in sentence case.
  ctx.fillText(
    (formatLevelProgress(levelState) ?? "Max level").toUpperCase(),
    RIGHT,
    112
  );

  const barY = 126;
  const barW = RIGHT - COLUMN_X;
  ctx.fillStyle = TRACK;
  roundRect(ctx, COLUMN_X, barY, barW, 10, 5);
  ctx.fill();

  // A near-zero-width rounded rect still paints its own end caps, so a listener with no
  // progress yet would get a stray accent dot instead of an empty bar.
  const filled = barW * progress;
  if (filled > 1) {
    ctx.fillStyle = accent;
    roundRect(ctx, COLUMN_X, barY, Math.max(filled, 10), 10, 5);
    ctx.fill();
  }

  await drawStats(ctx, stats);
  await drawBadges(ctx, stats);

  ctx.restore();
  return canvas.toBuffer("image/png");
}
