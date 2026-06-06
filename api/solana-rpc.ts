import dotenv from "dotenv";
import { forwardSolanaRpc } from "../lib/solanaRpcProxy.ts";

dotenv.config();

interface VercelRequest {
  method?: string;
  body?: unknown;
}

interface VercelResponse {
  status(code: number): VercelResponse;
  json(body: unknown): void;
  end(): void;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const rpcUrl = process.env.SOLANA_RPC_URL;

  if (!rpcUrl) {
    res.status(500).json({ error: "SOLANA_RPC_URL is missing" });
    return;
  }

  const body = req.body;

  if (!body || typeof body !== "object") {
    res.status(400).json({
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32600, message: "Invalid JSON-RPC request." },
    });
    return;
  }

  const { status, payload } = await forwardSolanaRpc(
    body as Parameters<typeof forwardSolanaRpc>[0],
    rpcUrl
  );

  res.status(status).json(payload);
}
