/**
 * Bounch player-name rules aligned with server/highscore-server.js sanitizeName.
 * Frontend validates (and rejects) before save; backend still sanitizes on submit.
 */

export const BOUNCH_PLAYER_NAME_KEY = "mango-bounch-player-name";
export const BOUNCH_MAX_PLAYER_NAME_LENGTH = 24;

/** Allowed: letters, digits, underscore, space, hyphen (same as backend \w\s-). */
const ALLOWED_NAME_PATTERN = /^[\w\s-]+$/;

export type BounchPlayerNameValidation =
  | { ok: true; name: string }
  | { ok: false; error: string };

export function normalizeBounchPlayerName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export function validateBounchPlayerName(raw: unknown): BounchPlayerNameValidation {
  if (typeof raw !== "string") {
    return { ok: false, error: "Enter a name to continue." };
  }

  const normalized = normalizeBounchPlayerName(raw);

  if (!normalized) {
    return { ok: false, error: "Enter a name to continue." };
  }

  if (normalized.length > BOUNCH_MAX_PLAYER_NAME_LENGTH) {
    return {
      ok: false,
      error: `Name must be ${BOUNCH_MAX_PLAYER_NAME_LENGTH} characters or fewer.`,
    };
  }

  if (!ALLOWED_NAME_PATTERN.test(normalized)) {
    return {
      ok: false,
      error: "Use only letters, numbers, spaces, hyphens, and underscores.",
    };
  }

  return { ok: true, name: normalized };
}

export function isValidBounchPlayerName(raw: unknown): boolean {
  return validateBounchPlayerName(raw).ok;
}
