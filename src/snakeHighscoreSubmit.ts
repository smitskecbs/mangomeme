/**
 * Frontend high-score submit — posts to the Hetzner bot server only.
 * No Telegram secrets in the browser. Set VITE_MANGO_HIGHSCORE_API_URL in .env.
 */

const HIGH_SCORE_PATH = "/snake-highscore";

function normalizeHighScoreApiUrl(raw: string): string {
  const trimmed = raw.trim();

  if (!trimmed) {
    return "";
  }

  try {
    const url = new URL(trimmed);

    if (url.pathname.includes("/snake-highscore/snake-highscore")) {
      url.pathname = url.pathname.replace(/\/snake-highscore\/snake-highscore\/?/g, "/snake-highscore");
    }

    if (url.pathname === "/" || url.pathname === "") {
      url.pathname = HIGH_SCORE_PATH;
    } else if (url.pathname === "/health" || url.pathname.endsWith("/health")) {
      url.pathname = HIGH_SCORE_PATH;
    }

    url.pathname = url.pathname.replace(/\/$/, "") || HIGH_SCORE_PATH;

    return url.toString();
  } catch {
    if (trimmed.endsWith("/snake-highscore") || trimmed.endsWith("/snake-highscore/")) {
      return trimmed.replace(/\/$/, "");
    }

    return `${trimmed.replace(/\/$/, "")}${HIGH_SCORE_PATH}`;
  }
}

const HIGH_SCORE_API_URL = normalizeHighScoreApiUrl(
  import.meta.env.VITE_MANGO_HIGHSCORE_API_URL?.trim() || ""
);

export interface SnakeHighscoreSubmitResult {
  ok: boolean;
  skipped?: boolean;
  mixedContent?: boolean;
  status?: number;
  body?: unknown;
  error?: string;
  requestUrl?: string;
}

export function isHighScoreSharingEnabled(): boolean {
  return HIGH_SCORE_API_URL.length > 0;
}

export function getHighScoreApiUrl(): string {
  return HIGH_SCORE_API_URL;
}

function formatErrorBody(body: unknown): string {
  if (typeof body === "string") {
    return body;
  }

  try {
    return JSON.stringify(body);
  } catch {
    return String(body);
  }
}

export async function submitSnakeHighscore(
  score: number,
  name: string
): Promise<SnakeHighscoreSubmitResult> {
  const trimmedName = name.trim() || "ManGo Player";
  const requestUrl = HIGH_SCORE_API_URL;

  console.log("[ManGo Snake] Share score clicked");
  console.log("[ManGo Snake] Name:", trimmedName);
  console.log("[ManGo Snake] Score:", score);
  console.log(
    "[ManGo Snake] VITE_MANGO_HIGHSCORE_API_URL (raw):",
    import.meta.env.VITE_MANGO_HIGHSCORE_API_URL || "(empty)"
  );
  console.log("[ManGo Snake] Normalized POST URL:", requestUrl || "(empty)");

  if (!requestUrl) {
    console.warn("[ManGo Snake] Sharing disabled — VITE_MANGO_HIGHSCORE_API_URL is not set.");
    return { ok: false, skipped: true, error: "Score sharing is not configured." };
  }

  if (requestUrl.includes("/health")) {
    console.error("[ManGo Snake] Invalid API URL points to /health. Use /snake-highscore.");
    return {
      ok: false,
      error: "Invalid API URL — must post to /snake-highscore, not /health.",
      requestUrl,
    };
  }

  if (
    typeof window !== "undefined" &&
    window.location.protocol === "https:" &&
    requestUrl.startsWith("http://")
  ) {
    const message =
      "Mixed content blocked: https://mangomeme.fun cannot call an http:// API. Use https://api.mangomeme.fun/snake-highscore";
    console.error("[ManGo Snake]", message);
    return { ok: false, mixedContent: true, error: message, requestUrl };
  }

  try {
    const response = await fetch(requestUrl, {
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
      const detail = formatErrorBody(body);
      return {
        ok: false,
        status: response.status,
        body,
        requestUrl,
        error: `Server returned ${response.status}: ${detail}`,
      };
    }

    return { ok: true, status: response.status, body, requestUrl };
  } catch (error) {
    console.error("[ManGo Snake] Share request failed:", error);
    return {
      ok: false,
      requestUrl,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}
