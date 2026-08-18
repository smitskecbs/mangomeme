/**
 * SPL MANGO delivery transaction construction. Browser-safe (no global Buffer).
 * ManGo never signs. No RPC lookups — ATAs are derived, dest ATA create is idempotent.
 */

import {
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";

export const SPL_TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const SPL_ASSOCIATED_TOKEN_PROGRAM_ID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
export const SPL_MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

const TOKEN_PROGRAM_ID = new PublicKey(SPL_TOKEN_PROGRAM_ID);
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(SPL_ASSOCIATED_TOKEN_PROGRAM_ID);
const MEMO_PROGRAM_ID = new PublicKey(SPL_MEMO_PROGRAM_ID);

export function getAssociatedTokenAddress(mint, owner) {
  const [address] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return address;
}

function createIdempotentAtaInstruction(payer, owner, mint, ata) {
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: new Uint8Array([1]),
  });
}

function transferCheckedInstruction(source, mint, destination, owner, amount, decimals) {
  const data = new Uint8Array(10);
  data[0] = 12;
  new DataView(data.buffer).setBigUint64(1, amount, true);
  data[9] = decimals;
  return new TransactionInstruction({
    programId: TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: source, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ],
    data,
  });
}

function memoInstruction(memo) {
  return new TransactionInstruction({
    keys: [],
    programId: MEMO_PROGRAM_ID,
    data: new TextEncoder().encode(memo),
  });
}

export function describeDeliveryTransfer(details) {
  const from = new PublicKey(details.from);
  const to = new PublicKey(details.to);
  const mint = new PublicKey(details.mint);
  const sourceAta = getAssociatedTokenAddress(mint, from);
  const destAta = getAssociatedTokenAddress(mint, to);
  return {
    feePayer: from.toBase58(),
    sourceOwner: from.toBase58(),
    destOwner: to.toBase58(),
    mint: mint.toBase58(),
    sourceAta: sourceAta.toBase58(),
    destAta: destAta.toBase58(),
    sourceAtaLookup: "derived",
    destAtaLookup: "derived",
    destAtaCreate: "idempotent-always",
    amountBaseUnits: String(details.amountBaseUnits),
    decimals: Number(details.decimals),
    memoPrefixOk: String(details.memo || "").startsWith("mango-delivery:"),
    blockhashPresent: Boolean(details.recentBlockhash),
    blockhashLength: details.recentBlockhash ? String(details.recentBlockhash).length : 0,
    instructionCount: 3,
    tokenProgram: SPL_TOKEN_PROGRAM_ID,
  };
}

export function inspectDeliveryTransaction(tx) {
  const ixs = Array.isArray(tx && tx.instructions) ? tx.instructions : [];
  const transferData = ixs[1] && ixs[1].data ? Uint8Array.from(ixs[1].data) : new Uint8Array();
  const amountView = transferData.length >= 9 ? new DataView(transferData.buffer, transferData.byteOffset, transferData.byteLength) : null;
  return {
    instructionCount: ixs.length,
    feePayer: tx.feePayer ? tx.feePayer.toBase58() : "",
    recentBlockhashPresent: Boolean(tx.recentBlockhash),
    programs: ixs.map((ix) => ix.programId.toBase58()),
    destAtaCreateIdempotent: Boolean(ixs[0] && Uint8Array.from(ixs[0].data)[0] === 1),
    transferChecked: Boolean(transferData[0] === 12),
    transferDecimals: transferData.length > 9 ? transferData[9] : null,
    transferAmount: amountView ? amountView.getBigUint64(1, true).toString() : "",
  };
}

export function buildDeliveryTransferTransaction(details, recentBlockhash) {
  const from = new PublicKey(details.from);
  const to = new PublicKey(details.to);
  const mint = new PublicKey(details.mint);
  const amount = BigInt(details.amountBaseUnits);
  if (amount <= 0n) {
    throw new Error("Delivery amount is invalid.");
  }
  const decimals = Number(details.decimals);
  if (!Number.isInteger(decimals) || decimals !== 9) {
    throw new Error("Delivery decimals are invalid.");
  }
  const sourceAta = getAssociatedTokenAddress(mint, from);
  const destAta = getAssociatedTokenAddress(mint, to);
  const tx = new Transaction({
    feePayer: from,
    recentBlockhash,
  });
  tx.add(
    createIdempotentAtaInstruction(from, to, mint, destAta),
    transferCheckedInstruction(sourceAta, mint, destAta, from, amount, decimals),
    memoInstruction(details.memo)
  );
  return tx;
}

export function describeWalletSendApi(wallet) {
  const features =
    wallet && wallet.standardWallet && wallet.standardWallet.features && typeof wallet.standardWallet.features === "object"
      ? wallet.standardWallet.features
      : {};
  const standardFeature = features["solana:signAndSendTransaction"];
  const hasStandardSignAndSend = Boolean(
    standardFeature && typeof standardFeature.signAndSendTransaction === "function"
  );
  const hasStandardSignTransaction = Boolean(
    features["solana:signTransaction"] &&
      typeof features["solana:signTransaction"].signTransaction === "function"
  );
  const provider = wallet && wallet.legacyProvider;
  const hasLegacySignAndSend = Boolean(provider && typeof provider.signAndSendTransaction === "function");
  const featureNames = Object.keys(features)
    .filter((name) => name.startsWith("solana:") || name.startsWith("standard:"))
    .sort()
    .join(",");
  return {
    kind: wallet && wallet.kind ? String(wallet.kind) : "unknown",
    hasStandardSignAndSend,
    hasStandardSignTransaction,
    hasLegacySignAndSend,
    featureNames,
  };
}
