/**
 * Official Solana wallet in-app browser deeplinks for mobile fallback.
 * Discovery stays in solanaWallets.ts. This module only builds browse links.
 *
 * Formats (official browse docs, HTTPS universal links):
 * - Backpack: https://backpack.app/ul/v1/browse/<url>?ref=<ref>
 *   https://docs.backpack.app/deeplinks/other-methods/browse.md
 * - Phantom:  https://phantom.app/ul/browse/<url>?ref=<ref>
 *   https://docs.phantom.com/phantom-deeplinks/other-methods/browse
 * - Solflare: https://solflare.com/ul/v1/browse/<url>?ref=<ref>
 *   https://docs.solflare.com/solflare/technical/deeplinks/other-methods/browse.md
 *
 * `url` and `ref` are URL-encoded. `ref` is the requesting app origin only
 * (never the one-time token). The token is carried only inside the encoded
 * dApp URL, which the official browse protocol requires.
 *
 * Do not invent deeplinks for wallets without official browse documentation.
 */

export const WALLET_CONNECT_ORIGIN = "https://mangomeme.fun";
export const WALLET_CONNECT_PATH = "/wallet-connect";
export const WALLET_CONNECT_REF = WALLET_CONNECT_ORIGIN;

export type OfficialBrowseWallet = "backpack" | "phantom" | "solflare";

export const OFFICIAL_BROWSE_WALLETS: readonly OfficialBrowseWallet[] = [
  "backpack",
  "phantom",
  "solflare",
] as const;

const BROWSE_LABELS: Record<OfficialBrowseWallet, string> = {
  backpack: "Open in Backpack",
  phantom: "Open in Phantom",
  solflare: "Open in Solflare",
};

export interface MobileOpenAction {
  id: OfficialBrowseWallet;
  label: string;
  href: string;
}

export function buildWalletConnectPageUrl(token: string): string {
  const trimmed = token.trim();
  if (!trimmed) {
    throw new Error("missing_token");
  }
  return `${WALLET_CONNECT_ORIGIN}${WALLET_CONNECT_PATH}?t=${encodeURIComponent(trimmed)}`;
}

export function buildOfficialBrowseLink(
  wallet: OfficialBrowseWallet,
  token: string
): string {
  const encodedUrl = encodeURIComponent(buildWalletConnectPageUrl(token));
  const encodedRef = encodeURIComponent(WALLET_CONNECT_REF);
  if (wallet === "backpack") {
    return `https://backpack.app/ul/v1/browse/${encodedUrl}?ref=${encodedRef}`;
  }
  if (wallet === "phantom") {
    return `https://phantom.app/ul/browse/${encodedUrl}?ref=${encodedRef}`;
  }
  return `https://solflare.com/ul/v1/browse/${encodedUrl}?ref=${encodedRef}`;
}

export function isOfficialBrowseWallet(id: string): id is OfficialBrowseWallet {
  return (OFFICIAL_BROWSE_WALLETS as readonly string[]).includes(id);
}

export function officialBrowseLinkForWalletName(
  name: string,
  token: string
): string | null {
  const key = name.trim().toLowerCase();
  if (!isOfficialBrowseWallet(key)) {
    return null;
  }
  return buildOfficialBrowseLink(key, token);
}

export function listOfficialMobileOpenActions(token: string): MobileOpenAction[] {
  return OFFICIAL_BROWSE_WALLETS.map((id) => ({
    id,
    label: BROWSE_LABELS[id],
    href: buildOfficialBrowseLink(id, token),
  }));
}

export function isLikelyMobileBrowser(
  userAgent: string,
  hints?: { maxTouchPoints?: number; platform?: string }
): boolean {
  const ua = userAgent || "";
  if (/iPhone|iPod|Android/i.test(ua)) {
    return true;
  }
  if (/iPad/i.test(ua)) {
    return true;
  }
  if (/Telegram/i.test(ua) && /Mobile/i.test(ua)) {
    return true;
  }
  if (hints?.platform === "MacIntel" && (hints.maxTouchPoints ?? 0) > 1) {
    return true;
  }
  return false;
}

export function shouldShowMobileWalletOpen(input: {
  hasToken: boolean;
  isMobile: boolean;
  walletCount: number;
}): boolean {
  return input.hasToken && input.isMobile && input.walletCount === 0;
}
