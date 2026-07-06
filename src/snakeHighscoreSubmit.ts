/**
 * Frontend high-score submit — posts to the Hetzner bot server only.
 * No Telegram secrets in the browser. Set VITE_MANGO_HIGHSCORE_API_URL in .env.
 */

const HIGH_SCORE_API_URL = import.meta.env.VITE_MANGO_HIGHSCORE_API_URL?.trim() || "";

export function isHighScoreSharingEnabled(): boolean {
  return HIGH_SCORE_API_URL.length > 0;
}

export async function submitSnakeHighscore(score: number, name: string): Promise<void> {
  if (!HIGH_SCORE_API_URL) {
    return;
  }

  try {
    await fetch(HIGH_SCORE_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: name.trim() || "ManGo Player",
        score,
      }),
    });
  } catch {
    // Non-blocking — local game continues even if share fails.
  }
}
