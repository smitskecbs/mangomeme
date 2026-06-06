import type { IncomingMessage, ServerResponse } from "node:http";

interface JsonRpcRequest {
  jsonrpc?: "2.0";
  id?: number | string;
  method?: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string };
}

const RPC_ERROR_MESSAGES = {
  403: "RPC access blocked. Please configure a private RPC endpoint.",
  429: "RPC rate limit reached. Try again later.",
} as const;

interface ProxyResult {
  status: number;
  payload: JsonRpcResponse;
}

function buildJsonRpcError(
  id: number | string,
  code: number,
  message: string
): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id: id ?? 1,
    error: { code, message },
  };
}

export async function forwardSolanaRpc(
  jsonRpcBody: JsonRpcRequest,
  rpcUrl: string | undefined
): Promise<ProxyResult> {
  const requestId = jsonRpcBody?.id ?? 1;

  if (!rpcUrl) {
    return {
      status: 503,
      payload: buildJsonRpcError(requestId, 503, RPC_ERROR_MESSAGES[403]),
    };
  }

  let upstream: Response;

  try {
    upstream = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(jsonRpcBody),
    });
  } catch {
    return {
      status: 502,
      payload: buildJsonRpcError(requestId, 502, "Unable to reach Solana RPC."),
    };
  }

  if (upstream.status === 403) {
    return {
      status: 403,
      payload: buildJsonRpcError(requestId, 403, RPC_ERROR_MESSAGES[403]),
    };
  }

  if (upstream.status === 429) {
    return {
      status: 429,
      payload: buildJsonRpcError(requestId, 429, RPC_ERROR_MESSAGES[429]),
    };
  }

  let payload: JsonRpcResponse;

  try {
    payload = (await upstream.json()) as JsonRpcResponse;
  } catch {
    return {
      status: 502,
      payload: buildJsonRpcError(requestId, 502, "Invalid RPC response."),
    };
  }

  return {
    status: upstream.ok ? 200 : upstream.status,
    payload,
  };
}

type NextFunction = (error?: unknown) => void;

export function createSolanaRpcMiddleware(getRpcUrl: () => string | undefined) {
  return function solanaRpcMiddleware(
    req: IncomingMessage,
    res: ServerResponse,
    next: NextFunction
  ): void {
    if (
      req.url !== "/api/solana-rpc" &&
      !req.url?.startsWith("/api/solana-rpc?")
    ) {
      next();
      return;
    }

    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.setHeader("Allow", "POST, OPTIONS");
      res.end();
      return;
    }

    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }

    const chunks: Buffer[] = [];

    req.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });

    req.on("end", async () => {
      try {
        const rawBody = Buffer.concat(chunks).toString("utf8");
        const body = rawBody
          ? (JSON.parse(rawBody) as JsonRpcRequest)
          : ({} as JsonRpcRequest);
        const { status, payload } = await forwardSolanaRpc(body, getRpcUrl());

        res.statusCode = status;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(payload));
      } catch {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify(buildJsonRpcError(1, 500, "RPC proxy error."))
        );
      }
    });

    req.on("error", () => {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(buildJsonRpcError(1, 500, "RPC proxy error.")));
    });
  };
}
