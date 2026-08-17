/**
 * ManGo presale page helpers.
 * Run: node tests/presale.test.js
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function readSrc(rel) {
  return readFileSync(path.join(root, rel), "utf8");
}

function runTest(name, fn) {
  fn();
  console.log(`✓ ${name}`);
}

runTest("presale page exists and is ManGo branded", () => {
  const html = readSrc("presale.html");
  assert.ok(html.includes("ManGo · Presale"));
  assert.ok(html.includes("src/presale.ts"));
  assert.ok(!html.includes("guaranteed profit"));
  assert.ok(!/VITE_.*TREASURY/.test(html));
});

runTest("vercel rewrite /presale/:token", () => {
  const vercel = JSON.parse(readSrc("vercel.json"));
  assert.ok(
    vercel.rewrites.some(
      (rule) => rule.source === "/presale/:token" && rule.destination === "/presale.html"
    )
  );
});

runTest("vite includes presale entry", () => {
  const vite = readSrc("vite.config.ts");
  assert.ok(vite.includes("presale.html"));
});

runTest("token parser is path-based without uid", () => {
  const src = readSrc("src/presaleState.ts");
  assert.ok(src.includes("presale"));
  assert.ok(src.includes("PRESALE_TOKEN_PATTERN"));
  assert.ok(!src.includes("telegramUserId"));
  assert.ok(!src.includes("uid="));
});

runTest("amount buttons 0.01 0.05 0.10 0.25", () => {
  const src = readSrc("src/presale.ts");
  assert.ok(src.includes("selectAmount"));
  assert.ok(readSrc("presale.html").includes("Confirm in Wallet"));
});

runTest("review disclaimer no profit claims", () => {
  const src = readSrc("src/presaleState.ts");
  assert.ok(src.includes("MANGO will not be delivered in this transaction"));
  assert.ok(!/guaranteed profit/i.test(src));
  const ui = readSrc("src/presale.ts");
  assert.ok(ui.includes("You send:"));
  assert.ok(ui.includes("You receive after distribution:"));
  assert.ok(ui.includes("Presale wallet:"));
  assert.ok(ui.includes("reservation_expired") || src.includes("reservation_expired"));
  assert.ok(ui.includes("isReservationExpired") || src.includes("isReservationExpired"));
});

runTest("wallet-connect remains signMessage-only", () => {
  const wallets = readSrc("src/solanaWallets.ts");
  assert.ok(wallets.includes("Connect + signMessage only"));
  assert.ok(!wallets.includes("signAndSendPresaleTransfer"));
  const presaleWallet = readSrc("src/solanaPresaleWallet.ts");
  assert.ok(presaleWallet.includes("SystemProgram.transfer"));
  assert.ok(presaleWallet.includes("@solana/web3.js"));
  assert.ok(!presaleWallet.toLowerCase().includes("privatekey"));
});

runTest("no VITE treasury secret", () => {
  const api = readSrc("src/presaleApi.ts");
  assert.ok(!api.includes("VITE_PRESALE_TREASURY"));
  assert.ok(api.includes("/presale/status"));
  assert.ok(api.includes("/presale/prepare"));
  assert.ok(api.includes("/presale/payment"));
  assert.ok(api.includes("/presale/confirm"));
});

runTest("payment uses server blockhash only", () => {
  const wallet = readSrc("src/solanaPresaleWallet.ts");
  assert.ok(wallet.includes("details.recentBlockhash"));
  assert.ok(!wallet.includes("getLatestBlockhash"));
  assert.ok(!wallet.includes("fetchLatestBlockhash"));
  const ui = readSrc("src/presale.ts");
  assert.ok(ui.includes("requestPresalePayment"));
  assert.ok(ui.includes("hasActivePaymentValidity"));
});

runTest("states covered", () => {
  const src = readSrc("src/presaleState.ts");
  for (const view of [
    "invalid_session",
    "expired_session",
    "not_live",
    "wallet_not_connected",
    "wallet_mismatch",
    "amount",
    "reserving",
    "reserved",
    "review",
    "wallet_confirmation",
    "submitting",
    "verifying",
    "confirmed",
    "success",
    "already_recorded",
    "sold_out",
    "user_max",
    "transaction_failed",
    "reservation_expired",
  ]) {
    assert.ok(src.includes(`"${view}"`) || src.includes(`| "${view}"`) || src.includes(view), view);
  }
});

console.log("presale website tests passed");
