/**
 * Tests for Snake pause/stop session helpers.
 * Run with: node tests/snake-session-controls.test.js
 */

import assert from "node:assert/strict";
import {
  canPauseSnake,
  canResumeSnake,
  canStopSnakeRun,
  canToggleSnakePause,
  shouldShowSnakeSessionControls,
  snakePauseButtonLabel,
  snakeStateAfterPauseToggle,
  snakeStateAfterStop,
} from "../src/snakeSessionControls.ts";

function runTest(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

runTest("playing → pause", () => {
  assert.equal(canPauseSnake("playing"), true);
  assert.equal(snakeStateAfterPauseToggle("playing"), "paused");
});

runTest("pause → resume", () => {
  assert.equal(canResumeSnake("paused"), true);
  assert.equal(snakeStateAfterPauseToggle("paused"), "playing");
});

runTest("pause stopt movement (no toggle outside playing/paused)", () => {
  assert.equal(canToggleSnakePause("idle"), false);
  assert.equal(canToggleSnakePause("over"), false);
  assert.equal(canToggleSnakePause("ending"), false);
  assert.equal(snakeStateAfterPauseToggle("idle"), null);
});

runTest("stop vanuit playing → ready/idle", () => {
  assert.equal(canStopSnakeRun("playing"), true);
  assert.equal(snakeStateAfterStop("playing"), "idle");
});

runTest("stop vanuit paused → ready/idle", () => {
  assert.equal(canStopSnakeRun("paused"), true);
  assert.equal(snakeStateAfterStop("paused"), "idle");
});

runTest("stop veroorzaakt geen finalize vanuit idle/over", () => {
  assert.equal(snakeStateAfterStop("idle"), null);
  assert.equal(snakeStateAfterStop("over"), null);
  assert.equal(snakeStateAfterStop("ending"), null);
});

runTest("session controls alleen tijdens playing/paused", () => {
  assert.equal(shouldShowSnakeSessionControls("playing"), true);
  assert.equal(shouldShowSnakeSessionControls("paused"), true);
  assert.equal(shouldShowSnakeSessionControls("idle"), false);
  assert.equal(shouldShowSnakeSessionControls("over"), false);
});

runTest("pause button label wisselt", () => {
  assert.equal(snakePauseButtonLabel("playing"), "⏸ Pause");
  assert.equal(snakePauseButtonLabel("paused"), "▶ Resume");
});

runTest("meerdere pause/resume-cycli blijven geldig", () => {
  let state = "playing";
  state = snakeStateAfterPauseToggle(state);
  assert.equal(state, "paused");
  state = snakeStateAfterPauseToggle(state);
  assert.equal(state, "playing");
  state = snakeStateAfterPauseToggle(state);
  assert.equal(state, "paused");
  state = snakeStateAfterPauseToggle(state);
  assert.equal(state, "playing");
});

console.log("All snake session control tests passed.");
