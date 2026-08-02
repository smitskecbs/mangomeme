/**
 * Tests for Bounch player-name validation.
 * Run with: node tests/bounch-player-name.test.js
 */

import assert from "node:assert/strict";
import {
  BOUNCH_MAX_PLAYER_NAME_LENGTH,
  BOUNCH_PLAYER_NAME_KEY,
  isValidBounchPlayerName,
  normalizeBounchPlayerName,
  validateBounchPlayerName,
} from "../src/bounchPlayerName.ts";

function runTest(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

runTest("storage key is Bounch-only", () => {
  assert.equal(BOUNCH_PLAYER_NAME_KEY, "mango-bounch-player-name");
});

runTest("max length matches backend", () => {
  assert.equal(BOUNCH_MAX_PLAYER_NAME_LENGTH, 24);
});

runTest("trims and collapses whitespace", () => {
  assert.equal(normalizeBounchPlayerName("  ManGo   Player  "), "ManGo Player");
});

runTest("accepts valid names", () => {
  const result = validateBounchPlayerName("ManGo_Player-1");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.name, "ManGo_Player-1");
  }
});

runTest("rejects empty / whitespace-only", () => {
  assert.equal(validateBounchPlayerName("").ok, false);
  assert.equal(validateBounchPlayerName("   ").ok, false);
  assert.equal(validateBounchPlayerName(null).ok, false);
  assert.equal(isValidBounchPlayerName(""), false);
});

runTest("rejects too long", () => {
  const tooLong = "a".repeat(BOUNCH_MAX_PLAYER_NAME_LENGTH + 1);
  const result = validateBounchPlayerName(tooLong);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /24/);
  }
});

runTest("rejects disallowed characters", () => {
  assert.equal(validateBounchPlayerName("Hi!").ok, false);
  assert.equal(validateBounchPlayerName("name@mail").ok, false);
  assert.equal(validateBounchPlayerName("emoji 🥭").ok, false);
});

runTest("accepts max-length valid name", () => {
  const exact = "a".repeat(BOUNCH_MAX_PLAYER_NAME_LENGTH);
  assert.equal(isValidBounchPlayerName(exact), true);
});

console.log("All bounch player-name tests passed.");
