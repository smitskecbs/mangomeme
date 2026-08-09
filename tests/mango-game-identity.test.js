/**
 * Tests for ManGo Labs game identity (opaque Telegram signed tokens).
 * Run with: node tests/mango-game-identity.test.js
 */

import assert from "node:assert/strict";
import {
  GAME_TOKEN_STORAGE_KEYS,
  buildBounchHighscoreBody,
  buildSnakeHighscoreBody,
  captureGameIdentityFromLocation,
  getGameIdentityToken,
  isMangoGameId,
} from "../src/mangoGameIdentity.ts";

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
    _data: data,
  };
}

runTest("accepts only snake and bounch game ids", () => {
  assert.equal(isMangoGameId("snake"), true);
  assert.equal(isMangoGameId("bounch"), true);
  assert.equal(isMangoGameId("pong"), false);
  assert.equal(isMangoGameId(""), false);
  assert.equal(isMangoGameId(null), false);
});

runTest("?game=snake&t=TOKEN → Snake sessionStorage", () => {
  const storage = createMemoryStorage();
  const result = captureGameIdentityFromLocation({
    search: "?game=snake&t=test-snake-token",
    pathname: "/mango-labs",
    storage,
    historyReplaceState: () => {},
  });

  assert.equal(result.captured, true);
  assert.equal(result.game, "snake");
  assert.equal(storage.getItem(GAME_TOKEN_STORAGE_KEYS.snake), "test-snake-token");
  assert.equal(storage.getItem(GAME_TOKEN_STORAGE_KEYS.bounch), null);
});

runTest("?game=bounch&t=TOKEN → Bounch sessionStorage", () => {
  const storage = createMemoryStorage();
  const result = captureGameIdentityFromLocation({
    search: "?game=bounch&t=test-bounch-token",
    pathname: "/mango-labs",
    storage,
    historyReplaceState: () => {},
  });

  assert.equal(result.captured, true);
  assert.equal(result.game, "bounch");
  assert.equal(storage.getItem(GAME_TOKEN_STORAGE_KEYS.bounch), "test-bounch-token");
  assert.equal(storage.getItem(GAME_TOKEN_STORAGE_KEYS.snake), null);
});

runTest("Snake token does not touch Bounch key", () => {
  const storage = createMemoryStorage({
    [GAME_TOKEN_STORAGE_KEYS.bounch]: "existing-bounch",
  });

  captureGameIdentityFromLocation({
    search: "?game=snake&t=only-snake",
    pathname: "/mango-labs",
    storage,
    historyReplaceState: () => {},
  });

  assert.equal(storage.getItem(GAME_TOKEN_STORAGE_KEYS.snake), "only-snake");
  assert.equal(storage.getItem(GAME_TOKEN_STORAGE_KEYS.bounch), "existing-bounch");
});

runTest("Bounch token does not touch Snake key", () => {
  const storage = createMemoryStorage({
    [GAME_TOKEN_STORAGE_KEYS.snake]: "existing-snake",
  });

  captureGameIdentityFromLocation({
    search: "?game=bounch&t=only-bounch",
    pathname: "/mango-labs",
    storage,
    historyReplaceState: () => {},
  });

  assert.equal(storage.getItem(GAME_TOKEN_STORAGE_KEYS.bounch), "only-bounch");
  assert.equal(storage.getItem(GAME_TOKEN_STORAGE_KEYS.snake), "existing-snake");
});

runTest("unknown game → nothing stored", () => {
  const storage = createMemoryStorage();
  const result = captureGameIdentityFromLocation({
    search: "?game=pong&t=should-not-store",
    pathname: "/mango-labs",
    storage,
    historyReplaceState: () => {},
  });

  assert.equal(result.captured, false);
  assert.equal(result.game, null);
  assert.deepEqual(storage._data, {});
});

runTest("missing t → nothing stored", () => {
  const storage = createMemoryStorage();
  const result = captureGameIdentityFromLocation({
    search: "?game=snake",
    pathname: "/mango-labs",
    storage,
    historyReplaceState: () => {},
  });

  assert.equal(result.captured, false);
  assert.equal(result.game, "snake");
  assert.deepEqual(storage._data, {});
});

runTest("empty t → nothing stored", () => {
  const storage = createMemoryStorage();
  const result = captureGameIdentityFromLocation({
    search: "?game=bounch&t=%20%20",
    pathname: "/mango-labs",
    storage,
    historyReplaceState: () => {},
  });

  assert.equal(result.captured, false);
  assert.deepEqual(storage._data, {});
});

runTest("token remains available from sessionStorage after capture", () => {
  const storage = createMemoryStorage();
  captureGameIdentityFromLocation({
    search: "?game=snake&t=opaque-session-token",
    pathname: "/mango-labs",
    storage,
    historyReplaceState: () => {},
  });

  assert.equal(getGameIdentityToken("snake", storage), "opaque-session-token");
  assert.equal(getGameIdentityToken("bounch", storage), null);
});

runTest("Snake submit with token → body contains t", () => {
  const body = buildSnakeHighscoreBody("Kevin", 120, "snake-opaque-t");
  assert.deepEqual(body, { name: "Kevin", score: 120, t: "snake-opaque-t" });
});

runTest("Snake submit without token → body omits t", () => {
  assert.deepEqual(buildSnakeHighscoreBody("Kevin", 120), { name: "Kevin", score: 120 });
  assert.deepEqual(buildSnakeHighscoreBody("Kevin", 120, null), {
    name: "Kevin",
    score: 120,
  });
  assert.deepEqual(buildSnakeHighscoreBody("Kevin", 120, ""), {
    name: "Kevin",
    score: 120,
  });
});

runTest("Bounch submit with token → body contains t", () => {
  const body = buildBounchHighscoreBody("Kevin", 3, "bounch-opaque-t");
  assert.deepEqual(body, { name: "Kevin", level: 3, t: "bounch-opaque-t" });
});

runTest("Bounch submit without token → body omits t", () => {
  assert.deepEqual(buildBounchHighscoreBody("Kevin", 3), { name: "Kevin", level: 3 });
  assert.deepEqual(buildBounchHighscoreBody("Kevin", 3, null), {
    name: "Kevin",
    level: 3,
  });
});

runTest("Snake token is never sent on Bounch body builder", () => {
  const snakeToken = getGameIdentityToken(
    "snake",
    createMemoryStorage({
      [GAME_TOKEN_STORAGE_KEYS.snake]: "snake-only",
      [GAME_TOKEN_STORAGE_KEYS.bounch]: "bounch-only",
    })
  );
  const bounchToken = getGameIdentityToken(
    "bounch",
    createMemoryStorage({
      [GAME_TOKEN_STORAGE_KEYS.snake]: "snake-only",
      [GAME_TOKEN_STORAGE_KEYS.bounch]: "bounch-only",
    })
  );

  const bounchBody = buildBounchHighscoreBody("Player", 2, bounchToken);
  assert.equal(bounchBody.t, "bounch-only");
  assert.notEqual(bounchBody.t, snakeToken);

  const snakeBody = buildSnakeHighscoreBody("Player", 50, snakeToken);
  assert.equal(snakeBody.t, "snake-only");
  assert.notEqual(snakeBody.t, bounchToken);
});

runTest("URL token is removed via replaceState without reload", () => {
  const storage = createMemoryStorage();
  let replacedUrl = null;

  const result = captureGameIdentityFromLocation({
    search: "?game=snake&t=visible-bearer&utm=keep",
    pathname: "/mango-labs",
    hash: "#mango-snake",
    storage,
    historyState: { keep: true },
    historyReplaceState: (_data, _unused, url) => {
      replacedUrl = url;
    },
  });

  assert.equal(result.captured, true);
  assert.equal(result.urlCleaned, true);
  assert.equal(storage.getItem(GAME_TOKEN_STORAGE_KEYS.snake), "visible-bearer");
  assert.equal(replacedUrl, "/mango-labs?game=snake&utm=keep#mango-snake");
  assert.ok(!String(replacedUrl).includes("t="));
  assert.ok(!String(replacedUrl).includes("visible-bearer"));
});

runTest("score response body builders stay compatible without token", () => {
  const snake = buildSnakeHighscoreBody("ManGo Player", 760);
  const bounch = buildBounchHighscoreBody("ManGo Player", 5);

  assert.equal(Object.keys(snake).sort().join(","), "name,score");
  assert.equal(Object.keys(bounch).sort().join(","), "level,name");
  assert.equal("t" in snake, false);
  assert.equal("t" in bounch, false);
});

runTest("storage keys are session-scoped names", () => {
  assert.equal(GAME_TOKEN_STORAGE_KEYS.snake, "mango-game-token-snake");
  assert.equal(GAME_TOKEN_STORAGE_KEYS.bounch, "mango-game-token-bounch");
});

console.log("\nAll mango game identity tests passed.");
