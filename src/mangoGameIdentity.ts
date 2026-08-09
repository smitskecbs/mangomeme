/**
 * ManGo Labs game identity — opaque Telegram-signed tokens from personal links.
 * Frontend stores and forwards `t`; it never decodes or verifies the token.
 */

export type MangoGameId = "snake" | "bounch";

export const GAME_TOKEN_STORAGE_KEYS = {
  snake: "mango-game-token-snake",
  bounch: "mango-game-token-bounch",
} as const;

export interface GameIdentityStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface CaptureGameIdentityOptions {
  search?: string;
  pathname?: string;
  hash?: string;
  storage?: GameIdentityStorage | null;
  historyReplaceState?:
    | ((data: unknown, unused: string, url?: string | URL | null) => void)
    | null;
  historyState?: unknown;
}

export interface CaptureGameIdentityResult {
  captured: boolean;
  game: MangoGameId | null;
  urlCleaned: boolean;
}

export function isMangoGameId(value: string | null | undefined): value is MangoGameId {
  return value === "snake" || value === "bounch";
}

function resolveSessionStorage(storage?: GameIdentityStorage | null): GameIdentityStorage | null {
  if (storage) {
    return storage;
  }

  if (typeof sessionStorage === "undefined") {
    return null;
  }

  try {
    return sessionStorage;
  } catch {
    return null;
  }
}

export function getGameIdentityToken(
  game: MangoGameId,
  storage?: GameIdentityStorage | null
): string | null {
  const store = resolveSessionStorage(storage);

  if (!store) {
    return null;
  }

  try {
    const raw = store.getItem(GAME_TOKEN_STORAGE_KEYS[game]);
    if (typeof raw !== "string") {
      return null;
    }

    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

export function setGameIdentityToken(
  game: MangoGameId,
  token: string,
  storage?: GameIdentityStorage | null
): boolean {
  const trimmed = token.trim();
  if (!trimmed) {
    return false;
  }

  const store = resolveSessionStorage(storage);
  if (!store) {
    return false;
  }

  try {
    store.setItem(GAME_TOKEN_STORAGE_KEYS[game], trimmed);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read `game` + `t` from the URL, store the opaque token per game in sessionStorage,
 * then remove `t` from the visible address bar (no reload). Keeps `game` and other params.
 */
export function captureGameIdentityFromLocation(
  options: CaptureGameIdentityOptions = {}
): CaptureGameIdentityResult {
  const search =
    options.search ??
    (typeof window !== "undefined" ? window.location.search : "");
  const pathname =
    options.pathname ??
    (typeof window !== "undefined" ? window.location.pathname : "/");
  const hash =
    options.hash ?? (typeof window !== "undefined" ? window.location.hash : "");

  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search
  );
  const gameParam = params.get("game");
  const tokenParam = params.get("t");

  if (!isMangoGameId(gameParam)) {
    return { captured: false, game: null, urlCleaned: false };
  }

  if (typeof tokenParam !== "string" || !tokenParam.trim()) {
    return { captured: false, game: gameParam, urlCleaned: false };
  }

  const stored = setGameIdentityToken(gameParam, tokenParam, options.storage);
  if (!stored) {
    return { captured: false, game: gameParam, urlCleaned: false };
  }

  let urlCleaned = false;

  if (params.has("t")) {
    params.delete("t");
    const nextSearch = params.toString();
    const nextUrl = `${pathname}${nextSearch ? `?${nextSearch}` : ""}${hash}`;

    const replaceState =
      options.historyReplaceState ??
      (typeof history !== "undefined"
        ? (data: unknown, unused: string, url?: string | URL | null) => {
            history.replaceState(data, unused, url);
          }
        : null);

    if (replaceState) {
      try {
        const state =
          options.historyState !== undefined
            ? options.historyState
            : typeof history !== "undefined"
              ? history.state
              : null;
        replaceState(state, "", nextUrl);
        urlCleaned = true;
      } catch {
        urlCleaned = false;
      }
    }
  }

  return { captured: true, game: gameParam, urlCleaned };
}

export function buildSnakeHighscoreBody(
  name: string,
  score: number,
  token?: string | null
): { name: string; score: number; t?: string } {
  const body: { name: string; score: number; t?: string } = { name, score };
  const trimmed = typeof token === "string" ? token.trim() : "";
  if (trimmed) {
    body.t = trimmed;
  }
  return body;
}

export function buildBounchHighscoreBody(
  name: string,
  level: number,
  token?: string | null
): { name: string; level: number; t?: string } {
  const body: { name: string; level: number; t?: string } = { name, level };
  const trimmed = typeof token === "string" ? token.trim() : "";
  if (trimmed) {
    body.t = trimmed;
  }
  return body;
}
