/**
 * Frontend high-score submit — posts to the Hetzner bot server only.
 * No Telegram secrets in the browser. Set VITE_MANGO_HIGHSCORE_API_URL in .env.
 */

const HIGH_SCORE_API_URL = import.meta.env.VITE_MANGO_HIGHSCORE_API_URL?.trim() || "";

export interface SnakeHighscoreSubmitResult {
  ok: boolean;
  skipped?: boolean;
  mixedContent?: boolean;
  status?: number;
  body?: unknown;
  error?: string;
}

export function isHighScoreSharingEnabled(): boolean {
  return HIGH_SCORE_API_URL.length > 0;
}

export function getHighScoreApiUrl(): string {
  return HIGH_SCORE_API_URL;
}

export async function submitSnakeHighscore(
  score: number,
  name: string
): Promise<SnakeHighscoreSubmitResult> {
  const trimmedName = name.trim() || "ManGo Player";

  console.log("[ManGo Snake] Share score clicked");
  console.log("[ManGo Snake] Name:", trimmedName);
  console.log("[ManGo Snake] Score:", score);
  console.log("[ManGo Snake] VITE_MANGO_HIGHSCORE_API_URL:", HIGH_SCORE_API_URL || "(empty)");

  if (!HIGH_SCORE_API_URL) {
    console.warn("[ManGo Snake] Sharing disabled — VITE_MANGO_HIGHSCORE_API_URL is not set.");
    return { ok: false, skipped: true, error: "Score sharing is not configured." };
  }

  console.log("[ManGo Snake] POST URL:", HIGH_SCORE_API_URL);

  if (
    typeof window !== "undefined" &&
    window.location.protocol === "https:" &&
    HIGH_SCORE_API_URL.startsWith("http://")
  ) {
    const message =
      "Mixed content blocked: https://mangomeme.fun cannot call an http:// API. Use an HTTPS API URL (for example via nginx reverse proxy).";
    console.error("[ManGo Snake]", message);
    return { ok: false, mixedContent: true, error: message };
  }

  try {
    const response = await fetch(HIGH_SCORE_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: trimmedName,
        score,
      }),
    });

    const responseText = await response.text();
    let body: unknown = responseText;

    try {
      body = JSON.parse(responseText);
    } catch {
      // keep raw text
    }

    console.log("[ManGo Snake] Response status:", response.status);
    console.log("[ManGo Snake] Response body:", body);

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        body,
        error: `Server returned ${response.status}`,
      };
    }

    return { ok: true, status: response.status, body };
  } catch (error) {
    console.error("[ManGo Snake] Share request failed:", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}
