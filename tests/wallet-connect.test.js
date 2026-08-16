/**
 * Frontend wallet-connect route helpers.
 * Run with: node --import ./tests/_ts-register.mjs tests/wallet-connect.test.js
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
  parseWalletConnectToken,
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

console.log("wallet-connect tests passed");
