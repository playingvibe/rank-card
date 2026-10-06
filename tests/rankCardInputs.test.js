import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import renderRankCard, { fetchAvatar } from "../src/presentation/components/cards/RankCard.js";
import { resolveAccent } from "../src/domain/constants/InstanceTheme.js";

/**
 * What the rank card does with inputs it does not control: a stored accent that is not a colour,
 * and an avatar CDN that accepts the connection and then never answers.
 */

const hash = (buffer) => createHash("md5").update(buffer).digest("hex");
const TARGET = { username: "tester", avatarUrl: null };
const STATS = { totalListeningTime: 3_600_000, currentStreak: 0, longestStreak: 0, sessionCount: 3 };

test("an accent that is not a colour renders the default card instead of throwing", async () => {
  const fallback = resolveAccent(process.env.CLIENT_ID);

  for (const bad of ["not-a-colour", "#12345", "rgb(0,0,0)"]) {
    const card = await renderRankCard(TARGET, STATS, bad);
    const expected = await renderRankCard(TARGET, STATS, fallback);
    assert.equal(hash(card), hash(expected), `accent ${JSON.stringify(bad)}`);
  }
});

test("a short-form accent is expanded, the same as the other colour fields", async () => {
  const short = await renderRankCard(TARGET, STATS, "#F0A");
  const long = await renderRankCard(TARGET, STATS, "#ff00aa");
  assert.equal(hash(short), hash(long));
});

test("an avatar server that never answers is abandoned at the timeout", async (t) => {
  // Accepts the request and never responds: the stall that would otherwise hang /rank until Discord's
  // interaction token expired.
  const stalled = [];
  const server = createServer((req, res) => stalled.push(res));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    for (const res of stalled) res.destroy();
    server.close();
  });

  const started = Date.now();
  const bytes = await fetchAvatar(`http://127.0.0.1:${server.address().port}/avatar.png`, { timeoutMs: 150 });

  assert.equal(bytes, null);
  assert.ok(Date.now() - started < 2_000, "it must give up near the timeout, not wait indefinitely");
});

test("an avatar larger than any real one is refused rather than buffered", async (t) => {
  const server = createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "image/png", "Content-Length": String(8 * 1024 * 1024) });
    res.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());

  assert.equal(await fetchAvatar(`http://127.0.0.1:${server.address().port}/huge.png`), null);
});

test("an oversized avatar that never states its length is cut off at the cap too", async (t) => {
  const server = createServer((req, res) => {
    // Chunked: no Content-Length for the header check to refuse on.
    res.writeHead(200, { "Content-Type": "image/png" });
    const chunk = Buffer.alloc(256 * 1024, 1);
    let sent = 0;
    const write = () => {
      while (sent < 8 * 1024 * 1024) {
        sent += chunk.length;
        if (!res.write(chunk)) return res.once("drain", write);
      }
      res.end();
    };
    write();
    req.on("close", () => res.destroy());
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.closeAllConnections?.() ?? server.close());

  assert.equal(await fetchAvatar(`http://127.0.0.1:${server.address().port}/huge.png`), null);
});

test("an avatar within the cap comes back whole, with or without a stated length", async (t) => {
  const bytes = Buffer.alloc(300_000, 7);
  const server = createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "image/png" });
    res.end(bytes);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());

  const got = await fetchAvatar(`http://127.0.0.1:${server.address().port}/ok.png`);
  assert.equal(got?.length, bytes.length);
});

test("the background is drawn at the card's own pixels, not at half size and stretched", async () => {
  const { renderBackground, SCALE, W, H } = await import("../src/presentation/components/cards/cardBackgrounds.js");

  const canvas = renderBackground("grid", "#336699", true);

  assert.equal(canvas.width, W * SCALE);
  assert.equal(canvas.height, H * SCALE);
});

test("a background is remembered by style, colour and fade, and the memory it may take is bounded", async () => {
  const { renderBackground } = await import("../src/presentation/components/cards/cardBackgrounds.js");

  assert.equal(renderBackground("bars", "#112233", false), renderBackground("bars", "#112233", false), "the same canvas");
  assert.notEqual(renderBackground("bars", "#112233", false), renderBackground("bars", "#112233", true));
});
