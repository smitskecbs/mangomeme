/**
 * Tests for Bounch pause/stop session helpers.
 * Run with: node tests/bounch-session-controls.test.js
 */

import assert from "node:assert/strict";
import {
  bounchPauseButtonLabel,
  bounchStateAfterPauseToggle,
  bounchStateAfterStop,
  bounchStopTriggersSubmitOrUnlock,
  canPauseBounch,
  canResumeBounch,
  canStopBounchRun,
  shouldShowBounchSessionControls,
} from "../src/bounchSessionControls.ts";
import {
  bounchAchievementForLevelClear,
  unlockAchievements,
} from "../src/mangoAchievements.ts";

function runTest(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

function createMemoryStorage(initial = {}) {
  const data = { ...initial };

  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    },
  };
}

runTest("playing → paused", () => {
  assert.equal(canPauseBounch("playing"), true);
  assert.equal(bounchStateAfterPauseToggle("playing"), "paused");
});

runTest("paused → playing", () => {
  assert.equal(canResumeBounch("paused"), true);
  assert.equal(bounchStateAfterPauseToggle("paused"), "playing");
});

runTest("pause niet in ready/name/over/won", () => {
  assert.equal(canPauseBounch("ready"), false);
  assert.equal(canPauseBounch("naming"), false);
  assert.equal(canPauseBounch("over"), false);
  assert.equal(canPauseBounch("won"), false);
  assert.equal(canPauseBounch("idle"), false);
});

runTest("stop vanuit playing/paused → zelfde level ready", () => {
  assert.equal(canStopBounchRun("playing"), true);
  assert.equal(canStopBounchRun("paused"), true);
  assert.equal(bounchStateAfterStop("playing"), "ready");
  assert.equal(bounchStateAfterStop("paused"), "ready");
});

runTest("stop veroorzaakt geen submit/unlock/Best-update", () => {
  assert.equal(bounchStopTriggersSubmitOrUnlock(), false);
  assert.equal(bounchStateAfterStop("won"), null);
  assert.equal(bounchStateAfterStop("over"), null);
  assert.equal(bounchStateAfterStop("ready"), null);
});

runTest("session controls alleen tijdens playing/paused", () => {
  assert.equal(shouldShowBounchSessionControls("playing"), true);
  assert.equal(shouldShowBounchSessionControls("paused"), true);
  assert.equal(shouldShowBounchSessionControls("ready"), false);
  assert.equal(shouldShowBounchSessionControls("over"), false);
});

runTest("pause button label wisselt", () => {
  assert.equal(bounchPauseButtonLabel("playing"), "⏸ Pause");
  assert.equal(bounchPauseButtonLabel("paused"), "▶ Resume");
});

runTest("nieuwe Level 1-clear kan First Bounch unlocken", () => {
  assert.equal(bounchAchievementForLevelClear(1), "bounch-level-1");
  const storage = createMemoryStorage();
  const newly = unlockAchievements(["bounch-level-1"], { storage, now: 1, notify: false });
  assert.equal(newly.length, 1);
  assert.equal(newly[0].id, "bounch-level-1");
});

runTest("reeds unlocked achievement toont geen tweede unlock", () => {
  const storage = createMemoryStorage();
  unlockAchievements(["bounch-level-1"], { storage, now: 1, notify: false });
  const again = unlockAchievements(["bounch-level-1"], { storage, now: 2, notify: false });
  assert.deepEqual(again, []);
});

runTest("Stop en game-over unlocken geen Bounch-achievement", () => {
  assert.equal(bounchAchievementForLevelClear(2), null);
  assert.equal(bounchStateAfterStop("playing"), "ready");
  assert.equal(bounchStopTriggersSubmitOrUnlock(), false);
});

console.log("All bounch session control tests passed.");
