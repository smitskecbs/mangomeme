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
}

function readNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
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

  return lines.join("\n");
}

export function isBounchHighscoreApiResponse(body: unknown): body is BounchHighscoreApiResponse {
  return Boolean(body && typeof body === "object" && (body as BounchHighscoreApiResponse).ok === true);
}
