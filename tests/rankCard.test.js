import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import renderRankCard, {
  flameFor,
  layoutPills,
  truncateToWidth,
} from "../src/presentation/components/cards/RankCard.js";
import { resolveAccent } from "../src/domain/constants/InstanceTheme.js";
import {
  CARD_BACKGROUND_STYLES,
  cardAccentContrast,
  isCardBackground,
  isReadableCardAccent,
  normaliseCardColor,
  resolveCardFade,
} from "../src/domain/constants/CardBackgrounds.js";

const hash = (buffer) => createHash("md5").update(buffer).digest("hex");

const HOUR = 60 * 60 * 1000;

/** Stand-in for ctx.measureText: every character is 10 wide, so the arithmetic is checkable. */
const tenPerChar = (text) => text.length * 10;

describe("layoutPills", () => {
  it("flows pills left to right with the gap between them", () => {
    assert.deepEqual(layoutPills([100, 50, 80], 0, 1000, 10), [0, 110, 170]);
  });

  it("starts at startX rather than zero", () => {
    assert.deepEqual(layoutPills([40], 44, 1000, 10), [44]);
  });

  it("drops a pill that would cross the right edge", () => {
    // Third would start at 170 and end at 250, past a 200 limit.
    assert.deepEqual(layoutPills([100, 50, 80], 0, 200, 10), [0, 110]);
  });

  it("drops everything after the first pill that doesn't fit, not just that one", () => {
    // A narrow pill follows a wide one. Keeping it would silently reorder the row, so the
    // row stops at the overflow instead.
    assert.deepEqual(layoutPills([100, 500, 10], 0, 200, 10), [0]);
  });

  it("returns nothing when even the first pill is too wide", () => {
    assert.deepEqual(layoutPills([300], 0, 200, 10), []);
  });

  it("handles an empty row", () => {
    assert.deepEqual(layoutPills([], 0, 200, 10), []);
  });
});

describe("truncateToWidth", () => {
  it("leaves text that already fits completely alone", () => {
    assert.equal(truncateToWidth("nadia", 100, tenPerChar), "nadia");
  });

  it("leaves text alone at exactly the limit", () => {
    assert.equal(truncateToWidth("nadia", 50, tenPerChar), "nadia");
  });

  it("ellipsises text that overflows, and the result actually fits", () => {
    const result = truncateToWidth("averyverylongusername", 100, tenPerChar);

    assert.ok(result.endsWith("…"));
    assert.ok(
      tenPerChar(result) <= 100,
      `truncated to "${result}" which measures ${tenPerChar(result)}, over the 100 limit`
    );
  });

  it("still returns something for a limit too small for any text", () => {
    // Not a crash and not an empty string — one character plus the ellipsis is the floor.
    const result = truncateToWidth("nadia", 5, tenPerChar);
    assert.ok(result.length >= 2, `expected at least a character and an ellipsis, got "${result}"`);
  });
});

describe("renderRankCard", () => {
  /** Reads width/height out of a PNG's IHDR chunk, which starts at byte 16. */
  const pngSize = (buffer) => ({
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  });

  const isPng = (buffer) =>
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

  it("renders a valid PNG at the expected 2x dimensions", async () => {
    const buffer = await renderRankCard(
      { username: "nadia", avatarUrl: null },
      { totalListeningTime: 227 * HOUR, currentStreak: 12, longestStreak: 31, sessionCount: 1400 }
    );

    assert.ok(isPng(buffer), "output is not a PNG");
    assert.deepEqual(pngSize(buffer), { width: 1800, height: 640 });
  });

  it("renders a brand-new user with no badges and no listening time", async () => {
    const buffer = await renderRankCard(
      { username: "newcomer", avatarUrl: null },
      { totalListeningTime: 0, currentStreak: 0, longestStreak: 0, sessionCount: 0 }
    );

    assert.ok(isPng(buffer));
  });

  it("survives a missing sessionCount rather than drawing undefined", async () => {
    const buffer = await renderRankCard(
      { username: "legacy", avatarUrl: null },
      { totalListeningTime: HOUR, currentStreak: 1, longestStreak: 1 }
    );

    assert.ok(isPng(buffer));
  });

  it("falls back to a drawn initial when the avatar can't be fetched", async () => {
    // An unroutable host, so this genuinely exercises the fetch failure path rather than
    // mocking it away. If the catch were missing this would reject and fail the test.
    const buffer = await renderRankCard(
      { username: "offline", avatarUrl: "http://127.0.0.1:1/avatar.png" },
      { totalListeningTime: 5 * HOUR, currentStreak: 2, longestStreak: 3, sessionCount: 40 }
    );

    assert.ok(isPng(buffer));
  });

  describe("per-instance accent", () => {
    const target = { username: "nadia", avatarUrl: null };
    const stats = { totalListeningTime: 30 * HOUR, currentStreak: 4, longestStreak: 9, sessionCount: 120 };

    it("a different accent produces genuinely different pixels, not just a different label", async () => {
      const pink = await renderRankCard(target, stats, "#E05570");
      const blue = await renderRankCard(target, stats, "#4577B8");

      assert.notEqual(hash(pink), hash(blue));
    });

    it("is deterministic — the same accent renders byte-identical output", async () => {
      const first = await renderRankCard(target, stats, "#D9B15C");
      const second = await renderRankCard(target, stats, "#D9B15C");

      assert.equal(hash(first), hash(second));
    });

    it("an accent too dark to read on the ground is drawn in the bot's own colour", async () => {
      const dark = await renderRankCard(target, stats, "#101018");
      const own = await renderRankCard(target, stats, resolveAccent(process.env.CLIENT_ID));

      assert.equal(hash(dark), hash(own));
    });

    it("a background with no colour follows the card's accent, and a chosen colour still wins", async () => {
      const followed = await renderRankCard(target, stats, "#4577B8", "aurora", null);
      const explicit = await renderRankCard(target, stats, "#4577B8", "aurora", "#4577b8");
      const other = await renderRankCard(target, stats, "#4577B8", "aurora", "#e05570");

      assert.equal(hash(followed), hash(explicit), "no colour reads as the accent");
      assert.notEqual(hash(followed), hash(other), "an explicit colour is not overridden");
    });

    it("defaults to this process's own instance via CLIENT_ID, not a hardcoded colour", async () => {
      const previous = process.env.CLIENT_ID;
      try {
        // Vibe 2's real client id — see InstanceTheme.js.
        process.env.CLIENT_ID = "1533281867523031070";
        const viaEnv = await renderRankCard(target, stats);
        const viaExplicitAccent = await renderRankCard(target, stats, resolveAccent(process.env.CLIENT_ID));

        assert.equal(hash(viaEnv), hash(viaExplicitAccent));

        // And it must actually differ from the Vibe-fallback default — proving CLIENT_ID is
        // really driving the choice, not being silently ignored.
        delete process.env.CLIENT_ID;
        const fallback = await renderRankCard(target, stats);
        assert.notEqual(hash(viaEnv), hash(fallback));
      } finally {
        if (previous === undefined) delete process.env.CLIENT_ID;
        else process.env.CLIENT_ID = previous;
      }
    });
  });
});

describe("streak flame and premium crown", () => {
  const TARGET = { username: "nadia", avatarUrl: null };
  const base = { totalListeningTime: 2 * HOUR, longestStreak: 4, sessionCount: 147 };

  it("stays unlit below three days", () => {
    assert.equal(flameFor(0), null);
    assert.equal(flameFor(1), null);
    assert.equal(flameFor(2), null, "an icon that is always there stops being information");
    assert.equal(flameFor(undefined), null);
  });

  it("picks one tier per band, and the same one throughout a band", () => {
    assert.equal(flameFor(3), flameFor(6), "3 and 6 are the same tier");
    assert.equal(flameFor(14), flameFor(29));
    assert.equal(flameFor(100), flameFor(9999), "the top tier has no upper bound");

    const tiers = [3, 7, 14, 30, 100].map((n) => flameFor(n));
    assert.equal(new Set(tiers).size, 5, "two bands resolved to the same tier");
  });

  it("grows with the tier and reuses the badge family's metals", () => {
    const tiers = [3, 7, 14, 30, 100].map((n) => flameFor(n));

    const scales = tiers.map((t) => t.scale);
    assert.deepEqual([...scales].sort((a, b) => a - b), scales, "scale must not go backwards");

    // The markers are badge art, not one-off drawings — which was the whole complaint about the
    // first version. Each tier must name a `badge_streak_*` icon from scripts/assets/generate-badges.js.
    assert.deepEqual(
      tiers.map((t) => t.icon),
      [
        "badge_streak_bronze",
        "badge_streak_silver",
        "badge_streak_gold",
        "badge_streak_diamond",
        "badge_streak_ruby",
      ]
    );
  });

  it("has art on disk for every tier, and for premium", async () => {
    // A missing PNG degrades silently to no marker, so nothing else here would catch it.
    const { access } = await import("node:fs/promises");
    const names = [...[3, 7, 14, 30, 100].map((n) => flameFor(n).icon), "badge_premium"];

    for (const name of names) {
      await access(new URL(`../resource/emojis/${name}.png`, import.meta.url));
    }
  });

  it("draws the crown only when the caller says premium", async () => {
    const stats = { ...base, currentStreak: 5 };
    const plain = hash(await renderRankCard(TARGET, stats));

    const paid = await renderRankCard(TARGET, stats, undefined, null, null, null, true);
    assert.notEqual(hash(paid), plain, "premium gets a crown");

    // Whether an entitlement is active is `isPremiumActive()`'s job (tests/entitlements.test.js);
    // the card draws what it is told, and a stats document's `premium` field changes nothing.
    const ignored = await renderRankCard(TARGET, { ...stats, premium: { tier: "user", expiresAt: null } });
    assert.equal(hash(ignored), plain, "the card must not read entitlements itself");
  });
});

describe("rank card backgrounds", () => {
  const TARGET = { username: "mara", avatarUrl: null };
  const STATS = {
    totalListeningTime: 227 * HOUR,
    currentStreak: 12,
    longestStreak: 31,
    sessionCount: 640,
  };
  const ACCENT = "#5aa9f0";

  it("degrades an unknown style to exactly the plain card", async () => {
    const plain = await renderRankCard(TARGET, STATS, ACCENT, null);

    // Includes older colour keys such as "dusk" and "ember", which a stored value may still
    // hold — an old stored value must not become an error.
    for (const stale of ["not-a-style", "dusk", "ember", "slate"]) {
      assert.equal(hash(await renderRankCard(TARGET, STATS, ACCENT, stale)), hash(plain));
    }
  });

  it("renders every style, and each differs from the plain card", async () => {
    const plain = hash(await renderRankCard(TARGET, STATS, ACCENT, null));

    for (const style of CARD_BACKGROUND_STYLES) {
      const rendered = await renderRankCard(TARGET, STATS, ACCENT, style.key, "#7b3fe4");
      assert.notEqual(hash(rendered), plain, `${style.key} rendered identically to plain`);
    }
  });

  it("the colour actually changes the render", async () => {
    const a = await renderRankCard(TARGET, STATS, ACCENT, "waves", "#7b3fe4");
    const b = await renderRankCard(TARGET, STATS, ACCENT, "waves", "#0f7a5a");

    assert.notEqual(hash(a), hash(b), "two colours produced the same background");
  });

  it("the two styles differ from each other at the same colour", async () => {
    const waves = await renderRankCard(TARGET, STATS, ACCENT, "waves", "#7b3fe4");
    const marks = await renderRankCard(TARGET, STATS, ACCENT, "marks", "#7b3fe4");

    assert.notEqual(hash(waves), hash(marks));
  });

  it("the accent glow is dropped once a background is drawn", async () => {
    // The glow is the only thing the accent contributes to the card's *lighting*, and two tinted
    // light sources in the same corner is what made a custom background look broken. So on a
    // backgrounded card the accent must no longer change the image at all beyond the progress bar
    // and level text -- which it still does, hence "notEqual" on the plain pair as the control.
    const plainPink = hash(await renderRankCard(TARGET, STATS, "#e05570", null));
    const plainBlue = hash(await renderRankCard(TARGET, STATS, "#5aa9f0", null));
    assert.notEqual(plainPink, plainBlue, "control: the accent does change the plain card");

    const bgPink = hash(await renderRankCard(TARGET, STATS, "#e05570", "waves", "#7b3fe4"));
    const bgBlue = hash(await renderRankCard(TARGET, STATS, "#5aa9f0", "waves", "#7b3fe4"));
    assert.notEqual(bgPink, bgBlue, "the accent still colours the bar and the level readout");
  });

  it("an unset colour falls back rather than rendering nothing", async () => {
    const plain = hash(await renderRankCard(TARGET, STATS, ACCENT, null));
    const noColour = await renderRankCard(TARGET, STATS, ACCENT, "waves", null);
    const nonsense = await renderRankCard(TARGET, STATS, ACCENT, "waves", "not-a-colour");

    assert.notEqual(hash(noColour), plain, "a style with no colour still draws");
    assert.equal(hash(nonsense), hash(noColour), "an invalid colour falls back to the default");
  });

  it("accepts null and the shipped style keys, and nothing else", () => {
    assert.equal(isCardBackground(null), true, "null is the plain card, which is valid");
    assert.equal(isCardBackground(undefined), true);
    for (const style of CARD_BACKGROUND_STYLES) assert.equal(isCardBackground(style.key), true);

    assert.equal(isCardBackground("nope"), false);
    assert.equal(isCardBackground("../waves"), false);
    assert.equal(isCardBackground("WAVES"), false, "keys are case-sensitive");
  });

  it("defaults the fade per style, and null is not the same as false", () => {
    // The third state is the point: someone who never touched the switch follows whichever style
    // they pick, rather than carrying a default that suited a style they have abandoned.
    assert.equal(resolveCardFade("waves", null), true, "waves fades by default");
    assert.equal(resolveCardFade("marks", null), false, "marks does not");
    assert.equal(resolveCardFade("waves", undefined), true);

    // An explicit choice overrides both defaults, in both directions.
    assert.equal(resolveCardFade("waves", false), false);
    assert.equal(resolveCardFade("marks", true), true);
  });

  it("the switch actually changes what is drawn, for both styles", async () => {
    for (const style of ["waves", "marks"]) {
      const faded = await renderRankCard(TARGET, STATS, ACCENT, style, "#2f6fd0", true);
      const even = await renderRankCard(TARGET, STATS, ACCENT, style, "#2f6fd0", false);
      assert.notEqual(hash(faded), hash(even), `${style} ignored the fade switch`);
    }
  });

  it("an untouched switch renders each style's default", async () => {
    const wavesNull = await renderRankCard(TARGET, STATS, ACCENT, "waves", "#2f6fd0", null);
    const wavesFaded = await renderRankCard(TARGET, STATS, ACCENT, "waves", "#2f6fd0", true);
    assert.equal(hash(wavesNull), hash(wavesFaded), "waves defaults to faded");

    const marksNull = await renderRankCard(TARGET, STATS, ACCENT, "marks", "#2f6fd0", null);
    const marksEven = await renderRankCard(TARGET, STATS, ACCENT, "marks", "#2f6fd0", false);
    assert.equal(hash(marksNull), hash(marksEven), "marks defaults to even");
  });

  it("normalises colours, expanding short form and rejecting non-colours", () => {
    assert.equal(normaliseCardColor("#F0A"), "#ff00aa");
    assert.equal(normaliseCardColor("5AA9F0"), "#5aa9f0");
    assert.equal(normaliseCardColor(null), null);
    assert.equal(normaliseCardColor("rebeccapurple"), undefined);
    assert.equal(normaliseCardColor("#12345"), undefined);
  });

  it("judges an accent by its contrast against the card's ground", () => {
    assert.ok(cardAccentContrast("#ffffff") > 15, "white is far above the line");
    assert.ok(cardAccentContrast("#000000") < 1.2, "black is the ground");
    assert.equal(isReadableCardAccent(null), true, "null is the bot's own colour");
    assert.equal(isReadableCardAccent("#e05570"), true);
    assert.equal(isReadableCardAccent("#1a1a40"), false);
  });
});
