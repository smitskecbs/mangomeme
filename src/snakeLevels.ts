/**
 * ManGo Snake difficulty levels — obstacles, spawn safety, and score formula.
 * Pure helpers. Level 1 scoring matches the historic Classic rules:
 *   mango = 10, timed 5-mango bonus mango = 50 if collected.
 * Harder levels use the same formula × level multiplier.
 */

export const SNAKE_GRID_CELLS = 18;
export const SNAKE_INITIAL_LENGTH = 3;
export const SNAKE_BASE_MANGO_POINTS = 10;
export const SNAKE_BASE_BONUS_POINTS = 50;
export const SNAKE_BONUS_EVERY = 5;
export const SNAKE_SPAWN_ATTEMPTS = 64;
export const SNAKE_MAX_MANGO_COUNT = 5000;
export const SNAKE_MAX_SCORE = 100_000;
export const SNAKE_DEFAULT_LEVEL = 1;
export const SNAKE_LEVEL_STORAGE_KEY = "mango-snake-selected-level";

export type SnakeDifficultyLevel = 1 | 2 | 3 | 4;
export type SnakeSessionPhase = "idle" | "playing" | "paused" | "ending" | "over";
export type SnakeDeathKind = "self" | "obstacle" | null;

export interface SnakeBoardConfig {
  cols: number;
  rows: number;
}

export interface SnakeGridPoint {
  x: number;
  y: number;
}

export interface SnakeLevelDef {
  id: SnakeDifficultyLevel;
  emoji: string;
  shortName: string;
  buttonLabel: string;
  fullName: string;
  leaderboardTag: string;
  multiplier: number;
}

export const SNAKE_LEVELS: readonly SnakeLevelDef[] = Object.freeze([
  Object.freeze({
    id: 1,
    emoji: "🥭",
    shortName: "Classic",
    buttonLabel: "🥭 Classic",
    fullName: "🥭 Level 1 — Classic",
    leaderboardTag: "🥭 L1",
    multiplier: 1,
  }),
  Object.freeze({
    id: 2,
    emoji: "🧱",
    shortName: "Walls",
    buttonLabel: "🧱 Walls",
    fullName: "🧱 Level 2 — Walls",
    leaderboardTag: "🧱 L2",
    multiplier: 2,
  }),
  Object.freeze({
    id: 3,
    emoji: "🎯",
    shortName: "Center",
    buttonLabel: "🎯 Center",
    fullName: "🎯 Level 3 — Center",
    leaderboardTag: "🎯 L3",
    multiplier: 3,
  }),
  Object.freeze({
    id: 4,
    emoji: "🔥",
    shortName: "Danger Zone",
    buttonLabel: "🔥 Danger Zone",
    fullName: "🔥 Level 4 — Danger Zone",
    leaderboardTag: "🔥 L4",
    multiplier: 4,
  }),
]);

const LEVEL_BY_ID = new Map<SnakeDifficultyLevel, SnakeLevelDef>(
  SNAKE_LEVELS.map((level) => [level.id, level])
);

export function isSnakeDifficultyLevel(value: unknown): value is SnakeDifficultyLevel {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

export function parseSnakeLevel(raw: unknown): SnakeDifficultyLevel | null {
  if (typeof raw === "boolean" || raw === null || raw === undefined || raw === "") {
    return null;
  }

  const parsed = typeof raw === "number" ? raw : Number.parseInt(String(raw), 10);

  if (!Number.isInteger(parsed) || !isSnakeDifficultyLevel(parsed)) {
    return null;
  }

  return parsed;
}

/** Client/local fallback: invalid or missing → Classic. */
export function normalizeSnakeLevel(raw: unknown): SnakeDifficultyLevel {
  return parseSnakeLevel(raw) ?? SNAKE_DEFAULT_LEVEL;
}

export function getSnakeLevelDef(raw: unknown): SnakeLevelDef {
  return LEVEL_BY_ID.get(normalizeSnakeLevel(raw)) as SnakeLevelDef;
}

/** No XP/BP/title gate — every listed level is always selectable. */
export function isSnakeLevelFreelySelectable(raw: unknown): boolean {
  return parseSnakeLevel(raw) !== null;
}

export function canChangeSnakeLevel(state: SnakeSessionPhase): boolean {
  return state === "idle" || state === "over";
}

export function applySnakeLevelSelection(
  selectedLevel: unknown,
  nextLevel: unknown,
  state: SnakeSessionPhase
): SnakeDifficultyLevel {
  if (!canChangeSnakeLevel(state)) {
    return normalizeSnakeLevel(selectedLevel);
  }

  const parsed = parseSnakeLevel(nextLevel);
  return parsed ?? normalizeSnakeLevel(selectedLevel);
}

export function freezeActiveLevel(selectedLevel: unknown): SnakeDifficultyLevel {
  return normalizeSnakeLevel(selectedLevel);
}

export function scoreForMango(level: unknown): number {
  return SNAKE_BASE_MANGO_POINTS * normalizeSnakeLevel(level);
}

export function scoreForFiveMangoBonus(level: unknown): number {
  return SNAKE_BASE_BONUS_POINTS * normalizeSnakeLevel(level);
}

export function maxBonusMangoesForCount(mangoCount: number): number {
  if (!Number.isInteger(mangoCount) || mangoCount < 0) {
    return 0;
  }

  return Math.floor(mangoCount / SNAKE_BONUS_EVERY);
}

export function calculateSnakeScore(input: {
  mangoCount: number;
  level?: unknown;
  bonusMangoesEaten?: number;
}): number {
  const mangoCount = Number.isInteger(input.mangoCount) && input.mangoCount > 0 ? input.mangoCount : 0;
  const level = normalizeSnakeLevel(input.level);
  const maxBonus = maxBonusMangoesForCount(mangoCount);
  const bonusRaw = input.bonusMangoesEaten;
  const bonusMangoesEaten =
    Number.isInteger(bonusRaw) && (bonusRaw as number) >= 0
      ? Math.min(bonusRaw as number, maxBonus)
      : 0;

  return mangoCount * scoreForMango(level) + bonusMangoesEaten * scoreForFiveMangoBonus(level);
}

export function cellKey(x: number, y: number): string {
  return `${x}:${y}`;
}

export function parseCellKey(key: string): SnakeGridPoint | null {
  const parts = String(key).split(":");
  if (parts.length !== 2) {
    return null;
  }

  const x = Number.parseInt(parts[0], 10);
  const y = Number.parseInt(parts[1], 10);

  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    return null;
  }

  return { x, y };
}

export function defaultSnakeBoard(board?: Partial<SnakeBoardConfig> | null): SnakeBoardConfig {
  const cols = Number.isInteger(board?.cols) && (board?.cols as number) > 0 ? (board?.cols as number) : SNAKE_GRID_CELLS;
  const rows = Number.isInteger(board?.rows) && (board?.rows as number) > 0 ? (board?.rows as number) : SNAKE_GRID_CELLS;
  return { cols, rows };
}

export function isInsideBoard(point: SnakeGridPoint, board?: Partial<SnakeBoardConfig> | null): boolean {
  const { cols, rows } = defaultSnakeBoard(board);
  return Number.isInteger(point.x) && Number.isInteger(point.y) && point.x >= 0 && point.y >= 0 && point.x < cols && point.y < rows;
}

export function wrapPoint(point: SnakeGridPoint, board?: Partial<SnakeBoardConfig> | null): SnakeGridPoint {
  const { cols, rows } = defaultSnakeBoard(board);
  return {
    x: ((point.x % cols) + cols) % cols,
    y: ((point.y % rows) + rows) % rows,
  };
}

export function getInitialSnake(board?: Partial<SnakeBoardConfig> | null): SnakeGridPoint[] {
  const { cols, rows } = defaultSnakeBoard(board);
  const midX = Math.floor(cols / 2);
  const midY = Math.floor(rows / 2);

  return Array.from({ length: SNAKE_INITIAL_LENGTH }, (_, index) => ({
    x: midX - index,
    y: midY,
  }));
}

export function getFirstMoveCell(board?: Partial<SnakeBoardConfig> | null): SnakeGridPoint {
  const { cols, rows } = defaultSnakeBoard(board);
  return {
    x: Math.floor(cols / 2) + 1,
    y: Math.floor(rows / 2),
  };
}

function addRect(
  cells: Set<string>,
  x0: number,
  y0: number,
  width: number,
  height: number,
  board: SnakeBoardConfig
): void {
  for (let y = y0; y < y0 + height; y += 1) {
    for (let x = x0; x < x0 + width; x += 1) {
      if (x >= 0 && y >= 0 && x < board.cols && y < board.rows) {
        cells.add(cellKey(x, y));
      }
    }
  }
}

function getCenterBlockCells(board: SnakeBoardConfig): Set<string> {
  const cells = new Set<string>();
  const midX = Math.floor(board.cols / 2);
  const midY = Math.floor(board.rows / 2);
  addRect(cells, midX - 1, midY - 2, 2, 2, board);
  return cells;
}

function getWallSegmentCells(board: SnakeBoardConfig): Set<string> {
  const cells = new Set<string>();
  const wallY = Math.max(1, Math.floor(board.rows * 0.22));
  const wallX0 = Math.max(1, Math.floor(board.cols * 0.22));
  addRect(cells, wallX0, wallY, 4, 1, board);

  const pillarX = Math.min(board.cols - 2, Math.max(2, Math.floor(board.cols * 0.72)));
  const pillarY0 = Math.min(board.rows - 5, Math.max(2, Math.floor(board.rows * 0.62)));
  addRect(cells, pillarX, pillarY0, 1, 4, board);
  return cells;
}

function getCornerBlockCells(board: SnakeBoardConfig): Set<string> {
  const cells = new Set<string>();
  addRect(cells, 0, 0, 2, 2, board);
  addRect(cells, board.cols - 2, 0, 2, 2, board);
  addRect(cells, 0, board.rows - 2, 2, 2, board);
  addRect(cells, board.cols - 2, board.rows - 2, 2, 2, board);
  return cells;
}

export function getObstaclesForLevel(
  level: unknown,
  boardConfig?: Partial<SnakeBoardConfig> | null
): Set<string> {
  const board = defaultSnakeBoard(boardConfig);
  const normalized = normalizeSnakeLevel(level);

  if (normalized === 1) {
    return new Set();
  }

  if (normalized === 2) {
    return getWallSegmentCells(board);
  }

  if (normalized === 3) {
    return getCenterBlockCells(board);
  }

  const danger = getCornerBlockCells(board);
  for (const key of getCenterBlockCells(board)) {
    danger.add(key);
  }
  return danger;
}

export function isObstacleCell(
  point: SnakeGridPoint,
  level: unknown,
  boardConfig?: Partial<SnakeBoardConfig> | null
): boolean {
  return getObstaclesForLevel(level, boardConfig).has(cellKey(point.x, point.y));
}

export function snakeDiesAt(
  head: SnakeGridPoint,
  options: {
    body: SnakeGridPoint[];
    obstacles?: Iterable<string> | Set<string>;
    willGrow?: boolean;
  }
): SnakeDeathKind {
  const bodyToCheck = options.willGrow ? options.body : options.body.slice(0, -1);

  if (bodyToCheck.some((segment) => segment.x === head.x && segment.y === head.y)) {
    return "self";
  }

  const obstacles =
    options.obstacles instanceof Set ? options.obstacles : new Set(options.obstacles || []);

  if (obstacles.has(cellKey(head.x, head.y))) {
    return "obstacle";
  }

  return null;
}

export function blockedKeysForSpawn(input: {
  snake: SnakeGridPoint[];
  obstacles?: Iterable<string> | Set<string>;
  food?: SnakeGridPoint | null;
  bonus?: SnakeGridPoint | null;
}): Set<string> {
  const blocked = new Set<string>();

  for (const segment of input.snake) {
    blocked.add(cellKey(segment.x, segment.y));
  }

  if (input.obstacles) {
    for (const key of input.obstacles) {
      blocked.add(key);
    }
  }

  if (input.food) {
    blocked.add(cellKey(input.food.x, input.food.y));
  }

  if (input.bonus) {
    blocked.add(cellKey(input.bonus.x, input.bonus.y));
  }

  return blocked;
}

export function pickFreeCell(input: {
  board?: Partial<SnakeBoardConfig> | null;
  blocked: Set<string>;
  random?: () => number;
  attempts?: number;
}): SnakeGridPoint | null {
  const { cols, rows } = defaultSnakeBoard(input.board);
  const random = input.random || Math.random;
  const attempts = Number.isInteger(input.attempts) && (input.attempts as number) > 0
    ? (input.attempts as number)
    : SNAKE_SPAWN_ATTEMPTS;

  for (let index = 0; index < attempts; index += 1) {
    const x = Math.floor(random() * cols);
    const y = Math.floor(random() * rows);
    if (!input.blocked.has(cellKey(x, y)) && isInsideBoard({ x, y }, { cols, rows })) {
      return { x, y };
    }
  }

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      if (!input.blocked.has(cellKey(x, y))) {
        return { x, y };
      }
    }
  }

  return null;
}

export function startingSnakeOverlapsObstacles(
  level: unknown,
  boardConfig?: Partial<SnakeBoardConfig> | null
): boolean {
  const obstacles = getObstaclesForLevel(level, boardConfig);
  return getInitialSnake(boardConfig).some((segment) => obstacles.has(cellKey(segment.x, segment.y)));
}

export function firstMoveIsSafe(
  level: unknown,
  boardConfig?: Partial<SnakeBoardConfig> | null
): boolean {
  const board = defaultSnakeBoard(boardConfig);
  const obstacles = getObstaclesForLevel(level, board);
  const snake = getInitialSnake(board);
  const head = wrapPoint(getFirstMoveCell(board), board);
  return snakeDiesAt(head, { body: snake, obstacles, willGrow: false }) === null;
}

export function formatSnakeGameOverMessage(input: {
  level: unknown;
  mangoCount: number;
  score: number;
  best: number;
}): string {
  const def = getSnakeLevelDef(input.level);
  return [
    "💀 Game Over",
    "",
    `Difficulty:\n${def.fullName}`,
    "",
    `Mangoes eaten:\n${input.mangoCount}`,
    "",
    `Score:\n${input.score}`,
    "",
    `Best:\n${input.best}`,
  ].join("\n");
}

export function loadStoredSnakeLevel(
  storage?: { getItem(key: string): string | null } | null
): SnakeDifficultyLevel {
  if (!storage) {
    return SNAKE_DEFAULT_LEVEL;
  }

  try {
    return normalizeSnakeLevel(storage.getItem(SNAKE_LEVEL_STORAGE_KEY));
  } catch {
    return SNAKE_DEFAULT_LEVEL;
  }
}

export function saveStoredSnakeLevel(
  level: unknown,
  storage?: { setItem(key: string, value: string): void } | null
): SnakeDifficultyLevel {
  const normalized = normalizeSnakeLevel(level);

  if (!storage) {
    return normalized;
  }

  try {
    storage.setItem(SNAKE_LEVEL_STORAGE_KEY, String(normalized));
  } catch {
    // ignore quota / private-mode failures
  }

  return normalized;
}
