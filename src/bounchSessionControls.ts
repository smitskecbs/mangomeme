/**
 * Pure helpers for ManGo Bounch pause/stop session controls.
 */

export type BounchSessionState =
  | "idle"
  | "naming"
  | "ready"
  | "playing"
  | "paused"
  | "won"
  | "over";

export function canPauseBounch(state: BounchSessionState): boolean {
  return state === "playing";
}

export function canResumeBounch(state: BounchSessionState): boolean {
  return state === "paused";
}

export function canToggleBounchPause(state: BounchSessionState): boolean {
  return state === "playing" || state === "paused";
}

export function canStopBounchRun(state: BounchSessionState): boolean {
  return state === "playing" || state === "paused";
}

export function bounchStateAfterPauseToggle(state: BounchSessionState): BounchSessionState | null {
  if (state === "playing") {
    return "paused";
  }

  if (state === "paused") {
    return "playing";
  }

  return null;
}

export function bounchPauseButtonLabel(state: BounchSessionState): string {
  return state === "paused" ? "▶ Resume" : "⏸ Pause";
}

export function shouldShowBounchSessionControls(state: BounchSessionState): boolean {
  return state === "playing" || state === "paused";
}

/** Stop aborts the attempt and returns to the same level's ready state. */
export function bounchStateAfterStop(state: BounchSessionState): BounchSessionState | null {
  if (!canStopBounchRun(state)) {
    return null;
  }

  return "ready";
}

export function bounchStopTriggersSubmitOrUnlock(): boolean {
  return false;
}
