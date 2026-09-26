# Contributing

Thank you for helping. This repository is the rank card of [Vibe](https://playvibe.gg): the canvas renderer
behind `/rank`. The bot is a separate, private project.

## Ways to help

- **Report a bug** with the bug template: the data you rendered with (numbers and names are fine, real
  people's private details are not), the image you got, and what you expected.
- **Fix how the card looks**: alignment, truncation, contrast, a long name, an unusual streak. Small fixes
  can go straight to a pull request.
- **Propose or build a background** (below).
- **Suggest something** with the suggestion template. Say what problem it solves before what it looks like.

Security problems do not go in an issue: see [SECURITY.md](SECURITY.md).

## Set up

```bash
npm ci
node scripts/assets/render-rank-card-backgrounds.js --out out   # every background, side by side
```

## Before you open a pull request

- `npm run lint` and `npm test` pass.
- You rendered it with awkward data, not only the friendly example: a 32-character wide-glyph name, no
  badges, every badge, a streak of 0 and of 100+, the maximum level, a missing avatar.
- If you changed how it looks, before and after images are attached (the contact-sheet script makes this
  easy).
- One change per pull request, with a description of what and why.

CI runs lint and the tests on every pull request, with no access to any secret.

## Backgrounds

A background is a style drawn behind the card's content. Each one exists **twice**: as a canvas drawing here
and as CSS in the [Activity](https://github.com/playingvibe/activity), so a user's choice looks the same on
both. A new background is therefore **two pull requests**, one to each repository, linked to each other.

To add one here:

1. Add its entry (`key`, `name`, `description`) to `CARD_BACKGROUND_STYLES` in
   `src/domain/constants/CardBackgrounds.js`. The key is lowercase and URL-safe, and is stored on people's
   profiles, so it can't be renamed later.
2. Draw it in `drawBackground` in `RankCard.js`. It takes the tint colour and a fade; the card puts a veil
   over it before drawing text, so any colour is safe, but the text and badges must stay readable.
3. Add a test that the style renders and that an unknown key falls back to the plain card
   (see the existing background tests).
4. Render the contact sheet and attach it.

Keep it quiet: it sits behind numbers people read. Prefer a few strokes or a low-contrast pattern over
anything busy.

## Style

- Plain modern JavaScript (ES modules) with JSDoc where the name doesn't say enough; match the code around
  your change.
- The layout is in logical units drawn at a scale, so it stays crisp on high-DPI screens. Use the existing
  constants rather than raw pixels.
- A comment records a reason the code cannot show (a Discord limit, a text-measuring quirk, a trade-off). It
  does not restate the code.
- Commit messages use a short conventional prefix (`fix(rank): ...`, `feat(rank): ...`).

## Shared modules

`level.js`, `duration.js`, `badges.js` and `CardBackgrounds.js` are also used by the bot and the website.
Changing a threshold, a tier or the level curve changes those too, so open an issue first and expect closer
review.

## What you can rely on when you contribute

- **Your work stays yours, under the repository's licence.** By opening a pull request you confirm that you
  wrote the change (or have the right to submit it), and you license it under the repository's
  [MIT licence](LICENSE).
- **Don't include anything you don't have the right to.** No copied images, fonts or icons, and no
  third-party logos or characters. If a change includes AI-generated code or art, say so in the pull request.
- **The Vibe name, logo and badge art aren't covered by the MIT licence** (see the README).
- **Reviews.** A maintainer reviews every pull request. Changes are re-applied to the maintainers' private
  repository, which is the source of truth, and the next publish carries them back here.

## Conduct

Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md).
