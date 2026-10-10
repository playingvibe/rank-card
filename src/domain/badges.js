// @ts-check
import Emojis from "./constants/Emojis.js";
import { currentVoteStreak } from "./voting.js";

/**
 * Milestone badges for `/rank`: ordered thresholds per track, highest earned tier only.
 *
 * `icon` is an `Emojis` key for artwork from `scripts/assets/generate-badges.js`, so the embed (custom
 * emoji) and the rank card (the same PNG) share one source; canvas cannot draw colour emoji. The
 * thresholds are a judgement call with little usage data behind the top tiers. Exported for
 * `scripts/sync-web-shared.js`, which generates the website's copy.
 */
export const LISTENING_TIME_BADGES = [
  { hours: 1000, name: "Ruby Listener", icon: Emojis.BADGE_TIME_RUBY, color: "#FF6B9D" },
  { hours: 500, name: "Diamond Listener", icon: Emojis.BADGE_TIME_DIAMOND, color: "#7FD8EE" },
  { hours: 200, name: "Gold Listener", icon: Emojis.BADGE_TIME_GOLD, color: "#F5C542" },
  { hours: 50, name: "Silver Listener", icon: Emojis.BADGE_TIME_SILVER, color: "#C9CDD4" },
  { hours: 10, name: "Bronze Listener", icon: Emojis.BADGE_TIME_BRONZE, color: "#CD8A4E" },
];

export const TRACKS_LISTENED_BADGES = [
  { count: 2500, name: "Ruby Collector", icon: Emojis.BADGE_TRACKS_RUBY, color: "#FF6B9D" },
  { count: 1000, name: "Diamond Collector", icon: Emojis.BADGE_TRACKS_DIAMOND, color: "#7FD8EE" },
  { count: 500, name: "Gold Collector", icon: Emojis.BADGE_TRACKS_GOLD, color: "#F5C542" },
  { count: 250, name: "Silver Collector", icon: Emojis.BADGE_TRACKS_SILVER, color: "#C9CDD4" },
  { count: 100, name: "Bronze Collector", icon: Emojis.BADGE_TRACKS_BRONZE, color: "#CD8A4E" },
];

/**
 * Consecutive weeks with a vote (see `voting.js`). Judged on the current streak, not the best, so
 * the badge goes when the voting stops.
 */
export const VOTE_STREAK_BADGES = [
  { weeks: 26, name: "Ruby Supporter", icon: Emojis.BADGE_VOTE_RUBY, color: "#FF6B9D" },
  { weeks: 16, name: "Diamond Supporter", icon: Emojis.BADGE_VOTE_DIAMOND, color: "#7FD8EE" },
  { weeks: 8, name: "Gold Supporter", icon: Emojis.BADGE_VOTE_GOLD, color: "#F5C542" },
  { weeks: 4, name: "Silver Supporter", icon: Emojis.BADGE_VOTE_SILVER, color: "#C9CDD4" },
  { weeks: 2, name: "Bronze Supporter", icon: Emojis.BADGE_VOTE_BRONZE, color: "#CD8A4E" },
];

/**
 * Tenure, not a ladder: one badge, earned by having a `firstSeenAt` before the cutoff. Announced
 * in advance so joining the support server before then is a reason to try Vibe now rather than
 * later — see `src/player/events/tips.js`'s `founder` tip.
 */
export const FOUNDER_CUTOFF = new Date("2027-01-01T00:00:00Z");
export const FOUNDER_BADGE = { name: "Founder", icon: Emojis.BADGE_FOUNDER, color: "#FF295E" };

/** Boosting the support server: earned while `boostingSince` is set (see `BoosterSyncService`), gone when the boost ends. */
export const BOOST_BADGE = { name: "Booster", icon: Emojis.BADGE_BOOST, color: "#FF73FA" };

/**
 * @param {object} stats
 * @param {number} stats.totalListeningTime - Milliseconds.
 * @param {number} stats.sessionCount - Tracks credited with listening time.
 * @param {?{streakWeeks?: number, lastWeek?: ?number}} [stats.voting]
 * @param {Date|string|number|null} [stats.boostingSince] - Set while the user boosts the support server.
 * @param {Date|string|number|null} [stats.firstSeenAt] - When this user's document was created.
 *        `null`/missing (a document written before the field existed) never earns Founder.
 * @param {Date|number} [now]
 * @returns {Array<{name: string, icon: string, color: string}>} 0-5 tiers: Founder first, then Booster (a
 *          fixed fact, so it is never the one dropped for space), then the highest per
 *          accrual track, in listening-time, tracks-listened, vote-streak order.
 */
export function getEarnedBadgeTiers({ totalListeningTime, sessionCount, voting, firstSeenAt, boostingSince }, now = Date.now()) {
  const hours = totalListeningTime / (60 * 60 * 1000);
  const tiers = [];

  if (firstSeenAt && new Date(firstSeenAt) < FOUNDER_CUTOFF) tiers.push(FOUNDER_BADGE);
  if (boostingSince) tiers.push(BOOST_BADGE);

  const timeTier = LISTENING_TIME_BADGES.find((tier) => hours >= tier.hours);
  if (timeTier) tiers.push(timeTier);

  const tracksTier = TRACKS_LISTENED_BADGES.find((tier) => sessionCount >= tier.count);
  if (tracksTier) tiers.push(tracksTier);

  const weeks = currentVoteStreak(voting, now);
  const voteTier = VOTE_STREAK_BADGES.find((tier) => weeks >= tier.weeks);
  if (voteTier) tiers.push(voteTier);

  return tiers;
}

/**
 * The tiers as embed labels. The emoji lookup is passed in because the rank card has no client;
 * without it a label is the bare name.
 * @param {{totalListeningTime: number, sessionCount: number, voting?: ?{streakWeeks?: number, lastWeek?: ?number}}} stats
 * @param {?{get: (icon: string) => string}} [emoteService] - Turns an icon name into its emoji text.
 * @returns {string[]} Empty if no tier is earned.
 */
export function getEarnedBadges(stats, emoteService) {
  return getEarnedBadgeTiers(stats).map(
    (tier) => `${emoteService ? emoteService.get(tier.icon) : ""} ${tier.name}`.trim()
  );
}
