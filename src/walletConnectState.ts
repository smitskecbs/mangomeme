export type WalletConnectView =
  | "missing_token"
  | "idle"
  | "discovering"
  | "connecting"
  | "connected"
  | "verifying"
  | "success"
  | "expired"
  | "used"
  | "invalid"
  | "error"
  | "no_wallets"
  | "no_wallets_mobile";

export interface WalletConnectModel {
  token: string | null;
  view: WalletConnectView;
  walletAddress: string | null;
  walletName: string | null;
  errorMessage: string | null;
}

export const MANGO_LINK_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const MANGO_LINK_TOKEN_LENGTH = 43;

export function isManGoLinkToken(value: string | null | undefined): value is string {
  return typeof value === "string" && MANGO_LINK_TOKEN_PATTERN.test(value);
}

export function isBase64UrlCharset(value: string): boolean {
  return typeof value === "string" && value.length > 0 && /^[A-Za-z0-9_-]+$/.test(value);
}

/**
 * Wallets that decode the whole browse deeplink before splitting path/query
 * can open: /wallet-connect?t=<token>?ref=https://mangomeme.fun
 * URLSearchParams then treats everything after t= as the token (length 69).
 * Recover only when the prefix before `?` is an exact valid ManGo token.
 */
export function canonicalizeWalletConnectToken(raw: string): string {
  if (!raw.includes("?")) {
    return raw;
  }
  const first = raw.split("?")[0];
  if (isManGoLinkToken(first)) {
    return first;
  }
  return raw;
}

function tokenFromPathname(pathname: string | undefined): string | null {
  if (typeof pathname !== "string" || !pathname) {
    return null;
  }
  const match = pathname.match(/^\/wallet-connect\/([^/]+)\/?$/);
  if (!match || !match[1]) {
    return null;
  }
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export function parseWalletConnectToken(
  search: string,
  pathname?: string
): string | null {
  const query = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(query);
  const fromQuery = params.get("t");
  const fromPath = tokenFromPathname(pathname);
  const raw = typeof fromQuery === "string" && fromQuery ? fromQuery : fromPath;
  if (typeof raw !== "string" || !raw) {
    return null;
  }
  const canonical = canonicalizeWalletConnectToken(raw);
  if (!canonical || canonical.length > 128) {
    return null;
  }
  return canonical;
}

export function parseWalletConnectPageLocation(href: string): string | null {
  try {
    const url = new URL(href);
    return parseWalletConnectToken(url.search, url.pathname);
  } catch {
    return null;
  }
}

export function resolveWalletConnectToken(
  search: string,
  pathname?: string
): {
  token: string | null;
  presentedLength: number;
  charsetValid: boolean;
  valid: boolean;
  missing: boolean;
} {
  const query = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(query);
  const fromQuery = params.get("t");
  const fromPath = tokenFromPathname(pathname);
  const raw = typeof fromQuery === "string" && fromQuery ? fromQuery : fromPath;
  if (typeof raw !== "string" || !raw) {
    return {
      token: null,
      presentedLength: 0,
      charsetValid: false,
      valid: false,
      missing: true,
    };
  }
  const canonical = canonicalizeWalletConnectToken(raw);
  const valid = isManGoLinkToken(canonical);
  return {
    token: valid ? canonical : canonical || null,
    presentedLength: raw.length,
    charsetValid: isBase64UrlCharset(canonical),
    valid,
    missing: false,
  };
}

export function initialWalletConnectModel(
  search: string,
  pathname?: string
): WalletConnectModel {
  const resolved = resolveWalletConnectToken(search, pathname);
  if (resolved.missing) {
    return {
      token: null,
      view: "missing_token",
      walletAddress: null,
      walletName: null,
      errorMessage: null,
    };
  }
  if (!resolved.valid || !resolved.token) {
    return {
      token: null,
      view: "invalid",
      walletAddress: null,
      walletName: null,
      errorMessage: WALLET_COPY.invalid.body,
    };
  }
  return {
    token: resolved.token,
    view: "idle",
    walletAddress: null,
    walletName: null,
    errorMessage: null,
  };
}

export function mapApiErrorToView(error: string | undefined | null): {
  view: WalletConnectView;
  message: string;
} {
  const text = typeof error === "string" ? error.trim() : "";
  if (
    /couldn'?t reach ManGo verification/i.test(text) ||
    /Could not reach the wallet API/i.test(text) ||
    /network or CORS/i.test(text)
  ) {
    return { view: "error", message: WALLET_COPY.network };
  }
  if (text === "This verification link has expired.") {
    return { view: "expired", message: text };
  }
  if (text === "This verification link has already been used.") {
    return { view: "used", message: text };
  }
  if (text === "This verification link is invalid.") {
    return { view: "invalid", message: text };
  }
  if (
    !text ||
    text === "Verification failed." ||
    text === WALLET_COPY.temporary ||
    /temporarily unavailable/i.test(text)
  ) {
    return { view: "error", message: WALLET_COPY.temporary };
  }
  return { view: "error", message: text };
}

export const WALLET_COPY = {
  missing_token: {
    title: "🥭 Connect your Solana Wallet",
    body: "This page needs a verification link from Telegram.\nOpen ManGo Bot and tap Connect Wallet.",
  },
  idle: {
    title: "🥭 Connect your Solana Wallet",
    body: "Verify a Solana wallet to link it to your ManGo Telegram profile.\n\nConnect a compatible Solana wallet and sign a verification message.\n\nNo transaction will be sent.\nManGo never gets control of your wallet.",
  },
  discovering: {
    title: "🥭 Connect your Solana Wallet",
    body: "Looking for your wallet...",
  },
  expired: {
    title: "Link expired",
    body: "This verification link has expired.\nReturn to Telegram and request a new one.",
  },
  used: {
    title: "Link already used",
    body: "This verification link has already been used.",
  },
  invalid: {
    title: "Link invalid",
    body: "This verification link is invalid.\nReturn to Telegram and request a new one.",
  },
  network: "We couldn't reach ManGo verification. Please try again.",
  temporary: "Verification is temporarily unavailable. Please try again.",
  success: {
    title: "✅ Wallet verified!",
    body: "Your Solana wallet is now linked to your ManGo Telegram profile.\n\nYou can return to Telegram.\n\n🥭 Welcome back to ManGo.",
  },
  no_wallets: {
    title: "🥭 Connect your Solana Wallet",
    body: "No compatible Solana wallet was detected.\n\nInstall or open a Solana wallet in your browser and try again.",
  },
  no_wallets_mobile: {
    title: "🥭 No wallet detected",
    body: "Your wallet may not be available inside Telegram or your mobile browser.\n\nOpen this page in your Solana wallet app to continue.",
  },
  connect_failed:
    "Could not connect wallet. Choose a compatible Solana wallet installed in your browser.",
  connected_status:
    "Wallet connected. Sign a message to verify ownership — no transaction will be sent.",
} as const;

export const DISCOVERY_GRACE_MS = 2000;

const LOCKED_DISCOVERY_VIEWS: ReadonlySet<WalletConnectView> = new Set([
  "missing_token",
  "connecting",
  "connected",
  "verifying",
  "success",
  "expired",
  "used",
  "invalid",
  "error",
]);

export function resolveDiscoveryView(input: {
  hasToken: boolean;
  isMobile: boolean;
  walletCount: number;
  currentView: WalletConnectView;
  discoveryPending?: boolean;
}): WalletConnectView {
  if (!input.hasToken) {
    return "missing_token";
  }
  if (LOCKED_DISCOVERY_VIEWS.has(input.currentView)) {
    return input.currentView;
  }
  if (input.walletCount > 0) {
    return "idle";
  }
  if (input.isMobile) {
    if (input.discoveryPending) {
      return "discovering";
    }
    return "no_wallets_mobile";
  }
  if (input.currentView === "no_wallets") {
    return "no_wallets";
  }
  return "idle";
}

export function nextViewAfterRetryDiscovery(input: {
  hasToken: boolean;
  isMobile: boolean;
  walletCount: number;
}): WalletConnectView {
  if (!input.hasToken) {
    return "missing_token";
  }
  if (input.walletCount > 0) {
    return "idle";
  }
  return input.isMobile ? "discovering" : "no_wallets";
}

export function telegramReturnUrl(botUsername: string): string {
  const name = botUsername.replace(/^@/, "").trim();
  if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(name)) {
    return "https://t.me/ManGoMemeFunCommunityBot";
  }
  return `https://t.me/${name}`;
}
