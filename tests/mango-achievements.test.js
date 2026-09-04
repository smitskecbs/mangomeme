/**
 * Tests for ManGo Labs Achievements V1 (pure storage + unlock helpers).
 * Run with: node tests/mango-achievements.test.js
 */

import assert from "node:assert/strict";
import {
  ACHIEVEMENTS,
  ACHIEVEMENTS_STORAGE_KEY,
  bounchAchievementForLevelClear,
  getAchievementById,
  getAchievementShareUiState,
  getUnlockedAchievements,
  isAchievementShared,
  isAchievementUnlocked,
  loadAchievementsMap,
  markAchievementShared,
  parseAchievementsStorage,
  snakeAchievementsForRun,
  shareAchievementOnX,
  unlockAchievement,
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
    _data: data,
  };
}

runTest("lege storage", () => {
  const storage = createMemoryStorage();
  assert.deepEqual(loadAchievementsMap(storage), {});
  assert.deepEqual(getUnlockedAchievements(storage), []);
  assert.equal(isAchievementUnlocked("snake-first-game", storage), false);
});

runTest("eerste unlock", () => {
  const storage = createMemoryStorage();
  const unlocked = unlockAchievement("snake-first-game", {
    storage,
    now: 1000,
    notify: false,
  });

  assert.equal(unlocked?.id, "snake-first-game");
  assert.equal(isAchievementUnlocked("snake-first-game", storage), true);
  assert.equal(getUnlockedAchievements(storage).length, 1);
  assert.equal(getUnlockedAchievements(storage)[0].unlockedAt, 1000);

  const raw = storage.getItem(ACHIEVEMENTS_STORAGE_KEY);
  assert.ok(raw);
  assert.match(raw, /snake-first-game/);
});

runTest("dubbele unlock geeft geen nieuwe notification", () => {
  const storage = createMemoryStorage();
  const first = unlockAchievement("snake-score-100", { storage, now: 1, notify: false });
  const second = unlockAchievement("snake-score-100", { storage, now: 2, notify: false });

  assert.ok(first);
  assert.equal(second, null);
  assert.equal(getUnlockedAchievements(storage).length, 1);
  assert.equal(loadAchievementsMap(storage)["snake-score-100"].unlockedAt, 1);
});

runTest("meerdere unlocks", () => {
  const storage = createMemoryStorage();
  const newly = unlockAchievements(["snake-first-game", "snake-score-100", "snake-score-500"], {
    storage,
    now: 42,
    notify: false,
  });

  assert.deepEqual(
    newly.map((item) => item.id),
    ["snake-first-game", "snake-score-100", "snake-score-500"]
  );
  assert.equal(getUnlockedAchievements(storage).length, 3);
});

runTest("corrupte storage", () => {
  assert.deepEqual(parseAchievementsStorage(null), {});
  assert.deepEqual(parseAchievementsStorage(""), {});
  assert.deepEqual(parseAchievementsStorage("not-json"), {});
  assert.deepEqual(parseAchievementsStorage("[]"), {});
  assert.deepEqual(parseAchievementsStorage("null"), {});
  assert.deepEqual(parseAchievementsStorage('{"snake-first-game":"bad"}'), {});
  assert.deepEqual(parseAchievementsStorage('{"snake-first-game":{"unlockedAt":"nope"}}'), {});

  const storage = createMemoryStorage({
    [ACHIEVEMENTS_STORAGE_KEY]: "{broken",
  });
  assert.deepEqual(loadAchievementsMap(storage), {});

  const ok = unlockAchievement("snake-first-game", { storage, now: 5, notify: false });
  assert.equal(ok?.id, "snake-first-game");
});

runTest("onbekende achievement-id wordt genegeerd", () => {
  const storage = createMemoryStorage();
  assert.equal(unlockAchievement("not-a-real-id", { storage, notify: false }), null);
  assert.deepEqual(
    unlockAchievements(["ghost", "snake-first-game", "also-fake"], {
      storage,
      now: 9,
      notify: false,
    }).map((item) => item.id),
    ["snake-first-game"]
  );
  assert.equal(getAchievementById("ghost"), undefined);
});

runTest("Snake score 99 → alleen First Snake Run", () => {
  assert.deepEqual(snakeAchievementsForRun(99), ["snake-first-game"]);
});

runTest("Snake score 100 → Starter", () => {
  assert.deepEqual(snakeAchievementsForRun(100), ["snake-first-game", "snake-score-100"]);
});

runTest("Snake score 499 → geen Climber", () => {
  assert.deepEqual(snakeAchievementsForRun(499), ["snake-first-game", "snake-score-100"]);
});

runTest("Snake score 500 → Starter + Climber", () => {
  assert.deepEqual(snakeAchievementsForRun(500), [
    "snake-first-game",
    "snake-score-100",
    "snake-score-500",
  ]);
});

runTest("Snake score 1499 → geen Master", () => {
  assert.deepEqual(snakeAchievementsForRun(1499), [
    "snake-first-game",
    "snake-score-100",
    "snake-score-500",
  ]);
});

runTest("Snake score 1500 of 2000 → Starter + Climber + Master", () => {
  const expected = [
    "snake-first-game",
    "snake-score-100",
    "snake-score-500",
    "snake-score-1500",
  ];
  assert.deepEqual(snakeAchievementsForRun(1500), expected);
  assert.deepEqual(snakeAchievementsForRun(2000), expected);
});

runTest("één run kan meerdere nieuwe achievements ontgrendelen", () => {
  const storage = createMemoryStorage();
  const ids = snakeAchievementsForRun(2000);
  const newly = unlockAchievements(ids, { storage, now: 7, notify: false });
  assert.deepEqual(
    newly.map((item) => item.id),
    ["snake-first-game", "snake-score-100", "snake-score-500", "snake-score-1500"]
  );

  const again = unlockAchievements(ids, { storage, now: 8, notify: false });
  assert.deepEqual(again, []);
});

runTest("Bounch Level 1 clear → juiste achievement", () => {
  assert.equal(bounchAchievementForLevelClear(1), "bounch-level-1");
});

runTest("Level 2 clear → geen nieuw level-achievement", () => {
  assert.equal(bounchAchievementForLevelClear(2), null);
});

runTest("Level 3/5/7 → juiste achievement", () => {
  assert.equal(bounchAchievementForLevelClear(3), "bounch-level-3");
  assert.equal(bounchAchievementForLevelClear(5), "bounch-level-5");
  assert.equal(bounchAchievementForLevelClear(7), "bounch-level-7");
});

runTest("Share on X is volledig uit de achievement-UI", () => {
  const storage = createMemoryStorage();
  unlockAchievement("snake-score-500", { storage, now: 1, notify: false });
  assert.equal(getAchievementShareUiState("snake-score-500", storage), "none");
  assert.equal(shareAchievementOnX("snake-score-500", { storage, now: 2 }), false);
  assert.equal(isAchievementShared("snake-score-500", storage), false);
});

runTest("oude storage met onbekende ids blijft bruikbaar", () => {
  const storage = createMemoryStorage({
    [ACHIEVEMENTS_STORAGE_KEY]: JSON.stringify({
      "future-badge": { unlockedAt: 11 },
      "snake-first-game": { unlockedAt: 12 },
    }),
  });

  const map = loadAchievementsMap(storage);
  assert.equal(map["future-badge"].unlockedAt, 11);
  assert.equal(map["snake-first-game"].unlockedAt, 12);
  assert.equal(getUnlockedAchievements(storage).length, 1);
  assert.equal(getUnlockedAchievements(storage)[0].id, "snake-first-game");

  unlockAchievement("snake-score-100", { storage, now: 13, notify: false });
  const after = loadAchievementsMap(storage);
  assert.equal(after["future-badge"].unlockedAt, 11);
  assert.equal(after["snake-score-100"].unlockedAt, 13);
});

runTest("V1 achievement set has exactly 8 definitions", () => {
  assert.equal(ACHIEVEMENTS.length, 8);
});

runTest("unlocked achievement start als niet gedeeld", () => {
  const storage = createMemoryStorage();
  unlockAchievement("snake-first-game", { storage, now: 1, notify: false });
  assert.equal(isAchievementShared("snake-first-game", storage), false);
  assert.equal(getAchievementShareUiState("snake-first-game", storage), "none");
  assert.equal(loadAchievementsMap(storage)["snake-first-game"].sharedAt, undefined);
});

runTest("mark shared voegt sharedAt toe", () => {
  const storage = createMemoryStorage();
  unlockAchievement("snake-score-100", { storage, now: 2, notify: false });
  assert.equal(markAchievementShared("snake-score-100", { storage, now: 20 }), true);
  assert.equal(isAchievementShared("snake-score-100", storage), true);
  assert.equal(loadAchievementsMap(storage)["snake-score-100"].sharedAt, 20);
  assert.equal(loadAchievementsMap(storage)["snake-score-100"].unlockedAt, 2);
});

runTest("shared-status blijft na opnieuw inlezen", () => {
  const storage = createMemoryStorage();
  unlockAchievement("snake-score-500", { storage, now: 3, notify: false });
  markAchievementShared("snake-score-500", { storage, now: 30 });

  const reloaded = loadAchievementsMap(storage);
  assert.equal(reloaded["snake-score-500"].unlockedAt, 3);
  assert.equal(reloaded["snake-score-500"].sharedAt, 30);
  assert.equal(isAchievementShared("snake-score-500", storage), true);
});

runTest("dubbel markeren veroorzaakt geen fout en overschrijft unlock niet", () => {
  const storage = createMemoryStorage();
  unlockAchievement("snake-first-game", { storage, now: 4, notify: false });
  assert.equal(markAchievementShared("snake-first-game", { storage, now: 40 }), true);
  assert.equal(markAchievementShared("snake-first-game", { storage, now: 99 }), true);
  const record = loadAchievementsMap(storage)["snake-first-game"];
  assert.equal(record.unlockedAt, 4);
  assert.equal(record.sharedAt, 40);
});

runTest("één gedeeld achievement beïnvloedt een ander niet", () => {
  const storage = createMemoryStorage();
  unlockAchievements(["snake-first-game", "snake-score-100"], {
    storage,
    now: 5,
    notify: false,
  });
  markAchievementShared("snake-first-game", { storage, now: 50 });
  assert.equal(isAchievementShared("snake-first-game", storage), true);
  assert.equal(isAchievementShared("snake-score-100", storage), false);
  assert.equal(getAchievementShareUiState("snake-score-100", storage), "none");
});

runTest("oude storage zonder sharedAt blijft geldig", () => {
  const storage = createMemoryStorage({
    [ACHIEVEMENTS_STORAGE_KEY]: JSON.stringify({
      "snake-first-game": { unlockedAt: 12 },
    }),
  });
  assert.equal(isAchievementUnlocked("snake-first-game", storage), true);
  assert.equal(isAchievementShared("snake-first-game", storage), false);
  assert.equal(getAchievementShareUiState("snake-first-game", storage), "none");
  assert.equal(parseAchievementsStorage('{"snake-first-game":{"unlockedAt":12}}')["snake-first-game"].sharedAt, undefined);
});

runTest("locked/onbekende id kan niet foutief gedeeld worden", () => {
  const storage = createMemoryStorage();
  assert.equal(markAchievementShared("snake-first-game", { storage, now: 1 }), false);
  assert.equal(markAchievementShared("not-real", { storage, now: 1 }), false);
  assert.equal(getAchievementShareUiState("snake-first-game", storage), "none");
  assert.equal(getAchievementShareUiState("ghost", storage), "none");
});

runTest("gallery-model toont geen Share of Shared voor Snake", () => {
  const storage = createMemoryStorage();
  unlockAchievement("snake-first-game", { storage, now: 6, notify: false });
  assert.equal(getAchievementShareUiState("snake-first-game", storage), "none");
  markAchievementShared("snake-first-game", { storage, now: 60 });
  assert.equal(getAchievementShareUiState("snake-first-game", storage), "none");
  assert.equal(shareAchievementOnX("snake-first-game", { storage }), false);
});

runTest("Bounch achievements bieden geen Share on X, ook niet na unlock", () => {
  const storage = createMemoryStorage();
  unlockAchievement("bounch-level-1", { storage, now: 6, notify: false });
  assert.equal(isAchievementUnlocked("bounch-level-1", storage), true);
  assert.equal(getAchievementShareUiState("bounch-level-1", storage), "none");
  assert.equal(shareAchievementOnX("bounch-level-1", { storage, now: 7 }), false);
  assert.equal(isAchievementShared("bounch-level-1", storage), false);
});

runTest("bestaande Bounch sharedAt blijft bewaard maar toont geen X-share UI", () => {
  const storage = createMemoryStorage({
    [ACHIEVEMENTS_STORAGE_KEY]: JSON.stringify({
      "bounch-level-1": { unlockedAt: 6, sharedAt: 60 },
    }),
  });
  assert.equal(isAchievementUnlocked("bounch-level-1", storage), true);
  assert.equal(isAchievementShared("bounch-level-1", storage), true);
  assert.equal(getAchievementShareUiState("bounch-level-1", storage), "none");
  assert.equal(loadAchievementsMap(storage)["bounch-level-1"].sharedAt, 60);
});

console.log("All mango achievements tests passed.");
