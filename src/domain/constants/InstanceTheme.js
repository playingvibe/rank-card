// @ts-check
/**
 * Each instance's accent by client id: the one source of every surface's palette.
 * `scripts/sync-web-shared.js` generates the Activity's copy (with `NAMES` and `ACCENT_HOVERS`);
 * edit here, then `npm run sync:web`. Each is the bot's own colour from `resource/brand/` (its avatar), flat and
 * readable on the near-black ground. Vibe Dev is white so it is never mistaken for a real instance.
 */
export const ACCENTS = {
  "800075471290236968": "#FFFFFF", // Vibe Dev
  "815329807377498153": "#FF295E", // Vibe
  "1533281867523031070": "#1A79FF", // Vibe 2
  "1001935021436850207": "#FFC20A", // Vibe 3
  "820636341788344321": "#00A331", // Vibe Beta
};

/** The Activity's hover shades: lighter, except Vibe Dev's, which dims from white. */
export const ACCENT_HOVERS = {
  "800075471290236968": "#D8DEE9", // Vibe Dev
  "815329807377498153": "#ff4371", // Vibe
  "1533281867523031070": "#3589FF", // Vibe 2
  "1001935021436850207": "#ffc927", // Vibe 3
  "820636341788344321": "#1fae4a", // Vibe Beta
};

/** The flagship's palette is every surface's fallback, for a client id not listed here. */
export const FALLBACK_PALETTE_ID = "815329807377498153";
const FALLBACK_ACCENT = ACCENTS[FALLBACK_PALETTE_ID];

/**
 * The application emoji carrying each instance's avatar, for inline use: a Components V2 message
 * cannot carry an embed, so it has no author field for a real avatar.
 */
const MARKS = {
  "800075471290236968": "vibe", // Vibe Dev, no mark of its own; borrows the flagship's
  "815329807377498153": "vibe",
  "1533281867523031070": "vibe2",
  "1001935021436850207": "vibe3",
  "820636341788344321": "vibebeta",
};

/**
 * Display names by client id. Resolved before the stored `guildInstances.name`, which can be stale
 * or `""`.
 */
export const NAMES = {
  "800075471290236968": "Vibe Dev",
  "815329807377498153": "Vibe",
  "1533281867523031070": "Vibe 2",
  "1001935021436850207": "Vibe 3",
  "820636341788344321": "Vibe Beta",
};

/**
 * @param {string|undefined} clientId
 * @param {string} [stored] - Used only for an unknown id.
 * @returns {string} Never empty, and never "Vibe" for an unknown bot.
 */
export function resolveInstanceName(clientId, stored = "") {
  return NAMES[clientId] ?? (stored || "Unknown bot");
}

/**
 * Each instance's gradient V. A separate map because Vibe Dev has its own mark here but borrows
 * the flagship's avatar in `MARKS`, and tabs that tell bots apart must never share an icon.
 */
const GRADIENT_MARKS = {
  "800075471290236968": "mark_vibedev",
  "815329807377498153": "mark_vibe",
  "1533281867523031070": "mark_vibe2",
  "1001935021436850207": "mark_vibe3",
  "820636341788344321": "mark_vibebeta",
};

/**
 * @param {string|undefined} clientId
 * @returns {string} The `Emojis` name for this instance's avatar mark.
 */
export function resolveMark(clientId) {
  return (clientId && MARKS[clientId]) || "vibe";
}

/**
 * @param {string|undefined} clientId
 * @returns {string} The `Emojis` name for this instance's gradient V mark.
 */
export function resolveGradientMark(clientId) {
  return (clientId && GRADIENT_MARKS[clientId]) || "mark_vibe";
}

/**
 * @param {string|undefined} clientId - Typically `process.env.CLIENT_ID`.
 * @returns {string} Hex accent colour for this bot instance.
 */
export function resolveAccent(clientId) {
  return (clientId && ACCENTS[clientId]) || FALLBACK_ACCENT;
}

/**
 * The accent as an integer, for `EmbedBuilder.setColor()` and `ContainerBuilder.setAccentColor()`.
 * @param {string|undefined} clientId
 * @returns {number}
 */
export function accentInt(clientId) {
  return parseInt(resolveAccent(clientId).replace("#", ""), 16);
}
