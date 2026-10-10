# Vibe: rank card

The image `/rank` draws in [Vibe](https://playvibe.gg), a Discord music bot: a person's level, listening
time, streaks, tracks and badges, on a card in the same visual language as the Activity. It is a single
canvas renderer that takes plain data and returns PNG bytes, with no Discord and no database, so anyone can
run it, change it and see the result in seconds.

Bugs, ideas and pull requests are welcome, especially fixes to how the card looks and new backgrounds. The
bot itself is not public; this repository is the part of the project that is.

## Run it locally

You need Node 22 or newer.

```bash
npm ci
node scripts/assets/render-rank-card.js --out out/card.png
node scripts/assets/render-rank-card-backgrounds.js --out out
```

The second command renders the plain card and one card per background, and lays them side by side in
`out/backgrounds-sheet.png`.

To render your own numbers, call the renderer directly:

```js
import fs from "node:fs";
import renderRankCard from "./src/presentation/components/cards/RankCard.js";

const png = await renderRankCard(
  { username: "mara", avatarUrl: null },                    // who; null draws an initial
  { totalListeningTime: 227 * 3600 * 1000, currentStreak: 12, longestStreak: 31, sessionCount: 640 },
  "#ff295e",                                                // accent (null for the default)
  "bars",                                                   // background style, or null
  "#ff295e",                                                // background colour
  null,                                                     // fade, null for the style's default
  true                                                      // premium: draws the crown
);
fs.writeFileSync("out/card.png", png);
```

| Argument | Meaning |
|---|---|
| `target` | `{ username, avatarUrl }`. An avatar URL is fetched with a timeout; `null` draws the initial |
| `stats` | `totalListeningTime` in ms, `currentStreak`, `longestStreak`, `sessionCount`, optional `voting` |
| `accent` | The colour of the level, the bar and the streak; invalid values fall back to the default |
| `background` | One of `CARD_BACKGROUND_STYLES` in `src/domain/constants/CardBackgrounds.js`, or `null` |
| `backgroundColor`, `fade` | Tint and strength of the background; `null` for the defaults |
| `premium` | Draws the crown. The caller decides; the card holds no entitlement logic |

## Checks

```bash
npm run lint
npm test
```

CI runs both on every pull request, with no access to any secret.

## What is where

```
src/presentation/components/cards/RankCard.js   the renderer, its layout and every background
src/domain/constants/CardBackgrounds.js         the list of background styles (the keys)
src/domain/badges.js, src/shared/format/        badge tiers, levels and durations the card draws
scripts/assets/                                 render scripts
tests/                                          node:test files
resource/fonts/, resource/emojis/badge_*        Outfit and the badge art the card loads
docs/architecture.md                            how the renderer is organised
```

Some of these modules are shared with the bot and the website. A change to a threshold, a tier or the level
curve changes the bot too, so a maintainer reviews those closely; changes to `RankCard.js` and the
backgrounds are the everyday contribution.

## How changes flow

The maintainers' private repository is the source of truth and this one is a mirror of the card and what it
needs. A merged pull request here is re-applied there by a maintainer, and the next publish carries it back,
so the history you see here may be rewritten when that happens. Nothing you send is lost by it.

## Licence

The code is [MIT](LICENSE). That covers everything except:

- **The Vibe name and logo,** which are the project's brand and are not licensed for use as another bot's
  or service's identity.
- **The badge art** (`resource/emojis/badge_*`), which is part of the artwork in
  [playingvibe/brand](https://github.com/playingvibe/brand) and follows the licence there (CC BY-NC 4.0).
- **Outfit** (`resource/fonts/`), by The Outfit Project Authors, under the SIL Open Font License 1.1
  ([`resource/fonts/OFL-Outfit.txt`](resource/fonts/OFL-Outfit.txt)).

Related: [playingvibe/activity](https://github.com/playingvibe/activity),
[playingvibe/brand](https://github.com/playingvibe/brand),
[playingvibe/website](https://github.com/playingvibe/website).

## Security

Please report a vulnerability privately, not in an issue: see [SECURITY.md](SECURITY.md).
