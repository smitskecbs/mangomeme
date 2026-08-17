/**
 * Presale-only SOL transfer helper.
 * Wallet-connect remains signMessage-only. This module is not imported there.
 *
 * @solana/web3.js is used solely to construct a native System Program transfer
 * plus an SPL Memo. The user wallet signs and sends. ManGo never signs.
 */

import {
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import type { ConnectedWallet } from "./solanaWallets.ts";

const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

function encodeBase58(bytes: Uint8Array): string {
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

export interface PresalePaymentDetails {
  from: string;
  to: string;
  lamports: string;
  memo: string;
  recentBlockhash: string;
}

function memoInstruction(memo: string): TransactionInstruction {
  return new TransactionInstruction({
    keys: [],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(new TextEncoder().encode(memo)),
  });
}

export function buildPresaleTransferTransaction(
  details: PresalePaymentDetails,
  recentBlockhash: string
): Transaction {
  const from = new PublicKey(details.from);
  const to = new PublicKey(details.to);
  const lamports = BigInt(details.lamports);
  const tx = new Transaction({
    feePayer: from,
    recentBlockhash,
  });
  tx.add(
    SystemProgram.transfer({
      fromPubkey: from,
      toPubkey: to,
      lamports,
    }),
    memoInstruction(details.memo)
  );
  return tx;
}

export async function signAndSendPresaleTransfer(
  wallet: ConnectedWallet,
  details: PresalePaymentDetails
): Promise<string> {
  if (wallet.address !== details.from) {
    throw new Error("Connected wallet does not match the verified presale wallet.");
  }
  if (!details.recentBlockhash) {
    throw new Error("Presale payment is not ready to sign.");
  }
  const transaction = buildPresaleTransferTransaction(details, details.recentBlockhash);

  if (wallet.kind === "standard" && wallet.standardWallet && wallet.account) {
    const feature = wallet.standardWallet.features["solana:signAndSendTransaction"] as
      | {
          signAndSendTransaction: (input: {
            account: unknown;
            transaction: Uint8Array;
            chain: string;
          }) => Promise<Array<{ signature: Uint8Array }>>;
        }
      | undefined;
    if (!feature || typeof feature.signAndSendTransaction !== "function") {
      throw new Error("This wallet cannot send a presale transfer.");
    }
    const serialized = Uint8Array.from(
      transaction.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      })
    );
    const [out] = await feature.signAndSendTransaction({
      account: wallet.account,
      transaction: serialized,
      chain: "solana:mainnet",
    });
    if (!out || !out.signature) {
      throw new Error("Wallet did not return a signature.");
    }
    return encodeBase58(
      out.signature instanceof Uint8Array ? out.signature : new Uint8Array(out.signature)
    );
  }

  const provider = wallet.legacyProvider as
    | {
        signAndSendTransaction?: (tx: Transaction) => Promise<{ signature?: string } | string>;
        signTransaction?: (tx: Transaction) => Promise<Transaction>;
      }
    | undefined;
  if (provider && typeof provider.signAndSendTransaction === "function") {
    const sent = await provider.signAndSendTransaction(transaction);
    if (typeof sent === "string" && sent) {
      return sent;
    }
    if (sent && typeof sent === "object" && typeof sent.signature === "string") {
      return sent.signature;
    }
  }
  throw new Error("This wallet cannot send a presale transfer.");
}
