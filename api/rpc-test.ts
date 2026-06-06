import dotenv from "dotenv";
import { forwardSolanaRpc } from "../lib/solanaRpcProxy.ts";

dotenv.config();

interface VercelRequest {
  method?: string;
}

interface VercelResponse {
  status(code: number): VercelResponse;
  json(body: unknown): void;
  end(): void;
}

const HEALTH_REQUEST = {
  jsonrpc: "2.0",
  id: 1,
  method: "getHealth",
} as const;

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ success: false, error: "Method not allowed" });
    return;
  }

  const rpcUrl = process.env.SOLANA_RPC_URL;

  if (!rpcUrl) {
    res.status(500).json({
      success: false,
      error: "SOLANA_RPC_URL is missing",
    });
    return;
  }

  const { status, payload } = await forwardSolanaRpc(HEALTH_REQUEST, rpcUrl);

  if (status === 200 && !payload.error) {
    res.status(200).json({
      success: true,
      response: payload,
    });
    return;
  }

  res.status(status >= 400 ? status : 502).json({
    success: false,
    error: payload.error ?? {
      message: "RPC health check failed.",
      status,
    },
  });
}
