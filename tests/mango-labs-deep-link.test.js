/**
 * Tests for ManGo Labs ?game= deep-link open flow.
 * Run with: node tests/mango-labs-deep-link.test.js
 */

import assert from "node:assert/strict";
import {
  GAME_TOKEN_STORAGE_KEYS,
  captureGameIdentityFromLocation,
  getGameIdentityToken,
} from "../src/mangoGameIdentity.ts";
import {
  LABS_GAME_OPEN_BUTTON_IDS,
  getRequestedLabsGame,
  openLabsGameFromDeepLink,
} from "../src/mangoLabsDeepLink.ts";

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

runTest("getRequestedLabsGame: game=snake → snake", () => {
  assert.equal(getRequestedLabsGame("?game=snake"), "snake");
  assert.equal(getRequestedLabsGame("game=snake&t=SECRET"), "snake");
});

runTest("getRequestedLabsGame: game=bounch → bounch", () => {
  assert.equal(getRequestedLabsGame("?game=bounch"), "bounch");
  assert.equal(getRequestedLabsGame("?game=bounch&t=SECRET"), "bounch");
});

runTest("getRequestedLabsGame: missing game → null (normal Labs landing)", () => {
  assert.equal(getRequestedLabsGame(""), null);
  assert.equal(getRequestedLabsGame("?"), null);
  assert.equal(getRequestedLabsGame("?t=only-token"), null);
  assert.equal(getRequestedLabsGame("?utm=keep"), null);
});

runTest("getRequestedLabsGame: unknown game → null (normal Labs landing)", () => {
  assert.equal(getRequestedLabsGame("?game=pong"), null);
  assert.equal(getRequestedLabsGame("?game=Snake"), null);
  assert.equal(getRequestedLabsGame("?game="), null);
});

runTest("game=snake → Snake open/select flow (ms-open-game click)", () => {
  const clicks = [];
  const result = openLabsGameFromDeepLink({
    search: "?game=snake",
    openButton: (buttonId) => clicks.push(buttonId),
  });

  assert.equal(result.opened, "snake");
  assert.deepEqual(clicks, [LABS_GAME_OPEN_BUTTON_IDS.snake]);
  assert.equal(LABS_GAME_OPEN_BUTTON_IDS.snake, "ms-open-game");
});

runTest("game=bounch → Bounch open/select flow (mb-open-game click)", () => {
  const clicks = [];
  const result = openLabsGameFromDeepLink({
    search: "?game=bounch",
    openButton: (buttonId) => clicks.push(buttonId),
  });

  assert.equal(result.opened, "bounch");
  assert.deepEqual(clicks, [LABS_GAME_OPEN_BUTTON_IDS.bounch]);
  assert.equal(LABS_GAME_OPEN_BUTTON_IDS.bounch, "mb-open-game");
});

runTest("missing game → no open (normal Labs landing)", () => {
  const clicks = [];
  const result = openLabsGameFromDeepLink({
    search: "",
    openButton: (buttonId) => clicks.push(buttonId),
  });

  assert.equal(result.opened, null);
  assert.deepEqual(clicks, []);
});

runTest("unknown game → no open (normal Labs landing)", () => {
  const clicks = [];
  const result = openLabsGameFromDeepLink({
    search: "?game=pong&t=x",
    openButton: (buttonId) => clicks.push(buttonId),
  });

  assert.equal(result.opened, null);
  assert.deepEqual(clicks, []);
});

runTest("token capture happens before deep link; t removed, game stays", () => {
  const storage = createMemoryStorage();
  let replacedUrl = null;
  const clicks = [];

  const capture = captureGameIdentityFromLocation({
    search: "?game=snake&t=SECRET-TOKEN",
    pathname: "/mango-labs",
    storage,
    historyReplaceState: (_data, _unused, url) => {
      replacedUrl = url;
    },
  });

  // Deep link reads post-capture URL shape: game remains, t gone.
  const cleanedSearch = "?game=snake";
  const open = openLabsGameFromDeepLink({
    search: cleanedSearch,
    openButton: (buttonId) => clicks.push(buttonId),
  });

  assert.equal(capture.captured, true);
  assert.equal(capture.game, "snake");
  assert.equal(capture.urlCleaned, true);
  assert.equal(replacedUrl, "/mango-labs?game=snake");
  assert.ok(!String(replacedUrl).includes("t="));
  assert.ok(!String(replacedUrl).includes("SECRET-TOKEN"));
  assert.equal(getGameIdentityToken("snake", storage), "SECRET-TOKEN");
  assert.equal(open.opened, "snake");
  assert.deepEqual(clicks, ["ms-open-game"]);
});

runTest("bounch capture + deep link: t removed, game stays, identity unchanged", () => {
  const storage = createMemoryStorage();
  let replacedUrl = null;

  const capture = captureGameIdentityFromLocation({
    search: "?game=bounch&t=BOUNCH-SECRET",
    pathname: "/mango-labs",
    storage,
    historyReplaceState: (_data, _unused, url) => {
      replacedUrl = url;
    },
  });

  const open = openLabsGameFromDeepLink({
    search: "?game=bounch",
    openButton: () => {},
  });

  assert.equal(capture.captured, true);
  assert.equal(replacedUrl, "/mango-labs?game=bounch");
  assert.ok(!String(replacedUrl).includes("t="));
  assert.equal(storage.getItem(GAME_TOKEN_STORAGE_KEYS.bounch), "BOUNCH-SECRET");
  assert.equal(getGameIdentityToken("bounch", storage), "BOUNCH-SECRET");
  assert.equal(open.opened, "bounch");
});

runTest("deep link causes no double game-init (open once via button, never init)", () => {
  let initCalls = 0;
  const openCalls = [];

  // Simulate labs.ts order: capture → init once each → deep-link open.
  captureGameIdentityFromLocation({
    search: "?game=snake&t=tok",
    pathname: "/mango-labs",
    storage: createMemoryStorage(),
    historyReplaceState: () => {},
  });
  initCalls += 1; // initMangoSnake
  initCalls += 1; // initMangoBounch

  openLabsGameFromDeepLink({
    search: "?game=snake",
    openButton: (buttonId) => openCalls.push(buttonId),
  });

  assert.equal(initCalls, 2);
  assert.deepEqual(openCalls, ["ms-open-game"]);
  assert.equal(openCalls.length, 1);
});

runTest("manual Snake select path still available (same button id, repeatable)", () => {
  const clicks = [];
  const openButton = (buttonId) => clicks.push(buttonId);

  openLabsGameFromDeepLink({ search: "?game=snake", openButton });
  // Manual Start game uses the same button id — deep link does not consume/disable it.
  openButton(LABS_GAME_OPEN_BUTTON_IDS.snake);

  assert.deepEqual(clicks, ["ms-open-game", "ms-open-game"]);
});

runTest("manual Bounch select path still available (same button id, repeatable)", () => {
  const clicks = [];
  const openButton = (buttonId) => clicks.push(buttonId);

  openLabsGameFromDeepLink({ search: "?game=bounch", openButton });
  openButton(LABS_GAME_OPEN_BUTTON_IDS.bounch);

  assert.deepEqual(clicks, ["mb-open-game", "mb-open-game"]);
});

runTest("identity/sessionStorage behavior unchanged when deep-linking without t", () => {
  const storage = createMemoryStorage({
    [GAME_TOKEN_STORAGE_KEYS.snake]: "already-captured",
  });

  const capture = captureGameIdentityFromLocation({
    search: "?game=snake",
    pathname: "/mango-labs",
    storage,
    historyReplaceState: () => {
      throw new Error("should not rewrite URL when t is absent");
    },
  });

  const open = openLabsGameFromDeepLink({
    search: "?game=snake",
    openButton: () => {},
  });

  assert.equal(capture.captured, false);
  assert.equal(capture.urlCleaned, false);
  assert.equal(getGameIdentityToken("snake", storage), "already-captured");
  assert.equal(open.opened, "snake");
});

console.log("\nAll mango labs deep-link tests passed.");
