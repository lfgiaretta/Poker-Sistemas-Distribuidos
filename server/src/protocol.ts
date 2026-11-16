export interface NodeInfo {
  id: number;
  internalUrl: string;
  publicUrl: string;
}

export interface RegistryReply {
  nodes: NodeInfo[];
  ttlMs: number;
}

export type Envelope = any;
export type ClusterInfo = any;
export type NodeEvent = any;
export type NodeStatus = any;
export type ForwardMsg = any;
export type ForwardReply = any;
