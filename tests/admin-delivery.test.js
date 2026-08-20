/**
 * ManGo admin delivery page helpers.
 * Run: node tests/admin-delivery.test.js
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PublicKey } from "@solana/web3.js";
import {
  isUnsafeDeliveryLogText,
  logDeliveryDebug,
  logDeliveryError,
} from "../src/adminDeliveryDebug.js";
import {
  SPL_ASSOCIATED_TOKEN_PROGRAM_ID,
  SPL_MEMO_PROGRAM_ID,
  SPL_TOKEN_PROGRAM_ID,
  SPL_TOKEN_2022_PROGRAM_ID,
  buildDeliveryTransferTransaction,
  describeDeliveryTransfer,
  describeWalletSendApi,
  getAssociatedTokenAddress,
  inspectDeliveryTransaction,
} from "../src/solanaDeliveryTx.js";
import { signAndSendDeliveryTransfer } from "../src/solanaDeliveryWallet.js";
import { submitAdminDelivery } from "../src/adminDeliverySubmit.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const FROM = "memekrM9YqzBQBmHjgne8CHeaPicxwFDxeMo3bkHwMY";
const MINT = "29KN57rM6tV2aWdo1agZcF6ynPXB1dhHdKHNrrAmaNGo";
const TO = "So11111111111111111111111111111111111111112";
const BLOCKHASH = "11111111111111111111111111111111";
const AMOUNT = "1000000000000";
const MEMO = "mango-delivery:abcd1234";

function readSrc(rel) {
  return readFileSync(path.join(root, rel), "utf8");
}

function runTest(name, fn) {
  tests.push({ name, fn });
}

const tests = [];

function details(overrides = {}) {
  return {
    from: FROM,
    to: TO,
    mint: MINT,
    amountBaseUnits: AMOUNT,
    decimals: 9,
    memo: MEMO,
    recentBlockhash: BLOCKHASH,
    ...overrides,
  };
}

function captureLogs(fn) {
  const info = [];
  const errors = [];
  const origInfo = console.info;
  const origError = console.error;
  console.info = (...args) => {
    info.push(args.map(String).join(" "));
  };
  console.error = (...args) => {
    errors.push(args.map(String).join(" "));
  };
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      console.info = origInfo;
      console.error = origError;
    })
    .then((result) => ({ result, logs: [...info, ...errors].join("\n") }));
}

function assertLogsSafe(logs) {
  const text = String(logs || "");
  assert.equal(/helius/i.test(text), false);
  assert.equal(/api[-_]?key/i.test(text), false);
  assert.equal(text.includes("https://"), false);
  assert.equal(text.includes("DELIVERY_RPC_URL"), false);
  assert.equal(text.includes("admin-delivery/"), false);
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
    assert.ok(page.includes("submitAdminDelivery"));
    const wallet = readSrc("src/solanaDeliveryWallet.js");
    assert.ok(wallet.includes("ManGo never signs"));
    assert.ok(!wallet.toLowerCase().includes("secretkey"));
    assert.ok(!wallet.toLowerCase().includes("privatekey"));
  });

runTest("no private keys in delivery frontend", () => {
    for (const rel of [
      "src/adminDelivery.ts",
      "src/adminDeliveryApi.ts",
      "src/adminDeliveryState.ts",
      "src/solanaDeliveryWallet.js",
      "src/solanaDeliveryTx.js",
      "src/adminDeliverySubmit.js",
      "src/adminDeliveryDebug.js",
      "admin-delivery.html",
    ]) {
      const src = readSrc(rel).toLowerCase();
      assert.ok(!src.includes("privatekey"));
      assert.ok(!src.includes("seed phrase"));
    }
  });

runTest("empty catch no longer swallows transaction errors", () => {
    const page = readSrc("src/adminDelivery.ts");
    assert.ok(page.includes("logDeliveryError"));
    assert.equal(/catch\s*\{/.test(page), false);
    const submit = readSrc("src/adminDeliverySubmit.js");
    assert.ok(submit.includes("catch (err)"));
    assert.ok(submit.includes("logDeliveryError"));
    assert.ok(submit.includes("requestConfirm"));
  });

runTest("no client-side getLatestBlockhash or global Buffer instruction data", () => {
    for (const rel of [
      "src/solanaDeliveryWallet.js",
      "src/solanaDeliveryTx.js",
      "src/adminDelivery.ts",
      "src/adminDeliverySubmit.js",
    ]) {
      const src = readSrc(rel);
      assert.equal(src.includes("getLatestBlockhash"), false, rel);
      assert.equal(src.includes("Buffer.from"), false, rel);
      assert.equal(src.includes("Buffer.alloc"), false, rel);
    }
  });

runTest("source ATA is derived for distribution owner and Tokenkeg mint", () => {
    const from = new PublicKey(FROM);
    const mint = new PublicKey(MINT);
    const expected = getAssociatedTokenAddress(mint, from);
    const [independent] = PublicKey.findProgramAddressSync(
      [from.toBuffer(), new PublicKey(SPL_TOKEN_PROGRAM_ID).toBuffer(), mint.toBuffer()],
      new PublicKey(SPL_ASSOCIATED_TOKEN_PROGRAM_ID)
    );
    assert.equal(expected.toBase58(), independent.toBase58());
    const plan = describeDeliveryTransfer(details());
    assert.equal(plan.sourceOwner, FROM);
    assert.equal(plan.sourceAta, expected.toBase58());
    assert.equal(plan.sourceAtaLookup, "derived");
    assert.equal(plan.tokenProgram, SPL_TOKEN_PROGRAM_ID);
  });

runTest("destination ATA is derived for frozen walletSnapshot owner", () => {
    const to = new PublicKey(TO);
    const mint = new PublicKey(MINT);
    const expected = getAssociatedTokenAddress(mint, to);
    const plan = describeDeliveryTransfer(details());
    assert.equal(plan.destOwner, TO);
    assert.equal(plan.destAta, expected.toBase58());
    assert.equal(plan.destAtaCreate, "idempotent-always");
  });

runTest("transaction uses server blockhash, decimals 9, exact amount, fee payer", () => {
    const tx = buildDeliveryTransferTransaction(details(), BLOCKHASH);
    const inspected = inspectDeliveryTransaction(tx);
    assert.equal(inspected.instructionCount, 3);
    assert.equal(inspected.feePayer, FROM);
    assert.equal(tx.recentBlockhash, BLOCKHASH);
    assert.equal(inspected.transferChecked, true);
    assert.equal(inspected.transferDecimals, 9);
    assert.equal(inspected.transferAmount, AMOUNT);
    assert.equal(inspected.destAtaCreateIdempotent, true);
    assert.deepEqual(inspected.programs, [
      SPL_ASSOCIATED_TOKEN_PROGRAM_ID,
      SPL_TOKEN_PROGRAM_ID,
      SPL_MEMO_PROGRAM_ID,
    ]);
    const memo = new TextDecoder().decode(Uint8Array.from(tx.instructions[2].data));
    assert.equal(memo, MEMO);
  });

runTest("destination ATA missing still includes idempotent create", () => {
    const existing = inspectDeliveryTransaction(buildDeliveryTransferTransaction(details(), BLOCKHASH));
    const missing = inspectDeliveryTransaction(buildDeliveryTransferTransaction(details({ to: FROM }), BLOCKHASH));
    assert.equal(existing.instructionCount, 3);
    assert.equal(missing.instructionCount, 3);
    assert.equal(existing.destAtaCreateIdempotent, true);
    assert.equal(missing.destAtaCreateIdempotent, true);
  });

runTest("invalid construction throws", () => {
    assert.throws(() => buildDeliveryTransferTransaction(details({ mint: "not-a-mint" }), BLOCKHASH));
    assert.throws(
      () => buildDeliveryTransferTransaction(details({ decimals: 99 }), BLOCKHASH),
      /decimals/
    );
    assert.throws(
      () =>
        buildDeliveryTransferTransaction(
          details({ tokenProgram: "11111111111111111111111111111111" }),
          BLOCKHASH
        ),
      /Unsupported token type/
    );
  });

runTest("decimals 6 SPL and 0 NFT are allowed; MANGO 9 still works", () => {
    const spl = inspectDeliveryTransaction(
      buildDeliveryTransferTransaction(details({ decimals: 6, amountBaseUnits: "1000000" }), BLOCKHASH)
    );
    assert.equal(spl.transferDecimals, 6);
    assert.equal(spl.transferChecked, true);
    const nft = inspectDeliveryTransaction(
      buildDeliveryTransferTransaction(details({ decimals: 0, amountBaseUnits: "1" }), BLOCKHASH)
    );
    assert.equal(nft.transferDecimals, 0);
    assert.equal(nft.transferAmount, "1");
    const mango = inspectDeliveryTransaction(buildDeliveryTransferTransaction(details(), BLOCKHASH));
    assert.equal(mango.transferDecimals, 9);
    assert.equal(mango.transferAmount, AMOUNT);
  });

  runTest("Token-2022 transferChecked and ATA use Token-2022 program", () => {
    const mint = new PublicKey(MINT);
    const from = new PublicKey(FROM);
    const to = new PublicKey(TO);
    const program = new PublicKey(SPL_TOKEN_2022_PROGRAM_ID);
    const expectedSource = PublicKey.findProgramAddressSync(
      [from.toBuffer(), program.toBuffer(), mint.toBuffer()],
      new PublicKey(SPL_ASSOCIATED_TOKEN_PROGRAM_ID)
    )[0];
    const expectedDest = PublicKey.findProgramAddressSync(
      [to.toBuffer(), program.toBuffer(), mint.toBuffer()],
      new PublicKey(SPL_ASSOCIATED_TOKEN_PROGRAM_ID)
    )[0];
    const plan = describeDeliveryTransfer(details({ tokenProgram: SPL_TOKEN_2022_PROGRAM_ID, decimals: 6, amountBaseUnits: "1000000" }));
    assert.equal(plan.tokenProgram, SPL_TOKEN_2022_PROGRAM_ID);
    assert.equal(plan.sourceAta, expectedSource.toBase58());
    assert.equal(plan.destAta, expectedDest.toBase58());
    const kegPlan = describeDeliveryTransfer(details());
    assert.equal(kegPlan.tokenProgram, SPL_TOKEN_PROGRAM_ID);
    assert.notEqual(plan.sourceAta, kegPlan.sourceAta);
    const tx = buildDeliveryTransferTransaction(
      details({ tokenProgram: SPL_TOKEN_2022_PROGRAM_ID, decimals: 6, amountBaseUnits: "1000000" }),
      BLOCKHASH
    );
    const inspected = inspectDeliveryTransaction(tx);
    assert.equal(inspected.transferChecked, true);
    assert.equal(inspected.transferDecimals, 6);
    assert.equal(inspected.transferAmount, "1000000");
    assert.deepEqual(inspected.programs, [
      SPL_ASSOCIATED_TOKEN_PROGRAM_ID,
      SPL_TOKEN_2022_PROGRAM_ID,
      SPL_MEMO_PROGRAM_ID,
    ]);
    assert.equal(tx.instructions[0].keys[5].pubkey.toBase58(), SPL_TOKEN_2022_PROGRAM_ID);
    const memo = new TextDecoder().decode(Uint8Array.from(tx.instructions[2].data));
    assert.equal(memo, MEMO);
  });

  runTest("wallet without signAndSendTransaction fails loudly", async () => {
    const wallet = {
      address: FROM,
      kind: "standard",
      account: { address: FROM, publicKey: new Uint8Array(32) },
      standardWallet: {
        features: {
          "solana:signMessage": { signMessage: async () => [] },
        },
      },
    };
    const api = describeWalletSendApi(wallet);
    assert.equal(api.hasStandardSignAndSend, false);
    const captured = await captureLogs(async () => {
      await assert.rejects(() => signAndSendDeliveryTransfer(wallet, details()), /cannot send a token transfer/);
    });
    assert.ok(captured.logs.includes("missing-sign-and-send") || captured.logs.includes("cannot send"));
    assert.ok(captured.logs.includes("[delivery] failed"));
    assertLogsSafe(captured.logs);
  });

runTest("wallet rejection is logged and not swallowed", async () => {
    const wallet = {
      address: FROM,
      kind: "standard",
      account: { address: FROM, publicKey: new Uint8Array(32) },
      standardWallet: {
        features: {
          "solana:signAndSendTransaction": {
            signAndSendTransaction: async () => {
              const err = new Error("User rejected the request.");
              err.code = 4001;
              throw err;
            },
          },
        },
      },
    };
    const captured = await captureLogs(async () => {
      await assert.rejects(() => signAndSendDeliveryTransfer(wallet, details()), /User rejected/);
    });
    assert.ok(captured.logs.includes("name=Error"));
    assert.ok(captured.logs.includes("code=4001"));
    assert.ok(captured.logs.includes("User rejected the request."));
    assertLogsSafe(captured.logs);
  });

runTest("confirm pending then sent polls the same signature without resend", async () => {
    let signCalls = 0;
    const confirms = [];
    const result = await submitAdminDelivery({
      baseUrl: "https://example.invalid",
      token: "tok",
      wallet: { address: FROM, kind: "legacy" },
      confirmAttempts: 4,
      confirmRetryMs: 1,
      sleep: async () => {},
      requestPayment: async () => ({
        ok: true,
        from: FROM,
        to: TO,
        mint: MINT,
        amountBaseUnits: AMOUNT,
        decimals: 9,
        memo: MEMO,
        recentBlockhash: BLOCKHASH,
      }),
      signAndSend: async () => {
        signCalls += 1;
        return "5".repeat(88);
      },
      requestConfirm: async (_base, _token, signature) => {
        confirms.push(signature);
        if (confirms.length < 3) {
          return { ok: true, pending: true, status: "pending", reason: "not-finalized" };
        }
        return { ok: true, status: "sent", signature };
      },
    });
    assert.equal(result.ok, true);
    assert.equal(signCalls, 1);
    assert.equal(confirms.length, 3);
    assert.ok(confirms.every((sig) => sig === "5".repeat(88)));
    assert.equal(result.view, undefined);
  });

runTest("waiting state resumes confirm without signing again", async () => {
    let signCalls = 0;
    let paymentCalls = 0;
    const result = await submitAdminDelivery({
      baseUrl: "https://example.invalid",
      token: "tok",
      wallet: { address: FROM, kind: "legacy" },
      existingSignature: "6".repeat(88),
      confirmAttempts: 2,
      confirmRetryMs: 1,
      sleep: async () => {},
      requestPayment: async () => {
        paymentCalls += 1;
        return { ok: false };
      },
      signAndSend: async () => {
        signCalls += 1;
        return "5".repeat(88);
      },
      requestConfirm: async (_base, _token, signature) => {
        assert.equal(signature, "6".repeat(88));
        return { ok: true, status: "sent", signature };
      },
    });
    assert.equal(result.ok, true);
    assert.equal(signCalls, 0);
    assert.equal(paymentCalls, 0);
  });

runTest("true verification mismatch is a failure not waiting", async () => {
    const result = await submitAdminDelivery({
      baseUrl: "https://example.invalid",
      token: "tok",
      wallet: { address: FROM, kind: "legacy" },
      requestPayment: async () => ({
        ok: true,
        from: FROM,
        to: TO,
        mint: MINT,
        amountBaseUnits: AMOUNT,
        decimals: 9,
        memo: MEMO,
        recentBlockhash: BLOCKHASH,
      }),
      signAndSend: async () => "5".repeat(88),
      requestConfirm: async () => ({
        ok: false,
        status: "failed",
        reason: "wrong-amount",
        error: "This transaction could not be verified.",
      }),
    });
    assert.equal(result.ok, false);
    assert.equal(result.view, "error");
    assert.equal(result.pending, undefined);
  });

runTest("waiting copy and no resend after signature are in the page", () => {
    const state = readSrc("src/adminDeliveryState.ts");
    assert.ok(state.includes("Transaction submitted"));
    assert.ok(state.includes("Waiting for network confirmation"));
    const page = readSrc("src/adminDelivery.ts");
    assert.ok(page.includes("existingSignature"));
    assert.ok(page.includes('view: "waiting"'));
    assert.ok(page.includes("model.view !== \"review\""));
    const submit = readSrc("src/adminDeliverySubmit.js");
    assert.ok(submit.includes("existingSignature"));
    assert.ok(submit.includes("confirm-pending"));
  });

runTest("successful signature leads to /delivery/confirm", async () => {
    const calls = [];
    const result = await submitAdminDelivery({
      baseUrl: "https://example.invalid",
      token: "should-not-appear-in-logs-token-value-xxxxxxxx",
      wallet: { address: FROM, kind: "legacy" },
      requestPayment: async () => ({
        ok: true,
        from: FROM,
        to: TO,
        mint: MINT,
        amountBaseUnits: AMOUNT,
        decimals: 9,
        memo: MEMO,
        recentBlockhash: BLOCKHASH,
      }),
      signAndSend: async () => "5".repeat(88),
      requestConfirm: async (_base, _token, signature) => {
        calls.push(signature);
        return { ok: true, idempotent: false };
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.confirmCalled, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].length, 88);
  });

runTest("transaction construction exception does not call confirm", async () => {
    const confirms = [];
    const captured = await captureLogs(async () => {
      const result = await submitAdminDelivery({
        baseUrl: "https://example.invalid",
        token: "tok",
        wallet: { address: FROM, kind: "legacy" },
        requestPayment: async () => ({
          ok: true,
          from: FROM,
          to: TO,
          mint: MINT,
          amountBaseUnits: AMOUNT,
          decimals: 9,
          memo: MEMO,
          recentBlockhash: BLOCKHASH,
        }),
        signAndSend: async () => {
          throw new TypeError("Buffer is not defined");
        },
        requestConfirm: async () => {
          confirms.push(true);
          return { ok: true };
        },
      });
      assert.equal(result.ok, false);
      assert.equal(result.view, "transaction_failed");
      assert.equal(result.confirmCalled, false);
    });
    assert.equal(confirms.length, 0);
    assert.ok(captured.logs.includes("Buffer is not defined"));
    assert.ok(captured.logs.includes("[delivery] failed step=sign-send"));
    assertLogsSafe(captured.logs);
  });

runTest("debug logs never include secrets or raw RPC URLs", async () => {
    const captured = await captureLogs(async () => {
      logDeliveryDebug("payment-response", {
        ok: true,
        token: "secret-token",
        rpcUrl: "https://rpc.test.invalid/rpc?api-key=abc",
        blockhashPresent: true,
      });
      logDeliveryError(
        Object.assign(new Error("RPC https://rpc.test.invalid/rpc?api-key=abc"), { name: "TypeError" }),
        "sign-send"
      );
    });
    assert.ok(captured.logs.includes("blockhashPresent=true"));
    assert.equal(captured.logs.includes("secret-token"), false);
    assert.ok(captured.logs.includes("name=TypeError"));
    assert.equal(captured.logs.includes("RPC https"), false);
    assertLogsSafe(captured.logs);
  });

runTest("standard signAndSendTransaction is used when available", async () => {
    let called = false;
    const wallet = {
      address: FROM,
      kind: "standard",
      account: { address: FROM, publicKey: new Uint8Array(32) },
      standardWallet: {
        features: {
          "solana:signAndSendTransaction": {
            signAndSendTransaction: async (input) => {
              called = true;
              assert.ok(input.transaction instanceof Uint8Array);
              assert.equal(input.chain, "solana:mainnet");
              assert.ok(input.transaction.byteLength > 0);
              return [{ signature: new Uint8Array(64).fill(1) }];
            },
          },
        },
      },
    };
    const captured = await captureLogs(async () => signAndSendDeliveryTransfer(wallet, details()));
    assert.equal(called, true);
    assert.equal(typeof captured.result, "string");
    assert.ok(captured.result.length > 0);
    assert.ok(captured.logs.includes("wallet-sign-send-started"));
    assert.ok(captured.logs.includes("wallet-sign-send-succeeded"));
    assert.equal(captured.logs.includes(captured.result), false);
    assertLogsSafe(captured.logs);
  });

async function main() {
  for (const { name, fn } of tests) {
    await fn();
    console.log(`✓ ${name}`);
  }
  console.log("admin-delivery tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
