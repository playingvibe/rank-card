// Renders the rank card once per background style and lays them side by side in one image.
import fs from "node:fs";
import path from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import renderRankCard from "../../src/presentation/components/cards/RankCard.js";
import { CARD_BACKGROUND_STYLES } from "../../src/domain/constants/CardBackgrounds.js";

/**
 * A contact sheet of every card background: the plain card first, then one card per style in
 * `CARD_BACKGROUND_STYLES`, each with the same prop stats and the default background colour, so a
 * new or changed style can be judged next to the others. Also writes each card on its own.
 *
 * Usage:  node scripts/assets/render-rank-card-backgrounds.js [--out <dir>]
 * Output: <dir>/backgrounds-sheet.png and <dir>/card-<key>.png (default dir: ./out)
 */

const argIndex = process.argv.indexOf("--out");
const OUT = path.resolve(argIndex > -1 ? process.argv[argIndex + 1] : "out");

const TARGET = { username: "mara", avatarUrl: null };
const STATS = {
  totalListeningTime: 227 * 60 * 60 * 1000,
  currentStreak: 12,
  longestStreak: 31,
  sessionCount: 640,
};

const GAP = 24;
const LABEL = 44;

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const entries = [{ key: "plain", name: "Plain" }, ...CARD_BACKGROUND_STYLES.map(({ key, name }) => ({ key, name }))];
  const cards = [];
  for (const { key, name } of entries) {
    const png = await renderRankCard(TARGET, STATS, undefined, key === "plain" ? null : key);
    fs.writeFileSync(path.join(OUT, `card-${key}.png`), png);
    cards.push({ name, image: await loadImage(png) });
  }

  const cell = cards[0].image;
  const columns = 2;
  const rows = Math.ceil(cards.length / columns);
  const width = columns * cell.width + (columns + 1) * GAP;
  const height = rows * (cell.height + LABEL) + (rows + 1) * GAP;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#313338";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#b5bac1";
  ctx.font = "28px sans-serif";
  cards.forEach(({ name, image }, i) => {
    const x = GAP + (i % columns) * (cell.width + GAP);
    const y = GAP + Math.floor(i / columns) * (cell.height + LABEL + GAP);
    ctx.drawImage(image, x, y);
    ctx.fillText(name, x, y + cell.height + 32);
  });

  const sheet = path.join(OUT, "backgrounds-sheet.png");
  fs.writeFileSync(sheet, canvas.toBuffer("image/png"));
  console.log(`${cards.length} cards, sheet at ${path.relative(process.cwd(), sheet)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
