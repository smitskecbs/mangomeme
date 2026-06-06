export type HealthCategory = "GOOD" | "AVERAGE" | "POOR" | "BAD";

export type SolanaAddress = string;

export interface ScoreSection {
  label: string;
  score: number;
  max: number;
  notes: string[];
}

export interface TokenHealthReport {
  mint: SolanaAddress;
  name: string;
  symbol: string;
  liquidityUsd: number;
  marketCap: number;
  volume24h: number;
  topHolderPct: number | null;
  top10Pct: number | null;
  mintAuthorityRevoked: boolean;
  freezeAuthorityRevoked: boolean;
  ageDays: number | null;
  poolCount: number;
  hasMedia: boolean;
}

export interface TokenHealthResult {
  score: number;
  category: HealthCategory;
  image: string;
  summary: string;
  warnings: string[];
  sections: ScoreSection[];
  report: TokenHealthReport;
}

export interface DexAggregated {
  name: string | null;
  symbol: string | null;
  hasMedia: boolean;
  liquidityUsd: number;
  marketCap: number;
  volume24h: number;
  poolCount: number;
  ageDays: number | null;
  oldestPairDate: Date | null;
}

export interface MintAuthorities {
  mintAuthorityRevoked: boolean;
  freezeAuthorityRevoked: boolean;
}

export interface HolderStats {
  topHolderPct: number | null;
  top10Pct: number | null;
  holderCount: number;
}

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: unknown;
}

export interface JsonRpcError {
  code: number;
  message: string;
}

export interface JsonRpcResponse<T = unknown> {
  jsonrpc: "2.0";
  id: number | string;
  result?: T;
  error?: JsonRpcError;
}

export interface RpcAccountInfoResult {
  value: {
    data: [string, string];
  } | null;
}

export interface RpcTokenAmount {
  uiAmount: number | null;
}

export interface RpcLargestAccountsResult {
  value: Array<{ uiAmount: number | null }>;
}

export interface RpcTokenSupplyResult {
  value: {
    uiAmount: number | null;
  };
}

export interface DexScreenerPair {
  baseToken?: {
    name?: string;
    symbol?: string;
  };
  info?: {
    imageUrl?: string;
    websites?: unknown[];
    socials?: unknown[];
  };
  liquidity?: {
    usd?: number;
  };
  volume?: {
    h24?: number;
  };
  marketCap?: number;
  fdv?: number;
  pairCreatedAt?: number;
}

export const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export const CATEGORY_IMAGES: Record<HealthCategory, string> = {
  GOOD: "/token_checker/good.png",
  AVERAGE: "/token_checker/average.png",
  POOR: "/token_checker/poor.png",
  BAD: "/token_checker/bad.png",
};

export const RPC_ERROR_MESSAGES = {
  403: "RPC access blocked. Please configure a private RPC endpoint.",
  429: "RPC rate limit reached. Try again later.",
} as const;
