import express from "express";
import type { NodeInfo, RegistryReply } from "./protocol.js";

const TTL_MS = Number(process.env.REGISTRY_TTL_MS ?? 6000);
const PORT = Number(process.env.PORT ?? 7000);

const nodes = new Map<number, NodeInfo & { lastSeen: number }>();

function alive(): RegistryReply {
  const now = Date.now();
  for (const [id, n] of nodes) {
    if (now - n.lastSeen > TTL_MS) {
      console.log(`[registro] nó ${id} expirou (sem renovação há ${TTL_MS} ms)`);
      nodes.delete(id);
    }
  }
  const list = [...nodes.values()]
    .sort((a, b) => a.id - b.id)
    .map(({ id, internalUrl, publicUrl }) => ({ id, internalUrl, publicUrl }));
  return { nodes: list, ttlMs: TTL_MS };
}

const app = express();
app.use(express.json());

app.post("/register", (req, res) => {
  const info = req.body as NodeInfo;
  const id = Number(info.id);
  if (!nodes.has(id)) console.log(`[registro] nó ${id} registrado em ${info.internalUrl}`);
  nodes.set(id, { id, internalUrl: info.internalUrl, publicUrl: info.publicUrl, lastSeen: Date.now() });
  res.json(alive());
});

app.get(["/", "/nodes"], (_req, res) => {
  res.set("access-control-allow-origin", "*").json(alive());
});

app.listen(PORT, () => console.log(`[registro] ouvindo na porta ${PORT}`));
