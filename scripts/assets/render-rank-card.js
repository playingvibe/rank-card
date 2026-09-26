// Renders a /rank card with prop stats for the bot-list entries.
import fs from "node:fs";
import path from "node:path";
import renderRankCard from "../../src/presentation/components/cards/RankCard.js";

/**
 * Renders a `/rank` card with prop stats, for the bot-list entries.
 *
 * ## Why this and not the Activity's own profile screen
 *
 * `scripts/assets/capture-activity-shots.js` already produces `profile.png`, which shows listening time and two
 * streak tiles. This is better for a listing on two counts:
 *
 * - **It shows badges**, which the Activity's profile view does not render at all. Badges are the
 *   most obviously *earned* thing Vibe has, and a listing screenshot is exactly where "there is
 *   progression here" needs to land.
 * - **It is a different surface.** Every other asset on the page is the Activity. This is a
 *   message in a Discord channel, which is where most of Vibe actually lives — a page of four
 *   player screenshots implies the bot *is* the player.
 *
 * ## The prop stats, and why these numbers
 *
 * They match `activity/src/mockSync.ts` deliberately. Both surfaces appear on the same listing
 * page, and a card claiming 540 hours next to a profile screen claiming 227 reads as fabricated —
 * which it would be. 227 hours clears the 200-hour **Gold Listener** threshold and 640 tracks
 * clears the 500-track **Gold Collector** one, so the card renders two badges of the same tier
 * rather than a mismatched pair.
 *
 * No avatar URL is passed. `drawAvatar()` falls back to a drawn initial, which is the same thing
 * the Activity's profile view shows — and fetching a real Discord avatar into promotional art
 * would mean putting a real person on it.
 *
 * Usage:  node scripts/assets/render-rank-card.js [--out <file>]
 * Output: resource/brand/press/rank-card.png unless --out says otherwise
 */

const ROOT = path.join(import.meta.dirname, "..", "..");
const outIndex = process.argv.indexOf("--out");
const OUT = path.resolve(
  outIndex > -1 ? process.argv[outIndex + 1] : path.join(ROOT, "resource", "brand", "press", "rank-card.png")
);

/** Prop identity. Never a real handle — see `mockSync.ts` for the same reasoning. */
const TARGET = { username: "mara", avatarUrl: null };

/**
 * Kept in step with `mockSync.ts`'s `profile.stats`. If one moves, move the other: they are
 * rendered side by side on the listing.
 */
const STATS = {
  totalListeningTime: 227 * 60 * 60 * 1000,
  currentStreak: 12,
  longestStreak: 31,
  sessionCount: 640,
};

async function main() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });

  // The accent defaults to `resolveAccent(process.env.CLIENT_ID)`, which without a client id
  // falls through to the flagship palette — the right one for the flagship's listing.
  const png = await renderRankCard(TARGET, STATS);

  fs.writeFileSync(OUT, png);
  console.log(`  rank-card.png   ${(png.length / 1024).toFixed(0)} KB`);
  console.log(`\nWritten to ${path.relative(ROOT, OUT)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
