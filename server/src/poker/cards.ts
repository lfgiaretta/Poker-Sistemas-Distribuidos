/**
 * Cartas são strings de 2 caracteres: rank + naipe (ex.: "As", "Td", "9h").
 * Naipes: s = espadas, h = copas, d = ouros, c = paus.
 */
export type Card = string;

export const RANKS = "23456789TJQKA";
export const SUITS = "shdc";

/** Gerador de números em [0, 1). No líder usamos crypto; nos testes, um gerador com semente. */
export type Random = () => number;

/** Baralho completo (52 cartas) embaralhado com Fisher-Yates. */
export function newDeck(random: Random): Card[] {
  const deck: Card[] = [];
  for (const r of RANKS) for (const s of SUITS) deck.push(r + s);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/** Valor numérico do rank: 2..14 (ás = 14). */
export function rankValue(card: Card): number {
  return RANKS.indexOf(card[0]) + 2;
}
