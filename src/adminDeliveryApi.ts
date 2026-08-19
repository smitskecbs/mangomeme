/**
 * Admin delivery API client. Never sends telegramUserId or a client-chosen mint/destination.
 */

import { getWalletApiBaseUrlFromEnv } from "./walletConnectApi.ts";
import { isDeliveryToken, type DeliveryStatusPayload } from "./adminDeliveryState.ts";

export const DELIVERY_REACHABILITY_ERROR =
  "We couldn't reach ManGo delivery. Please try again.";
export const DELIVERY_TEMPORARY_ERROR =
  "Delivery is temporarily unavailable. Please try again.";

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
      data: { ok: false, error: DELIVERY_REACHABILITY_ERROR } as T,
      networkError: DELIVERY_REACHABILITY_ERROR,
    };
  }
}

function interpret<T extends { ok?: boolean; error?: string }>(
  status: number,
  data: T | null,
  networkError?: string
): T {
  if (networkError || !Number.isFinite(status) || status === 0) {
    return { ok: false, error: DELIVERY_REACHABILITY_ERROR } as T;
  }
  if (status >= 500) {
    return { ok: false, error: DELIVERY_TEMPORARY_ERROR } as T;
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

export function getDeliveryApiBaseUrl(
  env: { VITE_MANGO_WALLET_API_URL?: string } = {},
  pageProtocol?: string
): { baseUrl: string; error?: string } {
  return getWalletApiBaseUrlFromEnv(env, pageProtocol);
}

export async function requestDeliveryStatus(
  baseUrl: string,
  token: string
): Promise<{ ok: boolean; error?: string } & Partial<DeliveryStatusPayload>> {
  if (!isDeliveryToken(token)) {
    return { ok: false, error: "This delivery link is invalid." };
  }
  const result = await postJson<{ ok: boolean; error?: string } & DeliveryStatusPayload>(
    `${baseUrl}/delivery/status`,
    { token }
  );
  return interpret(result.status, result.data, result.networkError);
}

export async function requestDeliveryPayment(
  baseUrl: string,
  token: string
): Promise<{ ok: boolean; error?: string } & Partial<DeliveryStatusPayload>> {
  const result = await postJson<{ ok: boolean; error?: string } & DeliveryStatusPayload>(
    `${baseUrl}/delivery/payment`,
    { token }
  );
  return interpret(result.status, result.data, result.networkError);
}

export async function requestDeliveryConfirm(
  baseUrl: string,
  token: string,
  signature: string
): Promise<{
  ok: boolean;
  error?: string;
  signature?: string;
  idempotent?: boolean;
  pending?: boolean;
  status?: string;
  reason?: string;
  deliveryState?: string;
  kind?: string;
}> {
  const result = await postJson<{
    ok: boolean;
    error?: string;
    signature?: string;
    idempotent?: boolean;
    pending?: boolean;
    status?: string;
    reason?: string;
    deliveryState?: string;
    kind?: string;
  }>(`${baseUrl}/delivery/confirm`, { token, signature });
  return interpret(result.status, result.data, result.networkError);
}
