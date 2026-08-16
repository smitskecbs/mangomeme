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
  buildWalletConnectBrowseTargetUrl,
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
  NETWORK_CORS_ERROR,
  WALLET_REACHABILITY_ERROR,
  WALLET_TEMPORARY_ERROR,
  getWalletApiBaseUrlFromEnv,
  interpretWalletChallengeResponse,
  interpretWalletVerifyResponse,
  requestWalletChallenge,
  resolveWalletApiBaseUrl,
} from "../src/walletConnectApi.ts";
import {
  DISCOVERY_GRACE_MS,
  MANGO_LINK_TOKEN_PATTERN,
  WALLET_COPY,
  canonicalizeWalletConnectToken,
  initialWalletConnectModel,
  isManGoLinkToken,
  mapApiErrorToView,
  nextViewAfterRetryDiscovery,
  parseWalletConnectPageLocation,
  parseWalletConnectToken,
  resolveDiscoveryView,
  resolveWalletConnectToken,
  telegramReturnUrl,
} from "../src/walletConnectState.ts";
import {
  WALLET_STANDARD_READY,
  WALLET_STANDARD_REGISTER,
  connectDiscoveredWallet,
  createWalletRegistry,
  describeDiscoveredWallets,
  isUsableLegacyProvider,
  signMessageWithWallet,
} from "../src/solanaWallets.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pending = [];
const SAMPLE_TOKEN = "Abcdefghijklmnopqrstuvwxyz0123456789-_ABCDE";
const INVALID_LINK_MESSAGE = "This verification link is invalid.";

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
    WALLET_COPY.discovering.title,
    WALLET_COPY.discovering.body,
    WALLET_COPY.no_wallets.title,
    WALLET_COPY.no_wallets.body,
    WALLET_COPY.no_wallets_mobile.title,
    WALLET_COPY.no_wallets_mobile.body,
    WALLET_COPY.connect_failed,
    WALLET_COPY.connected_status,
    WALLET_COPY.success.title,
    WALLET_COPY.success.body,
    WALLET_COPY.expired.title,
    WALLET_COPY.expired.body,
    WALLET_COPY.used.title,
    WALLET_COPY.used.body,
    WALLET_COPY.invalid.title,
    WALLET_COPY.invalid.body,
    WALLET_COPY.network,
    WALLET_COPY.temporary,
  ].join("\n");
}

function runTest(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === "function") {
      pending.push(
        result.then(
          () => {
            console.log(`✓ ${name}`);
          },
          (error) => {
            console.error(`✗ ${name}`);
            throw error;
          }
        )
      );
      return;
    }
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
  assert.equal(SAMPLE_TOKEN.length, 43);
  assert.equal(MANGO_LINK_TOKEN_PATTERN.test(SAMPLE_TOKEN), true);
  const model = initialWalletConnectModel(`?t=${SAMPLE_TOKEN}`);
  assert.equal(model.view, "idle");
  assert.equal(model.token, SAMPLE_TOKEN);
  assert.equal(parseWalletConnectToken("?t=  padded  "), "  padded  ");
  assert.equal(parseWalletConnectToken("?t=abc-DEF_012"), "abc-DEF_012");
  assert.equal(parseWalletConnectToken("?t=keep_underscore"), "keep_underscore");
  assert.equal(parseWalletConnectToken("?t=keep-dash"), "keep-dash");
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

runTest("expired / used / invalid / network / server error mapping", () => {
  assert.equal(
    mapApiErrorToView("This verification link has expired.").view,
    "expired"
  );
  assert.equal(
    mapApiErrorToView("This verification link has already been used.").view,
    "used"
  );
  assert.equal(
    mapApiErrorToView("This verification link is invalid.").view,
    "invalid"
  );
  assert.equal(
    mapApiErrorToView("This wallet is already linked to another ManGo profile.").view,
    "error"
  );
  const network = mapApiErrorToView(
    "Could not reach the wallet API. Possible network or CORS problem."
  );
  assert.equal(network.view, "error");
  assert.equal(network.message, WALLET_COPY.network);
  assert.notEqual(network.view, "expired");
  const reach = mapApiErrorToView(WALLET_REACHABILITY_ERROR);
  assert.equal(reach.view, "error");
  assert.equal(reach.message, WALLET_COPY.network);
  const server = mapApiErrorToView("Verification failed.");
  assert.equal(server.view, "error");
  assert.equal(server.message, WALLET_COPY.temporary);
  assert.notEqual(server.view, "expired");
  const fiveHundred = mapApiErrorToView(WALLET_TEMPORARY_ERROR);
  assert.equal(fiveHundred.view, "error");
  assert.notEqual(fiveHundred.view, "expired");
});

runTest("success / expired copy", () => {
  assert.ok(WALLET_COPY.success.body.includes("Wallet verified") === false);
  assert.ok(WALLET_COPY.success.title.includes("Wallet verified"));
  assert.ok(WALLET_COPY.expired.body.includes("expired"));
  assert.ok(WALLET_COPY.used.body.includes("already been used"));
  assert.ok(WALLET_COPY.invalid.body.includes("invalid"));
  assert.ok(WALLET_COPY.network.includes("couldn't reach ManGo verification"));
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
  assert.ok(WALLET_COPY.discovering.body.includes("Looking for your wallet"));
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
  assert.ok(walletsSrc.includes('addLegacy("legacy:phantom", "Phantom"'));
  assert.ok(walletsSrc.includes('"legacy:solflare"'));
  assert.ok(walletsSrc.includes('"Solflare"'));
  assert.ok(walletsSrc.includes('addLegacy("legacy:backpack", "Backpack"'));
  assert.equal(/jupiter/i.test(walletsSrc), false);
  assert.ok(walletsSrc.includes("solana:signMessage"));
  assert.equal(/signTransaction/.test(walletsSrc), true);
  assert.ok(walletsSrc.includes("Never signTransaction / sendTransaction"));
  assert.ok(walletsSrc.includes(`detail: { register }`));
  assert.equal(walletsSrc.includes("new Event(WALLET_STANDARD_READY)"), false);
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
      discoveryPending: true,
    }),
    "discovering"
  );
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
  const token = SAMPLE_TOKEN;
  const pageUrl = buildWalletConnectPageUrl(token);
  const browseTarget = buildWalletConnectBrowseTargetUrl(token);
  assert.equal(
    pageUrl,
    `${WALLET_CONNECT_ORIGIN}/wallet-connect?t=${encodeURIComponent(token)}`
  );
  assert.equal(
    browseTarget,
    `${WALLET_CONNECT_ORIGIN}/wallet-connect/${encodeURIComponent(token)}`
  );
  assert.equal(new URL(pageUrl).searchParams.get("t"), token);
  assert.equal(parseWalletConnectPageLocation(browseTarget), token);
  for (const wallet of OFFICIAL_BROWSE_WALLETS) {
    const href = buildOfficialBrowseLink(wallet, token);
    const encodedTarget = href.split("/browse/")[1].split("?ref=")[0];
    assert.equal(decodeURIComponent(encodedTarget), browseTarget);
    assert.notEqual(decodeURIComponent(encodedTarget), pageUrl);
  }
});

runTest("dApp URL is encoded exactly once in browse links", () => {
  const token = SAMPLE_TOKEN;
  const dappUrl = buildWalletConnectBrowseTargetUrl(token);
  const href = buildOfficialBrowseLink("backpack", token);
  const encodedOnce = encodeURIComponent(dappUrl);
  const encodedTwice = encodeURIComponent(encodedOnce);
  assert.equal(href.includes(encodedOnce), true);
  assert.equal(href.includes(encodedTwice), false);
  assert.equal(dappUrl.includes("?"), false);
  assert.equal(dappUrl.includes("t="), false);
});

runTest("mobile open links never add a uid", () => {
  const token = SAMPLE_TOKEN;
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
    "discovering"
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
  const token = SAMPLE_TOKEN;
  const href = buildOfficialBrowseLink("backpack", token);
  const browseTarget = buildWalletConnectBrowseTargetUrl(token);
  assert.equal(
    href,
    `https://backpack.app/ul/v1/browse/${encodeURIComponent(browseTarget)}?ref=${encodeURIComponent(WALLET_CONNECT_REF)}`
  );
});

runTest("Phantom official browse deep link", () => {
  const token = SAMPLE_TOKEN;
  const href = buildOfficialBrowseLink("phantom", token);
  const browseTarget = buildWalletConnectBrowseTargetUrl(token);
  assert.equal(
    href,
    `https://phantom.app/ul/browse/${encodeURIComponent(browseTarget)}?ref=${encodeURIComponent(WALLET_CONNECT_REF)}`
  );
});

runTest("Solflare official browse deep link", () => {
  const token = SAMPLE_TOKEN;
  const href = buildOfficialBrowseLink("solflare", token);
  const browseTarget = buildWalletConnectBrowseTargetUrl(token);
  assert.equal(
    href,
    `https://solflare.com/ul/v1/browse/${encodeURIComponent(browseTarget)}?ref=${encodeURIComponent(WALLET_CONNECT_REF)}`
  );
});

function browseTargetUrlOnce(href) {
  const encoded = href.split("/browse/")[1].split("?ref=")[0];
  return decodeURIComponent(encoded);
}

function naiveWholeHrefOpenedDappUrl(href) {
  const decoded = decodeURIComponent(href);
  return decoded.split("/browse/")[1];
}

function tokenFromOpenedPage(openedUrl) {
  return parseWalletConnectPageLocation(openedUrl);
}

function tokenFromBrowseHref(href) {
  return tokenFromOpenedPage(browseTargetUrlOnce(href));
}

function tokenFromNaiveBackpackOpen(href) {
  return tokenFromOpenedPage(naiveWholeHrefOpenedDappUrl(href));
}

function legacyQueryBrowseLink(wallet, token) {
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

runTest("source token length is 43 and base64url", () => {
  assert.equal(SAMPLE_TOKEN.length, 43);
  assert.equal(isManGoLinkToken(SAMPLE_TOKEN), true);
  assert.equal(/[A-Za-z]/.test(SAMPLE_TOKEN), true);
  assert.equal(/[0-9]/.test(SAMPLE_TOKEN), true);
  assert.equal(SAMPLE_TOKEN.includes("-"), true);
  assert.equal(SAMPLE_TOKEN.includes("_"), true);
});

runTest("raw token survives URLSearchParams and challenge JSON", () => {
  const token = SAMPLE_TOKEN;
  assert.equal(parseWalletConnectToken(`?t=${token}`), token);
  assert.equal(parseWalletConnectToken(`?t=${encodeURIComponent(token)}`), token);
  const search = new URL(buildWalletConnectPageUrl(token)).search;
  assert.equal(parseWalletConnectToken(search), token);
  const body = JSON.stringify({ token: parseWalletConnectToken(search), wallet: "W" });
  assert.equal(JSON.parse(body).token, token);
  assert.equal(JSON.parse(body).token.length, 43);
});

runTest("no trim mutation on wallet-connect token parse", () => {
  assert.equal(parseWalletConnectToken("?t=  padded  "), "  padded  ");
  const parseSrc = readSrc("src/walletConnectState.ts");
  const fnStart = parseSrc.indexOf("export function parseWalletConnectToken");
  const fnEnd = parseSrc.indexOf("export function parseWalletConnectPageLocation");
  const parseFn = parseSrc.slice(fnStart, fnEnd);
  assert.equal(parseFn.includes(".trim()"), false);
});

runTest("legacy query browse naive decode mutates token to length 69", () => {
  const token = SAMPLE_TOKEN;
  const href = legacyQueryBrowseLink("backpack", token);
  const opened = naiveWholeHrefOpenedDappUrl(href);
  const mutated = new URL(opened).searchParams.get("t");
  assert.equal(mutated, `${token}?ref=${WALLET_CONNECT_REF}`);
  assert.equal(mutated.length, 69);
  assert.equal(isManGoLinkToken(mutated), false);
});

runTest("Backpack realistic browse roundtrip keeps exact 43-char token", () => {
  const token = SAMPLE_TOKEN;
  const href = buildOfficialBrowseLink("backpack", token);
  const official = tokenFromBrowseHref(href);
  const naive = tokenFromNaiveBackpackOpen(href);
  assert.equal(official, token);
  assert.equal(naive, token);
  assert.equal(official.length, 43);
  assert.equal(MANGO_LINK_TOKEN_PATTERN.test(official), true);
});

runTest("Phantom realistic browse roundtrip keeps exact 43-char token", () => {
  const token = SAMPLE_TOKEN;
  const href = buildOfficialBrowseLink("phantom", token);
  assert.equal(tokenFromBrowseHref(href), token);
  assert.equal(tokenFromNaiveBackpackOpen(href), token);
  assert.equal(tokenFromBrowseHref(href).length, 43);
  assert.equal(MANGO_LINK_TOKEN_PATTERN.test(tokenFromBrowseHref(href)), true);
});

runTest("Solflare realistic browse roundtrip keeps exact 43-char token", () => {
  const token = SAMPLE_TOKEN;
  const href = buildOfficialBrowseLink("solflare", token);
  assert.equal(tokenFromBrowseHref(href), token);
  assert.equal(tokenFromNaiveBackpackOpen(href), token);
  assert.equal(tokenFromBrowseHref(href).length, 43);
  assert.equal(MANGO_LINK_TOKEN_PATTERN.test(tokenFromBrowseHref(href)), true);
});

runTest("underscore and dash tokens survive parse and deeplink", () => {
  const token = SAMPLE_TOKEN;
  assert.equal(token.includes("_"), true);
  assert.equal(token.includes("-"), true);
  assert.equal(parseWalletConnectToken(`?t=${token}`), token);
  assert.equal(
    parseWalletConnectToken("", `/wallet-connect/${encodeURIComponent(token)}`),
    token
  );
  for (const wallet of OFFICIAL_BROWSE_WALLETS) {
    assert.equal(tokenFromBrowseHref(buildOfficialBrowseLink(wallet, token)), token);
    assert.equal(tokenFromNaiveBackpackOpen(buildOfficialBrowseLink(wallet, token)), token);
  }
});

runTest("browse target is decoded once, not twice", () => {
  const token = SAMPLE_TOKEN;
  const href = buildOfficialBrowseLink("phantom", token);
  const encoded = href.split("/browse/")[1].split("?ref=")[0];
  const once = decodeURIComponent(encoded);
  assert.equal(once, buildWalletConnectBrowseTargetUrl(token));
  assert.equal(once.startsWith("https://mangomeme.fun/wallet-connect/"), true);
  assert.equal(once.includes("?"), false);
  assert.equal(tokenFromBrowseHref(href), token);
  assert.equal(once.includes("%"), false);
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

runTest("network and 500 are never classified as expired", () => {
  assert.equal(mapApiErrorToView(NETWORK_CORS_ERROR).view, "error");
  assert.equal(mapApiErrorToView(WALLET_REACHABILITY_ERROR).view, "error");
  assert.equal(
    interpretWalletVerifyResponse(0, { ok: false, error: "This verification link has expired." })
      .error,
    WALLET_REACHABILITY_ERROR
  );
  assert.equal(
    interpretWalletVerifyResponse(500, {
      ok: false,
      error: "This verification link has expired.",
    }).error,
    WALLET_TEMPORARY_ERROR
  );
  assert.equal(
    interpretWalletChallengeResponse(0, {
      ok: false,
      error: "This verification link has expired.",
    }).error,
    WALLET_REACHABILITY_ERROR
  );
  assert.equal(
    interpretWalletChallengeResponse(
      500,
      { ok: false, error: "This verification link has expired." }
    ).error,
    WALLET_TEMPORARY_ERROR
  );
  assert.equal(
    mapApiErrorToView(
      interpretWalletChallengeResponse(500, {
        ok: false,
        error: "This verification link has expired.",
      }).error
    ).view,
    "error"
  );
});

runTest("valid challenge response stays on the connect flow", () => {
  const result = interpretWalletChallengeResponse(200, {
    ok: true,
    challengeId: "cid",
    message: "ManGo Wallet Verification",
    expiresAt: 1,
  });
  assert.equal(result.ok, true);
  assert.equal(result.challengeId, "cid");
  assert.equal(mapApiErrorToView(undefined).view, "error");
  assert.notEqual(mapApiErrorToView(undefined).view, "expired");
});

function mockPublicKey(address = "7AbcDEFG9XYZMango") {
  return {
    toBytes: () => new Uint8Array(32),
    toBase58: () => address,
  };
}

function mockLegacyProvider(flags = {}) {
  const publicKey = mockPublicKey();
  return {
    ...flags,
    publicKey,
    async connect() {
      return { publicKey };
    },
    async signMessage(message) {
      return { signature: new Uint8Array(message.length ? 64 : 64) };
    },
  };
}

function mockStandardWallet(name) {
  const publicKey = new Uint8Array(32);
  const account = { address: "7AbcDEFG9XYZMango", publicKey };
  return {
    name,
    accounts: [account],
    chains: ["solana:mainnet"],
    features: {
      "standard:connect": {
        async connect() {
          return { accounts: [account] };
        },
      },
      "solana:signMessage": {
        async signMessage() {
          return [{ signature: new Uint8Array(64) }];
        },
      },
    },
  };
}

function dispatchRegister(target, wallet) {
  target.dispatchEvent(
    new CustomEvent(WALLET_STANDARD_REGISTER, {
      detail: ({ register }) => register(wallet),
    })
  );
}

runTest("initial Wallet Standard registry is empty", () => {
  const target = new EventTarget();
  const registry = createWalletRegistry({ target });
  assert.deepEqual(registry.list(), []);
  registry.destroy();
});

runTest("Backpack can register after page initialization", () => {
  const target = new EventTarget();
  let changes = 0;
  const registry = createWalletRegistry({
    target,
    onChange() {
      changes += 1;
    },
  });
  assert.equal(registry.list().length, 0);
  dispatchRegister(target, mockStandardWallet("Backpack"));
  const listed = registry.list();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].name, "Backpack");
  assert.equal(listed[0].kind, "standard");
  assert.ok(changes >= 1);
  registry.destroy();
});

runTest("late Wallet Standard registration updates discovery view automatically", () => {
  assert.equal(
    resolveDiscoveryView({
      hasToken: true,
      isMobile: true,
      walletCount: 0,
      currentView: "discovering",
      discoveryPending: true,
    }),
    "discovering"
  );
  assert.equal(
    resolveDiscoveryView({
      hasToken: true,
      isMobile: true,
      walletCount: 1,
      currentView: "discovering",
      discoveryPending: true,
    }),
    "idle"
  );
  assert.equal(
    resolveDiscoveryView({
      hasToken: true,
      isMobile: true,
      walletCount: 1,
      currentView: "no_wallets_mobile",
    }),
    "idle"
  );
  const connectSrc = readSrc("src/walletConnect.ts");
  assert.ok(connectSrc.includes("onChange()"));
  assert.ok(connectSrc.includes("syncDiscovery()"));
  assert.ok(connectSrc.includes("startDiscoveryWindow()"));
  assert.equal(typeof DISCOVERY_GRACE_MS, "number");
  assert.ok(DISCOVERY_GRACE_MS >= 1000);
});

runTest("late registered Backpack can connect and signMessage", () => {
  const target = new EventTarget();
  const registry = createWalletRegistry({ target });
  dispatchRegister(target, mockStandardWallet("Backpack"));
  const wallet = registry.list()[0];
  return connectDiscoveredWallet(wallet).then((connected) => {
    assert.equal(connected.name, "Backpack");
    assert.equal(connected.kind, "standard");
    return signMessageWithWallet(connected, "verify mango").then((signature) => {
      assert.equal(signature instanceof Uint8Array, true);
      assert.equal(signature.length, 64);
      registry.destroy();
    });
  });
});

runTest("legacy Backpack provider fallback requires connect and signMessage", () => {
  assert.equal(isUsableLegacyProvider({ isBackpack: true }), false);
  assert.equal(
    isUsableLegacyProvider({ isBackpack: true, connect() {}, signMessage() {} }),
    true
  );
  const target = Object.assign(new EventTarget(), {
    backpack: mockLegacyProvider({ isBackpack: true }),
  });
  const registry = createWalletRegistry({ target });
  const listed = registry.list();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].name, "Backpack");
  assert.equal(listed[0].kind, "legacy");
  assert.equal(listed[0].id, "legacy:backpack");
  registry.destroy();
});

runTest("window.solana.isBackpack is accepted as Backpack, generic solana is not", () => {
  const backpackTarget = Object.assign(new EventTarget(), {
    solana: mockLegacyProvider({ isBackpack: true }),
  });
  const backpackRegistry = createWalletRegistry({ target: backpackTarget });
  assert.equal(backpackRegistry.list()[0]?.name, "Backpack");
  backpackRegistry.destroy();

  const genericTarget = Object.assign(new EventTarget(), {
    solana: mockLegacyProvider(),
  });
  const genericRegistry = createWalletRegistry({ target: genericTarget });
  assert.equal(genericRegistry.list().length, 0);
  genericRegistry.destroy();
});

runTest("duplicate Backpack registration is deduped", () => {
  const target = new EventTarget();
  const registry = createWalletRegistry({ target });
  dispatchRegister(target, mockStandardWallet("Backpack"));
  dispatchRegister(target, mockStandardWallet("Backpack"));
  assert.equal(registry.list().length, 1);
  Object.assign(target, { backpack: mockLegacyProvider({ isBackpack: true }) });
  const listed = registry.list();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].kind, "standard");
  registry.destroy();
});

runTest("wallet that loaded before the app registers via app-ready detail", () => {
  const target = new EventTarget();
  const wallet = mockStandardWallet("Backpack");
  target.addEventListener(WALLET_STANDARD_READY, (event) => {
    const api = event.detail;
    if (api && typeof api.register === "function") {
      api.register(wallet);
    }
  });
  const registry = createWalletRegistry({ target });
  assert.equal(registry.list()[0]?.name, "Backpack");
  registry.destroy();
});

runTest("Phantom and Solflare legacy discovery still works", () => {
  const target = Object.assign(new EventTarget(), {
    phantom: { solana: mockLegacyProvider({ isPhantom: true }) },
    solflare: mockLegacyProvider({ isSolflare: true }),
  });
  const registry = createWalletRegistry({ target });
  const names = registry.list().map((wallet) => wallet.name).sort();
  assert.deepEqual(names, ["Phantom", "Solflare"]);
  registry.destroy();
});

runTest("desktop Backpack via Wallet Standard still works", () => {
  const target = new EventTarget();
  const registry = createWalletRegistry({ target });
  dispatchRegister(target, mockStandardWallet("Backpack"));
  assert.equal(
    resolveDiscoveryView({
      hasToken: true,
      isMobile: false,
      walletCount: registry.list().length,
      currentView: "idle",
    }),
    "idle"
  );
  registry.destroy();
});

runTest("mobile deeplink fallback remains after discovery settles with no wallet", () => {
  assert.equal(
    resolveDiscoveryView({
      hasToken: true,
      isMobile: true,
      walletCount: 0,
      currentView: "discovering",
      discoveryPending: false,
    }),
    "no_wallets_mobile"
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

runTest("debug discovery summary never includes secrets", () => {
  const summary = describeDiscoveredWallets([
    { id: "standard:Backpack", name: "Backpack", kind: "standard" },
  ]);
  assert.deepEqual(summary, {
    count: 1,
    names: ["Backpack"],
    kinds: ["standard"],
  });
  const encoded = JSON.stringify(summary);
  assert.equal(encoded.includes("t="), false);
  assert.equal(/uid/i.test(encoded), false);
  assert.equal(/challenge/i.test(encoded), false);
  assert.equal(/signature/i.test(encoded), false);
  const connectSrc = readSrc("src/walletConnect.ts");
  assert.ok(connectSrc.includes("import.meta.env.DEV"));
  assert.ok(connectSrc.includes("describeDiscoveredWallets"));
  assert.equal(/console\.log/.test(connectSrc), false);
});

runTest("incomplete injected provider is not faked as a wallet", () => {
  const target = Object.assign(new EventTarget(), {
    backpack: { isBackpack: true, connect() {} },
    xnft: { connect() {}, signMessage() {} },
  });
  const registry = createWalletRegistry({ target });
  assert.equal(registry.list().length, 0);
  registry.destroy();
});

runTest("frontend verify success requires HTTP 2xx and ok true only", () => {
  assert.deepEqual(interpretWalletVerifyResponse(200, { ok: true }), { ok: true });
  assert.equal(interpretWalletVerifyResponse(200, { ok: false, error: "nope" }).ok, false);
  assert.equal(interpretWalletVerifyResponse(400, { ok: false, error: "bad" }).ok, false);
  assert.equal(interpretWalletVerifyResponse(500, { ok: true }).ok, false);
  assert.equal(interpretWalletVerifyResponse(500, { ok: true }).error, WALLET_TEMPORARY_ERROR);
  assert.equal(interpretWalletVerifyResponse(0, { ok: false }).ok, false);
  assert.equal(interpretWalletVerifyResponse(0, { ok: false }).error, NETWORK_CORS_ERROR);
  assert.equal(
    interpretWalletVerifyResponse(200, {
      ok: true,
      challengeId: "not-a-verify",
      message: "ManGo Wallet Verification",
    }).ok,
    false
  );
});

runTest("wallet-connect page does not force success after signing", () => {
  const connectSrc = readSrc("src/walletConnect.ts");
  const verifyStart = connectSrc.indexOf('verifyBtn?.addEventListener("click"');
  const verifyBlock = connectSrc.slice(verifyStart);
  assert.ok(verifyBlock.includes("requestWalletVerify"));
  assert.ok(verifyBlock.includes("if (!verified.ok)"));
  const failReturn = verifyBlock.indexOf("if (!verified.ok)");
  const successAssign = verifyBlock.indexOf('view: "success"');
  assert.ok(failReturn >= 0 && successAssign > failReturn);
  assert.ok(verifyBlock.includes("signMessageWithWallet"));
  const signCatch = verifyBlock.indexOf("Signature cancelled");
  assert.ok(signCatch >= 0 && signCatch < successAssign);
});

runTest("token after page parse is length 43 and base64url", () => {
  const token = SAMPLE_TOKEN;
  const queryModel = initialWalletConnectModel(`?t=${token}`);
  const pathModel = initialWalletConnectModel("", `/wallet-connect/${token}`);
  const browseOpened = browseTargetUrlOnce(buildOfficialBrowseLink("backpack", token));
  const parsed = parseWalletConnectPageLocation(browseOpened);
  assert.equal(queryModel.token, token);
  assert.equal(pathModel.token, token);
  assert.equal(parsed, token);
  assert.equal(parsed.length, 43);
  assert.equal(MANGO_LINK_TOKEN_PATTERN.test(parsed), true);
});

runTest("invalid length is rejected before API", async () => {
  const shortToken = SAMPLE_TOKEN.slice(0, 42);
  const longToken = `${SAMPLE_TOKEN}x`;
  assert.equal(isManGoLinkToken(shortToken), false);
  assert.equal(isManGoLinkToken(longToken), false);
  assert.equal(initialWalletConnectModel(`?t=${shortToken}`).view, "invalid");
  assert.equal(initialWalletConnectModel(`?t=${longToken}`).view, "invalid");
  assert.ok(WALLET_COPY.invalid.body.includes(INVALID_LINK_MESSAGE));
  let called = 0;
  const orig = globalThis.fetch;
  globalThis.fetch = async () => {
    called += 1;
    return new Response("{}", { status: 200 });
  };
  try {
    const short = await requestWalletChallenge("https://api.mangomeme.fun", shortToken, "W");
    const long = await requestWalletChallenge("https://api.mangomeme.fun", longToken, "W");
    assert.equal(short.ok, false);
    assert.equal(short.error, INVALID_LINK_MESSAGE);
    assert.equal(long.ok, false);
    assert.equal(long.error, INVALID_LINK_MESSAGE);
    assert.equal(called, 0);
  } finally {
    globalThis.fetch = orig;
  }
});

runTest("invalid charset is rejected before API", async () => {
  const bad = `${SAMPLE_TOKEN.slice(0, 42)}+`;
  assert.equal(bad.length, 43);
  assert.equal(isManGoLinkToken(bad), false);
  assert.equal(initialWalletConnectModel(`?t=${encodeURIComponent(bad)}`).view, "invalid");
  let called = 0;
  const orig = globalThis.fetch;
  globalThis.fetch = async () => {
    called += 1;
    return new Response("{}", { status: 200 });
  };
  try {
    const result = await requestWalletChallenge("https://api.mangomeme.fun", bad, "W");
    assert.equal(result.ok, false);
    assert.equal(result.error, INVALID_LINK_MESSAGE);
    assert.equal(called, 0);
  } finally {
    globalThis.fetch = orig;
  }
});

runTest("challenge request posts the exact same 43-char token", async () => {
  const token = SAMPLE_TOKEN;
  const parsed = parseWalletConnectPageLocation(buildWalletConnectBrowseTargetUrl(token));
  let posted;
  const orig = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    posted = JSON.parse(init.body);
    return new Response(
      JSON.stringify({ ok: true, challengeId: "cid", message: "ManGo Wallet Verification" }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };
  try {
    const result = await requestWalletChallenge("https://api.mangomeme.fun", parsed, "WalletAddr");
    assert.equal(result.ok, true);
    assert.equal(posted.token, token);
    assert.equal(posted.token.length, 43);
    assert.equal(posted.token, parsed);
  } finally {
    globalThis.fetch = orig;
  }
});

runTest("no signMessage attempt before valid challenge", () => {
  const connectSrc = readSrc("src/walletConnect.ts");
  const verifyStart = connectSrc.indexOf('verifyBtn?.addEventListener("click"');
  const verifyBlock = connectSrc.slice(verifyStart);
  const guardAt = verifyBlock.indexOf("isManGoLinkToken(token)");
  const challengeAt = verifyBlock.indexOf("requestWalletChallenge");
  const challengeFailAt = verifyBlock.indexOf("if (!challenge.ok");
  const signAt = verifyBlock.indexOf("signMessageWithWallet");
  assert.ok(guardAt >= 0 && guardAt < challengeAt);
  assert.ok(challengeAt >= 0 && challengeAt < challengeFailAt);
  assert.ok(challengeFailAt >= 0 && challengeFailAt < signAt);
  assert.ok(verifyBlock.includes('view: "invalid"'));
});

runTest("signMessage does occur after valid challenge", () => {
  const connectSrc = readSrc("src/walletConnect.ts");
  const verifyStart = connectSrc.indexOf('verifyBtn?.addEventListener("click"');
  const verifyBlock = connectSrc.slice(verifyStart);
  const challengeAt = verifyBlock.indexOf("requestWalletChallenge");
  const challengeOkGate = verifyBlock.indexOf("if (!challenge.ok || !challenge.challengeId || !challenge.message)");
  const signAt = verifyBlock.indexOf("signMessageWithWallet");
  const returnAfterFail = verifyBlock.indexOf("return;", challengeOkGate);
  assert.ok(challengeAt < challengeOkGate);
  assert.ok(returnAfterFail >= 0 && returnAfterFail < signAt);
  assert.ok(signAt > challengeOkGate);
});

runTest("no raw token in production logs", () => {
  const connectSrc = readSrc("src/walletConnect.ts");
  const apiSrc = readSrc("src/walletConnectApi.ts");
  const stateSrc = readSrc("src/walletConnectState.ts");
  const linksSrc = readSrc("src/mobileWalletLinks.ts");
  assert.equal(/console\.log/.test(connectSrc), false);
  assert.equal(/console\.log/.test(apiSrc), false);
  assert.equal(/console\.log/.test(stateSrc), false);
  assert.equal(/console\.log/.test(linksSrc), false);
  assert.ok(connectSrc.includes("import.meta.env.DEV"));
  assert.ok(connectSrc.includes("originalLength"));
  assert.ok(connectSrc.includes("parsedLength"));
  assert.ok(connectSrc.includes("charsetValid"));
  const metaStart = connectSrc.indexOf('console.info("[ManGo wallet] token meta"');
  assert.ok(metaStart >= 0);
  const metaWindow = connectSrc.slice(Math.max(0, metaStart - 160), metaStart + 280);
  assert.ok(metaWindow.includes("if (import.meta.env.DEV)"));
  assert.ok(metaWindow.includes("originalLength"));
  assert.ok(metaWindow.includes("parsedLength"));
  assert.ok(metaWindow.includes("charsetValid"));
  assert.equal(/token:\s/.test(metaWindow.slice(160)), false);
  assert.equal(/console\.info\([^)]*token/.test(apiSrc), false);
});

runTest("mangled t=token?ref= recovers the original 43-char token", () => {
  const token = SAMPLE_TOKEN;
  const mangled = `${token}?ref=${WALLET_CONNECT_REF}`;
  assert.equal(mangled.length, 69);
  const resolved = resolveWalletConnectToken(`?t=${mangled}`);
  assert.equal(resolved.presentedLength, 69);
  assert.equal(resolved.token, token);
  assert.equal(resolved.valid, true);
  assert.equal(initialWalletConnectModel(`?t=${mangled}`).token, token);
  assert.equal(canonicalizeWalletConnectToken(mangled), token);
  const arbitrary = `abc?ref=${WALLET_CONNECT_REF}`;
  assert.equal(canonicalizeWalletConnectToken(arbitrary), arbitrary);
  assert.equal(isManGoLinkToken(canonicalizeWalletConnectToken(arbitrary)), false);
  assert.equal(initialWalletConnectModel(`?t=${arbitrary}`).view, "invalid");
  assert.equal(initialWalletConnectModel(`?t=${arbitrary}`).token, null);
});

runTest("vercel rewrites path-form wallet-connect URLs", () => {
  const vercel = JSON.parse(readSrc("vercel.json"));
  assert.equal(
    vercel.rewrites.some(
      (rule) => rule.source === "/wallet-connect/:token" && rule.destination === "/wallet-connect.html"
    ),
    true
  );
});

await Promise.all(pending);
console.log("wallet-connect tests passed");
