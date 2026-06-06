import {
  BASE58_REGEX,
  type HolderStats,
  RPC_ERROR_MESSAGES,
  type JsonRpcResponse,
  type MintAuthorities,
  type RpcAccountInfoResult,
  type RpcLargestAccountsResult,
  type RpcTokenBalanceValue,
  type RpcTokenSupplyResult,
  type SolanaAddress,
} from "./tokenHealthTypes.ts";

const SOLANA_RPC_API = "/api/solana-rpc";

function getRpcErrorMessage(
  response: Response,
  payload: JsonRpcResponse | null
): string {
  const errorCode = payload?.error?.code;
  const errorMessage = payload?.error?.message ?? "";

  if (
    response.status === 403 ||
    errorCode === 403 ||
    /403|forbidden|access denied/i.test(errorMessage)
  ) {
    return RPC_ERROR_MESSAGES[403];
  }

  if (
    response.status === 429 ||
    errorCode === 429 ||
    /rate limit|too many requests/i.test(errorMessage)
  ) {
    return RPC_ERROR_MESSAGES[429];
  }

  return errorMessage || "Unable to reach Solana RPC.";
}

async function rpcCall<T>(method: string, params: unknown): Promise<T> {
  const response = await fetch(SOLANA_RPC_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
  });

  let payload: JsonRpcResponse<T> | null = null;

  try {
    payload = (await response.json()) as JsonRpcResponse<T>;
  } catch {
    throw new Error(getRpcErrorMessage(response, null));
  }

  if (!response.ok || payload.error) {
    throw new Error(getRpcErrorMessage(response, payload));
  }

  return payload.result as T;
}

/** SPL mint layout decode (Solana Kit-style binary read, no web3.js). */
function parseMintAuthorities(base64Data: string): MintAuthorities {
  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  const view = new DataView(bytes.buffer);
  const mintAuthorityOption = view.getUint32(0, true);
  const freezeAuthorityOption = view.getUint32(46, true);

  return {
    mintAuthorityRevoked: mintAuthorityOption === 0,
    freezeAuthorityRevoked: freezeAuthorityOption === 0,
  };
}

function parseRawTokenAmount(value: RpcTokenBalanceValue | undefined): bigint | null {
  if (!value) {
    return null;
  }

  if (value.amount) {
    try {
      return BigInt(value.amount);
    } catch {
      // Fall through to uiAmountString.
    }
  }

  if (value.uiAmountString) {
    const [whole, fraction = ""] = value.uiAmountString.split(".");
    const decimals = value.decimals ?? 0;
    const paddedFraction = fraction.padEnd(decimals, "0").slice(0, decimals);
    const raw = `${whole}${paddedFraction}`.replace(/^(-?)0+(?=\d)/, "$1");

    try {
      return BigInt(raw || "0");
    } catch {
      return null;
    }
  }

  if (value.uiAmount != null) {
    const decimals = value.decimals ?? 0;
    const scaled = Math.round(value.uiAmount * 10 ** decimals);

    if (Number.isFinite(scaled)) {
      return BigInt(scaled);
    }
  }

  return null;
}

function percentageOf(part: bigint, total: bigint): number {
  if (total === 0n) {
    return 0;
  }

  const basisPoints = (part * 10000n) / total;
  return Number(basisPoints) / 100;
}

export function assertValidMintAddress(mint: string): SolanaAddress {
  const normalizedMint = mint.trim();

  if (!BASE58_REGEX.test(normalizedMint)) {
    throw new Error("Invalid Solana mint address.");
  }

  return normalizedMint;
}

export async function fetchMintAuthorities(
  mint: SolanaAddress
): Promise<MintAuthorities> {
  const result = await rpcCall<RpcAccountInfoResult>("getAccountInfo", [
    mint,
    { encoding: "base64" },
  ]);

  if (!result?.value?.data?.[0]) {
    throw new Error("Invalid Solana mint address.");
  }

  return parseMintAuthorities(result.value.data[0]);
}

function unavailableHolderStats(): HolderStats {
  return {
    topHolderPercentage: null,
    top10HolderPercentage: null,
    largestAccountsReturned: 0,
    analysisUnavailable: true,
  };
}

/**
 * Holder concentration from the RPC largest-accounts sample only.
 * Uses getTokenLargestAccounts + getTokenSupply — never enumerates all holders.
 */
export async function fetchHolderStats(mint: SolanaAddress): Promise<HolderStats> {
  let largestAccounts: RpcLargestAccountsResult;

  try {
    largestAccounts = await rpcCall<RpcLargestAccountsResult>(
      "getTokenLargestAccounts",
      [mint]
    );
  } catch {
    return unavailableHolderStats();
  }

  let supply: RpcTokenSupplyResult;

  try {
    supply = await rpcCall<RpcTokenSupplyResult>("getTokenSupply", [mint]);
  } catch {
    return unavailableHolderStats();
  }

  const accounts = largestAccounts?.value ?? [];
  const totalSupplyRaw = parseRawTokenAmount(supply?.value);

  if (!totalSupplyRaw || totalSupplyRaw === 0n || !accounts.length) {
    return {
      topHolderPercentage: null,
      top10HolderPercentage: null,
      largestAccountsReturned: accounts.length,
      analysisUnavailable: false,
    };
  }

  const rawAmounts = accounts
    .map((account) => parseRawTokenAmount(account))
    .filter((amount): amount is bigint => amount != null && amount > 0n);

  if (!rawAmounts.length) {
    return {
      topHolderPercentage: null,
      top10HolderPercentage: null,
      largestAccountsReturned: accounts.length,
      analysisUnavailable: false,
    };
  }

  const topHolderPercentage = percentageOf(rawAmounts[0], totalSupplyRaw);
  const top10Sum = rawAmounts
    .slice(0, 10)
    .reduce((sum, amount) => sum + amount, 0n);
  const top10HolderPercentage = percentageOf(top10Sum, totalSupplyRaw);

  return {
    topHolderPercentage,
    top10HolderPercentage,
    largestAccountsReturned: accounts.length,
    analysisUnavailable: false,
  };
}
