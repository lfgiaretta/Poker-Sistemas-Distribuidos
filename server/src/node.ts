import { ClientHub } from "./clients.js";
import { CLUSTER_SIZE, NODE_ID, WRITE_QUORUM } from "./config.js";
import { Discovery, sleep } from "./discovery.js";
import { Election } from "./election.js";
import { LamportClock } from "./lamport.js";
import { type Command, type CommandResult, GameError, needsTick } from "./poker/engine.js";
import type { ClusterInfo, Envelope, ForwardMsg, ForwardReply, NodeEvent, NodeStatus } from "./protocol.js";
import { Replication, Unavailable } from "./replication.js";
import { Rpc } from "./rpc.js";

const MAX_EVENTS = 40;

export class PokerNode {
  readonly id = NODE_ID;
  readonly clock = new LamportClock();
  readonly events: NodeEvent[] = [];
  readonly rpc = new Rpc(this);
  readonly discovery = new Discovery(this);
  readonly election = new Election(this);
  readonly replication = new Replication(this);
  readonly clients = new ClientHub(this);

  start() {
    this.record(`Nó ${this.id} iniciado`);
    void this.discovery.run();
    void this.election.run();
    void this.gameLoop();
  }

  record(text: string) {
    const event = { lamport: this.clock.time, time: Date.now(), text };
    this.events.push(event);
    if (this.events.length > MAX_EVENTS) this.events.shift();
    console.log(`[nó ${this.id}] L=${event.lamport} ${text}`);
  }

  async submit(cmd: Command): Promise<CommandResult> {
    if (this.election.isLeader) return this.replication.commit(cmd);

    const leaderId = this.election.leaderId;
    const leader = leaderId === null ? undefined : this.discovery.peers.get(leaderId);
    if (!leader) throw new Unavailable("Sem líder no momento (eleição em andamento). Tente de novo em instantes.");

    const reply = await this.rpc.call<ForwardReply>(leader.internalUrl, "/internal/forward", { cmd }, 4000);
    if (!reply) throw new Unavailable(`O líder (nó ${leaderId}) não respondeu. Tente de novo.`);
    if ("error" in reply) throw reply.kind === "game" ? new GameError(reply.error) : new Unavailable(reply.error);
    return reply.result;
  }

  async onForward(msg: Envelope & ForwardMsg): Promise<ForwardReply> {
    try {
      if (!this.election.isLeader) throw new Unavailable("Este nó não é o líder.");
      return { result: await this.replication.commit(msg.cmd) };
    } catch (err) {
      if (err instanceof GameError) return { error: err.message, kind: "game" };
      if (err instanceof Unavailable) return { error: err.message, kind: "unavailable" };
      throw err;
    }
  }

  private async gameLoop() {
    for (;;) {
      await sleep(500);
      if (this.election.isLeader && needsTick(this.replication.state, Date.now())) {
        try {
          await this.replication.commit({ type: "tick" });
        } catch (err) {
          if (!(err instanceof GameError || err instanceof Unavailable)) console.error(err);
        }
      }
    }
  }

  isReady() {
    return this.election.leaderId !== null && (this.election.isLeader || this.replication.seq > 0);
  }

  clusterInfo(): ClusterInfo {
    return {
      nodeId: this.id,
      leaderId: this.election.leaderId,
      term: this.election.term,
      lamport: this.clock.time,
      seq: this.replication.seq,
      role: this.election.role,
      nodes: this.discovery.allNodes(),
    };
  }

  status(): NodeStatus {
    const state = this.replication.state;
    return {
      ...this.clusterInfo(),
      knownNodes: this.discovery.knownNodes(),
      electing: this.election.electing,
      registryOk: this.discovery.registryOk,
      clusterSize: CLUSTER_SIZE,
      writeQuorum: WRITE_QUORUM,
      players: Object.keys(state.players).length,
      handCount: state.handCount,
      clients: this.clients.count,
      events: this.events.slice(-15),
    };
  }
}
