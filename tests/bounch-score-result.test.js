/**
 * Tests for Bounch score result formatting.
 * Run with: node tests/bounch-score-result.test.js
 */

import assert from "node:assert/strict";
import {
  formatBounchScoreResult,
  isBounchHighscoreApiResponse,
} from "../src/bounchScoreResult.ts";

function runTest(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

runTest("new global best message", () => {
  const message = formatBounchScoreResult(
    {
      ok: true,
      personalBest: true,
      personalBestImproved: true,
      isNewGlobal: true,
      bestLevel: 5,
      rank: 1,
    },
    5
  );

  assert.match(message, /New global best! Level 5/);
  assert.match(message, /Best: Level 5/);
  assert.match(message, /Global rank: #1/);
});

runTest("new personal best message", () => {
  const message = formatBounchScoreResult(
    {
      ok: true,
      personalBest: true,
      personalBestImproved: true,
      isNewGlobal: false,
      bestLevel: 4,
      rank: 3,
    },
    4
  );

  assert.match(message, /New personal best! Level 4/);
  assert.match(message, /Best: Level 4/);
  assert.match(message, /Global rank: #3/);
  assert.doesNotMatch(message, /New global best/);
});

runTest("regular clear message", () => {
  const message = formatBounchScoreResult(
    {
      ok: true,
      personalBest: false,
      personalBestImproved: false,
      isNewGlobal: false,
      bestLevel: 3,
      rank: 7,
    },
    2
  );

  assert.doesNotMatch(message, /New personal best/);
  assert.doesNotMatch(message, /New global best/);
  assert.match(message, /Best: Level 3/);
  assert.match(message, /Global rank: #7/);
});

runTest("rank omitted when missing", () => {
  const message = formatBounchScoreResult(
    {
      ok: true,
      bestLevel: 2,
    },
    2
  );

  assert.match(message, /Best: Level 2/);
  assert.doesNotMatch(message, /Global rank/);
});

runTest("valid api response detection", () => {
  assert.equal(isBounchHighscoreApiResponse({ ok: true }), true);
  assert.equal(isBounchHighscoreApiResponse({ ok: false }), false);
  assert.equal(isBounchHighscoreApiResponse(null), false);
});

runTest("verified XP with unlock is shown", () => {
  const message = formatBounchScoreResult(
    {
      ok: true,
      personalBest: true,
      personalBestImproved: true,
      isNewGlobal: false,
      bestLevel: 4,
      rank: 2,
      identity: { verified: true },
      xp: { awarded: 5, dailyPlay: 1, unlock: 4 },
    },
    4
  );
  assert.match(message, /Game XP: \+5/);
  assert.match(message, /daily \+1/);
  assert.match(message, /unlock \+4/);
});

runTest("unverified Bounch submit shows no XP line", () => {
  const message = formatBounchScoreResult(
    {
      ok: true,
      bestLevel: 2,
      rank: 5,
      identity: { verified: false },
      xp: { awarded: 0, dailyPlay: 0, unlock: 0 },
    },
    2
  );
  assert.doesNotMatch(message, /Game XP/);
});

console.log("\nAll bounch score result tests passed.");
