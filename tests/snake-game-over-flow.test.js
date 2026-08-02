/**
 * Regression tests for Snake game-over share vs stop/achievement toast deferral.
 * Run with: node tests/snake-game-over-flow.test.js
 */

import assert from "node:assert/strict";
import {
  flushDeferredAchievementToasts,
  getUnlockedAchievements,
  unlockAchievements,
} from "../src/mangoAchievements.ts";
import { planSnakeGameOverSideEffects } from "../src/snakeSessionControls.ts";

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

runTest("normale game-over triggert share + deferred toast", () => {
  const plan = planSnakeGameOverSideEffects({
    source: "finalize",
    sharingEnabled: true,
  });
  assert.equal(plan.unlockAchievements, true);
  assert.equal(plan.openShareModal, true);
  assert.equal(plan.deferAchievementToast, true);
});

runTest("game-over zonder sharing opent geen share", () => {
  const plan = planSnakeGameOverSideEffects({
    source: "finalize",
    sharingEnabled: false,
  });
  assert.equal(plan.openShareModal, false);
  assert.equal(plan.deferAchievementToast, false);
  assert.equal(plan.unlockAchievements, true);
});

runTest("Stop triggert geen finalize/share-submitflow", () => {
  const plan = planSnakeGameOverSideEffects({
    source: "stop",
    sharingEnabled: true,
  });
  assert.equal(plan.unlockAchievements, false);
  assert.equal(plan.openShareModal, false);
  assert.equal(plan.deferAchievementToast, false);
});

runTest("modal dismiss triggert geen share", () => {
  const plan = planSnakeGameOverSideEffects({
    source: "dismiss",
    sharingEnabled: true,
  });
  assert.equal(plan.openShareModal, false);
  assert.equal(plan.unlockAchievements, false);
});

runTest("deferToast unlockt wel, flush toont later", () => {
  const storage = createMemoryStorage();
  const newly = unlockAchievements(["snake-first-game"], {
    storage,
    now: 10,
    deferToast: true,
  });
  assert.equal(newly.length, 1);
  assert.equal(getUnlockedAchievements(storage).length, 1);

  // Flush is a no-throw side-effect hook (listener may be null in Node).
  flushDeferredAchievementToasts();
  assert.equal(getUnlockedAchievements(storage).length, 1);
});

runTest("pause/resume blokkeert latere normale game-over niet", () => {
  const afterPauseResume = planSnakeGameOverSideEffects({
    source: "finalize",
    sharingEnabled: true,
  });
  assert.equal(afterPauseResume.openShareModal, true);
  assert.equal(afterPauseResume.unlockAchievements, true);
});

console.log("All snake game-over flow tests passed.");
