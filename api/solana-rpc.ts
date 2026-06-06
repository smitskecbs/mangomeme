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

  try {
    const rpcResponse = await fetch(rpcUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const text = await rpcResponse.text();

    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = {
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32000, message: "Invalid RPC response." },
      };
    }

    res.status(rpcResponse.ok ? 200 : rpcResponse.status).json(payload);
  } catch (error) {
    res.status(502).json({
      jsonrpc: "2.0",
      id: 1,
      error: {
        code: -32000,
        message:
          error instanceof Error
            ? error.message
            : "Unable to reach Solana RPC.",
      },
    });
  }
}
