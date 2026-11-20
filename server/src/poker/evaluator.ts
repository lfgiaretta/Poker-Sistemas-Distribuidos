/**
 * Avaliador de mãos de poker.
 *
 * Cada mão de 5 cartas vira um "score": [categoria, desempates...].
 * Comparando os arrays posição por posição sabemos quem ganha.
 * Para 7 cartas (2 do jogador + 5 da mesa) testamos as 21 combinações de 5.
 */
import { type Card, rankValue } from "./cards.js";

export type Score = number[];

export const CATEGORY_NAMES = [
  "Carta alta",
  "Um par",
  "Dois pares",
  "Trinca",
  "Sequência",
  "Flush",
  "Full house",
  "Quadra",
  "Straight flush",
];

export function compareScores(a: Score, b: Score): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function score5(cards: Card[]): Score {
  const values = cards.map(rankValue).sort((a, b) => b - a);
  const flush = new Set(cards.map((c) => c[1])).size === 1;

  const unique = [...new Set(values)];
  let straightHigh = 0;
  if (unique.length === 5) {
    if (unique[0] - unique[4] === 4) straightHigh = unique[0];
    else if (unique.join() === "14,5,4,3,2") straightHigh = 5; // A-2-3-4-5: o ás vale 1
  }

  // Agrupa por quantidade e depois por valor, do grupo mais forte ao mais fraco.
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const shape = groups.map(([, count]) => count).join("");
  const ordered = groups.map(([value]) => value);

  if (straightHigh && flush) return [8, straightHigh];
  if (shape === "41") return [7, ...ordered];
  if (shape === "32") return [6, ...ordered];
  if (flush) return [5, ...values];
  if (straightHigh) return [4, straightHigh];
  if (shape === "311") return [3, ...ordered];
  if (shape === "221") return [2, ...ordered];
  if (shape === "2111") return [1, ...ordered];
  return [0, ...values];
}

function* combinations<T>(items: T[], k: number, start = 0, picked: T[] = []): Generator<T[]> {
  if (picked.length === k) {
    yield picked;
    return;
  }
  for (let i = start; i < items.length; i++) yield* combinations(items, k, i + 1, [...picked, items[i]]);
}

/** Melhor mão de 5 cartas dentre as recebidas. */
export function bestHand(cards: Card[]): { score: Score; cards: Card[] } {
  let best: { score: Score; cards: Card[] } | null = null;
  for (const combo of combinations(cards, 5)) {
    const score = score5(combo);
    if (!best || compareScores(score, best.score) > 0) best = { score, cards: combo };
  }
  return best!;
}

export function describe(score: Score): string {
  return CATEGORY_NAMES[score[0]];
}
