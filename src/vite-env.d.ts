/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MANGO_HIGHSCORE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
