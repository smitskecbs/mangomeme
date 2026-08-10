export interface GameXpApiPayload {
  awarded?: number;
  dailyPlay?: number;
  unlock?: number;
}

export interface GameIdentityApiPayload {
  verified?: boolean;
}

export interface SnakeHighscoreApiResponse {
  ok?: boolean;
  posted?: boolean;
  personalBest?: boolean;
  personalBestImproved?: boolean;
  personalBestScore?: number;
  score?: number;
  isNewGlobal?: boolean;
  rank?: number;
  globalHighScore?: number;
  globalHighScoreName?: string;
  gamesPlayed?: number;
  lastScore?: number;
  lastPlayedAt?: string;
  leaderboard?: Array<{ name: string; score: number }>;
  reason?: string;
  error?: string;
  identity?: GameIdentityApiPayload;
  xp?: GameXpApiPayload;
}

export interface SnakeScoreResultMessage {
  title: string;
  body: string;
}

function readNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatGamesPlayedLine(body: SnakeHighscoreApiResponse): string {
  const gamesPlayed = readNumber(body.gamesPlayed, 0);

  if (gamesPlayed <= 0) {
    return "";
  }

  return `\n\nGames played:\n${gamesPlayed}`;
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
    return "\n\nGame XP: already claimed today";
  }

  const parts: string[] = [];
  if (dailyPlay > 0) {
    parts.push(`daily +${dailyPlay}`);
  }
  if (unlock > 0) {
    parts.push(`unlock +${unlock}`);
  }

  if (parts.length > 0) {
    return `\n\nGame XP: +${awarded} (${parts.join(", ")})`;
  }

  return `\n\nGame XP: +${awarded}`;
}

export function formatSnakeScoreResult(
  body: SnakeHighscoreApiResponse,
  submittedScore: number
): SnakeScoreResultMessage {
  const score = readNumber(body.score, submittedScore);
  const personalBestImproved = Boolean(body.personalBestImproved ?? body.personalBest);
  const personalBestScore = readNumber(body.personalBestScore, personalBestImproved ? score : 0);
  const rank = readNumber(body.rank, 0);
  const globalHighScore = readNumber(body.globalHighScore, 0);
  const globalHighScoreName = body.globalHighScoreName?.trim() || "ManGo Player";
  const gamesPlayedLine = formatGamesPlayedLine(body);
  const xpLine = formatGameXpLine(body);

  if (personalBestImproved && body.isNewGlobal) {
    return {
      title: "🏆 NEW GLOBAL HIGHSCORE!",
      body: `Score: ${score}\n\nYou are now #1!${gamesPlayedLine}${xpLine}`,
    };
  }

  if (personalBestImproved) {
    return {
      title: "🥳 NEW PERSONAL BEST!",
      body: `Score: ${score}\n\nCurrent Rank: #${rank}${gamesPlayedLine}${xpLine}`,
    };
  }

  return {
    title: "🐍 Nice run!",
    body: `Score:\n${score}\n\nYour Personal Best:\n${personalBestScore}\n\nCurrent Rank:\n#${rank}\n\nGlobal Highscore:\n${globalHighScore} by ${globalHighScoreName}\n\nKeep trying! 🥭${gamesPlayedLine}${xpLine}`,
  };
}

export function isSnakeHighscoreApiResponse(body: unknown): body is SnakeHighscoreApiResponse {
  return Boolean(body && typeof body === "object" && (body as SnakeHighscoreApiResponse).ok === true);
}
