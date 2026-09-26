// @ts-check
/**
 * Vote-streak rules, no I/O. Counted in weeks, not votes: top.gg allows a vote every 12 hours, and
 * a streak of votes would reward an alarm clock. Weeks are Monday-based UTC, one global calendar.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Week number, +1 per week. The epoch was a Thursday, so +3 days moves the boundary to Monday
 * 00:00 UTC. An integer, so "the next week" is subtraction with no year or week-53 cases.
 * @param {Date|number} at
 * @returns {number}
 */
export function weekIndex(at) {
  const ms = at instanceof Date ? at.getTime() : at;
  return Math.floor((Math.floor(ms / DAY_MS) + 3) / 7);
}

/**
 * The streak now. The stored one is never rewritten when a week passes, so the read decides: it
 * survives a current week with no vote yet, and ends after a whole week without one.
 * @param {?{streakWeeks?: number, lastWeek?: ?number}} voting
 * @param {Date|number} [now]
 * @returns {number}
 */
export function currentVoteStreak(voting, now = Date.now()) {
  if (!voting?.streakWeeks || voting.lastWeek === null || voting.lastWeek === undefined) return 0;
  return weekIndex(now) - voting.lastWeek <= 1 ? voting.streakWeeks : 0;
}
