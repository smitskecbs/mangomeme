/**
 * Admin-signed SPL MANGO transfer. ManGo never signs.
 * Uses @solana/web3.js only — no extra SPL dependency.
 */

import {
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import type { ConnectedWallet } from "./solanaWallets.ts";

const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);
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

export interface DeliveryTransferDetails {
  from: string;
  to: string;
  mint: string;
  amountBaseUnits: string;
  decimals: number;
  memo: string;
  recentBlockhash: string;
}

export function getAssociatedTokenAddress(mint: PublicKey, owner: PublicKey): PublicKey {
  const [address] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return address;
}

function createIdempotentAtaInstruction(
  payer: PublicKey,
  owner: PublicKey,
  mint: PublicKey,
  ata: PublicKey
): TransactionInstruction {
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
    data: Buffer.from([1]),
  });
}

function transferCheckedInstruction(
  source: PublicKey,
  mint: PublicKey,
  destination: PublicKey,
  owner: PublicKey,
  amount: bigint,
  decimals: number
): TransactionInstruction {
  const data = Buffer.alloc(10);
  data[0] = 12;
  data.writeBigUInt64LE(amount, 1);
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

function memoInstruction(memo: string): TransactionInstruction {
  return new TransactionInstruction({
    keys: [],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(new TextEncoder().encode(memo)),
  });
}

export function buildDeliveryTransferTransaction(
  details: DeliveryTransferDetails,
  recentBlockhash: string
): Transaction {
  const from = new PublicKey(details.from);
  const to = new PublicKey(details.to);
  const mint = new PublicKey(details.mint);
  const amount = BigInt(details.amountBaseUnits);
  const sourceAta = getAssociatedTokenAddress(mint, from);
  const destAta = getAssociatedTokenAddress(mint, to);
  const tx = new Transaction({
    feePayer: from,
    recentBlockhash,
  });
  tx.add(
    createIdempotentAtaInstruction(from, to, mint, destAta),
    transferCheckedInstruction(sourceAta, mint, destAta, from, amount, details.decimals),
    memoInstruction(details.memo)
  );
  return tx;
}

export async function signAndSendDeliveryTransfer(
  wallet: ConnectedWallet,
  details: DeliveryTransferDetails
): Promise<string> {
  if (wallet.address !== details.from) {
    throw new Error("Connected wallet does not match the distribution wallet.");
  }
  if (!details.recentBlockhash) {
    throw new Error("Delivery is not ready to sign.");
  }
  const transaction = buildDeliveryTransferTransaction(details, details.recentBlockhash);

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
      throw new Error("This wallet cannot send a token transfer.");
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
  throw new Error("This wallet cannot send a token transfer.");
}
