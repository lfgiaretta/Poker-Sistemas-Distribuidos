import { INTERNAL_URL, PUBLIC_URL, REGISTER_INTERVAL_MS, REGISTRY_URL, RPC_TIMEOUT_MS } from "./config.js";
import type { PokerNode } from "./node.js";
import type { NodeInfo, RegistryReply } from "./protocol.js";

export class Discovery {
  peers = new Map<number, NodeInfo>();
  everSeen = new Map<number, NodeInfo>();
  registryOk = false;

  constructor(private node: PokerNode) {}

  me(): NodeInfo {
    return { id: this.node.id, internalUrl: INTERNAL_URL, publicUrl: PUBLIC_URL };
  }

  peerList(): NodeInfo[] {
    return [...this.peers.values()];
  }

  allNodes(): NodeInfo[] {
    return [this.me(), ...this.peers.values()].sort((a, b) => a.id - b.id);
  }

  knownNodes(): NodeInfo[] {
    return [this.me(), ...[...this.everSeen.values()].filter((n) => n.id !== this.node.id)].sort((a, b) => a.id - b.id);
  }

  async run() {
    for (;;) {
      await this.register();
      await sleep(REGISTER_INTERVAL_MS);
    }
  }

  async register() {
    let data: RegistryReply;
    try {
      const resp = await fetch(REGISTRY_URL + "/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(this.me()),
        signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
      });
      data = (await resp.json()) as RegistryReply;
    } catch {
      if (this.registryOk) this.node.record("Registro de serviços inacessível; usando lista em cache");
      this.registryOk = false;
      return;
    }

    if (!this.registryOk) this.node.record("Conectado ao registro de serviços");
    this.registryOk = true;

    const fresh = new Map(data.nodes.filter((n) => n.id !== this.node.id).map((n) => [n.id, n]));
    for (const id of fresh.keys()) if (!this.peers.has(id)) this.node.record(`Descobriu o nó ${id}`);
    for (const id of this.peers.keys()) if (!fresh.has(id)) this.node.record(`Nó ${id} saiu do registro`);
    this.peers = fresh;
    for (const n of fresh.values()) this.everSeen.set(n.id, n);
  }
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
