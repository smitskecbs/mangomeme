/**
 * Admin delivery page state. Path token only — no uid in the URL.
 */

export const DELIVERY_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type DeliveryView =
  | "missing_token"
  | "invalid_session"
  | "expired_session"
  | "disabled"
  | "discovering"
  | "wallet_not_connected"
  | "wallet_mismatch"
  | "review"
  | "submitting"
  | "verifying"
  | "success"
  | "already_sent"
  | "transaction_failed"
  | "error";

export interface DeliveryStatusPayload {
  typeLabel: string;
  kind: string;
  destination: string;
  destinationShort: string;
  asset: string;
  amountHuman: string;
  amountDisplay: string;
  amountBaseUnits: string;
  mint: string;
  expectedSigner: string;
  expectedSignerShort: string;
  memo: string;
  deliveryId: string;
  tokenProgram: string;
  associatedTokenProgram: string;
  decimals: number;
  from: string;
  to: string;
  fromShort: string;
  toShort: string;
  expiresAt: number;
  recentBlockhash?: string | null;
  lastValidBlockHeight?: number | null;
  network: string;
}

export interface DeliveryModel {
  token: string | null;
  view: DeliveryView;
  status: DeliveryStatusPayload | null;
  connectedWallet: string | null;
  errorMessage: string | null;
}

export const DELIVERY_COPY: Record<
  Exclude<DeliveryView, "error" | "review" | "submitting" | "verifying">,
  { title: string; body: string }
> = {
  missing_token: {
    title: "🎁 ManGo Delivery",
    body: "Open this page from the ManGo admin delivery link.",
  },
  invalid_session: {
    title: "🎁 ManGo Delivery",
    body: "This delivery link is invalid. Create a new one with /deliver.",
  },
  expired_session: {
    title: "🎁 ManGo Delivery",
    body: "This delivery link has expired. Create a new one with /deliver.",
  },
  disabled: {
    title: "🎁 ManGo Delivery",
    body: "Reward delivery is disabled.",
  },
  discovering: {
    title: "🎁 ManGo Delivery",
    body: "Looking for a Solana wallet…",
  },
  wallet_not_connected: {
    title: "🎁 Connect distribution wallet",
    body: "Connect the ManGo distribution wallet. The bot never holds private keys.",
  },
  wallet_mismatch: {
    title: "🎁 Wallet mismatch",
    body: "Connect the exact configured distribution wallet.",
  },
  success: {
    title: "🎁 Delivery sent",
    body: "The on-chain transfer was verified. The reward is now marked sent.",
  },
  already_sent: {
    title: "🎁 Already sent",
    body: "This delivery was already verified.",
  },
  transaction_failed: {
    title: "🎁 Transaction failed",
    body: "The wallet transaction did not complete. Nothing was marked sent.",
  },
};

export function isDeliveryToken(value: string | null | undefined): value is string {
  return typeof value === "string" && DELIVERY_TOKEN_PATTERN.test(value);
}

function tokenFromPathname(pathname: string | undefined): string | null {
  if (typeof pathname !== "string" || !pathname) {
    return null;
  }
  const match = pathname.match(/^\/admin-delivery\/([^/]+)\/?$/);
  if (!match || !match[1]) {
    return null;
  }
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export function parseDeliveryToken(search: string, pathname?: string): string | null {
  const fromPath = tokenFromPathname(pathname);
  if (typeof fromPath === "string" && fromPath && isDeliveryToken(fromPath)) {
    return fromPath;
  }
  const query = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(query);
  const fromQuery = params.get("t");
  if (typeof fromQuery === "string" && isDeliveryToken(fromQuery)) {
    return fromQuery;
  }
  return null;
}

export function initialDeliveryModel(search: string, pathname?: string): DeliveryModel {
  const token = parseDeliveryToken(search, pathname);
  return {
    token,
    view: token ? "discovering" : "missing_token",
    status: null,
    connectedWallet: null,
    errorMessage: null,
  };
}

export function reviewText(status: DeliveryStatusPayload): string {
  return [
    `Type: ${status.typeLabel}`,
    `To: ${status.destinationShort}`,
    `Asset: ${status.asset}`,
    `Amount: ${status.amountDisplay} MANGO`,
    "",
    "You are sending this reward from your connected distribution wallet.",
  ].join("\n");
}
