/**
 * Frontend wallet-connect route helpers.
 * Run with: node --import ./tests/_ts-register.mjs tests/wallet-connect.test.js
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  OFFICIAL_BROWSE_WALLETS,
  WALLET_CONNECT_ORIGIN,
  WALLET_CONNECT_REF,
  buildOfficialBrowseLink,
  buildWalletConnectPageUrl,
  isLikelyMobileBrowser,
  isOfficialBrowseWallet,
  listOfficialMobileOpenActions,
  officialBrowseLinkForWalletName,
  shouldShowMobileWalletOpen,
} from "../src/mobileWalletLinks.ts";
import { shortenWallet } from "../src/shortenWallet.ts";
import {
  EXPECTED_WALLET_API_ORIGIN,
  getWalletApiBaseUrlFromEnv,
  resolveWalletApiBaseUrl,
} from "../src/walletConnectApi.ts";
import {
  WALLET_COPY,
  initialWalletConnectModel,
  mapApiErrorToView,
  nextViewAfterRetryDiscovery,
  parseWalletConnectToken,
  resolveDiscoveryView,
  telegramReturnUrl,
} from "../src/walletConnectState.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readSrc(relativePath) {
  return readFileSync(path.join(ROOT, relativePath), "utf8");
}

function collectUserFacingCopy() {
  return [
    readSrc("wallet-connect.html"),
    readSrc("src/walletConnect.ts"),
    readSrc("src/walletConnectState.ts"),
    WALLET_COPY.missing_token.title,
    WALLET_COPY.missing_token.body,
    WALLET_COPY.idle.title,
    WALLET_COPY.idle.body,
    WALLET_COPY.no_wallets.title,
    WALLET_COPY.no_wallets.body,
    WALLET_COPY.no_wallets_mobile.title,
    WALLET_COPY.no_wallets_mobile.body,
    WALLET_COPY.connect_failed,
    WALLET_COPY.connected_status,
    WALLET_COPY.success.title,
    WALLET_COPY.success.body,
  ].join("\n");
}

function runTest(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

runTest("missing token state", () => {
  assert.equal(parseWalletConnectToken(""), null);
  assert.equal(parseWalletConnectToken("?"), null);
  assert.equal(parseWalletConnectToken("?game=snake"), null);
  const model = initialWalletConnectModel("");
  assert.equal(model.view, "missing_token");
  assert.equal(model.token, null);
});

runTest("connect token parsed, no uid required", () => {
  const token = "abcDEF123_-";
  const model = initialWalletConnectModel(`?t=${token}`);
  assert.equal(model.view, "idle");
  assert.equal(model.token, token);
  assert.equal(parseWalletConnectToken("?t=  padded  "), "padded");
});

runTest("shortenWallet display", () => {
  assert.equal(shortenWallet("7AbcDEFG9XYZMango"), "7Abc...ango");
});

runTest("API URL requires absolute origin", () => {
  assert.equal(resolveWalletApiBaseUrl("").baseUrl, "");
  assert.equal(resolveWalletApiBaseUrl("/wallet/challenge").baseUrl, "");
  assert.equal(
    resolveWalletApiBaseUrl("https://api.mangomeme.fun").baseUrl,
    EXPECTED_WALLET_API_ORIGIN
  );
  assert.equal(
    resolveWalletApiBaseUrl("https://api.mangomeme.fun/wallet/challenge").baseUrl,
    EXPECTED_WALLET_API_ORIGIN
  );
});

runTest("mixed content http API blocked on https pages", () => {
  const result = resolveWalletApiBaseUrl("http://203.0.113.10:8787", "https:");
  assert.equal(result.baseUrl, "");
  assert.equal(result.mixedContent, true);
});

runTest("localhost http allowed for local dev", () => {
  const result = resolveWalletApiBaseUrl("http://127.0.0.1:8787", "http:");
  assert.equal(result.baseUrl, "http://127.0.0.1:8787");
});

runTest("expired / used / error mapping", () => {
  assert.equal(
    mapApiErrorToView("This verification link has expired.").view,
    "expired"
  );
  assert.equal(
    mapApiErrorToView("This verification link has already been used.").view,
    "used"
  );
  assert.equal(
    mapApiErrorToView("This wallet is already linked to another ManGo profile.").view,
    "error"
  );
});

runTest("success / expired copy", () => {
  assert.ok(WALLET_COPY.success.body.includes("Wallet verified") === false);
  assert.ok(WALLET_COPY.success.title.includes("Wallet verified"));
  assert.ok(WALLET_COPY.expired.body.includes("expired"));
  assert.ok(WALLET_COPY.used.body.includes("already been used"));
});

runTest("user-facing copy is wallet-agnostic", () => {
  const copy = collectUserFacingCopy();
  assert.equal(/Phantom and Solflare/i.test(copy), false);
  assert.equal(/Try Phantom or Solflare/i.test(copy), false);
  assert.equal(/Install Phantom or Solflare/i.test(copy), false);
  assert.equal(/Supports Phantom/i.test(copy), false);
  assert.equal(/\bPhantom\b/.test(copy), false);
  assert.equal(/\bSolflare\b/.test(copy), false);
  assert.ok(WALLET_COPY.idle.title.includes("Connect your Solana Wallet"));
  assert.ok(WALLET_COPY.idle.body.includes("compatible Solana wallet"));
  assert.ok(WALLET_COPY.idle.body.includes("No transaction will be sent"));
  assert.ok(WALLET_COPY.idle.body.includes("never gets control of your wallet"));
  assert.ok(WALLET_COPY.no_wallets.body.includes("No compatible Solana wallet was detected"));
  assert.ok(WALLET_COPY.no_wallets.body.includes("Install or open a Solana wallet"));
  assert.ok(!WALLET_COPY.no_wallets.body.includes("Phantom"));
  assert.ok(WALLET_COPY.no_wallets_mobile.title.includes("No wallet detected"));
  assert.ok(WALLET_COPY.no_wallets_mobile.body.includes("Telegram or your mobile browser"));
  assert.ok(!/only these wallets are supported/i.test(copy));
  assert.ok(WALLET_COPY.connect_failed.includes("compatible Solana wallet"));
  assert.ok(WALLET_COPY.connected_status.includes("no transaction will be sent"));
  assert.ok(readSrc("wallet-connect.html").includes("Compatible Solana wallets are detected automatically"));
  assert.ok(readSrc("wallet-connect.html").includes("Connect Wallet"));
});

runTest("detected wallet names stay dynamic", () => {
  const connectSrc = readSrc("src/walletConnect.ts");
  assert.ok(connectSrc.includes("button.textContent = wallet.name"));
  const discovered = [{ name: "Backpack" }, { name: "Phantom" }, { name: "Solflare" }];
  assert.deepEqual(
    discovered.map((wallet) => wallet.name),
    ["Backpack", "Phantom", "Solflare"]
  );
});

runTest("Wallet Standard discovery still accepts named providers including Backpack", () => {
  const walletsSrc = readSrc("src/solanaWallets.ts");
  assert.ok(walletsSrc.includes("standard.set(wallet.name, wallet)"));
  assert.ok(walletsSrc.includes("name: wallet.name"));
  assert.ok(walletsSrc.includes('name: "Phantom"'));
  assert.ok(walletsSrc.includes('name: "Solflare"'));
  assert.equal(/name:\s*"Backpack"/.test(walletsSrc), false);
  assert.equal(/jupiter/i.test(walletsSrc), false);
  assert.ok(walletsSrc.includes("solana:signMessage"));
  assert.equal(/signTransaction/.test(walletsSrc), true);
  assert.ok(walletsSrc.includes("Never signTransaction / sendTransaction"));
});

runTest("signMessage only, no secrets in copy", () => {
  const copy = collectUserFacingCopy();
  assert.ok(/sign a (verification )?message/i.test(copy));
  assert.equal(/private key/i.test(copy), false);
  assert.equal(/seed phrase/i.test(copy), false);
  assert.equal(/BOT_TOKEN/.test(copy), false);
  assert.ok(WALLET_COPY.connected_status.includes("no transaction"));
});

runTest("return to Telegram has no token", () => {
  const url = telegramReturnUrl("ManGoMemeFunCommunityBot");
  assert.equal(url, "https://t.me/ManGoMemeFunCommunityBot");
  assert.ok(!url.includes("t="));
  assert.ok(!url.includes("uid"));
});

runTest("env helper does not read BOT_TOKEN", () => {
  const result = getWalletApiBaseUrlFromEnv({
    VITE_MANGO_WALLET_API_URL: "https://api.mangomeme.fun",
    BOT_TOKEN: "secret-should-be-ignored",
  });
  assert.equal(result.baseUrl, "https://api.mangomeme.fun");
});

runTest("desktop wallet detected keeps existing connect flow", () => {
  assert.equal(
    resolveDiscoveryView({
      hasToken: true,
      isMobile: false,
      walletCount: 1,
      currentView: "idle",
    }),
    "idle"
  );
  assert.equal(
    shouldShowMobileWalletOpen({
      hasToken: true,
      isMobile: false,
      walletCount: 1,
    }),
    false
  );
});

runTest("mobile wallet detected keeps existing connect flow", () => {
  assert.equal(
    resolveDiscoveryView({
      hasToken: true,
      isMobile: true,
      walletCount: 2,
      currentView: "idle",
    }),
    "idle"
  );
  assert.equal(
    shouldShowMobileWalletOpen({
      hasToken: true,
      isMobile: true,
      walletCount: 2,
    }),
    false
  );
});

runTest("Telegram/mobile with no wallet shows mobile instructions", () => {
  const telegramIphone =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari/604.1 Telegram";
  const telegramAndroid =
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 Telegram-Android/10.5.2";
  const desktopChrome =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  const telegramDesktop =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) TelegramDesktop Chrome/122.0.6261.94 Safari/537.36";

  assert.equal(isLikelyMobileBrowser(telegramIphone), true);
  assert.equal(isLikelyMobileBrowser(telegramAndroid), true);
  assert.equal(isLikelyMobileBrowser(desktopChrome), false);
  assert.equal(isLikelyMobileBrowser(telegramDesktop), false);
  assert.equal(
    resolveDiscoveryView({
      hasToken: true,
      isMobile: true,
      walletCount: 0,
      currentView: "idle",
    }),
    "no_wallets_mobile"
  );
  assert.equal(
    resolveDiscoveryView({
      hasToken: true,
      isMobile: false,
      walletCount: 0,
      currentView: "idle",
    }),
    "idle"
  );
  assert.equal(
    shouldShowMobileWalletOpen({
      hasToken: true,
      isMobile: true,
      walletCount: 0,
    }),
    true
  );
});

runTest("same one-time token stays in the target dApp URL", () => {
  const token = "cafebabedeadbeef0123456789abcdef0123456789abcdef0123456789abcd";
  const pageUrl = buildWalletConnectPageUrl(token);
  assert.equal(
    pageUrl,
    `${WALLET_CONNECT_ORIGIN}/wallet-connect?t=${encodeURIComponent(token)}`
  );
  assert.equal(new URL(pageUrl).searchParams.get("t"), token);
  for (const wallet of OFFICIAL_BROWSE_WALLETS) {
    const href = buildOfficialBrowseLink(wallet, token);
    const encodedTarget = href.split("/browse/")[1].split("?ref=")[0];
    assert.equal(decodeURIComponent(encodedTarget), pageUrl);
  }
});

runTest("token is URL-encoded in browse links and page URL", () => {
  const token = "a+b/c=d?e";
  const pageUrl = buildWalletConnectPageUrl(token);
  assert.ok(pageUrl.includes(`t=${encodeURIComponent(token)}`));
  assert.equal(pageUrl.includes("t=a+b/c=d?e"), false);
  const href = buildOfficialBrowseLink("phantom", token);
  const encodedTarget = href.split("/browse/")[1].split("?ref=")[0];
  assert.equal(encodedTarget, encodeURIComponent(pageUrl));
  assert.equal(decodeURIComponent(encodedTarget), pageUrl);
  assert.equal(new URL(decodeURIComponent(encodedTarget)).searchParams.get("t"), token);
});

runTest("mobile open links never add a uid", () => {
  const token = "abcDEF123_-";
  const pageUrl = buildWalletConnectPageUrl(token);
  assert.equal(pageUrl.includes("uid"), false);
  for (const action of listOfficialMobileOpenActions(token)) {
    assert.equal(/[?&]uid=/i.test(action.href), false);
    const ref = decodeURIComponent(action.href.split("?ref=")[1]);
    assert.equal(ref, WALLET_CONNECT_REF);
    assert.equal(ref.includes("t="), false);
    assert.equal(ref.includes("uid"), false);
  }
});

runTest("Try Again re-runs discovery without reload or challenge", () => {
  assert.equal(
    nextViewAfterRetryDiscovery({
      hasToken: true,
      isMobile: true,
      walletCount: 1,
    }),
    "idle"
  );
  assert.equal(
    nextViewAfterRetryDiscovery({
      hasToken: true,
      isMobile: true,
      walletCount: 0,
    }),
    "no_wallets_mobile"
  );
  const connectSrc = readSrc("src/walletConnect.ts");
  const tryAgainStart = connectSrc.indexOf('tryAgainBtn?.addEventListener("click"');
  const verifyStart = connectSrc.indexOf('verifyBtn?.addEventListener("click"');
  assert.ok(tryAgainStart >= 0);
  assert.ok(verifyStart > tryAgainStart);
  const tryAgainBlock = connectSrc.slice(tryAgainStart, verifyStart);
  assert.ok(tryAgainBlock.includes("registry.list()"));
  assert.ok(tryAgainBlock.includes("nextViewAfterRetryDiscovery"));
  assert.equal(tryAgainBlock.includes("requestWalletChallenge"), false);
  assert.equal(tryAgainBlock.includes("requestWalletVerify"), false);
  assert.equal(tryAgainBlock.includes("location.reload"), false);
  assert.equal(connectSrc.includes("location.reload"), false);
  assert.ok(readSrc("wallet-connect.html").includes("Try Again"));
});

runTest("Backpack official browse deep link", () => {
  const token = "token-backpack-1";
  const href = buildOfficialBrowseLink("backpack", token);
  const pageUrl = buildWalletConnectPageUrl(token);
  assert.equal(
    href,
    `https://backpack.app/ul/v1/browse/${encodeURIComponent(pageUrl)}?ref=${encodeURIComponent(WALLET_CONNECT_REF)}`
  );
});

runTest("Phantom official browse deep link", () => {
  const token = "token-phantom-1";
  const href = buildOfficialBrowseLink("phantom", token);
  const pageUrl = buildWalletConnectPageUrl(token);
  assert.equal(
    href,
    `https://phantom.app/ul/browse/${encodeURIComponent(pageUrl)}?ref=${encodeURIComponent(WALLET_CONNECT_REF)}`
  );
});

runTest("Solflare official browse deep link", () => {
  const token = "token-solflare-1";
  const href = buildOfficialBrowseLink("solflare", token);
  const pageUrl = buildWalletConnectPageUrl(token);
  assert.equal(
    href,
    `https://solflare.com/ul/v1/browse/${encodeURIComponent(pageUrl)}?ref=${encodeURIComponent(WALLET_CONNECT_REF)}`
  );
});

runTest("unsupported wallet gets no invented deeplink", () => {
  const token = "token-unsupported-1";
  assert.equal(isOfficialBrowseWallet("jupiter"), false);
  assert.equal(isOfficialBrowseWallet("metamask"), false);
  assert.equal(officialBrowseLinkForWalletName("Jupiter", token), null);
  assert.equal(officialBrowseLinkForWalletName("Glow", token), null);
  assert.equal(officialBrowseLinkForWalletName("Trust Wallet", token), null);
  const linksSrc = readSrc("src/mobileWalletLinks.ts");
  assert.equal(/jupiter/i.test(linksSrc), false);
  assert.equal(/phantom:\/\//.test(linksSrc), false);
  assert.equal(/backpack:\/\//.test(linksSrc), false);
  assert.equal(/solflare:\/\//.test(linksSrc), false);
  assert.deepEqual([...OFFICIAL_BROWSE_WALLETS], ["backpack", "phantom", "solflare"]);
});

runTest("signMessage-only verification remains, no signTransaction in page", () => {
  const connectSrc = readSrc("src/walletConnect.ts");
  const walletsSrc = readSrc("src/solanaWallets.ts");
  assert.ok(connectSrc.includes("signMessageWithWallet"));
  assert.equal(/signTransaction/.test(connectSrc), false);
  assert.equal(/sendTransaction/.test(connectSrc), false);
  assert.ok(walletsSrc.includes("solana:signMessage"));
  assert.ok(walletsSrc.includes("Never signTransaction / sendTransaction"));
});

runTest("no secrets in mobile wallet links or copy", () => {
  const copy = collectUserFacingCopy();
  const linksSrc = readSrc("src/mobileWalletLinks.ts");
  assert.equal(/private key/i.test(copy), false);
  assert.equal(/seed phrase/i.test(copy), false);
  assert.equal(/BOT_TOKEN/.test(copy), false);
  assert.equal(/private key/i.test(linksSrc), false);
  assert.equal(/seed phrase/i.test(linksSrc), false);
  assert.equal(/console\.log/.test(linksSrc), false);
  assert.equal(/console\.log/.test(readSrc("src/walletConnect.ts")), false);
});

runTest("expired/used token mapping is unchanged", () => {
  assert.equal(
    mapApiErrorToView("This verification link has expired.").view,
    "expired"
  );
  assert.equal(
    mapApiErrorToView("This verification link has already been used.").view,
    "used"
  );
  assert.equal(WALLET_COPY.expired.body.includes("expired"), true);
  assert.equal(WALLET_COPY.used.body.includes("already been used"), true);
});

console.log("wallet-connect tests passed");
