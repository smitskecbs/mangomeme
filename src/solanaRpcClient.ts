import {
  BASE58_REGEX,
  RPC_ERROR_MESSAGES,
  type HolderStats,
  type JsonRpcResponse,
  type MintAuthorities,
  type RpcAccountInfoResult,
  type RpcLargestAccountsResult,
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

export async function fetchHolderStats(mint: SolanaAddress): Promise<HolderStats> {
  const [largestAccounts, supply] = await Promise.all([
    rpcCall<RpcLargestAccountsResult>("getTokenLargestAccounts", [mint]),
    rpcCall<RpcTokenSupplyResult>("getTokenSupply", [mint]),
  ]);

  const totalSupply = Number(supply?.value?.uiAmount ?? 0);
  const accounts = largestAccounts?.value ?? [];

  if (!totalSupply || !accounts.length) {
    return {
      topHolderPct: null,
      top10Pct: null,
      holderCount: accounts.length,
    };
  }

  const amounts = accounts.map((account) => Number(account.uiAmount ?? 0));
  const topHolderPct = (amounts[0] / totalSupply) * 100;
  const top10Pct =
    (amounts.slice(0, 10).reduce((sum, amount) => sum + amount, 0) /
      totalSupply) *
    100;

  return {
    topHolderPct,
    top10Pct,
    holderCount: accounts.length,
  };
}
