/**
 * ManGo presale page state. Path token only — no uid in the URL.
 */

export const PRESALE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type PresaleView =
  | "missing_token"
  | "invalid_session"
  | "expired_session"
  | "not_live"
  | "discovering"
  | "wallet_not_connected"
  | "wallet_mismatch"
  | "amount"
  | "reserving"
  | "reserved"
  | "review"
  | "wallet_confirmation"
  | "submitting"
  | "verifying"
  | "confirmed"
  | "success"
  | "already_recorded"
  | "sold_out"
  | "user_max"
  | "transaction_failed"
  | "reservation_expired"
  | "error";

export interface PresaleAmount {
  lamports: string;
  sol: string;
  mango: string;
}

export interface PresaleStatusPayload {
  live: boolean;
  soldOut: boolean;
  expectedWallet: string;
  expectedWalletShort: string;
  walletVerified: boolean;
  walletMatch: boolean;
  treasuryShort: string;
  rate: string;
  minSol: string;
  maxWalletSol: string;
  amounts: PresaleAmount[];
  contributionSol: string;
  allocationMango: string;
  remainingMango: string;
  targetMango: string;
  availableSol?: string;
  reservedSol?: string;
  activeReservation?: PresalePreparePayload | null;
}

export interface PresalePreparePayload {
  orderId: string;
  memo: string;
  from: string;
  to: string;
  lamports: string;
  sol: string;
  mango: string;
  fromShort: string;
  toShort: string;
  network: string;
  expiresAt?: number;
  status?: string;
  recentBlockhash?: string | null;
  lastValidBlockHeight?: number | null;
}

export interface PresaleModel {
  token: string | null;
  view: PresaleView;
  status: PresaleStatusPayload | null;
  selected: PresaleAmount | null;
  prepare: PresalePreparePayload | null;
  connectedWallet: string | null;
  errorMessage: string | null;
  successSol: string | null;
  successMango: string | null;
}

export const PRESALE_COPY: Record<
  Exclude<
    PresaleView,
    | "error"
    | "amount"
    | "review"
    | "reserved"
    | "wallet_confirmation"
    | "reserving"
    | "submitting"
    | "verifying"
  >,
  { title: string; body: string }
> = {
  missing_token: {
    title: "🥭 ManGo Presale",
    body: "This presale link is invalid. Open Presale from ManGo Bot privately.",
  },
  invalid_session: {
    title: "🥭 ManGo Presale",
    body: "This presale link is invalid. Open a new link from ManGo Bot.",
  },
  expired_session: {
    title: "🥭 ManGo Presale",
    body: "This presale link has expired. Open Presale from ManGo Bot again.",
  },
  not_live: {
    title: "🥭 ManGo Presale",
    body: "The presale is not live yet.",
  },
  discovering: {
    title: "🥭 ManGo Presale",
    body: "Looking for a Solana wallet…",
  },
  wallet_not_connected: {
    title: "🥭 Connect your wallet",
    body: "Connect the Solana wallet that is verified on your ManGo profile.",
  },
  wallet_mismatch: {
    title: "🥭 Wallet mismatch",
    body: "Connect the exact Solana wallet linked to your ManGo Telegram profile.",
  },
  success: {
    title: "🥭 Contribution recorded",
    body: "Your allocation is recorded for future distribution. MANGO was not sent in this transaction.",
  },
  confirmed: {
    title: "🥭 Contribution recorded",
    body: "Your allocation is recorded for future distribution. MANGO was not sent in this transaction.",
  },
  already_recorded: {
    title: "🥭 Already recorded",
    body: "This contribution is already recorded.",
  },
  sold_out: {
    title: "🥭 Presale sold out",
    body: "The presale hard cap has been reached.",
  },
  user_max: {
    title: "🥭 Maximum reached",
    body: "This wallet has reached the maximum presale contribution.",
  },
  transaction_failed: {
    title: "🥭 Transaction failed",
    body: "The wallet transaction did not complete. No allocation was recorded.",
  },
  reservation_expired: {
    title: "🥭 Reservation expired",
    body: "Your presale reservation expired. Create a new one.",
  },
};

export function isPresaleToken(value: string | null | undefined): value is string {
  return typeof value === "string" && PRESALE_TOKEN_PATTERN.test(value);
}

export function canonicalizePresaleToken(raw: string): string {
  if (!raw.includes("?")) {
    return raw;
  }
  const first = raw.split("?")[0];
  if (isPresaleToken(first)) {
    return first;
  }
  return raw;
}

function tokenFromPathname(pathname: string | undefined): string | null {
  if (typeof pathname !== "string" || !pathname) {
    return null;
  }
  const match = pathname.match(/^\/presale\/([^/]+)\/?$/);
  if (!match || !match[1]) {
    return null;
  }
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export function parsePresaleToken(search: string, pathname?: string): string | null {
  const query = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(query);
  const fromQuery = params.get("t");
  const fromPath = tokenFromPathname(pathname);
  const raw = typeof fromQuery === "string" && fromQuery ? fromQuery : fromPath;
  if (typeof raw !== "string" || !raw) {
    return null;
  }
  const canonical = canonicalizePresaleToken(raw);
  if (!canonical || canonical.length > 128) {
    return null;
  }
  return isPresaleToken(canonical) ? canonical : null;
}

export function initialPresaleModel(search: string, pathname?: string): PresaleModel {
  const token = parsePresaleToken(search, pathname);
  return {
    token,
    view: token ? "discovering" : "missing_token",
    status: null,
    selected: null,
    prepare: null,
    connectedWallet: null,
    errorMessage: null,
    successSol: null,
    successMango: null,
  };
}

export function viewAfterStatus(
  model: PresaleModel,
  status: PresaleStatusPayload,
  connectedWallet: string | null
): PresaleView {
  if (!status.live) {
    return "not_live";
  }
  if (!connectedWallet) {
    return "wallet_not_connected";
  }
  if (connectedWallet !== status.expectedWallet) {
    return "wallet_mismatch";
  }
  if (status.activeReservation && hasActivePaymentValidity(status.activeReservation)) {
    return "reserved";
  }
  if (status.soldOut) {
    return "sold_out";
  }
  return "amount";
}

export function isReservationExpired(expiresAt: number | undefined, now = Date.now()): boolean {
  if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt)) {
    return false;
  }
  return now >= expiresAt;
}

export function hasActivePaymentValidity(
  prepare: {
    status?: string;
    recentBlockhash?: string | null;
    expiresAt?: number;
  } | null
    | undefined,
  now = Date.now()
): boolean {
  if (!prepare) {
    return false;
  }
  if (prepare.status === "submitted" || prepare.status === "payment-ready") {
    return true;
  }
  if (prepare.recentBlockhash) {
    return true;
  }
  return !isReservationExpired(prepare.expiresAt, now);
}

export function reviewDisclaimer(): string {
  return "This is a presale contribution. MANGO will not be delivered in this transaction.";
}

export function hasProfitClaim(text: string): boolean {
  return /guaranteed|profit|discount versus|bonding curve/i.test(text);
}
