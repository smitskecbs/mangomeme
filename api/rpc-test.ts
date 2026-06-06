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

  const rpcUrl = process.env.SOLANA_RPC_URL;

  if (!rpcUrl) {
    res.status(500).json({
      success: false,
      error: "SOLANA_RPC_URL is missing",
    });
    return;
  }

  try {
    const rpcResponse = await fetch(rpcUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getHealth",
      }),
    });

    const text = await rpcResponse.text();

    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }

    res.status(200).json({
      success: rpcResponse.ok,
      status: rpcResponse.status,
      response: payload,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown RPC error",
    });
  }
}
