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
  NETWORK_CORS_ERROR,
  getWalletApiBaseUrlFromEnv,
  interpretWalletVerifyResponse,
  resolveWalletApiBaseUrl,
} from "../src/walletConnectApi.ts";
import {
  DISCOVERY_GRACE_MS,
  WALLET_COPY,
  initialWalletConnectModel,
  mapApiErrorToView,
  nextViewAfterRetryDiscovery,
  parseWalletConnectToken,
  resolveDiscoveryView,
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

await Promise.all(pending);
console.log("wallet-connect tests passed");
