/**
 * Presale API client. Same origin policy as wallet verification.
 * Never sends telegramUserId or a client-chosen destination wallet.
 */

import { getWalletApiBaseUrlFromEnv } from "./walletConnectApi.ts";
import { isPresaleToken, type PresalePreparePayload, type PresaleStatusPayload } from "./presaleState.ts";

export const PRESALE_REACHABILITY_ERROR =
  "We couldn't reach ManGo presale. Please try again.";
export const PRESALE_TEMPORARY_ERROR =
  "Presale is temporarily unavailable. Please try again.";

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
      data: { ok: false, error: PRESALE_REACHABILITY_ERROR } as T,
      networkError: PRESALE_REACHABILITY_ERROR,
    };
  }
}

function interpret<T extends { ok?: boolean; error?: string }>(
  status: number,
  data: T | null,
  networkError?: string
): T {
  if (networkError || !Number.isFinite(status) || status === 0) {
    return { ok: false, error: PRESALE_REACHABILITY_ERROR } as T;
  }
  if (status >= 500) {
    return { ok: false, error: PRESALE_TEMPORARY_ERROR } as T;
  }
  if (status < 200 || status > 299 || !data || data.ok !== true) {
    return {
      ...(data || {}),
      ok: false,
      error: (data && data.error) || "Invalid request.",
    } as T;
  }
  return data;
}

export function getPresaleApiBaseUrl(
  env: { VITE_MANGO_WALLET_API_URL?: string } = {},
  pageProtocol?: string
): { baseUrl: string; error?: string } {
  return getWalletApiBaseUrlFromEnv(env, pageProtocol);
}

export async function requestPresaleStatus(
  baseUrl: string,
  token: string
): Promise<{ ok: boolean; error?: string } & Partial<PresaleStatusPayload>> {
  if (!isPresaleToken(token)) {
    return { ok: false, error: "This presale link is invalid." };
  }
  const result = await postJson<{ ok: boolean; error?: string } & PresaleStatusPayload>(
    `${baseUrl}/presale/status`,
    { token }
  );
  return interpret(result.status, result.data, result.networkError);
}

export async function requestPresalePrepare(
  baseUrl: string,
  token: string,
  lamports: string
): Promise<{ ok: boolean; error?: string } & Partial<PresalePreparePayload>> {
  const result = await postJson<{ ok: boolean; error?: string } & PresalePreparePayload>(
    `${baseUrl}/presale/prepare`,
    { token, lamports }
  );
  return interpret(result.status, result.data, result.networkError);
}

export async function requestPresalePayment(
  baseUrl: string,
  token: string,
  orderId: string
): Promise<{ ok: boolean; error?: string } & Partial<PresalePreparePayload>> {
  const result = await postJson<{ ok: boolean; error?: string } & PresalePreparePayload>(
    `${baseUrl}/presale/payment`,
    { token, orderId }
  );
  return interpret(result.status, result.data, result.networkError);
}

export async function requestPresaleConfirm(
  baseUrl: string,
  token: string,
  signature: string,
  orderId?: string
): Promise<{ ok: boolean; error?: string; sol?: string; mango?: string }> {
  const result = await postJson<{
    ok: boolean;
    error?: string;
    sol?: string;
    mango?: string;
  }>(`${baseUrl}/presale/confirm`, { token, signature, orderId });
  return interpret(result.status, result.data, result.networkError);
}
