export interface GameXpApiPayload {
  awarded?: number;
  dailyPlay?: number;
  unlock?: number;
}

export interface GameIdentityApiPayload {
  verified?: boolean;
}

export interface BounchHighscoreApiResponse {
  ok?: boolean;
  posted?: boolean;
  personalBest?: boolean;
  personalBestImproved?: boolean;
  bestLevel?: number;
  level?: number;
  isNewGlobal?: boolean;
  rank?: number;
  gamesPlayed?: number;
  lastLevel?: number;
  lastPlayedAt?: string;
  leaderboard?: Array<{ name: string; bestLevel?: number; level?: number }>;
  reason?: string;
  error?: string;
  identity?: GameIdentityApiPayload;
  xp?: GameXpApiPayload;
}

function readNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * XP line for verified submits only. Unverified → empty.
 */
export function formatGameXpLine(body: {
  identity?: GameIdentityApiPayload;
  xp?: GameXpApiPayload;
}): string {
  if (!body.identity?.verified) {
    return "";
  }

  const awarded = readNumber(body.xp?.awarded, 0);
  const dailyPlay = readNumber(body.xp?.dailyPlay, 0);
  const unlock = readNumber(body.xp?.unlock, 0);

  if (awarded <= 0) {
    return "\nGame XP: already claimed today";
  }

  const parts: string[] = [];
  if (dailyPlay > 0) {
    parts.push(`daily +${dailyPlay}`);
  }
  if (unlock > 0) {
    parts.push(`unlock +${unlock}`);
  }

  if (parts.length > 0) {
    return `\nGame XP: +${awarded} (${parts.join(", ")})`;
  }

  return `\nGame XP: +${awarded}`;
}

export function formatBounchScoreResult(
  body: BounchHighscoreApiResponse,
  submittedLevel: number
): string {
  const bestLevel = readNumber(body.bestLevel, submittedLevel);
  const rank = readNumber(body.rank, 0);
  const personalBestImproved = Boolean(body.personalBestImproved ?? body.personalBest);
  const lines: string[] = [];

  if (body.isNewGlobal) {
    lines.push(`New global best! Level ${bestLevel}`);
  } else if (personalBestImproved) {
    lines.push(`New personal best! Level ${bestLevel}`);
  }

  lines.push(`Best: Level ${bestLevel}`);

  if (rank > 0) {
    lines.push(`Global rank: #${rank}`);
  }

  const xpLine = formatGameXpLine(body).replace(/^\n/, "");
  if (xpLine) {
    lines.push(xpLine);
  }

  return lines.join("\n");
}

export function isBounchHighscoreApiResponse(body: unknown): body is BounchHighscoreApiResponse {
  return Boolean(body && typeof body === "object" && (body as BounchHighscoreApiResponse).ok === true);
}
