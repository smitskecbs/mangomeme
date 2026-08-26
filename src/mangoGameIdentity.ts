/**
 * ManGo Labs game identity — Telegram-signed tokens from personal links.
 * Frontend stores and forwards `t`. HMAC is verified only on the server.
 * Payload JSON may be read client-side for UX autofill (name) only — never trust for XP.
 */

export type MangoGameId = "snake" | "bounch";

export const GAME_TOKEN_STORAGE_KEYS = {
  snake: "mango-game-token-snake",
  bounch: "mango-game-token-bounch",
} as const;

export const GAME_SUGGESTED_NAME_STORAGE_KEYS = {
  snake: "mango-game-suggested-name-snake",
  bounch: "mango-game-suggested-name-bounch",
} as const;

const MAX_DISPLAY_NAME_LENGTH = 24;

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
  suggestedName: string | null;
}

export interface GameTokenPayloadClaims {
  game: MangoGameId | null;
  name: string | null;
}

export function isMangoGameId(value: string | null | undefined): value is MangoGameId {
  return value === "snake" || value === "bounch";
}

/**
 * Sanitize display name (aligned with bot/highscore sanitizeName).
 */
export function sanitizeTokenDisplayName(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }

  const trimmed = raw.trim().slice(0, MAX_DISPLAY_NAME_LENGTH);
  const safe = trimmed.replace(/[^\w\s-]/gi, "").replace(/\s+/g, " ").trim();
  return safe || null;
}

function base64UrlDecodeToUtf8(value: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    return null;
  }

  const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");

  try {
    if (typeof atob === "function") {
      return atob(base64);
    }

    if (typeof Buffer !== "undefined") {
      return Buffer.from(base64, "base64").toString("utf8");
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Read unsigned payload claims from a token string (no signature verify).
 * Used only for autofill UX.
 */
export function readGameTokenPayloadClaims(
  token: string | null | undefined
): GameTokenPayloadClaims {
  const empty: GameTokenPayloadClaims = { game: null, name: null };

  if (typeof token !== "string" || !token.trim()) {
    return empty;
  }

  const payloadPart = token.trim().split(".")[0];
  if (!payloadPart) {
    return empty;
  }

  const json = base64UrlDecodeToUtf8(payloadPart);
  if (!json) {
    return empty;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(json);
  } catch {
    return empty;
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return empty;
  }

  const record = payload as Record<string, unknown>;
  const rawGame = typeof record.game === "string" ? record.game : null;
  const game: MangoGameId | null = isMangoGameId(rawGame) ? rawGame : null;
  const name = sanitizeTokenDisplayName(record.name);

  return { game, name };
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

export function setSuggestedPlayerName(
  game: MangoGameId,
  name: string,
  storage?: GameIdentityStorage | null
): boolean {
  const safe = sanitizeTokenDisplayName(name);
  if (!safe) {
    return false;
  }

  const store = resolveSessionStorage(storage);
  if (!store) {
    return false;
  }

  try {
    store.setItem(GAME_SUGGESTED_NAME_STORAGE_KEYS[game], safe);
    return true;
  } catch {
    return false;
  }
}

export function getSuggestedPlayerName(
  game: MangoGameId,
  storage?: GameIdentityStorage | null
): string | null {
  const store = resolveSessionStorage(storage);
  if (!store) {
    return null;
  }

  try {
    return sanitizeTokenDisplayName(store.getItem(GAME_SUGGESTED_NAME_STORAGE_KEYS[game]));
  } catch {
    return null;
  }
}

/**
 * Prefer session suggested name (from Telegram token) over localStorage.
 */
export function resolvePlayerNameForAutofill(
  game: MangoGameId,
  savedLocalName: string,
  storage?: GameIdentityStorage | null
): string {
  const suggested = getSuggestedPlayerName(game, storage);
  if (suggested) {
    return suggested;
  }

  const trimmed = typeof savedLocalName === "string" ? savedLocalName.trim() : "";
  return trimmed;
}

/**
 * Read `game` + `t` from the URL, store the opaque token per game in sessionStorage,
 * then remove `t` from the visible address bar (no reload). Keeps `game` and other params.
 * If the token payload includes a sanitized name, store it for session autofill.
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
    return { captured: false, game: null, urlCleaned: false, suggestedName: null };
  }

  if (typeof tokenParam !== "string" || !tokenParam.trim()) {
    return { captured: false, game: gameParam, urlCleaned: false, suggestedName: null };
  }

  const stored = setGameIdentityToken(gameParam, tokenParam, options.storage);
  if (!stored) {
    return { captured: false, game: gameParam, urlCleaned: false, suggestedName: null };
  }

  const claims = readGameTokenPayloadClaims(tokenParam);
  let suggestedName: string | null = null;
  if (claims.name && (claims.game === null || claims.game === gameParam)) {
    if (setSuggestedPlayerName(gameParam, claims.name, options.storage)) {
      suggestedName = claims.name;
    }
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

  return { captured: true, game: gameParam, urlCleaned, suggestedName };
}

export function buildSnakeHighscoreBody(
  name: string,
  score: number,
  token?: string | null,
  meta?: {
    level?: number;
    mangoCount?: number;
    bonusMangoesEaten?: number;
  }
): {
  name: string;
  score: number;
  t?: string;
  level?: number;
  mangoCount?: number;
  bonusMangoesEaten?: number;
} {
  const body: {
    name: string;
    score: number;
    t?: string;
    level?: number;
    mangoCount?: number;
    bonusMangoesEaten?: number;
  } = { name, score };
  const trimmed = typeof token === "string" ? token.trim() : "";
  if (trimmed) {
    body.t = trimmed;
  }

  if (meta) {
    if (
      typeof meta.level === "number" &&
      Number.isInteger(meta.level) &&
      meta.level >= 1 &&
      meta.level <= 4
    ) {
      body.level = meta.level;
    }
    if (
      typeof meta.mangoCount === "number" &&
      Number.isInteger(meta.mangoCount) &&
      meta.mangoCount >= 0
    ) {
      body.mangoCount = meta.mangoCount;
    }
    if (
      typeof meta.bonusMangoesEaten === "number" &&
      Number.isInteger(meta.bonusMangoesEaten) &&
      meta.bonusMangoesEaten >= 0
    ) {
      body.bonusMangoesEaten = meta.bonusMangoesEaten;
    }
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
