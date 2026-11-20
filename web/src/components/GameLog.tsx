import type { LogEntry } from "../types";
import { Panel, Stamp } from "./ui";

/** Histórico de jogadas. O "L" é o relógio de Lamport do líder quando a jogada foi confirmada. */
export default function GameLog({ log }: { log: LogEntry[] }) {
  return (
    <Panel title="Histórico">
      <ol className="max-h-[420px] overflow-y-auto text-[13px]">
        {[...log].reverse().map((entry, i) => (
          <li key={`${entry.seq}-${i}`} className="border-b border-white/5 py-[3px]">
            <Stamp title={`seq ${entry.seq} · confirmada pelo nó ${entry.node}`}>
              L{entry.lamport}·n{entry.node}
            </Stamp>
            {entry.text}
          </li>
        ))}
      </ol>
    </Panel>
  );
}
