import type { Card } from "../types/coh";

const SUIT_SYMBOL: Record<Card["suit"], string> = {
  hearts: "\u2665",
  diamonds: "\u2666",
  clubs: "\u2663",
  spades: "\u2660",
};

const SUIT_CLASS: Record<Card["suit"], string> = {
  hearts: "text-rose-600",
  diamonds: "text-amber-600",
  clubs: "text-emerald-700",
  spades: "text-slate-950",
};

const PIP_LAYOUT: Record<number, string[]> = {
  1: ["left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"],
  2: [
    "left-1/2 top-[28%] -translate-x-1/2",
    "left-1/2 bottom-[28%] -translate-x-1/2 rotate-180",
  ],
  3: [
    "left-1/2 top-[25%] -translate-x-1/2",
    "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
    "left-1/2 bottom-[25%] -translate-x-1/2 rotate-180",
  ],
  4: [
    "left-[34%] top-[27%] -translate-x-1/2",
    "right-[34%] top-[27%] translate-x-1/2",
    "left-[34%] bottom-[27%] -translate-x-1/2 rotate-180",
    "right-[34%] bottom-[27%] translate-x-1/2 rotate-180",
  ],
  5: [
    "left-[34%] top-[26%] -translate-x-1/2",
    "right-[34%] top-[26%] translate-x-1/2",
    "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
    "left-[34%] bottom-[26%] -translate-x-1/2 rotate-180",
    "right-[34%] bottom-[26%] translate-x-1/2 rotate-180",
  ],
  6: [
    "left-[34%] top-[24%] -translate-x-1/2",
    "right-[34%] top-[24%] translate-x-1/2",
    "left-[34%] top-1/2 -translate-x-1/2 -translate-y-1/2",
    "right-[34%] top-1/2 translate-x-1/2 -translate-y-1/2",
    "left-[34%] bottom-[24%] -translate-x-1/2 rotate-180",
    "right-[34%] bottom-[24%] translate-x-1/2 rotate-180",
  ],
  7: [
    "left-[34%] top-[22%] -translate-x-1/2",
    "right-[34%] top-[22%] translate-x-1/2",
    "left-1/2 top-[36%] -translate-x-1/2",
    "left-[34%] top-[52%] -translate-x-1/2 -translate-y-1/2",
    "right-[34%] top-[52%] translate-x-1/2 -translate-y-1/2",
    "left-[34%] bottom-[22%] -translate-x-1/2 rotate-180",
    "right-[34%] bottom-[22%] translate-x-1/2 rotate-180",
  ],
  8: [
    "left-[34%] top-[21%] -translate-x-1/2",
    "right-[34%] top-[21%] translate-x-1/2",
    "left-1/2 top-[34%] -translate-x-1/2",
    "left-[34%] top-1/2 -translate-x-1/2 -translate-y-1/2",
    "right-[34%] top-1/2 translate-x-1/2 -translate-y-1/2",
    "left-1/2 bottom-[34%] -translate-x-1/2 rotate-180",
    "left-[34%] bottom-[21%] -translate-x-1/2 rotate-180",
    "right-[34%] bottom-[21%] translate-x-1/2 rotate-180",
  ],
  9: [
    "left-[39%] top-[24%] -translate-x-1/2",
    "right-[39%] top-[24%] translate-x-1/2",
    "left-[39%] top-[38%] -translate-x-1/2",
    "right-[39%] top-[38%] translate-x-1/2",
    "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
    "left-[39%] bottom-[38%] -translate-x-1/2 rotate-180",
    "right-[39%] bottom-[38%] translate-x-1/2 rotate-180",
    "left-[39%] bottom-[24%] -translate-x-1/2 rotate-180",
    "right-[39%] bottom-[24%] translate-x-1/2 rotate-180",
  ],
  10: [
    "left-[36%] top-[24%] -translate-x-1/2",
    "right-[36%] top-[24%] translate-x-1/2",
    "left-1/2 top-[32%] -translate-x-1/2",
    "left-[36%] top-[40%] -translate-x-1/2",
    "right-[36%] top-[40%] translate-x-1/2",
    "left-[36%] bottom-[40%] -translate-x-1/2 rotate-180",
    "right-[36%] bottom-[40%] translate-x-1/2 rotate-180",
    "left-1/2 bottom-[32%] -translate-x-1/2 rotate-180",
    "left-[36%] bottom-[24%] -translate-x-1/2 rotate-180",
    "right-[36%] bottom-[24%] translate-x-1/2 rotate-180",
  ],
};

interface PlayingCardV2Props {
  card?: Card;
  selected?: boolean;
  playable?: boolean;
  faceDown?: boolean;
  compact?: boolean;
  mini?: boolean;
  simple?: boolean;
  unavailable?: boolean;
  onClick?: () => void;
}

function pipCount(rank: Card["rank"]): number | null {
  if (rank === "A") return 1;
  const value = Number(rank);
  return Number.isNaN(value) ? null : value;
}

function pipTextClass(
  count: number | null,
  compact: boolean,
  mini: boolean
): string {
  if (mini) {
    return count && count >= 9 ? "text-[0.62rem]" : "text-sm";
  }
  if (count === 10) {
    return compact ? "text-[0.72rem]" : "text-[0.82rem]";
  }
  if (compact) {
    return count && count >= 9 ? "text-[0.8rem]" : "text-lg";
  }
  if (count && count >= 9) {
    return "text-[0.95rem]";
  }
  if (count && count >= 7) {
    return "text-[1.18rem]";
  }
  return "text-[1.35rem]";
}

function pipBoxClass(
  count: number | null,
  compact: boolean,
  mini: boolean
): string {
  if (mini) {
    return count && count >= 9 ? "w-2.5 text-center" : "";
  }
  if (count === 10) {
    return compact ? "w-3 text-center" : "w-4 text-center";
  }
  if (count && count >= 9) {
    return compact ? "w-3.5 text-center" : "w-4 text-center";
  }
  return "";
}

export function PlayingCardV2({
  card,
  selected = false,
  playable = false,
  faceDown = false,
  compact = false,
  mini = false,
  simple = false,
  unavailable = false,
  onClick,
}: PlayingCardV2Props) {
  const size = mini ? "h-[72px] w-[50px]" : compact ? "h-24 w-16" : "h-32 w-24";
  const cornerText = mini ? "text-[8px]" : compact ? "text-[10px]" : "text-[13px]";
  const faceRankText = mini ? "text-xl" : compact ? "text-3xl" : "text-4xl";
  const faceSuitText = mini ? "text-2xl" : compact ? "text-4xl" : "text-5xl";
  const faceInset = mini
    ? "inset-x-1.5 inset-y-3"
    : compact
    ? "inset-x-2 inset-y-5"
    : "inset-x-3 inset-y-7";
  const cardPadding = mini ? "p-1" : "p-1.5";
  const cornerBox = mini
    ? "left-0.5 top-0.5 w-5"
    : "left-1 top-1 w-6";
  const bottomCornerBox = mini
    ? "bottom-0.5 right-0.5 w-5"
    : "bottom-1 right-1 w-6";

  if (faceDown || !card) {
    return (
      <div className={`${size} rounded-md border border-slate-700 bg-slate-800 shadow-sm`}>
        <div className="flex h-full items-center justify-center text-xl font-bold text-white">
          COH
        </div>
      </div>
    );
  }

  const count = pipCount(card.rank);
  const pipText = pipTextClass(count, compact, mini);
  const pipBox = pipBoxClass(count, compact, mini);
  const interactive = Boolean(onClick);

  return (
    <button
      type="button"
      data-testid="playing-card"
      data-card-id={card.id}
      data-playable={playable ? "true" : "false"}
      aria-disabled={unavailable || !interactive}
      onClick={onClick}
      disabled={!interactive}
      className={`${size} ${cardPadding} relative shrink-0 rounded-md border bg-white text-left shadow-sm transition ${
        selected ? "-translate-y-3 border-sky-500 ring-2 ring-sky-300" : ""
      } ${
        playable
          ? "-translate-y-2 border-sky-400 ring-2 ring-sky-200 hover:-translate-y-3 hover:shadow-md"
          : "border-slate-200"
      } ${
        unavailable ? "opacity-45 grayscale saturate-50 hover:opacity-75" : ""
      } ${
        interactive
          ? unavailable
            ? "cursor-not-allowed"
            : "cursor-pointer"
          : "cursor-default"
      }`}
    >
      {!simple && (
        <div
          className={`absolute ${cornerBox} z-20 rounded-sm bg-white/95 py-0.5 text-center font-bold leading-none ${cornerText} ${SUIT_CLASS[card.suit]}`}
        >
          <div>{card.rank}</div>
          <div>{SUIT_SYMBOL[card.suit]}</div>
        </div>
      )}

      {count && !simple ? (
        PIP_LAYOUT[count].map((position, index) => (
          <span
            key={`${card.id}-${index}`}
            className={`absolute ${position} ${pipBox} ${pipText} font-bold leading-none ${SUIT_CLASS[card.suit]}`}
          >
            {SUIT_SYMBOL[card.suit]}
          </span>
        ))
      ) : (
        <div
          className={`absolute ${faceInset} flex flex-col items-center justify-center rounded border border-slate-100 ${SUIT_CLASS[card.suit]}`}
        >
          <div className={`${faceRankText} font-black leading-none`}>{card.rank}</div>
          <div className={`${faceSuitText} font-bold leading-none`}>
            {SUIT_SYMBOL[card.suit]}
          </div>
        </div>
      )}

      {!simple && (
        <div
          className={`absolute ${bottomCornerBox} z-20 rotate-180 rounded-sm bg-white/95 py-0.5 text-center font-bold leading-none ${cornerText} ${SUIT_CLASS[card.suit]}`}
        >
          <div>{card.rank}</div>
          <div>{SUIT_SYMBOL[card.suit]}</div>
        </div>
      )}
    </button>
  );
}
