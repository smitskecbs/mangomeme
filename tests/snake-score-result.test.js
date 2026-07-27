/**
 * Tests for Snake score result formatting.
 * Run with: node tests/snake-score-result.test.js
 */

import assert from "node:assert/strict";
import {
  formatSnakeScoreResult,
  isSnakeHighscoreApiResponse,
} from "../src/snakeScoreResult.ts";

function runTest(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

runTest("new global highscore message", () => {
  const message = formatSnakeScoreResult(
    {
      ok: true,
      personalBest: true,
      personalBestImproved: true,
      isNewGlobal: true,
      score: 760,
      personalBestScore: 760,
      rank: 1,
      globalHighScore: 760,
      globalHighScoreName: "Kevin",
    },
    760
  );

  assert.match(message.title, /NEW GLOBAL HIGHSCORE/);
  assert.match(message.body, /760/);
  assert.match(message.body, /#1/);
});

runTest("new personal best message", () => {
  const message = formatSnakeScoreResult(
    {
      ok: true,
      personalBest: true,
      personalBestImproved: true,
      isNewGlobal: false,
      score: 710,
      personalBestScore: 710,
      rank: 2,
      globalHighScore: 760,
      globalHighScoreName: "Kevin",
    },
    710
  );

  assert.match(message.title, /NEW PERSONAL BEST/);
  assert.match(message.body, /710/);
  assert.match(message.body, /#2/);
});

runTest("no personal best message", () => {
  const message = formatSnakeScoreResult(
    {
      ok: true,
      personalBest: false,
      personalBestImproved: false,
      score: 520,
      personalBestScore: 730,
      rank: 3,
      globalHighScore: 760,
      globalHighScoreName: "Kevin",
    },
    520
  );

  assert.match(message.title, /Nice run/);
  assert.match(message.body, /520/);
  assert.match(message.body, /730/);
  assert.match(message.body, /#3/);
  assert.match(message.body, /760 by Kevin/);
});

runTest("equal score is treated as no personal best", () => {
  const message = formatSnakeScoreResult(
    {
      ok: true,
      personalBest: false,
      personalBestImproved: false,
      score: 730,
      personalBestScore: 730,
      rank: 1,
      globalHighScore: 760,
      globalHighScoreName: "Kevin",
    },
    730
  );

  assert.match(message.title, /Nice run/);
});

runTest("valid api response detection", () => {
  assert.equal(isSnakeHighscoreApiResponse({ ok: true }), true);
  assert.equal(isSnakeHighscoreApiResponse({ ok: false }), false);
  assert.equal(isSnakeHighscoreApiResponse(null), false);
});

console.log("\nAll snake score result tests passed.");
