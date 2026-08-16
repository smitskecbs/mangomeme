/**
 * ManGo wallet verification API client helpers.
 * No Telegram secrets. No private keys.
 *
 * VITE_MANGO_WALLET_API_URL must be an absolute URL, e.g.:
 * https://api.mangomeme.fun
 */

import { isManGoLinkToken } from "./walletConnectState.ts";

export const EXPECTED_WALLET_API_ORIGIN = "https://api.mangomeme.fun";

export const WALLET_REACHABILITY_ERROR =
  "We couldn't reach ManGo verification. Please try again.";
export const WALLET_TEMPORARY_ERROR =
  "Verification is temporarily unavailable. Please try again.";
export const NETWORK_CORS_ERROR = WALLET_REACHABILITY_ERROR;

export function resolveWalletApiBaseUrl(
  raw: string,
  pageProtocol?: string
): { baseUrl: string; error?: string; mixedContent?: boolean } {
  const trimmed = raw.trim();

  if (!trimmed) {
    return {
      baseUrl: "",
      error: "Wallet verification is not configured.",
    };
  }

  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return {
      baseUrl: "",
      error: "VITE_MANGO_WALLET_API_URL must be an absolute https:// URL.",
    };
  }

  if (!/^https?:\/\//i.test(trimmed)) {
    return {
      baseUrl: "",
      error: "VITE_MANGO_WALLET_API_URL must start with http:// or https://.",
    };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { baseUrl: "", error: "Invalid wallet API URL." };
  }

  const baseUrl = url.origin;

  if (
    pageProtocol === "https:" &&
    url.protocol === "http:" &&
    url.hostname !== "localhost" &&
    url.hostname !== "127.0.0.1"
  ) {
    return {
      baseUrl: "",
      mixedContent: true,
      error:
        "Mixed content blocked: https://mangomeme.fun cannot call an http:// API. Use https://api.mangomeme.fun",
    };
  }

  return { baseUrl };
}

export function getWalletApiBaseUrlFromEnv(
  env: { VITE_MANGO_WALLET_API_URL?: string } = {},
  pageProtocol?: string
): { baseUrl: string; error?: string; mixedContent?: boolean } {
  return resolveWalletApiBaseUrl(env.VITE_MANGO_WALLET_API_URL || "", pageProtocol);
}

export interface ChallengeResponse {
  ok: boolean;
  challengeId?: string;
  message?: string;
  expiresAt?: number;
  error?: string;
}

export interface VerifyResponse {
  ok: boolean;
  error?: string;
}

export function interpretWalletVerifyResponse(
  status: number,
  data: {
    ok?: unknown;
    error?: unknown;
    challengeId?: unknown;
    message?: unknown;
  } | null
): VerifyResponse {
  if (!Number.isFinite(status) || status === 0) {
    return { ok: false, error: WALLET_REACHABILITY_ERROR };
  }
  if (status >= 500) {
    return { ok: false, error: WALLET_TEMPORARY_ERROR };
  }
  if (status < 200 || status > 299) {
    const error =
      data && typeof data.error === "string" && data.error.trim()
        ? data.error
        : WALLET_TEMPORARY_ERROR;
    return { ok: false, error };
  }
  if (!data || data.ok !== true) {
    return {
      ok: false,
      error:
        data && typeof data.error === "string" && data.error.trim()
          ? data.error
          : WALLET_TEMPORARY_ERROR,
    };
  }
  if (data.challengeId || data.message) {
    return { ok: false, error: WALLET_TEMPORARY_ERROR };
  }
  return { ok: true };
}

export function interpretWalletChallengeResponse(
  status: number,
  data: ChallengeResponse | null,
  networkError?: string
): ChallengeResponse {
  if (networkError || !Number.isFinite(status) || status === 0) {
    return { ok: false, error: WALLET_REACHABILITY_ERROR };
  }
  if (status >= 500) {
    return { ok: false, error: WALLET_TEMPORARY_ERROR };
  }
  if (status < 200 || status > 299 || !data || data.ok !== true) {
    return {
      ok: false,
      error: (data && data.error) || "Invalid request.",
    };
  }
  return data;
}

async function postJson<T extends { ok?: boolean; error?: string }>(
  url: string,
  body: unknown
): Promise<{ status: number; data: T; networkError?: string }> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    let data: T;
    try {
      data = JSON.parse(text) as T;
    } catch {
      data = { ok: false, error: "Invalid request." } as T;
    }
    return { status: response.status, data };
  } catch {
    return {
      status: 0,
      data: { ok: false, error: NETWORK_CORS_ERROR } as T,
      networkError: NETWORK_CORS_ERROR,
    };
  }
}

export async function requestWalletChallenge(
  baseUrl: string,
  token: string,
  wallet: string
): Promise<ChallengeResponse> {
  if (!isManGoLinkToken(token)) {
    return { ok: false, error: "This verification link is invalid." };
  }
  const result = await postJson<ChallengeResponse>(
    `${baseUrl}/wallet/challenge`,
    { token, wallet }
  );
  return interpretWalletChallengeResponse(
    result.status,
    result.data,
    result.networkError
  );
}

export async function requestWalletVerify(
  baseUrl: string,
  payload: {
    token: string;
    wallet: string;
    challengeId: string;
    signature: string;
  }
): Promise<VerifyResponse> {
  const result = await postJson<VerifyResponse>(
    `${baseUrl}/wallet/verify`,
    payload
  );
  if (result.networkError) {
    return { ok: false, error: result.networkError };
  }
  return interpretWalletVerifyResponse(result.status, result.data);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
