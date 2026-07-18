/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_WS_URL?: string;
  readonly VITE_USE_REMOTE_SERVER?: string;
  readonly VITE_ENABLE_REMOTE_SESSION?: string;
  readonly VITE_ENABLE_ECONOMY_SERVER?: string;
  readonly VITE_ENABLE_TRADE_SERVER?: string;
  readonly VITE_ENABLE_QUEST_SERVER?: string;
  readonly VITE_ENABLE_MONSTER_SERVER?: string;
  readonly VITE_ENABLE_PROGRESSION_SERVER?: string;
  readonly VITE_ENABLE_REALTIME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
