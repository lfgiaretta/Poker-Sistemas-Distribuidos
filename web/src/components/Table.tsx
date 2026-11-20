import type { GameView, PlayerView } from "../types";
import CardView, { CardSlot } from "./CardView";

const MAX_SEATS = 6;
// Posições na mesa (em %), sentido horário a partir de baixo: o próprio jogador fica embaixo.
const SLOTS = [
  { left: 50, top: 102 },
  { left: 6, top: 80 },
  { left: 6, top: 20 },
  { left: 50, top: 0 },
  { left: 94, top: 20 },
  { left: 94, top: 80 },
];

const STREET_LABEL = { preflop: "Pré-flop", flop: "Flop", turn: "Turn", river: "River" };

export default function Table({ view, now }: { view: GameView; now: number }) {
  const { table, players, me } = view;
  const mySeat = players.find((p) => p.id === me?.id)?.seat ?? 0;
  const bySlot = new Map(players.map((p) => [(p.seat - mySeat + MAX_SEATS) % MAX_SEATS, p]));

  return (
    <div className="px-20 pt-[50px] pb-[100px]">
      <div className="relative aspect-[2/1] rounded-full border-[14px] border-rail bg-[radial-gradient(ellipse_at_center,var(--color-felt)_0%,var(--color-felt-dark)_100%)] shadow-[inset_0_0_40px_rgba(0,0,0,0.5),0_10px_30px_rgba(0,0,0,0.5)]">
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          {table ? (
            <>
              <div className="text-[13px] text-[#cfe7d8]">
                Mão #{table.number} · {STREET_LABEL[table.street]}
              </div>
              <div className="flex gap-1.5">
                {table.board.map((c) => (
                  <CardView key={c} card={c} />
                ))}
                {Array.from({ length: 5 - table.board.length }, (_, i) => (
                  <CardSlot key={i} />
                ))}
              </div>
              <div className="rounded-full bg-black/35 px-3.5 py-1 font-semibold text-gold">Pote: {table.pot}</div>
            </>
          ) : (
            <div className="text-[#cfe7d8]">
              {players.length < 2
                ? "Aguardando jogadores… (mínimo 2)"
                : view.nextHandAt
                  ? `Próxima mão em ${Math.max(0, Math.ceil((view.nextHandAt - now) / 1000))}s`
                  : "Aguardando…"}
            </div>
          )}
        </div>

        {SLOTS.map((pos, slot) => {
          const player = bySlot.get(slot);
          return (
            <div
              key={slot}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${pos.left}%`, top: `${pos.top}%` }}
            >
              {player ? (
                <Seat player={player} isMe={player.id === me?.id} view={view} now={now} />
              ) : (
                <div className="rounded-xl border border-dashed border-white/20 px-4 py-3.5 text-xs text-white/35">vazio</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Seat({ player, isMe, view, now }: { player: PlayerView; isMe: boolean; view: GameView; now: number }) {
  const table = view.table;
  const turn = table?.toAct === player.id;
  const deadline = turn ? table?.deadline : null;
  const remaining = deadline ? Math.max(0, deadline - now) : 0;
  const shown = view.lastResult?.showdown.find((s) => s.id === player.id);
  const cards = player.cards.length ? player.cards : (shown?.cards ?? []);
  const best = new Set(shown?.best ?? []);

  const plateBorder = turn ? "border-gold shadow-[0_0_14px_rgba(229,184,75,0.6)]" : "border-line";
  const plateBg = isMe ? "bg-[#1d2c3d]" : "bg-panel";

  return (
    <div className={`relative flex min-w-[110px] flex-col items-center ${player.folded ? "opacity-45" : ""}`}>
      <div className="z-[1] -mb-2.5 flex h-[50px] gap-[3px]">
        {cards.map((c, i) => (
          <CardView key={i} card={c} small highlight={best.has(c)} />
        ))}
      </div>
      <div className={`z-[2] min-w-[110px] rounded-xl border-2 px-3 py-1.5 text-center ${plateBorder} ${plateBg}`}>
        <div className="text-sm font-semibold">
          {player.isDealer && (
            <span className="mr-1.5 inline-block size-[18px] rounded-full bg-white text-center text-[11px] leading-[18px] font-extrabold text-black">
              D
            </span>
          )}
          {player.name}
          {isMe && " (você)"}
        </div>
        <div className="text-[13px] text-gold">
          {player.allIn ? "ALL-IN" : player.stack}
          {player.leaving && " · saindo"}
        </div>
        {turn && deadline && (
          <div className="mt-1 h-1 overflow-hidden rounded-sm bg-white/10">
            <div className="h-full bg-gold transition-[width] duration-250 ease-linear" style={{ width: `${Math.min(100, remaining / 300)}%` }} />
          </div>
        )}
      </div>
      {player.bet > 0 && (
        <div className="absolute -bottom-[26px] rounded-full border border-gold bg-black/45 px-2.5 py-px text-xs text-gold">
          {player.bet}
        </div>
      )}
    </div>
  );
}
