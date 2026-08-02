/**
 * Pure helpers for ManGo Snake pause/stop session controls.
 */

export type SnakeSessionState = "idle" | "playing" | "paused" | "ending" | "over";

export function canPauseSnake(state: SnakeSessionState): boolean {
  return state === "playing";
}

export function canResumeSnake(state: SnakeSessionState): boolean {
  return state === "paused";
}

export function canToggleSnakePause(state: SnakeSessionState): boolean {
  return state === "playing" || state === "paused";
}

export function canStopSnakeRun(state: SnakeSessionState): boolean {
  return state === "playing" || state === "paused";
}

export function snakeStateAfterPauseToggle(state: SnakeSessionState): SnakeSessionState | null {
  if (state === "playing") {
    return "paused";
  }

  if (state === "paused") {
    return "playing";
  }

  return null;
}

export function snakePauseButtonLabel(state: SnakeSessionState): string {
  return state === "paused" ? "▶ Resume" : "⏸ Pause";
}

export function shouldShowSnakeSessionControls(state: SnakeSessionState): boolean {
  return state === "playing" || state === "paused";
}

/** Aborting a run must never finalize/submit; it returns to idle ready. */
export function snakeStateAfterStop(state: SnakeSessionState): SnakeSessionState | null {
  if (!canStopSnakeRun(state)) {
    return null;
  }

  return "idle";
}
