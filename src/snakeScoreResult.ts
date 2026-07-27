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
  leaderboard?: Array<{ name: string; score: number }>;
  reason?: string;
  error?: string;
}

export interface SnakeScoreResultMessage {
  title: string;
  body: string;
}

function readNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
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

  if (personalBestImproved && body.isNewGlobal) {
    return {
      title: "🏆 NEW GLOBAL HIGHSCORE!",
      body: `Score: ${score}\n\nYou are now #1!`,
    };
  }

  if (personalBestImproved) {
    return {
      title: "🥳 NEW PERSONAL BEST!",
      body: `Score: ${score}\n\nCurrent Rank: #${rank}`,
    };
  }

  return {
    title: "🐍 Nice run!",
    body: `Score:\n${score}\n\nYour Personal Best:\n${personalBestScore}\n\nCurrent Rank:\n#${rank}\n\nGlobal Highscore:\n${globalHighScore} by ${globalHighScoreName}\n\nKeep trying! 🥭`,
  };
}

export function isSnakeHighscoreApiResponse(body: unknown): body is SnakeHighscoreApiResponse {
  return Boolean(body && typeof body === "object" && (body as SnakeHighscoreApiResponse).ok === true);
}
