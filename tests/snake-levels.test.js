/**
 * ManGo Snake difficulty levels — layout, collision, spawn, scoring, selection.
 * Run with: node --import ./tests/_ts-register.mjs tests/snake-levels.test.js
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SNAKE_BONUS_EVERY,
  SNAKE_GRID_CELLS,
  SNAKE_LEVELS,
  applySnakeLevelSelection,
  blockedKeysForSpawn,
  calculateSnakeScore,
  canChangeSnakeLevel,
  cellKey,
  firstMoveIsSafe,
  freezeActiveLevel,
  formatSnakeGameOverMessage,
  getFirstMoveCell,
  getInitialSnake,
  getObstaclesForLevel,
  getSnakeLevelDef,
  isInsideBoard,
  isSnakeLevelFreelySelectable,
  loadStoredSnakeLevel,
  maxBonusMangoesForCount,
  normalizeSnakeLevel,
  parseSnakeLevel,
  pickFreeCell,
  saveStoredSnakeLevel,
  scoreForFiveMangoBonus,
  scoreForMango,
  snakeDiesAt,
  startingSnakeOverlapsObstacles,
  wrapPoint,
} from "../src/snakeLevels.ts";
import { buildSnakeHighscoreBody } from "../src/mangoGameIdentity.ts";
import { snakeAchievementsForRun } from "../src/mangoAchievements.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BOARD = { cols: SNAKE_GRID_CELLS, rows: SNAKE_GRID_CELLS };

function runTest(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

runTest("exactly 4 freely selectable levels", () => {
  assert.equal(SNAKE_LEVELS.length, 4);
  assert.deepEqual(
    SNAKE_LEVELS.map((level) => level.id),
    [1, 2, 3, 4]
  );
  assert.equal(getSnakeLevelDef(1).fullName, "🥭 Level 1 — Classic");
  assert.equal(getSnakeLevelDef(2).fullName, "🧱 Level 2 — Walls");
  assert.equal(getSnakeLevelDef(3).fullName, "🎯 Level 3 — Center");
  assert.equal(getSnakeLevelDef(4).fullName, "🔥 Level 4 — Danger Zone");
  for (const id of [1, 2, 3, 4]) {
    assert.equal(isSnakeLevelFreelySelectable(id), true);
  }
});

runTest("level 1 has no internal obstacles", () => {
  assert.equal(getObstaclesForLevel(1, BOARD).size, 0);
});

runTest("level 2 has wall segments away from spawn", () => {
  const obstacles = getObstaclesForLevel(2, BOARD);
  assert.ok(obstacles.size >= 6);
  assert.equal(startingSnakeOverlapsObstacles(2, BOARD), false);
});

runTest("level 3 has a center obstacle", () => {
  const obstacles = getObstaclesForLevel(3, BOARD);
  assert.ok(obstacles.has(cellKey(8, 7)));
  assert.ok(obstacles.has(cellKey(9, 8)));
  assert.equal(obstacles.has(cellKey(9, 9)), false);
});

runTest("level 4 has corners plus center", () => {
  const obstacles = getObstaclesForLevel(4, BOARD);
  assert.ok(obstacles.has(cellKey(0, 0)));
  assert.ok(obstacles.has(cellKey(17, 0)));
  assert.ok(obstacles.has(cellKey(0, 17)));
  assert.ok(obstacles.has(cellKey(17, 17)));
  assert.ok(obstacles.has(cellKey(8, 7)));
  assert.ok(obstacles.has(cellKey(9, 8)));
});

runTest("layouts stay on the board and never overlap spawn", () => {
  for (const level of [1, 2, 3, 4]) {
    const obstacles = getObstaclesForLevel(level, BOARD);
    for (const key of obstacles) {
      const point = key.split(":").map((part) => Number(part));
      assert.equal(isInsideBoard({ x: point[0], y: point[1] }, BOARD), true);
    }
    assert.equal(startingSnakeOverlapsObstacles(level, BOARD), false);
    assert.equal(firstMoveIsSafe(level, BOARD), true);
  }
});

runTest("invalid level defaults on the client and rejects as unselectable", () => {
  assert.equal(normalizeSnakeLevel(null), 1);
  assert.equal(normalizeSnakeLevel("nope"), 1);
  assert.equal(normalizeSnakeLevel(0), 1);
  assert.equal(normalizeSnakeLevel(5), 1);
  assert.equal(normalizeSnakeLevel(1.5), 1);
  assert.equal(parseSnakeLevel(5), null);
  assert.equal(parseSnakeLevel("2"), 2);
  assert.equal(isSnakeLevelFreelySelectable(99), false);
});

runTest("obstacle hit kills, adjacent cell does not", () => {
  const obstacles = getObstaclesForLevel(3, BOARD);
  assert.equal(
    snakeDiesAt({ x: 8, y: 7 }, { body: getInitialSnake(BOARD), obstacles }),
    "obstacle"
  );
  assert.equal(
    snakeDiesAt({ x: 7, y: 7 }, { body: getInitialSnake(BOARD), obstacles }),
    null
  );
});

runTest("self collision and wrap-around boundary stay classic", () => {
  const snake = [
    { x: 5, y: 5 },
    { x: 4, y: 5 },
    { x: 3, y: 5 },
  ];
  assert.equal(snakeDiesAt({ x: 4, y: 5 }, { body: snake, obstacles: new Set() }), "self");
  assert.deepEqual(wrapPoint({ x: -1, y: 5 }, BOARD), { x: 17, y: 5 });
  assert.deepEqual(wrapPoint({ x: 18, y: 18 }, BOARD), { x: 0, y: 0 });
  assert.equal(
    snakeDiesAt(wrapPoint({ x: -1, y: 5 }, BOARD), {
      body: snake,
      obstacles: new Set(),
    }),
    null
  );
});

runTest("obstacle collision works on levels 2-4 and first move is safe", () => {
  for (const level of [2, 3, 4]) {
    const obstacles = getObstaclesForLevel(level, BOARD);
    const first = [...obstacles][0].split(":").map((part) => Number(part));
    assert.equal(
      snakeDiesAt({ x: first[0], y: first[1] }, { body: getInitialSnake(BOARD), obstacles }),
      "obstacle"
    );
    assert.equal(firstMoveIsSafe(level, BOARD), true);
  }
});

runTest("mango never spawns on snake, obstacle, or outside the board", () => {
  const snake = getInitialSnake(BOARD);
  const obstacles = getObstaclesForLevel(4, BOARD);
  const blocked = blockedKeysForSpawn({ snake, obstacles });
  const seen = new Set();

  for (let index = 0; index < 40; index += 1) {
    const cell = pickFreeCell({ board: BOARD, blocked });
    assert.ok(cell);
    assert.equal(blocked.has(cellKey(cell.x, cell.y)), false);
    assert.equal(isInsideBoard(cell, BOARD), true);
    seen.add(cellKey(cell.x, cell.y));
  }

  assert.ok(seen.size >= 1);
});

runTest("bounded random attempts fall back to a scan", () => {
  const blocked = new Set();
  for (let y = 0; y < BOARD.rows; y += 1) {
    for (let x = 0; x < BOARD.cols; x += 1) {
      if (!(x === 17 && y === 17)) {
        blocked.add(cellKey(x, y));
      }
    }
  }

  const cell = pickFreeCell({
    board: BOARD,
    blocked,
    random: () => 0,
    attempts: 4,
  });
  assert.deepEqual(cell, { x: 17, y: 17 });
});

runTest("nearly full board returns null instead of looping", () => {
  const blocked = new Set();
  for (let y = 0; y < BOARD.rows; y += 1) {
    for (let x = 0; x < BOARD.cols; x += 1) {
      blocked.add(cellKey(x, y));
    }
  }

  assert.equal(pickFreeCell({ board: BOARD, blocked, attempts: 8 }), null);
});

runTest("Level 1 scoring matches historic 10 / +50 bonus mango", () => {
  assert.equal(scoreForMango(1), 10);
  assert.equal(scoreForFiveMangoBonus(1), 50);
  assert.equal(SNAKE_BONUS_EVERY, 5);
  assert.equal(calculateSnakeScore({ mangoCount: 1, level: 1, bonusMangoesEaten: 0 }), 10);
});

runTest("difficulty multipliers 2/3/4", () => {
  assert.equal(scoreForMango(2), 20);
  assert.equal(scoreForMango(3), 30);
  assert.equal(scoreForMango(4), 40);
  assert.equal(scoreForFiveMangoBonus(2), 100);
  assert.equal(scoreForFiveMangoBonus(3), 150);
  assert.equal(scoreForFiveMangoBonus(4), 200);
});

runTest("every-5-mango bonus scales and stays optional until collected", () => {
  assert.equal(calculateSnakeScore({ mangoCount: 4, level: 1, bonusMangoesEaten: 0 }), 40);
  assert.equal(maxBonusMangoesForCount(4), 0);
  assert.equal(calculateSnakeScore({ mangoCount: 5, level: 1, bonusMangoesEaten: 0 }), 50);
  assert.equal(calculateSnakeScore({ mangoCount: 5, level: 1, bonusMangoesEaten: 1 }), 100);
  assert.equal(calculateSnakeScore({ mangoCount: 10, level: 1, bonusMangoesEaten: 2 }), 200);
  assert.equal(calculateSnakeScore({ mangoCount: 5, level: 2, bonusMangoesEaten: 1 }), 200);
  assert.equal(calculateSnakeScore({ mangoCount: 5, level: 3, bonusMangoesEaten: 1 }), 300);
  assert.equal(calculateSnakeScore({ mangoCount: 5, level: 4, bonusMangoesEaten: 1 }), 400);
});

runTest("score formula is deterministic", () => {
  const first = calculateSnakeScore({ mangoCount: 12, level: 4, bonusMangoesEaten: 2 });
  const second = calculateSnakeScore({ mangoCount: 12, level: 4, bonusMangoesEaten: 2 });
  assert.equal(first, 12 * 40 + 2 * 200);
  assert.equal(first, second);
});

runTest("default level is Classic and level 4 is immediately selectable", () => {
  assert.equal(normalizeSnakeLevel(undefined), 1);
  assert.equal(isSnakeLevelFreelySelectable(4), true);
  assert.equal(applySnakeLevelSelection(1, 4, "idle"), 4);
});

runTest("no unlock requirement — any 1-4 pick is allowed", () => {
  assert.equal(applySnakeLevelSelection(1, 4, "idle"), 4);
  assert.equal(applySnakeLevelSelection(4, 1, "over"), 1);
  assert.equal(applySnakeLevelSelection(1, 3, "idle"), 3);
});

runTest("active level is frozen during a run", () => {
  assert.equal(canChangeSnakeLevel("playing"), false);
  assert.equal(canChangeSnakeLevel("paused"), false);
  assert.equal(canChangeSnakeLevel("ending"), false);
  assert.equal(applySnakeLevelSelection(2, 4, "playing"), 2);
  assert.equal(freezeActiveLevel(3), 3);
});

runTest("restart keeps the selected level; change after game over works", () => {
  assert.equal(canChangeSnakeLevel("over"), true);
  assert.equal(canChangeSnakeLevel("idle"), true);
  const selected = applySnakeLevelSelection(4, 4, "over");
  assert.equal(freezeActiveLevel(selected), 4);
  assert.equal(applySnakeLevelSelection(4, 1, "over"), 1);
});

runTest("personal-link submit body stays compatible and can add level metadata", () => {
  assert.deepEqual(buildSnakeHighscoreBody("Kevin", 120, "token-1"), {
    name: "Kevin",
    score: 120,
    t: "token-1",
  });
  assert.deepEqual(
    buildSnakeHighscoreBody("Kevin", 200, "token-1", {
      level: 4,
      mangoCount: 5,
      bonusMangoesEaten: 1,
    }),
    {
      name: "Kevin",
      score: 200,
      t: "token-1",
      level: 4,
      mangoCount: 5,
      bonusMangoesEaten: 1,
    }
  );
});

runTest("achievements still key off raw score, not difficulty id", () => {
  assert.deepEqual(snakeAchievementsForRun(90), ["snake-first-game"]);
  assert.ok(snakeAchievementsForRun(100).includes("snake-score-100"));
  assert.ok(snakeAchievementsForRun(500).includes("snake-score-500"));
});

runTest("game-over copy and stored level fallback", () => {
  const message = formatSnakeGameOverMessage({
    level: 4,
    mangoCount: 12,
    score: 520,
    best: 740,
  });
  assert.match(message, /Game Over/);
  assert.match(message, /Danger Zone/);
  assert.match(message, /12/);
  assert.match(message, /520/);
  assert.match(message, /740/);

  const memory = new Map();
  const storage = {
    getItem(key) {
      return memory.has(key) ? memory.get(key) : null;
    },
    setItem(key, value) {
      memory.set(key, String(value));
    },
  };
  assert.equal(loadStoredSnakeLevel(storage), 1);
  saveStoredSnakeLevel(4, storage);
  assert.equal(loadStoredSnakeLevel(storage), 4);
  memory.set("mango-snake-selected-level", "nope");
  assert.equal(loadStoredSnakeLevel(storage), 1);
});

runTest("labs page has an unlock-free difficulty selector", () => {
  const html = readFileSync(join(ROOT, "mango-labs.html"), "utf8");
  assert.match(html, /data-snake-level="1"/);
  assert.match(html, /data-snake-level="2"/);
  assert.match(html, /data-snake-level="3"/);
  assert.match(html, /data-snake-level="4"/);
  assert.match(html, /ms-change-level/);
  assert.doesNotMatch(html, /Unlock Level/);
  assert.doesNotMatch(html, /xp required/i);
});

runTest("starting snake has a reachable first-move cell", () => {
  const snake = getInitialSnake(BOARD);
  const first = getFirstMoveCell(BOARD);
  assert.equal(snake[0].x + 1, first.x);
  assert.equal(snake[0].y, first.y);
});

console.log("\nAll snake level tests passed.");
