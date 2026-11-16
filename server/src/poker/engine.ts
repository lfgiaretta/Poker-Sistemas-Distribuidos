/**
 * Esqueleto: motor do Texas Hold'em.
 * Criado pelo Integrante 1 para o projeto compilar; o Integrante 2 implementa.
 */
export type Command = any;
export type CommandResult = any;

export class GameError extends Error {}

export function needsTick(..._args: unknown[]): boolean {
  return false;
}
