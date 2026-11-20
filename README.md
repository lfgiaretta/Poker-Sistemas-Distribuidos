# Poker Distribuído

Texas Hold'em No-Limit jogado no navegador, mantido por um cluster de 6 nós em Docker.
Trabalho Final de Sistemas Distribuídos 2026 — tema "jogo de cartas distribuído".

| Requisito do enunciado | Como foi atendido |
|---|---|
| 3+ nós em contêineres | `registry` + `node1` a `node6` no Docker Compose |
| Comunicação com protocolo documentado | HTTP/JSON entre nós, WebSocket com navegadores — [docs/PROTOCOLO.md](docs/PROTOCOLO.md) |
| Descoberta de serviços | Registro com TTL; cada nó descobre o próprio IP e se anuncia |
| Eleição com heartbeat | Bully + heartbeat de 1 s (timeout 3,5 s) + termos + votos de uma maioria antes de assumir |
| Coordenação/ordenação | Relógio de Lamport em todas as mensagens + líder sequenciador com exclusão mútua |
| Falha ao vivo | Derrubar qualquer nó (inclusive o líder) — o jogo continua com o mesmo estado |
| Extra: observabilidade | Painel em `/dashboard`, servido só pelo líder, com papel, termo, Lamport, seq e eventos de cada nó |
| Extra (parcial): quórum configurável | Só o de escrita, `WRITE_QUORUM` (padrão: maioria), que permite comparar CP e AP. O enunciado pede também quórum de leitura |

Arquitetura, algoritmos, análise CAP e roteiro da demonstração: [docs/ARQUITETURA.md](docs/ARQUITETURA.md).

## Subir com Docker

Pré-requisito: Docker Desktop aberto.

```bash
docker compose up --build
```

- Mesa: <http://localhost:8001> até <http://localhost:8006> (qualquer nó serve)
- Painel do cluster: <http://localhost:8001/dashboard>. Só o líder serve o painel: abrindo por um seguidor, o navegador
  é redirecionado para o líder, e se o líder cair o painel aberto vai sozinho para o novo líder.

Para ter dois jogadores no mesmo computador, use duas janelas diferentes (ou uma anônima). Cada aba é um jogador.
A mão começa sozinha quando há 2 ou mais jogadores sentados.

Bots para completar a mesa (precisa de Node 20+ e `npm install` na raiz):

```bash
npm run bot -- --url http://localhost:8002 --count 2 --name Robo
```

### Jogar de outros computadores da mesma rede

1. Descubra o IP desta máquina na rede (`ipconfig` no Windows, `ip addr` no Linux).
2. Copie `.env.example` para `.env` e coloque esse IP em `PUBLIC_HOST`.
3. Suba (ou recrie) o cluster com `docker compose up -d`.
4. Nos outros aparelhos, abra `http://IP:8001` (ou 8002 a 8006). O painel fica em `http://IP:8001/dashboard`.

`PUBLIC_HOST` é o endereço que cada nó anuncia aos navegadores. Sem ele os nós anunciam `localhost`, e quem
está em outra máquina consegue jogar, mas não consegue trocar de nó quando o dele cai, nem abrir o painel.
Se a página não abrir no outro aparelho, libere o Docker no firewall desta máquina. Redes que isolam os
aparelhos entre si (comum em Wi-Fi público) também impedem o acesso: nesse caso use o roteador de um celular.

### Simulando falhas

```bash
docker compose kill node6
```

```bash
docker compose start node6
```

```bash
docker compose pause node2
```

```bash
docker compose unpause node2
```

```bash
docker compose kill node4 node5 node6
```

O primeiro derruba o líder (o nó 5 assume em ~4 s). O segundo religa o nó 6: ele sincroniza e volta a liderar.
`pause`/`unpause` simulam um nó travado. O último deixa só 3 de 6 nós: sem a maioria (4 votos) ninguém vira
líder e as jogadas são recusadas até um dos nós voltar.

Partição de rede (isola o nó 6 da rede do Compose sem desligá-lo, e depois religa):

```bash
docker network disconnect trabpoker_default trabpoker-node6-1
```

```bash
docker network connect trabpoker_default trabpoker-node6-1
```

Durante a partição, os outros 5 nós elegem o nó 5 e seguem jogando. O nó 6 isolado não aceita jogadas e, como
era o líder, deixa a liderança em ~4 s por não receber resposta de um quórum.
Ao religar, o nó 6 se atualiza com o estado da maioria e volta a liderar, sem perder jogadas.
O nome da rede e do contêiner vem da pasta do projeto: confira com `docker network ls` e `docker compose ps`.
Enquanto estiver isolado, o nó 6 também não responde em `localhost:8006`.

## Rodar sem Docker (desenvolvimento)

Requer Node 20+.

```bash
npm install
```

```bash
npm run build
```

```bash
npm run dev:cluster
```

Sobe o registro (7000) e os 6 nós em 8001–8006 como processos locais (`-- --nodes 3` para menos). No mesmo terminal dá para digitar
`kill 3`, `start 3` e `quit`.

Para mexer no front com recarga automática, deixe o cluster rodando e use `npm run dev:web` (abre em <http://localhost:5173>).

## Testes

```bash
npm run test:failover
```

É um teste de ponta a ponta: sobe um cluster próprio de 3 nós (em outras portas), coloca 2 bots jogando, derruba o líder,
confere que nada se perdeu e que o jogo continuou, religa o nó e testa a falta de quórum: o líder sozinho
deixa a liderança e recusa jogadas (~30 s).
A partição de rede é testada no Docker, com os comandos da seção anterior.

## Estrutura

```
server/
  src/
    main.ts          nó: rotas HTTP internas, /api/status, WebSocket, serve o front
    registry.ts      registro de serviços
    config.ts        configuração via variáveis de ambiente
    discovery.ts     registro periódico + lista de pares
    election.ts      Bully + heartbeat + termos
    replication.ts   líder aplica, replica e espera quórum; seguidores aplicam snapshots
    lamport.ts       relógio de Lamport
    mutex.ts         exclusão mútua para código assíncrono
    rpc.ts           chamadas HTTP entre nós (com Lamport e timeout)
    clients.ts       WebSocket com os navegadores
    node.ts          junta tudo; encaminha jogadas ao líder
    protocol.ts      tipos de todas as mensagens (usado também pelo front)
    poker/           regras do jogo (puro, sem rede): cartas, avaliador de mãos, motor
  scripts/           cluster local, bots e teste de failover
web/                 front-end React + Tailwind (mesa + painel)
docs/                protocolo e arquitetura
```

## Variáveis de ambiente do nó

| Variável | Padrão | Descrição |
|---|---|---|
| `NODE_ID` | 1 | id do nó (o Bully elege o maior) |
| `PORT` | 8000 | porta HTTP/WebSocket |
| `REGISTRY_URL` | `http://registry:7000` | endereço do registro |
| `PUBLIC_URL` | `http://localhost:PORT` | endereço que o navegador usa para chegar neste nó |
| `INTERNAL_URL` | IP do contêiner | endereço que os outros nós usam |
| `CLUSTER_SIZE` | 3 (6 no Compose) | tamanho do cluster; precisa bater com o número de nós |
| `WRITE_QUORUM` | maioria (4 de 6) | confirmações necessárias para efetivar uma jogada e votos para virar líder |
| `HEARTBEAT_INTERVAL_MS` / `HEARTBEAT_TIMEOUT_MS` | 1000 / 3500 | detecção de falha |
| `ACTION_TIMEOUT_MS` | 30000 | tempo para cada jogada |
| `NEXT_HAND_DELAY_MS` | 5000 | pausa entre mãos |
