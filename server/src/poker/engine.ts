/**
 * Motor do Texas Hold'em No-Limit.
 *
 * O estado inteiro da mesa é um objeto "puro" (só tipos JSON). Isso é proposital:
 * o líder aplica comandos sobre ele e envia o objeto inteiro para as réplicas, que
 * só precisam guardar o que receberam. Nada aqui sabe que existe rede.
 *
 * Inclusive o baralho embaralhado fica no estado: se o líder cair no meio da mão,
 * o novo líder continua dando exatamente as mesmas cartas.
 *
 * Tempos são em milissegundos (epoch), como Date.now().
 */
import { type Card, type Random, newDeck } from "./cards.js";
import { bestHand, compareScores, describe, type Score } from "./evaluator.js";
import type { ActionKind, GameView, HandResult, LogEntry, MeView, PlayerView, TableView } from "../protocol.js";

export const SMALL_BLIND = 10;
export const BIG_BLIND = 20;
export const STARTING_STACK = 1000;
export const MAX_SEATS = 6;
const LOG_SIZE = 60;
export const ACTION_TIMEOUT_MS = Number(process.env.ACTION_TIMEOUT_MS ?? 30_000);
export const NEXT_HAND_DELAY_MS = Number(process.env.NEXT_HAND_DELAY_MS ?? 5_000);

export type Street = "preflop" | "flop" | "turn" | "river";
const NEXT_STREET: Record<string, Street> = { preflop: "flop", flop: "turn", turn: "river" };
const STREET_NAMES: Record<Street, string> = { preflop: "Pré-flop", flop: "Flop", turn: "Turn", river: "River" };

export interface Player {
  id: string;
  name: string;
  token: string; // segredo do jogador (para reconectar em qualquer nó); nunca vai para a interface
  seat: number;
  stack: number;
  leaving: boolean;
}

export interface Hand {
  number: number;
  dealer: string;
  order: string[]; // jogadores da mão, começando à esquerda do dealer (dealer é o último)
  deck: Card[];
  board: Card[];
  street: Street;
  hole: Record<string, Card[]>;
  folded: string[];
  bets: Record<string, number>; // apostado nesta rodada de apostas
  contrib: Record<string, number>; // apostado na mão inteira (para montar os potes)
  currentBet: number;
  minRaise: number;
  acted: string[];
  toAct: string | null;
  deadline: number | null;
}

export interface GameState {
  players: Record<string, Player>;
  nextPlayerId: number;
  hand: Hand | null;
  handCount: number;
  dealerSeat: number;
  nextHandAt: number | null;
  lastResult: HandResult | null;
  log: LogEntry[];
}

export type Command =
  | { type: "join"; name: string; token: string }
  | { type: "tick" }
  | { type: "action"; token: string; action: ActionKind; amount?: number }
  | { type: "rebuy"; token: string }
  | { type: "leave"; token: string };

export type CommandResult = { playerId?: string };

/** Jogada inválida. A mensagem é mostrada para o jogador. */
export class GameError extends Error {}

export function newState(): GameState {
  return {
    players: {},
    nextPlayerId: 1,
    hand: null,
    handCount: 0,
    dealerSeat: -1,
    nextHandAt: null,
    lastResult: null,
    log: [],
  };
}

// ============================================================================ comandos

/**
 * Aplica um comando ao estado (alterando-o) e devolve a resposta para quem pediu.
 * Lança GameError se o comando for inválido; nesse caso quem chamou descarta o estado.
 */
export function applyCommand(state: GameState, cmd: Command, now: number, random: Random): CommandResult {
  switch (cmd.type) {
    case "join":
      return join(state, cmd.name, cmd.token, now);
    case "tick":
      tick(state, now, random);
      return {};
    case "action": {
      const player = playerByToken(state, cmd.token);
      act(state, player.id, cmd.action, cmd.amount, now, random);
      return { playerId: player.id };
    }
    case "rebuy": {
      const player = playerByToken(state, cmd.token);
      rebuy(state, player, now);
      return { playerId: player.id };
    }
    case "leave": {
      const player = playerByToken(state, cmd.token);
      leave(state, player, now, random);
      return { playerId: player.id };
    }
    default:
      throw new GameError("Comando desconhecido.");
  }
}

/** O líder chama isto periodicamente: existe algo dependente do tempo para fazer? */
export function needsTick(state: GameState, now: number): boolean {
  const hand = state.hand;
  if (!hand) {
    if (state.nextHandAt === null) return eligible(state).length >= 2;
    return now >= state.nextHandAt;
  }
  return hand.deadline !== null && now >= hand.deadline;
}

function join(state: GameState, rawName: string, token: string, now: number): CommandResult {
  const name = String(rawName ?? "").trim().slice(0, 16);
  if (!name) throw new GameError("Informe um nome.");
  const taken = new Set(Object.values(state.players).map((p) => p.seat));
  const seat = [...Array(MAX_SEATS).keys()].find((s) => !taken.has(s));
  if (seat === undefined) throw new GameError("A mesa está cheia.");

  const id = `p${state.nextPlayerId++}`;
  state.players[id] = { id, name, token, seat, stack: STARTING_STACK, leaving: false };
  log(state, `${name} sentou na cadeira ${seat + 1}`);
  maybeSchedule(state, now);
  return { playerId: id };
}

function rebuy(state: GameState, player: Player, now: number) {
  const hand = state.hand;
  if (player.stack > 0) throw new GameError("Só dá para recomprar com zero fichas.");
  if (hand && hand.order.includes(player.id) && !hand.folded.includes(player.id)) {
    throw new GameError("Espere a mão acabar.");
  }
  player.stack = STARTING_STACK;
  log(state, `${player.name} recomprou ${STARTING_STACK} fichas`);
  maybeSchedule(state, now);
}

function leave(state: GameState, player: Player, now: number, random: Random) {
  const hand = state.hand;
  if (!hand || !hand.order.includes(player.id)) {
    delete state.players[player.id];
    log(state, `${player.name} saiu da mesa`);
    return;
  }
  // Ainda é referenciado pela mão atual: será removido quando ela acabar.
  player.leaving = true;
  if (hand.folded.includes(player.id)) return;
  if (hand.toAct === player.id) {
    act(state, player.id, "fold", 0, now, random);
    return;
  }
  hand.folded.push(player.id);
  log(state, `${player.name} desistiu`);
  const remaining = active(hand);
  if (remaining.length === 1) winUncontested(state, remaining[0], now);
}

function tick(state: GameState, now: number, random: Random) {
  const hand = state.hand;
  if (!hand) {
    if (state.nextHandAt === null) maybeSchedule(state, now);
    else if (now >= state.nextHandAt) startHand(state, now, random);
    return;
  }
  if (hand.deadline !== null && now >= hand.deadline && hand.toAct) {
    const pid = hand.toAct;
    const action = hand.bets[pid] >= hand.currentBet ? "check" : "fold";
    log(state, `${state.players[pid].name} estourou o tempo`);
    act(state, pid, action, 0, now, random);
  }
}

// ============================================================================ a mão

function startHand(state: GameState, now: number, random: Random) {
  const seated = eligible(state);
  state.nextHandAt = null;
  if (seated.length < 2) return;

  // O botão de dealer anda para a próxima cadeira ocupada.
  const dealer = seated.find((p) => p.seat > state.dealerSeat) ?? seated[0];
  state.dealerSeat = dealer.seat;
  const i = seated.indexOf(dealer);
  const order = [...seated.slice(i + 1), ...seated.slice(0, i + 1)].map((p) => p.id);

  const deck = newDeck(random);
  const hole: Record<string, Card[]> = {};
  const zeros: Record<string, number> = {};
  for (const pid of order) {
    hole[pid] = [deck.pop()!, deck.pop()!];
    zeros[pid] = 0;
  }

  const hand: Hand = {
    number: ++state.handCount,
    dealer: dealer.id,
    order,
    deck,
    board: [],
    street: "preflop",
    hole,
    folded: [],
    bets: { ...zeros },
    contrib: { ...zeros },
    currentBet: 0,
    minRaise: BIG_BLIND,
    acted: [],
    toAct: null,
    deadline: null,
  };
  state.hand = hand;
  state.lastResult = null;

  // Heads-up (2 jogadores): o dealer paga o small blind e age primeiro no pré-flop.
  const [sb, bb] = order.length === 2 ? [order[1], order[0]] : [order[0], order[1]];
  put(state, sb, SMALL_BLIND);
  put(state, bb, BIG_BLIND);
  hand.currentBet = Math.max(...Object.values(hand.bets));

  const name = (pid: string) => state.players[pid].name;
  log(state, `Mão #${hand.number} — dealer ${dealer.name}, blinds ${name(sb)} ${SMALL_BLIND} / ${name(bb)} ${BIG_BLIND}`);
  continueHand(state, bb, now);
}

function act(state: GameState, pid: string, action: ActionKind, amount: number | undefined, now: number, random: Random) {
  const hand = state.hand;
  if (!hand) throw new GameError("Nenhuma mão em andamento.");
  if (hand.toAct !== pid) throw new GameError("Não é a sua vez.");

  const player = state.players[pid];
  const toCall = hand.currentBet - hand.bets[pid];
  const allInTag = () => (player.stack === 0 ? " (all-in)" : "");

  switch (action) {
    case "fold":
      hand.folded.push(pid);
      log(state, `${player.name} desistiu`);
      break;
    case "check":
      if (toCall > 0) throw new GameError(`Há ${toCall} para pagar; não dá para dar check.`);
      log(state, `${player.name} deu check`);
      break;
    case "call": {
      if (toCall <= 0) throw new GameError("Não há aposta para pagar; use check.");
      const paid = put(state, pid, toCall);
      log(state, `${player.name} pagou ${paid}${allInTag()}`);
      break;
    }
    case "raise":
    case "allin": {
      const maxTotal = hand.bets[pid] + player.stack;
      const target = action === "allin" ? maxTotal : Math.floor(Number(amount));
      if (!Number.isFinite(target)) throw new GameError("Valor de aumento inválido.");
      if (target > maxTotal) throw new GameError("Fichas insuficientes.");
      if (target <= hand.currentBet) {
        if (action !== "allin") throw new GameError("O aumento precisa ser maior que a aposta atual.");
        // All-in que nem cobre a aposta: equivale a pagar o que tem.
        put(state, pid, target - hand.bets[pid]);
        log(state, `${player.name} foi all-in com ${target}`);
        break;
      }
      const raiseBy = target - hand.currentBet;
      if (raiseBy < hand.minRaise && target < maxTotal) {
        throw new GameError(`O aumento mínimo é para ${hand.currentBet + hand.minRaise}.`);
      }
      const verb = hand.currentBet === 0 ? "apostou" : "aumentou para";
      hand.minRaise = Math.max(hand.minRaise, raiseBy);
      hand.currentBet = target;
      hand.acted = []; // um aumento reabre a ação para todos
      put(state, pid, target - hand.bets[pid]);
      log(state, `${player.name} ${verb} ${target}${allInTag()}`);
      break;
    }
    default:
      throw new GameError("Ação inválida.");
  }

  if (!hand.acted.includes(pid)) hand.acted.push(pid);
  continueHand(state, pid, now);
}

/** Passa a vez; se a rodada de apostas acabou, abre a próxima carta. */
function continueHand(state: GameState, afterPid: string, now: number) {
  const hand = state.hand!;
  const remaining = active(hand);
  if (remaining.length === 1) {
    winUncontested(state, remaining[0], now);
    return;
  }
  const next = nextActor(state, afterPid);
  if (next) {
    hand.toAct = next;
    hand.deadline = now + ACTION_TIMEOUT_MS;
    return;
  }
  nextStreet(state, now);
}

function nextStreet(state: GameState, now: number) {
  const hand = state.hand!;
  for (;;) {
    for (const pid of hand.order) hand.bets[pid] = 0;
    hand.currentBet = 0;
    hand.minRaise = BIG_BLIND;
    hand.acted = [];
    hand.toAct = null;
    hand.deadline = null;

    if (hand.street === "river") {
      showdown(state, now);
      return;
    }

    hand.deck.pop(); // carta queimada
    const count = hand.street === "preflop" ? 3 : 1;
    for (let i = 0; i < count; i++) hand.board.push(hand.deck.pop()!);
    hand.street = NEXT_STREET[hand.street];
    log(state, `${STREET_NAMES[hand.street]}: ${hand.board.join(" ")}`);

    // Se só um (ou nenhum) jogador ainda pode apostar, abrimos as cartas até o river.
    if (hand.order.filter((pid) => canAct(state, pid)).length >= 2) {
      hand.toAct = nextActor(state, hand.dealer);
      hand.deadline = now + ACTION_TIMEOUT_MS;
      return;
    }
  }
}

function showdown(state: GameState, now: number) {
  const hand = state.hand!;
  const remaining = active(hand);
  const scores: Record<string, { score: Score; cards: Card[] }> = {};
  for (const pid of remaining) scores[pid] = bestHand([...hand.hole[pid], ...hand.board]);

  const winnings: Record<string, number> = {};
  for (const pot of buildPots(hand.contrib, remaining)) {
    const best = pot.eligible.map((pid) => scores[pid].score).reduce((a, b) => (compareScores(a, b) >= 0 ? a : b));
    const winners = hand.order.filter((pid) => pot.eligible.includes(pid) && compareScores(scores[pid].score, best) === 0);
    const share = Math.floor(pot.amount / winners.length);
    const rest = pot.amount % winners.length;
    winners.forEach((pid, i) => {
      winnings[pid] = (winnings[pid] ?? 0) + share + (i < rest ? 1 : 0);
    });
  }

  for (const [pid, amount] of Object.entries(winnings)) state.players[pid].stack += amount;

  state.lastResult = {
    hand: hand.number,
    board: hand.board,
    winners: Object.entries(winnings).map(([pid, amount]) => ({
      id: pid,
      name: state.players[pid].name,
      amount,
      handName: describe(scores[pid].score),
    })),
    showdown: remaining.map((pid) => ({
      id: pid,
      name: state.players[pid].name,
      cards: hand.hole[pid],
      handName: describe(scores[pid].score),
      best: scores[pid].cards,
    })),
  };
  for (const [pid, amount] of Object.entries(winnings)) {
    log(state, `${state.players[pid].name} ganhou ${amount} com ${describe(scores[pid].score)}`);
  }
  finishHand(state, now);
}

/**
 * Divide o que foi apostado em pote principal + potes laterais.
 *
 * Cada nível de contribuição de um jogador ainda na mão (normalmente um all-in)
 * fecha um pote; só concorre a ele quem contribuiu pelo menos aquele nível.
 */
export function buildPots(contrib: Record<string, number>, remaining: string[]) {
  const levels = [...new Set(remaining.map((pid) => contrib[pid]).filter((c) => c > 0))].sort((a, b) => a - b);
  const pots: { amount: number; eligible: string[] }[] = [];
  let prev = 0;
  for (const level of levels) {
    const amount = Object.values(contrib).reduce((sum, c) => sum + Math.min(c, level) - Math.min(c, prev), 0);
    if (amount > 0) pots.push({ amount, eligible: remaining.filter((pid) => contrib[pid] >= level) });
    prev = level;
  }
  const total = Object.values(contrib).reduce((a, b) => a + b, 0);
  const leftover = total - pots.reduce((sum, p) => sum + p.amount, 0);
  if (leftover > 0) {
    if (pots.length) pots[pots.length - 1].amount += leftover;
    else pots.push({ amount: leftover, eligible: [...remaining] });
  }
  return pots;
}

function winUncontested(state: GameState, pid: string, now: number) {
  const hand = state.hand!;
  const pot = Object.values(hand.contrib).reduce((a, b) => a + b, 0);
  const player = state.players[pid];
  player.stack += pot;
  state.lastResult = {
    hand: hand.number,
    board: hand.board,
    showdown: [],
    winners: [{ id: pid, name: player.name, amount: pot, handName: null }],
  };
  log(state, `${player.name} levou ${pot} (os outros desistiram)`);
  finishHand(state, now);
}

function finishHand(state: GameState, now: number) {
  state.hand = null;
  for (const p of Object.values(state.players)) {
    if (p.leaving) {
      log(state, `${p.name} saiu da mesa`);
      delete state.players[p.id];
    }
  }
  state.nextHandAt = eligible(state).length >= 2 ? now + NEXT_HAND_DELAY_MS : null;
}

// ============================================================================ auxiliares

/** Move fichas do jogador para a mesa (limitado ao que ele tem). Retorna o valor movido. */
function put(state: GameState, pid: string, amount: number): number {
  const player = state.players[pid];
  const hand = state.hand!;
  const moved = Math.min(amount, player.stack);
  player.stack -= moved;
  hand.bets[pid] += moved;
  hand.contrib[pid] += moved;
  return moved;
}

function active(hand: Hand): string[] {
  return hand.order.filter((pid) => !hand.folded.includes(pid));
}

function canAct(state: GameState, pid: string): boolean {
  return !state.hand!.folded.includes(pid) && state.players[pid].stack > 0;
}

/** Próximo jogador (sentido horário) que ainda precisa agir nesta rodada de apostas. */
function nextActor(state: GameState, afterPid: string): string | null {
  const hand = state.hand!;
  const idx = hand.order.indexOf(afterPid);
  for (let k = 1; k <= hand.order.length; k++) {
    const pid = hand.order[(idx + k) % hand.order.length];
    if (canAct(state, pid) && (!hand.acted.includes(pid) || hand.bets[pid] < hand.currentBet)) return pid;
  }
  return null;
}

/** Jogadores que podem entrar na próxima mão, ordenados por cadeira. */
function eligible(state: GameState): Player[] {
  return Object.values(state.players)
    .filter((p) => p.stack > 0 && !p.leaving)
    .sort((a, b) => a.seat - b.seat);
}

function maybeSchedule(state: GameState, now: number) {
  if (!state.hand && state.nextHandAt === null && eligible(state).length >= 2) {
    state.nextHandAt = now + NEXT_HAND_DELAY_MS;
  }
}

function playerByToken(state: GameState, token: string): Player {
  const player = Object.values(state.players).find((p) => token && p.token === token);
  if (!player) throw new GameError("Sessão inválida. Entre na mesa novamente.");
  return player;
}

function log(state: GameState, text: string) {
  state.log.push({ text });
  if (state.log.length > LOG_SIZE) state.log.splice(0, state.log.length - LOG_SIZE);
}

// ============================================================================ visão do jogador

/** O que um jogador pode ver: sem tokens, sem baralho e sem as cartas dos outros. */
export function viewFor(state: GameState, viewerId: string | null): GameView {
  const hand = state.hand;
  const players: PlayerView[] = Object.values(state.players)
    .sort((a, b) => a.seat - b.seat)
    .map((p) => {
      const inHand = !!hand && hand.order.includes(p.id);
      const folded = inHand && hand!.folded.includes(p.id);
      let cards: Card[] = [];
      if (inHand && p.id === viewerId) cards = hand!.hole[p.id];
      else if (inHand && !folded) cards = ["??", "??"];
      return {
        id: p.id,
        name: p.name,
        seat: p.seat,
        stack: p.stack,
        leaving: p.leaving,
        inHand,
        folded,
        bet: inHand ? hand!.bets[p.id] : 0,
        allIn: inHand && !folded && p.stack === 0,
        isDealer: inHand && hand!.dealer === p.id,
        cards,
      };
    });

  const table: TableView | null = hand && {
    number: hand.number,
    street: hand.street,
    board: hand.board,
    pot: Object.values(hand.contrib).reduce((a, b) => a + b, 0),
    currentBet: hand.currentBet,
    toAct: hand.toAct,
    deadline: hand.deadline,
  };

  let me: MeView | null = null;
  const p = viewerId ? state.players[viewerId] : undefined;
  if (p) {
    const inHand = !!hand && hand.order.includes(p.id) && !hand.folded.includes(p.id);
    me = { id: p.id, name: p.name, stack: p.stack, canRebuy: p.stack === 0 && !inHand, turn: null };
    if (hand && hand.toAct === p.id) {
      const bet = hand.bets[p.id];
      const toCall = hand.currentBet - bet;
      const maxTo = bet + p.stack;
      me.turn = {
        toCall: Math.min(Math.max(toCall, 0), p.stack),
        canCheck: toCall <= 0,
        canRaise: maxTo > hand.currentBet,
        minRaiseTo: Math.min(hand.currentBet + hand.minRaise, maxTo),
        maxRaiseTo: maxTo,
      };
    }
  }

  return {
    players,
    table,
    me,
    lastResult: state.lastResult,
    nextHandAt: state.nextHandAt,
    log: state.log.slice(-30),
    blinds: [SMALL_BLIND, BIG_BLIND],
  };
}
