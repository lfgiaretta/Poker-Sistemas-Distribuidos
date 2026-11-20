import { useEffect, useState } from "react";
import type { ClientMessage, GameView } from "../types";
import { barClass, Button, inputClass } from "./ui";

export default function ActionBar({ view, send }: { view: GameView; send: (msg: ClientMessage) => void }) {
  const me = view.me!;
  const turn = me.turn;
  const [amount, setAmount] = useState(turn?.minRaiseTo ?? 0);

  // Sempre que vira a nossa vez, sugere o aumento mínimo.
  useEffect(() => {
    if (turn) setAmount(turn.minRaiseTo);
  }, [turn?.minRaiseTo, turn?.maxRaiseTo]);

  const act = (action: "fold" | "check" | "call" | "raise" | "allin", value?: number) =>
    send({ type: "action", action, amount: value });

  return (
    <div className={barClass}>
      <div>
        <strong>{me.name}</strong> · {me.stack} fichas
      </div>

      {turn ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="fold" onClick={() => act("fold")}>
            Desistir
          </Button>
          {turn.canCheck ? (
            <Button onClick={() => act("check")}>Check</Button>
          ) : (
            <Button onClick={() => act("call")}>Pagar {turn.toCall}</Button>
          )}
          {turn.canRaise && turn.minRaiseTo < turn.maxRaiseTo && (
            <span className="inline-flex items-center gap-1.5">
              <input
                type="range"
                className="accent-gold"
                min={turn.minRaiseTo}
                max={turn.maxRaiseTo}
                step={10}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
              />
              <input
                type="number"
                className={`${inputClass} w-[90px]`}
                min={turn.minRaiseTo}
                max={turn.maxRaiseTo}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
              />
              <Button onClick={() => act("raise", amount)}>
                {view.table?.currentBet ? "Aumentar para" : "Apostar"} {amount}
              </Button>
            </span>
          )}
          {turn.canRaise && (
            <Button variant="allin" onClick={() => act("allin")}>
              All-in ({turn.maxRaiseTo})
            </Button>
          )}
        </div>
      ) : (
        <div className="text-muted">{view.table ? "Aguardando a sua vez…" : "Aguardando a próxima mão…"}</div>
      )}

      <div className="ml-auto flex gap-2">
        {me.canRebuy && <Button onClick={() => send({ type: "rebuy" })}>Recomprar</Button>}
        <Button variant="ghost" onClick={() => send({ type: "leave" })}>
          Sair da mesa
        </Button>
      </div>
    </div>
  );
}
