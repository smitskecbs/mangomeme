/**
 * ManGo admin delivery page helpers.
 * Run: node tests/admin-delivery.test.js
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

runTest("admin delivery page exists and is not in site nav", () => {
  const html = readSrc("admin-delivery.html");
  assert.ok(html.includes("ManGo · Admin Delivery"));
  assert.ok(html.includes("src/adminDelivery.ts"));
  assert.ok(html.includes("Confirm in Wallet"));
  assert.ok(html.includes("noindex"));
  assert.ok(!html.includes('href="/mango-labs"'));
  const index = readSrc("index.html");
  assert.ok(!index.includes("admin-delivery"));
});

runTest("vercel rewrite /admin-delivery/:token", () => {
  const vercel = JSON.parse(readSrc("vercel.json"));
  assert.ok(
    vercel.rewrites.some(
      (rule) =>
        rule.source === "/admin-delivery/:token" &&
        rule.destination === "/admin-delivery.html"
    )
  );
});

runTest("vite includes admin delivery entry", () => {
  const vite = readSrc("vite.config.ts");
  assert.ok(vite.includes("admin-delivery.html"));
});

runTest("token parser is path-based without uid", () => {
  const src = readSrc("src/adminDeliveryState.ts");
  assert.ok(src.includes("DELIVERY_TOKEN_PATTERN"));
  assert.ok(src.includes("admin-delivery"));
  assert.ok(!src.includes("telegramUserId"));
  assert.ok(!src.includes("uid="));
});

runTest("review copy shows admin amount and destination", () => {
  const src = readSrc("src/adminDeliveryState.ts");
  assert.ok(src.includes("Type:"));
  assert.ok(src.includes("distribution wallet"));
  assert.ok(src.includes("amountDisplay"));
});

runTest("client never chooses mint or destination as source of truth", () => {
  const api = readSrc("src/adminDeliveryApi.ts");
  assert.ok(api.includes("/delivery/status"));
  assert.ok(api.includes("/delivery/confirm"));
  assert.ok(api.includes("Never sends telegramUserId"));
  assert.ok(!api.includes("telegramUserId:"));
  const page = readSrc("src/adminDelivery.ts");
  assert.ok(page.includes("signAndSendDeliveryTransfer"));
  assert.ok(page.includes("payment.mint"));
  assert.ok(page.includes("payment.to"));
  const wallet = readSrc("src/solanaDeliveryWallet.ts");
  assert.ok(wallet.includes("ManGo never signs"));
  assert.ok(!wallet.toLowerCase().includes("secretkey"));
  assert.ok(!wallet.toLowerCase().includes("privatekey"));
});

runTest("no private keys in delivery frontend", () => {
  for (const rel of [
    "src/adminDelivery.ts",
    "src/adminDeliveryApi.ts",
    "src/adminDeliveryState.ts",
    "src/solanaDeliveryWallet.ts",
    "admin-delivery.html",
  ]) {
    const src = readSrc(rel).toLowerCase();
    assert.ok(!src.includes("privatekey"));
    assert.ok(!src.includes("seed phrase"));
  }
});

console.log("admin-delivery tests passed");
