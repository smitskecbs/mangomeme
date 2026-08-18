/**
 * Admin-signed SPL MANGO transfer. ManGo never signs.
 * Uses @solana/web3.js only — no extra SPL dependency.
 */

import { logDeliveryDebug, logDeliveryError } from "./adminDeliveryDebug.js";
import {
  buildDeliveryTransferTransaction,
  describeDeliveryTransfer,
  describeWalletSendApi,
  inspectDeliveryTransaction,
} from "./solanaDeliveryTx.js";

function encodeBase58(bytes) {
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const source = Array.from(bytes);
  let zeros = 0;
  while (zeros < source.length && source[zeros] === 0) {
    zeros += 1;
  }
  const size = Math.floor(((source.length - zeros) * 138) / 100) + 1;
  const b58 = new Uint8Array(size);
  let length = 0;
  for (let i = zeros; i < source.length; i += 1) {
    let carry = source[i];
    let j = 0;
    for (let k = size - 1; k >= 0 && (carry !== 0 || j < length); k -= 1, j += 1) {
      carry += 256 * b58[k];
      b58[k] = carry % 58;
      carry = (carry / 58) | 0;
    }
    length = j;
  }
  let start = size - length;
  while (start < size && b58[start] === 0) {
    start += 1;
  }
  let result = "1".repeat(zeros);
  for (let i = start; i < size; i += 1) {
    result += ALPHABET[b58[i]];
  }
  return result;
}

export {
  buildDeliveryTransferTransaction,
  describeDeliveryTransfer,
  describeWalletSendApi,
  getAssociatedTokenAddress,
  inspectDeliveryTransaction,
} from "./solanaDeliveryTx.js";

export async function signAndSendDeliveryTransfer(wallet, details) {
  if (!wallet || wallet.address !== details.from) {
    throw new Error("Connected wallet does not match the distribution wallet.");
  }
  if (!details.recentBlockhash) {
    throw new Error("Delivery is not ready to sign.");
  }

  const plan = describeDeliveryTransfer(details);
  logDeliveryDebug("tx-plan", {
    sourceAtaLookup: plan.sourceAtaLookup,
    destAtaLookup: plan.destAtaLookup,
    destAtaCreate: plan.destAtaCreate,
    decimals: plan.decimals,
    amountBaseUnits: plan.amountBaseUnits,
    memoPrefixOk: plan.memoPrefixOk,
    blockhashPresent: plan.blockhashPresent,
    blockhashLength: plan.blockhashLength,
    instructionCount: plan.instructionCount,
  });
  logDeliveryDebug("ata-derived", {
    sourceAta: plan.sourceAta,
    destAta: plan.destAta,
  });

  const sendApi = describeWalletSendApi(wallet);
  logDeliveryDebug("wallet-api", {
    kind: sendApi.kind,
    hasStandardSignAndSend: sendApi.hasStandardSignAndSend,
    hasStandardSignTransaction: sendApi.hasStandardSignTransaction,
    hasLegacySignAndSend: sendApi.hasLegacySignAndSend,
    featureNames: sendApi.featureNames,
  });

  let transaction;
  try {
    transaction = buildDeliveryTransferTransaction(details, details.recentBlockhash);
  } catch (err) {
    logDeliveryError(err, "tx-construct");
    throw err;
  }
  const inspected = inspectDeliveryTransaction(transaction);
  logDeliveryDebug("tx-constructed", {
    instructionCount: inspected.instructionCount,
    destAtaCreateIdempotent: inspected.destAtaCreateIdempotent,
    transferChecked: inspected.transferChecked,
    transferDecimals: inspected.transferDecimals,
    feePayerOk: inspected.feePayer === details.from,
  });

  if (wallet.kind === "standard" && wallet.standardWallet && wallet.account) {
    const feature = wallet.standardWallet.features["solana:signAndSendTransaction"];
    if (!feature || typeof feature.signAndSendTransaction !== "function") {
      const err = new Error("This wallet cannot send a token transfer.");
      err.code = "missing-sign-and-send";
      logDeliveryError(err, "wallet-api");
      throw err;
    }
    let serialized;
    try {
      serialized = Uint8Array.from(
        transaction.serialize({
          requireAllSignatures: false,
          verifySignatures: false,
        })
      );
    } catch (err) {
      logDeliveryError(err, "tx-serialize");
      throw err;
    }
    logDeliveryDebug("tx-serialized", { byteLength: serialized.byteLength });
    logDeliveryDebug("wallet-sign-send-started", { kind: "standard" });
    let out;
    try {
      [out] = await feature.signAndSendTransaction({
        account: wallet.account,
        transaction: serialized,
        chain: "solana:mainnet",
      });
    } catch (err) {
      logDeliveryError(err, "wallet-sign-send");
      throw err;
    }
    if (!out || !out.signature) {
      throw new Error("Wallet did not return a signature.");
    }
    const signature = encodeBase58(
      out.signature instanceof Uint8Array ? out.signature : new Uint8Array(out.signature)
    );
    logDeliveryDebug("wallet-sign-send-succeeded", { signatureLength: signature.length });
    return signature;
  }

  const provider = wallet.legacyProvider;
  if (provider && typeof provider.signAndSendTransaction === "function") {
    logDeliveryDebug("wallet-sign-send-started", { kind: "legacy" });
    let sent;
    try {
      sent = await provider.signAndSendTransaction(transaction);
    } catch (err) {
      logDeliveryError(err, "wallet-sign-send");
      throw err;
    }
    if (typeof sent === "string" && sent) {
      logDeliveryDebug("wallet-sign-send-succeeded", { signatureLength: sent.length });
      return sent;
    }
    if (sent && typeof sent === "object" && typeof sent.signature === "string") {
      logDeliveryDebug("wallet-sign-send-succeeded", { signatureLength: sent.signature.length });
      return sent.signature;
    }
  }
  const err = new Error("This wallet cannot send a token transfer.");
  err.code = "missing-sign-and-send";
  logDeliveryError(err, "wallet-api");
  throw err;
}
