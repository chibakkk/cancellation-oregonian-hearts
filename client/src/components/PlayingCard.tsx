import type { Card } from "../types/coh";

const SUIT_SYMBOL: Record<Card["suit"], string> = {
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
  spades: "♠",
};

const SUIT_CLASS: Record<Card["suit"], string> = {
  hearts: "text-rose-600",
  diamonds: "text-amber-600",
  clubs: "text-emerald-700",
  spades: "text-slate-900",
};

interface PlayingCardProps {
  card?: Card;
  selected?: boolean;
  playable?: boolean;
  faceDown?: boolean;
  compact?: boolean;
  onClick?: () => void;
}

export function PlayingCard({
  card,
  selected = false,
  playable = false,
  faceDown = false,
  compact = false,
  onClick,
}: PlayingCardProps) {
  const size = compact ? "h-20 w-14" : "h-28 w-20";

  if (faceDown || !card) {
    return (
      <div
        className={`${size} rounded-md border border-slate-700 bg-slate-800 shadow-sm`}
      >
        <div className="flex h-full items-center justify-center text-xl text-white">
          COH
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`${size} relative shrink-0 rounded-md border bg-white p-2 text-left shadow-sm transition ${
        selected ? "-translate-y-3 border-sky-500 ring-2 ring-sky-300" : ""
      } ${
        playable
          ? "border-slate-300 hover:-translate-y-2 hover:shadow-md"
          : "border-slate-200"
      } ${onClick ? "cursor-pointer" : "cursor-default"}`}
    >
      <div className={`text-sm font-bold leading-none ${SUIT_CLASS[card.suit]}`}>
        <div>{card.rank}</div>
        <div>{SUIT_SYMBOL[card.suit]}</div>
      </div>
      <div
        className={`absolute inset-0 flex items-center justify-center text-4xl font-bold ${SUIT_CLASS[card.suit]}`}
      >
        {SUIT_SYMBOL[card.suit]}
      </div>
      <div
        className={`absolute bottom-2 right-2 rotate-180 text-sm font-bold leading-none ${SUIT_CLASS[card.suit]}`}
      >
        <div>{card.rank}</div>
        <div>{SUIT_SYMBOL[card.suit]}</div>
      </div>
    </button>
  );
}
