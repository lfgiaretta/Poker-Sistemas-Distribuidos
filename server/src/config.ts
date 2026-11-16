import os from "node:os";

const env = (name: string, fallback: string) => process.env[name] ?? fallback;
const num = (name: string, fallback: number) => Number(process.env[name] ?? fallback);

export const NODE_ID = num("NODE_ID", 1);
export const PORT = num("PORT", 8000);

function ownAddress(): string {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const iface of list ?? []) {
      if (iface.family === "IPv4" && !iface.internal) return `http://${iface.address}:${PORT}`;
    }
  }
  return `http://127.0.0.1:${PORT}`;
}

export const INTERNAL_URL = process.env.INTERNAL_URL || ownAddress();
export const PUBLIC_URL = env("PUBLIC_URL", `http://localhost:${PORT}`);
export const REGISTRY_URL = env("REGISTRY_URL", "http://registry:7000");

export const CLUSTER_SIZE = num("CLUSTER_SIZE", 3);
export const WRITE_QUORUM = num("WRITE_QUORUM", Math.floor(CLUSTER_SIZE / 2) + 1);

export const REGISTER_INTERVAL_MS = num("REGISTER_INTERVAL_MS", 2000);
export const HEARTBEAT_INTERVAL_MS = num("HEARTBEAT_INTERVAL_MS", 1000);
export const HEARTBEAT_TIMEOUT_MS = num("HEARTBEAT_TIMEOUT_MS", 3500);
export const COORDINATOR_WAIT_MS = num("COORDINATOR_WAIT_MS", 4000);
export const RPC_TIMEOUT_MS = num("RPC_TIMEOUT_MS", 1000);
export const STARTUP_DELAY_MS = num("STARTUP_DELAY_MS", 2000);
