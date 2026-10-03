// @ts-check
/**
 * Emoji names. Each must equal both the application emoji's name in Discord and its filename
 * under `resource/emojis/` (no extension); `EmoteService` looks them up by name.
 */
const Emojis = Object.freeze({
  PLAY: "play",
  PAUSE: "pause",
  RESUME: "resume",
  STOP: "stop",
  SKIP: "skip",
  REPLAY: "replay",
  SHUFFLE: "shuffle",
  QUEUE: "queue",
  SEARCH: "search",
  FAV: "fav",
  NOTFOUND: "notfound",
  ERROR: "error",
  NOMIC: "nomic",
  LOOPED: "looped",
  // Distinguishes `RepeatMode.TRACK` from `RepeatMode.QUEUE`.
  LOOP_ONE: "loop_one",
  NOLOOP: "noloop",
  VOL_HIGH: "vol_high",
  VOL_MID: "vol_mid",
  VOL_LOW: "vol_low",
  VOL_MUTE: "vol_mute",
  // The `/nowplaying` bar: a plain line and a plain dot.
  LINE: "line",
  SLIDER: "slider",
  // A rainbow trail and an animated cat, an alternative look for the bar, kept for a later use. Nothing
  // reads them yet; `EmoteService` still uploads them so they are ready.
  LINE_NYAN: "line_nyan",
  SLIDER_NYAN: "slider_nyan",
  // /invite's per-instance icons.
  VIBE: "vibe",
  VIBE2: "vibe2",
  VIBE3: "vibe3",
  VIBE_BETA: "vibebeta",

  // Each instance's gradient V (`scripts/assets/generate-instance-marks.js`), for where instances must be
  // told apart at 22px, such as `/config`'s tab row.
  MARK_VIBE: "mark_vibe",
  MARK_VIBE2: "mark_vibe2",
  MARK_VIBE3: "mark_vibe3",
  MARK_VIBE_BETA: "mark_vibebeta",
  MARK_VIBE_DEV: "mark_vibedev",
  // /invite's Support Server field icon.
  DISCORD: "discord",
  FILTER: "filter",
  // `/leaderboard`'s heading, and the playlist panel's way back.
  LEADERBOARD: "leaderboard",
  BACK: "back",
  // The #faq panel's section tabs (with `WAVE` and `ADD`). New icons: `scripts/assets/fetch-emoji-icons.js`.
  SHIELD: "shield",
  EXPORT: "export",
  TRASH: "trash",

  ACTIVITY: "activity",
  INSTANCES: "instances",
  WRENCH: "wrench",
  // /config setup wizard.
  SETTINGS: "settings",
  SUCCESS: "success",
  ADD: "add",
  // /lyrics.
  MIC: "mic",
  // /skip's vote-to-skip messages.
  VOTE: "vote",
  // Empty-voice-channel auto-leave notice.
  WAVE: "wave",
  // /seek's confirmation reply.
  FASTFORWARD: "fastforward",
  // Lavalink failover recovery: a success, so not ERROR.
  RECONNECT: "connection",
  // /skip <position>'s "jumped to" reply, distinct from SKIP.
  JUMP: "jump",
  PREMIUM: "premium",
  // /invite's embed title.
  INVITE: "invite",
  // The #faq panel's own heading.
  FAQ: "faq",
  // The #rules panel's own heading.
  RULES: "rules",
  // /invite's website link.
  WEBSITE: "website",

  // /rank badges from scripts/assets/generate-badges.js: shape says which track, metal says how far.
  BADGE_TIME_BRONZE: "badge_time_bronze",
  BADGE_TIME_SILVER: "badge_time_silver",
  BADGE_TIME_GOLD: "badge_time_gold",
  BADGE_TIME_DIAMOND: "badge_time_diamond",
  BADGE_TIME_RUBY: "badge_time_ruby",
  BADGE_TRACKS_BRONZE: "badge_tracks_bronze",
  BADGE_TRACKS_SILVER: "badge_tracks_silver",
  BADGE_TRACKS_GOLD: "badge_tracks_gold",
  BADGE_TRACKS_DIAMOND: "badge_tracks_diamond",
  BADGE_STREAK_BRONZE: "badge_streak_bronze",
  BADGE_STREAK_SILVER: "badge_streak_silver",
  BADGE_STREAK_GOLD: "badge_streak_gold",
  BADGE_STREAK_DIAMOND: "badge_streak_diamond",
  BADGE_STREAK_RUBY: "badge_streak_ruby",
  BADGE_PREMIUM: "badge_premium",
  // Tenure: used Vibe before the Founder cutoff. One tier, like premium.
  BADGE_FOUNDER: "badge_founder",
  // Vote streaks (consecutive weeks with a vote).
  BADGE_VOTE_BRONZE: "badge_vote_bronze",
  BADGE_VOTE_SILVER: "badge_vote_silver",
  BADGE_VOTE_GOLD: "badge_vote_gold",
  BADGE_VOTE_DIAMOND: "badge_vote_diamond",
  BADGE_VOTE_RUBY: "badge_vote_ruby",
  BADGE_TRACKS_RUBY: "badge_tracks_ruby",
});

/** Unicode stand-ins for when a custom emoji is not available. */
export const DEFAULT_EMOJI_FALLBACKS = Object.freeze({
  [Emojis.PLAY]: "▶️",
  [Emojis.PAUSE]: "⏸️",
  [Emojis.RESUME]: "▶️",
  [Emojis.STOP]: "⏹️",
  [Emojis.SKIP]: "⏭️",
  [Emojis.REPLAY]: "🔂",
  [Emojis.SHUFFLE]: "🔀",
  [Emojis.QUEUE]: "📃",
  [Emojis.SEARCH]: "🔍",
  [Emojis.FAV]: "⭐",
  [Emojis.NOTFOUND]: "❌",
  [Emojis.ERROR]: "⚠️",
  [Emojis.NOMIC]: "🚫",
  [Emojis.LOOPED]: "🔁",
  [Emojis.LOOP_ONE]: "🔂",
  [Emojis.NOLOOP]: "🚫",
  [Emojis.VOL_HIGH]: "🔊",
  [Emojis.VOL_MID]: "🔉",
  [Emojis.VOL_LOW]: "🔈",
  [Emojis.VOL_MUTE]: "🔇",
  [Emojis.LINE]: "▬",
  [Emojis.SLIDER]: "🔘",
  [Emojis.LINE_NYAN]: "▬",
  [Emojis.SLIDER_NYAN]: "🔘",
  [Emojis.VIBE]: "🔴",
  [Emojis.VIBE2]: "🔵",
  [Emojis.VIBE3]: "🟡",
  [Emojis.VIBE_BETA]: "🟢",
  // Same colours as the avatar fallbacks, so the tabs stay distinguishable.
  [Emojis.MARK_VIBE]: "🔴",
  [Emojis.MARK_VIBE2]: "🔵",
  [Emojis.MARK_VIBE3]: "🟡",
  [Emojis.MARK_VIBE_BETA]: "🟢",
  [Emojis.MARK_VIBE_DEV]: "🟣",
  [Emojis.DISCORD]: "💬",
  [Emojis.FILTER]: "🎚️",
  [Emojis.LEADERBOARD]: "🏆",
  [Emojis.BACK]: "⬅️",
  [Emojis.SHIELD]: "🛡️",
  [Emojis.EXPORT]: "📄",
  [Emojis.TRASH]: "🗑️",
  [Emojis.ACTIVITY]: "🪩",
  [Emojis.INSTANCES]: "🎛️",
  [Emojis.WRENCH]: "🛠️",
  [Emojis.SETTINGS]: "⚙️",
  [Emojis.SUCCESS]: "✅",
  [Emojis.ADD]: "➕",
  [Emojis.MIC]: "🎤",
  [Emojis.VOTE]: "🗳️",
  [Emojis.WAVE]: "👋",
  [Emojis.FASTFORWARD]: "⏩",
  [Emojis.RECONNECT]: "🔌",
  [Emojis.JUMP]: "↪️",
  [Emojis.PREMIUM]: "👑",
  [Emojis.INVITE]: "🤖",
  [Emojis.FAQ]: "❓",
  [Emojis.RULES]: "⚖️",
  [Emojis.WEBSITE]: "🌐",
  [Emojis.BADGE_TIME_BRONZE]: "🥉",
  [Emojis.BADGE_TIME_SILVER]: "🥈",
  [Emojis.BADGE_TIME_GOLD]: "🥇",
  [Emojis.BADGE_TIME_DIAMOND]: "💎",
  [Emojis.BADGE_TIME_RUBY]: "❤️",
  [Emojis.BADGE_TRACKS_BRONZE]: "🎵",
  [Emojis.BADGE_TRACKS_SILVER]: "🎶",
  [Emojis.BADGE_TRACKS_GOLD]: "💿",
  [Emojis.BADGE_TRACKS_DIAMOND]: "📀",
  [Emojis.BADGE_TRACKS_RUBY]: "🏆",
  [Emojis.BADGE_STREAK_BRONZE]: "⚡",
  [Emojis.BADGE_STREAK_SILVER]: "⚡",
  [Emojis.BADGE_STREAK_GOLD]: "⚡",
  [Emojis.BADGE_STREAK_DIAMOND]: "⚡",
  [Emojis.BADGE_STREAK_RUBY]: "⚡",
  [Emojis.BADGE_PREMIUM]: "👑",
  [Emojis.BADGE_FOUNDER]: "🌟",
  [Emojis.BADGE_VOTE_BRONZE]: "⬆️",
  [Emojis.BADGE_VOTE_SILVER]: "⬆️",
  [Emojis.BADGE_VOTE_GOLD]: "⬆️",
  [Emojis.BADGE_VOTE_DIAMOND]: "⬆️",
  [Emojis.BADGE_VOTE_RUBY]: "⬆️",
});

export default Emojis;
