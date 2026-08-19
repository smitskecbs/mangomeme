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
  | "waiting"
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
  deliveryState?: "open" | "payment-ready" | "submitted" | "reconciling" | "sent" | "failed";
  hasSignature?: boolean;
}

export interface DeliveryModel {
  token: string | null;
  view: DeliveryView;
  status: DeliveryStatusPayload | null;
  connectedWallet: string | null;
  errorMessage: string | null;
}

export const DELIVERY_COPY: Record<
  Exclude<DeliveryView, "error" | "review" | "submitting" | "verifying" | "waiting">,
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

export const WAITING_COPY = {
  title: "🎁 Transaction submitted",
  body: "Waiting for network confirmation...",
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

export const DELIVERY_SIGNATURE_STORAGE_PREFIX = "mango.delivery.sig.";

export function deliverySignatureStorageKey(token: string): string {
  return `${DELIVERY_SIGNATURE_STORAGE_PREFIX}${token}`;
}

export function isConfirmPending(confirmed: {
  ok?: boolean;
  pending?: boolean;
  status?: string;
  reason?: string;
} | null | undefined): boolean {
  if (!confirmed) {
    return false;
  }
  if (confirmed.pending === true) {
    return true;
  }
  const status = confirmed.status;
  return (
    status === "pending" ||
    status === "reconciling" ||
    status === "submitted" ||
    status === "not-finalized"
  );
}

export function isConfirmSent(confirmed: {
  ok?: boolean;
  pending?: boolean;
  status?: string;
} | null | undefined): boolean {
  if (!confirmed || confirmed.ok !== true) {
    return false;
  }
  if (isConfirmPending(confirmed)) {
    return false;
  }
  if (confirmed.status === "failed") {
    return false;
  }
  return confirmed.status === "sent" || confirmed.status === undefined || confirmed.status === "ok";
}

export function isWaitingDeliveryState(state: string | null | undefined): boolean {
  return state === "submitted" || state === "reconciling";
}
