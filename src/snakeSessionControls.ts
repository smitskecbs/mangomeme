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

export interface SnakeGameOverSideEffects {
  unlockAchievements: boolean;
  openShareModal: boolean;
  deferAchievementToast: boolean;
}

/**
 * Side effects for Snake end-of-run paths.
 * Stop/dismiss never share. Finalize opens share when enabled and defers toasts
 * so the achievement overlay cannot block submit.
 */
export function planSnakeGameOverSideEffects(input: {
  source: "finalize" | "stop" | "dismiss";
  sharingEnabled: boolean;
}): SnakeGameOverSideEffects {
  if (input.source !== "finalize") {
    return {
      unlockAchievements: false,
      openShareModal: false,
      deferAchievementToast: false,
    };
  }

  return {
    unlockAchievements: true,
    openShareModal: input.sharingEnabled,
    deferAchievementToast: input.sharingEnabled,
  };
}
