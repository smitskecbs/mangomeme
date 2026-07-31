/**
 * Resolve which Bounch level to start after reading local bestLevel.
 * bestLevel = highest successfully cleared level (unchanged meaning).
 * startLevel = min(bestLevel + 1, levelCount), clamped for bad storage.
 */

export function resolveBounchContinueLevel(
  bestLevel: unknown,
  levelCount: number
): number {
  const count = Number.isFinite(levelCount) && levelCount > 0 ? Math.floor(levelCount) : 1;

  const parsed =
    typeof bestLevel === "number"
      ? bestLevel
      : Number.parseInt(String(bestLevel ?? ""), 10);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return 1;
  }

  const capped = Math.min(Math.floor(parsed), count);
  return Math.min(capped + 1, count);
}
