import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
import { formatListeningSpan } from "../../../shared/format/duration.js";
import { getEarnedBadgeTiers } from "../../../domain/badges.js";
import { getLevel, formatLevelProgress } from "../../../shared/format/level.js";
import Emojis from "../../../domain/constants/Emojis.js";
import { resolveAccent } from "../../../domain/constants/InstanceTheme.js";
import { GROUND, H, SCALE, W, drawBackground, hexToRgba, roundRect } from "./cardBackgrounds.js";
import {
  isCardBackground,
  normaliseCardColor,
  resolveCardFade,
  isReadableCardAccent,
} from "../../../domain/constants/CardBackgrounds.js";

/**
 * `/rank`'s image card, in the Activity's visual language and per-instance accent.
 *
 * The accent is a parameter so the caller decides it. Layout is in logical units and drawn at SCALE, so it stays crisp on high-DPI screens.
 */


const PAD = 44;
const AVATAR = 112;
const COLUMN_X = 180;
/** The username's baseline. Named because the crown is positioned against it by measurement. */
const NAME_BASELINE = 84;
const RIGHT = W - PAD;

const INK = "#f5f2f3";
const TRACK = "rgba(255,255,255,0.14)";

const dim = (alpha) => `rgba(245,242,243,${alpha})`;

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
 * The body, or `null` once it passes `limit` bytes. Kept here rather than imported from the thumbnail proxy: this
 * file is published on its own (the rank-card repository) and takes nothing from the HTTP layer.
 */
async function readCappedBody(response, limit) {
  if (!response.body) return Buffer.alloc(0);
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > limit) return null;
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

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

    // Streamed and stopped at the cap, since Content-Length can be missing or lie.
    return await readCappedBody(response, MAX_AVATAR_BYTES);
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
 * `background` degrades to the plain card. `backgroundColor` falls back to the card's accent when a style is set; a
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
  // An accent too dark to read on the ground (a value stored before the page checked, or written by hand) is drawn
  // in the bot's own colour instead of leaving a bar nobody can see.
  if (!isReadableCardAccent(accent)) accent = resolveAccent(process.env.CLIENT_ID);

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
      // No colour chosen: follow the card's accent, which is the bot's own colour unless the user picked one.
      normaliseCardColor(backgroundColor) ?? accent,
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
  // Off the event loop: encoding a card synchronously stalls every guild's playback for the duration.
  return canvas.encode("png");
}
