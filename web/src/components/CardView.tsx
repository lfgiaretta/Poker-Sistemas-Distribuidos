const SUIT_SYMBOL: Record<string, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };
const RANK_LABEL: Record<string, string> = { T: "10" };

const BASE = "flex flex-col items-center justify-center rounded-md font-bold leading-none shadow-[0_2px_4px_rgba(0,0,0,0.4)]";
const SIZE = { normal: "h-[66px] w-[46px] text-xl", small: "h-12 w-[34px] text-[15px]" };
const BACK = "border-2 border-white bg-[repeating-linear-gradient(45deg,#23417a_0,#23417a_4px,#2d5299_4px,#2d5299_8px)]";

export default function CardView({ card, small, highlight }: { card: string; small?: boolean; highlight?: boolean }) {
  const size = small ? SIZE.small : SIZE.normal;
  if (card === "??") return <div className={`${BASE} ${size} ${BACK}`} />;

  const rank = RANK_LABEL[card[0]] ?? card[0];
  const suit = card[1];
  const color = suit === "h" || suit === "d" ? "text-[#c62828]" : "text-[#111]";
  return (
    <div className={`${BASE} ${size} bg-[#fafafa] ${color} ${highlight ? "outline-2 outline-gold" : ""}`}>
      <span>{rank}</span>
      <span>{SUIT_SYMBOL[suit]}</span>
    </div>
  );
}

/** Espaço vazio na mesa para uma carta que ainda não saiu. */
export function CardSlot() {
  return <div className={`${SIZE.normal} rounded-md border border-dashed border-white/20 bg-black/15`} />;
}
