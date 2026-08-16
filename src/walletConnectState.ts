export type WalletConnectView =
  | "missing_token"
  | "idle"
  | "connecting"
  | "connected"
  | "verifying"
  | "success"
  | "expired"
  | "used"
  | "error"
  | "no_wallets";

export interface WalletConnectModel {
  token: string | null;
  view: WalletConnectView;
  walletAddress: string | null;
  walletName: string | null;
  errorMessage: string | null;
}

export function parseWalletConnectToken(search: string): string | null {
  const query = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(query);
  const token = params.get("t");
  if (typeof token !== "string") {
    return null;
  }
  const trimmed = token.trim();
  if (!trimmed || trimmed.length > 128) {
    return null;
  }
  return trimmed;
}

export function initialWalletConnectModel(search: string): WalletConnectModel {
  const token = parseWalletConnectToken(search);
  if (!token) {
    return {
      token: null,
      view: "missing_token",
      walletAddress: null,
      walletName: null,
      errorMessage: null,
    };
  }
  return {
    token,
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
  const text = typeof error === "string" ? error : "Verification failed.";
  if (/expired/i.test(text)) {
    return { view: "expired", message: text };
  }
  if (/already been used/i.test(text)) {
    return { view: "used", message: text };
  }
  return { view: "error", message: text || "Something went wrong. Please try again." };
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
  expired: {
    title: "Link expired",
    body: "This verification link has expired.\nReturn to Telegram and request a new one.",
  },
  used: {
    title: "Link already used",
    body: "This verification link has already been used.",
  },
  success: {
    title: "✅ Wallet verified!",
    body: "Your Solana wallet is now linked to your ManGo Telegram profile.\n\nYou can return to Telegram.\n\n🥭 Welcome back to ManGo.",
  },
  no_wallets: {
    title: "🥭 Connect your Solana Wallet",
    body: "No compatible Solana wallet was detected.\n\nInstall or open a Solana wallet in your browser and try again.",
  },
  connect_failed:
    "Could not connect wallet. Choose a compatible Solana wallet installed in your browser.",
  connected_status:
    "Wallet connected. Sign a message to verify ownership — no transaction will be sent.",
} as const;

export function telegramReturnUrl(botUsername: string): string {
  const name = botUsername.replace(/^@/, "").trim();
  if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(name)) {
    return "https://t.me/ManGoMemeFunCommunityBot";
  }
  return `https://t.me/${name}`;
}
