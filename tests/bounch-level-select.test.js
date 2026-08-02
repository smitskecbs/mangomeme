/**
 * Tests for Bounch level-select unlock helpers.
 * Run with: node tests/bounch-level-select.test.js
 */

import assert from "node:assert/strict";
import {
  bounchLevelSelectTriggersSubmitOrUnlock,
  canSelectBounchLevel,
  resolveBounchLevelSelection,
  resolveBounchMaxUnlockedLevel,
  shouldShowBounchLevelSelectButton,
} from "../src/bounchLevelSelect.ts";

const LEVEL_COUNT = 7;

function runTest(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

runTest("best 0 → max unlocked 1", () => {
  assert.equal(resolveBounchMaxUnlockedLevel(0, LEVEL_COUNT), 1);
});

runTest("best 1 → max unlocked 2", () => {
  assert.equal(resolveBounchMaxUnlockedLevel(1, LEVEL_COUNT), 2);
});

runTest("best 4 → max unlocked 5", () => {
  assert.equal(resolveBounchMaxUnlockedLevel(4, LEVEL_COUNT), 5);
});

runTest("best 6 → max unlocked 7", () => {
  assert.equal(resolveBounchMaxUnlockedLevel(6, LEVEL_COUNT), 7);
});

runTest("best 7 → max unlocked 7", () => {
  assert.equal(resolveBounchMaxUnlockedLevel(7, LEVEL_COUNT), 7);
});

runTest("invalid best → 1", () => {
  assert.equal(resolveBounchMaxUnlockedLevel(null, LEVEL_COUNT), 1);
  assert.equal(resolveBounchMaxUnlockedLevel(Number.NaN, LEVEL_COUNT), 1);
  assert.equal(resolveBounchMaxUnlockedLevel("nope", LEVEL_COUNT), 1);
  assert.equal(resolveBounchMaxUnlockedLevel(-1, LEVEL_COUNT), 1);
});

runTest("locked level selecteren → geweigerd", () => {
  assert.equal(canSelectBounchLevel(3, 1, LEVEL_COUNT), false);
  assert.equal(resolveBounchLevelSelection(3, 1, LEVEL_COUNT), null);
  assert.equal(canSelectBounchLevel(7, 0, LEVEL_COUNT), false);
  assert.equal(canSelectBounchLevel(8, 7, LEVEL_COUNT), false);
  assert.equal(canSelectBounchLevel(1.5, 7, LEVEL_COUNT), false);
});

runTest("unlocked level selecteren → toegestaan", () => {
  assert.equal(resolveBounchLevelSelection(1, 0, LEVEL_COUNT), 1);
  assert.equal(resolveBounchLevelSelection(2, 1, LEVEL_COUNT), 2);
  assert.equal(resolveBounchLevelSelection(1, 7, LEVEL_COUNT), 1);
  assert.equal(resolveBounchLevelSelection(4, 7, LEVEL_COUNT), 4);
  assert.equal(resolveBounchLevelSelection(7, 7, LEVEL_COUNT), 7);
  assert.equal(resolveBounchLevelSelection("5", 7, LEVEL_COUNT), 5);
});

runTest("level-select button visibility", () => {
  assert.equal(shouldShowBounchLevelSelectButton("ready"), true);
  assert.equal(shouldShowBounchLevelSelectButton("playing"), true);
  assert.equal(shouldShowBounchLevelSelectButton("paused"), true);
  assert.equal(shouldShowBounchLevelSelectButton("over"), true);
  assert.equal(shouldShowBounchLevelSelectButton("won"), true);
  assert.equal(shouldShowBounchLevelSelectButton("naming"), false);
  assert.equal(shouldShowBounchLevelSelectButton("idle"), false);
});

runTest("level kiezen triggert geen submit/achievement", () => {
  assert.equal(bounchLevelSelectTriggersSubmitOrUnlock(), false);
});

console.log("All bounch level-select tests passed.");
