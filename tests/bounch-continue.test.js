/**
 * Tests for Bounch continue / start-level resolution.
 * Run with: node tests/bounch-continue.test.js
 */

import assert from "node:assert/strict";
import { resolveBounchContinueLevel } from "../src/bounchContinue.ts";

const LEVEL_COUNT = 5;

function runTest(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

runTest("best 0 → Level 1", () => {
  assert.equal(resolveBounchContinueLevel(0, LEVEL_COUNT), 1);
});

runTest("best 1 → Level 2", () => {
  assert.equal(resolveBounchContinueLevel(1, LEVEL_COUNT), 2);
});

runTest("best 2 → Level 3", () => {
  assert.equal(resolveBounchContinueLevel(2, LEVEL_COUNT), 3);
});

runTest("best 3 → Level 4", () => {
  assert.equal(resolveBounchContinueLevel(3, LEVEL_COUNT), 4);
});

runTest("best 4 → Level 5", () => {
  assert.equal(resolveBounchContinueLevel(4, LEVEL_COUNT), 5);
});

runTest("best 5 → Level 5", () => {
  assert.equal(resolveBounchContinueLevel(5, LEVEL_COUNT), 5);
});

runTest("missing / null → Level 1", () => {
  assert.equal(resolveBounchContinueLevel(null, LEVEL_COUNT), 1);
  assert.equal(resolveBounchContinueLevel(undefined, LEVEL_COUNT), 1);
  assert.equal(resolveBounchContinueLevel("", LEVEL_COUNT), 1);
});

runTest("invalid / NaN → Level 1", () => {
  assert.equal(resolveBounchContinueLevel(Number.NaN, LEVEL_COUNT), 1);
  assert.equal(resolveBounchContinueLevel("nope", LEVEL_COUNT), 1);
  assert.equal(resolveBounchContinueLevel(-1, LEVEL_COUNT), 1);
  assert.equal(resolveBounchContinueLevel(-3.5, LEVEL_COUNT), 1);
});

runTest("too high → clamp to Level 5", () => {
  assert.equal(resolveBounchContinueLevel(6, LEVEL_COUNT), 5);
  assert.equal(resolveBounchContinueLevel(99, LEVEL_COUNT), 5);
  assert.equal(resolveBounchContinueLevel("12", LEVEL_COUNT), 5);
});

runTest("string numeric best is accepted", () => {
  assert.equal(resolveBounchContinueLevel("3", LEVEL_COUNT), 4);
});

console.log("All bounch continue tests passed.");
