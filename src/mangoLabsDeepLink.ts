/**
 * ManGo Labs deep-link — open Snake/Bounch from ?game= without re-init.
 * Uses the same Start game button click path as manual selection.
 */

import { isMangoGameId, type MangoGameId } from "./mangoGameIdentity.ts";

export const LABS_GAME_OPEN_BUTTON_IDS = {
  snake: "ms-open-game",
  bounch: "mb-open-game",
} as const satisfies Record<MangoGameId, string>;

export function getRequestedLabsGame(search: string): MangoGameId | null {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search
  );
  const game = params.get("game");
  return isMangoGameId(game) ? game : null;
}

export interface OpenLabsGameFromDeepLinkOptions {
  search?: string;
  /** Injected for tests; default clicks the matching Start game button in the DOM. */
  openButton?: (buttonId: string) => void;
}

export interface OpenLabsGameFromDeepLinkResult {
  opened: MangoGameId | null;
}

/**
 * Open the game requested by `?game=` via the existing Start game button flow.
 * Does not call init — listeners must already be registered.
 */
export function openLabsGameFromDeepLink(
  options: OpenLabsGameFromDeepLinkOptions = {}
): OpenLabsGameFromDeepLinkResult {
  const search =
    options.search ??
    (typeof window !== "undefined" ? window.location.search : "");
  const game = getRequestedLabsGame(search);

  if (!game) {
    return { opened: null };
  }

  const buttonId = LABS_GAME_OPEN_BUTTON_IDS[game];

  if (options.openButton) {
    options.openButton(buttonId);
  } else if (typeof document !== "undefined") {
    document.getElementById(buttonId)?.click();
  }

  return { opened: game };
}
