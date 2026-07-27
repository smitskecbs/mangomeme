/**
 * Frontend high-score submit — posts to the Hetzner bot server only.
 * No Telegram secrets in the browser. Set VITE_MANGO_HIGHSCORE_API_URL in Vercel.
 *
 * Must be an absolute URL, e.g.:
 * https://api.mangomeme.fun/snake-highscore
 */

const RAW_ENV_URL = import.meta.env.VITE_MANGO_HIGHSCORE_API_URL?.trim() || "";
const EXPECTED_PATH = "/snake-highscore";
const EXPECTED_API_URL = "https://api.mangomeme.fun/snake-highscore";
const NETWORK_CORS_ERROR =
  "Could not reach the highscore API. Possible network or CORS problem.";

function normalizeHighScoreApiUrl(raw: string): string {
  const trimmed = raw.trim();

  if (!trimmed) {
    return "";
  }

  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    console.error(
      "[ManGo Snake] VITE_MANGO_HIGHSCORE_API_URL must be absolute (https://...).",
      "Relative paths like",
      trimmed,
      "post to the website host (Vercel) and return 404."
    );
    return "";
  }

  if (!/^https?:\/\//i.test(trimmed)) {
    console.error(
      "[ManGo Snake] VITE_MANGO_HIGHSCORE_API_URL must start with http:// or https://.",
      "Got:",
      trimmed
    );
    return "";
  }

  try {
    const url = new URL(trimmed);

    if (url.pathname.includes("/snake-highscore/snake-highscore")) {
      url.pathname = url.pathname.replace(/\/snake-highscore\/snake-highscore\/?/g, EXPECTED_PATH);
    }

    if (url.pathname === "/" || url.pathname === "") {
      url.pathname = EXPECTED_PATH;
    } else if (url.pathname === "/health" || url.pathname.endsWith("/health")) {
      url.pathname = EXPECTED_PATH;
    }

    url.pathname = url.pathname.replace(/\/$/, "") || EXPECTED_PATH;

    return url.toString();
  } catch {
    console.error("[ManGo Snake] Invalid VITE_MANGO_HIGHSCORE_API_URL:", trimmed);
    return "";
  }
}

const HIGH_SCORE_API_URL = normalizeHighScoreApiUrl(RAW_ENV_URL);

if (typeof window !== "undefined") {
  if (!RAW_ENV_URL) {
    console.warn(
      "[ManGo Snake] VITE_MANGO_HIGHSCORE_API_URL is empty — score sharing is disabled.",
      "Set it in Vercel to https://api.mangomeme.fun/snake-highscore and redeploy."
    );
  } else if (!HIGH_SCORE_API_URL) {
    console.warn(
      "[ManGo Snake] VITE_MANGO_HIGHSCORE_API_URL is invalid — score sharing is disabled.",
      "Raw value:",
      RAW_ENV_URL
    );
  }
}

export interface SnakeHighscoreSubmitResult {
  ok: boolean;
  skipped?: boolean;
  mixedContent?: boolean;
  status?: number;
  body?: unknown;
  error?: string;
  requestUrl?: string;
}

export type { SnakeHighscoreApiResponse } from "./snakeScoreResult.ts";

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

  if (typeof window !== "undefined") {
    console.log("[ManGo Snake] window.location.origin:", window.location.origin);
  }

  console.log("[ManGo Snake] VITE_MANGO_HIGHSCORE_API_URL (raw):", RAW_ENV_URL || "(empty)");
  console.log("[ManGo Snake] Normalized POST URL:", requestUrl || "(empty)");

  if (!RAW_ENV_URL) {
    console.warn("[ManGo Snake] VITE_MANGO_HIGHSCORE_API_URL is not set in this build.");
    return {
      ok: false,
      skipped: true,
      error: "Score sharing is not configured. Set VITE_MANGO_HIGHSCORE_API_URL in Vercel.",
    };
  }

  if (!requestUrl) {
    return {
      ok: false,
      skipped: true,
      error:
        "Invalid API URL. Use the full absolute URL: https://api.mangomeme.fun/snake-highscore",
    };
  }

  if (!requestUrl.startsWith("http://") && !requestUrl.startsWith("https://")) {
    return {
      ok: false,
      error: "API URL must be absolute — never use a relative path like /snake-highscore.",
      requestUrl,
    };
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

  console.log("[ManGo Snake] Final fetch URL:", requestUrl);

  if (requestUrl !== EXPECTED_API_URL) {
    console.warn(
      "[ManGo Snake] Final fetch URL differs from production default:",
      EXPECTED_API_URL
    );
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
    console.error("[ManGo Snake] Fetch error:", error);

    const isFetchFailure =
      error instanceof TypeError ||
      (error instanceof Error && /failed to fetch|networkerror|load failed/i.test(error.message));

    return {
      ok: false,
      requestUrl,
      error: isFetchFailure ? NETWORK_CORS_ERROR : error instanceof Error ? error.message : NETWORK_CORS_ERROR,
    };
  }
}
