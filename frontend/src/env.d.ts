/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend API origin or full API base when not served same-origin. */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
