import express, { type Request, type Response } from "express";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PORT } from "./config.js";
import { PokerNode } from "./node.js";

const node = new PokerNode();
const app = express();
app.use(express.json({ limit: "2mb" }));

function internal(handler: (msg: any) => Promise<object>) {
  return async (req: Request, res: Response) => {
    node.clock.update(req.body?.lamport);
    try {
      const data = await handler(req.body);
      res.json({ ...data, lamport: node.clock.tick() });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: String(err), lamport: node.clock.tick() });
    }
  };
}

app.post("/internal/election", internal((m) => node.election.onElection(m)));
app.post("/internal/coordinator", internal((m) => node.election.onCoordinator(m)));
app.post("/internal/heartbeat", internal((m) => node.election.onHeartbeat(m)));
app.post("/internal/replicate", internal((m) => node.replication.onReplicate(m)));
app.post("/internal/vote", internal((m) => node.election.onVoteRequest(m)));
app.post("/internal/forward", internal((m) => node.onForward(m)));

app.get("/api/status", (_req, res) => {
  res.set("access-control-allow-origin", "*").json(node.status());
});

const here = path.dirname(fileURLToPath(import.meta.url));
const webDist =
  process.env.WEB_DIST ??
  [path.resolve(here, "../../web/dist"), path.resolve(here, "../../../web/dist")].find((p) => existsSync(p));
if (webDist && existsSync(webDist)) {
  const index = path.join(webDist, "index.html");
  app.use(express.static(webDist));
  app.get("/", (_req, res) => res.sendFile(index));

  app.get("/dashboard", (_req, res) => {
    res.set("cache-control", "no-store");
    if (node.election.isLeader) return res.sendFile(index);
    const leader = node.discovery.knownNodes().find((n) => n.id === node.election.leaderId);
    if (leader) return res.redirect(302, `${leader.publicUrl}/dashboard`);
    res.status(503).set("retry-after", "2").type("html").send(NO_LEADER_PAGE);
  });
} else {
  app.get("/", (_req, res) => res.send("Front-end não compilado. Rode: npm run build -w web"));
}

const NO_LEADER_PAGE = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta http-equiv="refresh" content="2">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Painel do cluster</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0f1412;color:#e8efe9;font-family:system-ui,sans-serif;text-align:center">
<div><h1 style="font-size:22px">♠ Painel do cluster</h1>
<p>O painel só é servido pelo nó líder, e agora não há líder (eleição em andamento).</p>
<p style="color:#8fa39a">Tentando de novo a cada 2 segundos…</p></div></body></html>`;

const server = createServer(app);
node.clients.attach(server);
server.listen(PORT, () => {
  console.log(`[nó ${node.id}] ouvindo na porta ${PORT}`);
  node.start();
});
