import dotenv from "dotenv";

dotenv.config();

interface VercelRequest {
  method?: string;
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

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  res.status(200).json({
    hasSolanaRpcUrl: Boolean(process.env.SOLANA_RPC_URL),
    nodeEnv: process.env.NODE_ENV ?? null,
  });
}
