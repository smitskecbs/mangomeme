/**
 * Frontend wallet-connect route helpers.
 * Run with: node tests/wallet-connect.test.js
 */

import assert from "node:assert/strict";
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
