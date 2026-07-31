import type { Connect } from "vite";
import { defineConfig, loadEnv } from "vite";
import { resolve } from "node:path";
import { createSolanaRpcMiddleware } from "./lib/solanaRpcProxy";

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
      rollupOptions: {
        input: {
          main: resolve(__dirname, "index.html"),
          mangoLabs: resolve(__dirname, "mango-labs.html"),
        },
      },
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
