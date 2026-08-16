/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MANGO_HIGHSCORE_API_URL?: string;
  readonly VITE_MANGO_BOUNCH_HIGHSCORE_API_URL?: string;
  readonly VITE_MANGO_WALLET_API_URL?: string;
  readonly VITE_TELEGRAM_BOT_USERNAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
