import type { HandResult } from "../types";
import CardView from "./CardView";
import { Panel } from "./ui";

export default function ResultPanel({ result, nextHandAt, now }: { result: HandResult | null; nextHandAt: number | null; now: number }) {
  if (!result) return null;
  return (
    <Panel title={`Resultado da mão #${result.hand}`}>
      {result.winners.map((w) => (
        <div key={w.id} className="mb-1">
          🏆 <strong>{w.name}</strong> ganhou {w.amount}
          {w.handName && ` com ${w.handName}`}
        </div>
      ))}
      {result.showdown.map((s) => (
        <div key={s.id} className="my-1.5 flex items-center gap-2 text-[13px]">
          <span>{s.name}</span>
          <span className="flex gap-0.5">
            {s.cards.map((c) => (
              <CardView key={c} card={c} small />
            ))}
          </span>
          <span className="text-muted">{s.handName}</span>
        </div>
      ))}
      {nextHandAt && (
        <div className="text-muted">Próxima mão em {Math.max(0, Math.ceil((nextHandAt - now) / 1000))}s</div>
      )}
    </Panel>
  );
}
