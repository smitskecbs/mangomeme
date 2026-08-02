/**
 * Pure helpers for Bounch level selection / unlock range.
 * Unlock rule matches continue: maxUnlocked = min(bestLevel + 1, levelCount).
 */

import { resolveBounchContinueLevel } from "./bounchContinue.ts";

export type BounchLevelSelectState =
  | "idle"
  | "naming"
  | "ready"
  | "playing"
  | "paused"
  | "won"
  | "over";

/** Highest level the player may open in the selector. */
export function resolveBounchMaxUnlockedLevel(bestLevel: unknown, levelCount: number): number {
  return resolveBounchContinueLevel(bestLevel, levelCount);
}

function parseLevelId(levelId: unknown): number | null {
  if (typeof levelId === "number") {
    if (!Number.isInteger(levelId)) {
      return null;
    }

    return levelId;
  }

  if (typeof levelId === "string") {
    const trimmed = levelId.trim();

    if (!/^\d+$/.test(trimmed)) {
      return null;
    }

    return Number.parseInt(trimmed, 10);
  }

  return null;
}

/**
 * Returns the level id when selection is allowed, otherwise null.
 * Locked / invalid ids are rejected even if UI were bypassed.
 */
export function resolveBounchLevelSelection(
  levelId: unknown,
  bestLevel: unknown,
  levelCount: number
): number | null {
  const count = Number.isFinite(levelCount) && levelCount > 0 ? Math.floor(levelCount) : 1;
  const id = parseLevelId(levelId);

  if (id === null || id < 1 || id > count) {
    return null;
  }

  const maxUnlocked = resolveBounchMaxUnlockedLevel(bestLevel, count);

  if (id > maxUnlocked) {
    return null;
  }

  return id;
}

export function canSelectBounchLevel(
  levelId: unknown,
  bestLevel: unknown,
  levelCount: number
): boolean {
  return resolveBounchLevelSelection(levelId, bestLevel, levelCount) !== null;
}

export function shouldShowBounchLevelSelectButton(state: BounchLevelSelectState): boolean {
  return (
    state === "ready" ||
    state === "playing" ||
    state === "paused" ||
    state === "won" ||
    state === "over"
  );
}

/** Choosing a level never submits scores or unlocks achievements. */
export function bounchLevelSelectTriggersSubmitOrUnlock(): boolean {
  return false;
}
