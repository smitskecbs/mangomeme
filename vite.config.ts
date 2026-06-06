import type { Connect } from "vite";
import { defineConfig, loadEnv } from "vite";
import { createSolanaRpcMiddleware } from "./lib/solanaRpcProxy.ts";

function attachSolanaRpcProxy(
  server: { middlewares: Connect.Server },
  env: Record<string, string>
): void {
  server.middlewares.use(
    createSolanaRpcMiddleware(() => env.SOLANA_RPC_URL)
  );
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    build: {
      outDir: "dist",
    },
    plugins: [
      {
        name: "solana-rpc-proxy",
        configureServer(server) {
          attachSolanaRpcProxy(server, env);
        },
        configurePreviewServer(server) {
          attachSolanaRpcProxy(server, env);
        },
      },
    ],
  };
});
