import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PlayingCardV2 } from "./PlayingCardV2";
import { useGame } from "../context/useGame";
import type { Card, CompletedTrickView, PlayedCard, PlayerView, StoredResult, Trick } from "../types/coh";

const SUIT_LABEL: Record<Card["suit"], string> = {
  hearts: "ハート",
  diamonds: "ダイヤ",
  clubs: "クラブ",
  spades: "スペード",
};

const RANK_VALUE: Record<Card["rank"], number> = {
  A: 14,
  K: 13,
  Q: 12,
  J: 11,
  "10": 10,
  "9": 9,
  "8": 8,
  "7": 7,
  "6": 6,
  "5": 5,
  "4": 4,
  "3": 3,
  "2": 2,
};

const TRICK_COLLECT_DELAY_MS = 2100;
const TRICK_PREVIEW_CLEAR_DELAY_MS = 3400;

function cardKey(card: Card): string {
  return `${card.suit}:${card.rank}`;
}

function canceledCardKeys(cards: PlayedCard[], serverCanceledKeys: string[]): Set<string> {
  const counts: Record<string, number> = {};
  for (const played of cards) {
    const key = cardKey(played.card);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return new Set([
    ...serverCanceledKeys,
    ...Object.entries(counts)
      .filter(([, count]) => count > 1)
      .map(([key]) => key),
  ]);
}

function winningPlayedCard(trick?: Trick): PlayedCard | undefined {
  if (!trick || trick.cards.length === 0) {
    return undefined;
  }
  const canceled = canceledCardKeys(trick.cards, trick.canceledKeys);
  const candidates = trick.leadSuit
    ? trick.cards.filter(
        (played) => played.card.suit === trick.leadSuit && !canceled.has(cardKey(played.card))
      )
    : [];
  if (candidates.length === 0) {
    return trick.cards.find((played) => played.playerId === trick.leaderId) ?? trick.cards[0];
  }
  return candidates.reduce((best, played) =>
    RANK_VALUE[played.card.rank] > RANK_VALUE[best.card.rank] ? played : best
  );
}

function playerRankings(players: PlayerView[]) {
  return [...players]
    .sort((a, b) => b.totalScore - a.totalScore)
    .map((player, index) => ({
      name: player.name,
      totalScore: player.totalScore,
      rank: index + 1,
    }));
}

function saveResult(result: StoredResult) {
  try {
    const current = JSON.parse(
      localStorage.getItem("coh:results") ?? "[]"
    ) as StoredResult[];
    localStorage.setItem("coh:results", JSON.stringify([result, ...current].slice(0, 5)));
  } catch {
    localStorage.setItem("coh:results", JSON.stringify([result]));
  }
}

function seatPosition(index: number, count: number): {
  className: string;
  style?: CSSProperties;
} {
  if (count <= 4) {
    return {
      className:
        [
          "left-1/2 bottom-[16.5rem] -translate-x-1/2",
          "left-[2%] top-1/2 -translate-y-1/2",
          "left-1/2 top-[10%] -translate-x-1/2",
          "right-[2%] top-1/2 -translate-y-1/2",
        ][index] ?? "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
    };
  }

  const angle = (index / count) * Math.PI * 2 + Math.PI / 2;
  const horizontalRadius = count >= 7 ? 38 : 42;
  const verticalCenter = count >= 7 ? 40 : 39;
  const verticalRadius = count >= 7 ? 30 : 21;
  const x = 50 + Math.cos(angle) * horizontalRadius;
  const y = verticalCenter + Math.sin(angle) * verticalRadius;
  return {
    className: "-translate-x-1/2 -translate-y-1/2",
    style: { left: `${x}%`, top: `${y}%` },
  };
}

function playedCardPosition(index: number, count: number): {
  className: string;
  style?: CSSProperties;
} {
  if (count <= 4) {
    return {
      className:
        [
          "left-1/2 bottom-[20.5rem] -translate-x-1/2",
          "left-[18%] top-1/2 -translate-y-1/2",
          "left-1/2 top-[18%] -translate-x-1/2",
          "right-[18%] top-1/2 -translate-y-1/2",
        ][index] ?? "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
    };
  }

  const angle = (index / count) * Math.PI * 2 + Math.PI / 2;
  const horizontalRadius = count >= 9 ? 21 : 23;
  const verticalRadius = count >= 7 ? 20 : 20;
  const x = 50 + Math.cos(angle) * horizontalRadius;
  const y = 40 + Math.sin(angle) * verticalRadius;
  return {
    className: "-translate-x-1/2 -translate-y-1/2",
    style: { left: `${x}%`, top: `${y}%` },
  };
}

function PlayerSeat({
  player,
  active,
  me,
  start,
  leader,
  compact,
}: {
  player: PlayerView;
  active: boolean;
  me: boolean;
  start: boolean;
  leader: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={`${compact ? "min-w-20 px-2 py-1.5" : "min-w-28 px-3 py-2"} rounded-md border shadow-sm ${
        active
          ? "border-sky-400 bg-sky-50"
          : me
          ? "border-slate-300 bg-white"
          : "border-white/70 bg-white/80"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`truncate font-semibold text-slate-900 ${compact ? "max-w-16 text-sm" : ""}`}>
          {player.name}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {start && (
            <span
              data-testid="start-player-badge"
              className="rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white"
            >
              START
            </span>
          )}
          {leader && (
            <span className="rounded bg-emerald-700 px-1.5 py-0.5 text-[10px] font-bold text-white">
              LEAD
            </span>
          )}
          {player.isHost && (
            <span className="rounded bg-slate-900 px-1.5 py-0.5 text-[10px] text-white">
              HOST
            </span>
          )}
        </div>
      </div>
      <div className={`${compact ? "gap-1 text-[11px]" : "gap-2 text-xs"} mt-1 grid grid-cols-2 text-slate-500`}>
        <span>獲得 {player.capturedCount}</span>
        <span>合計 {player.totalScore}</span>
      </div>
      {player.passedThisRound && (
        <div className="mt-1 text-xs font-medium text-emerald-700">交換済み</div>
      )}
    </div>
  );
}

export default function NewGameTable() {
  const navigate = useNavigate();
  const { state, myPlayerId, startGame, passCards, playCard, restartGame } =
    useGame();
  const [selectedPassIds, setSelectedPassIds] = useState<string[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [completedTrickPreview, setCompletedTrickPreview] = useState<{
    data: CompletedTrickView;
    collecting: boolean;
  } | null>(null);
  const [handHint, setHandHint] = useState<{
    cardId: string;
    message: string;
  } | null>(null);
  const savedResultId = useRef<string | null>(null);
  const previewTimers = useRef<number[]>([]);
  const handHintTimer = useRef<number | null>(null);

  const me = state?.players.find((player) => player.id === myPlayerId);
  const currentTurnId = state?.currentRound?.currentTurnPlayerId;
  const latestSummary = state?.roundSummaries[state.roundSummaries.length - 1];
  const rankings = useMemo(
    () => (state ? playerRankings(state.players) : []),
    [state]
  );
  const tablePlayers = useMemo(() => {
    if (!state || !myPlayerId) {
      return [];
    }
    const myIndex = state.players.findIndex((player) => player.id === myPlayerId);
    if (myIndex < 0) {
      return state.players;
    }
    return [...state.players.slice(myIndex), ...state.players.slice(0, myIndex)];
  }, [state, myPlayerId]);

  useEffect(() => {
    setSelectedPassIds([]);
  }, [state?.roundNumber, state?.phase]);

  useEffect(() => {
    return () => {
      if (handHintTimer.current) {
        window.clearTimeout(handHintTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    for (const timer of previewTimers.current) {
      window.clearTimeout(timer);
    }
    previewTimers.current = [];

    const completed = state?.lastCompletedTrick;
    if (!completed) {
      setCompletedTrickPreview(null);
      return;
    }

    setCompletedTrickPreview({ data: completed, collecting: false });
    if (completed.trick.winnerId) {
      previewTimers.current.push(
        window.setTimeout(() => {
          setCompletedTrickPreview({ data: completed, collecting: true });
        }, TRICK_COLLECT_DELAY_MS)
      );
    }
    previewTimers.current.push(
      window.setTimeout(() => {
        setCompletedTrickPreview(null);
      }, TRICK_PREVIEW_CLEAR_DELAY_MS)
    );

    return () => {
      for (const timer of previewTimers.current) {
        window.clearTimeout(timer);
      }
      previewTimers.current = [];
    };
  }, [
    state?.lastCompletedTrick?.roundNumber,
    state?.lastCompletedTrick?.trick.number,
    state?.lastCompletedTrick?.trick.winnerId,
    state?.lastCompletedTrick?.trick.cards.map((played) => played.card.id).join(","),
  ]);

  useEffect(() => {
    if (!state || state.phase !== "finished") {
      return;
    }
    const id = `${state.roomId}:${state.roundSummaries.length}`;
    if (savedResultId.current === id) {
      return;
    }
    savedResultId.current = id;
    saveResult({
      id,
      roomId: state.roomId,
      playedAt: new Date().toISOString(),
      players: rankings,
    });
  }, [state, rankings]);

  if (!state || !myPlayerId || !me) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
        <div className="rounded-md border bg-white p-6 text-center shadow-sm">
          <p className="font-semibold text-slate-900">ルームに参加していません</p>
          <button
            type="button"
            className="mt-4 rounded-md bg-slate-950 px-4 py-2 text-white"
            onClick={() => navigate("/")}
          >
            ロビーへ戻る
          </button>
        </div>
      </main>
    );
  }

  const isHost = me.isHost;
  const canStart = state.phase === "waiting" && state.players.length >= 4 && isHost;
  const playableIds = new Set(state.playableCardIds);
  const passTargetId = state.currentRound?.passTargetByPlayerId[myPlayerId];
  const passTarget = state.players.find((player) => player.id === passTargetId);
  const selectedPassCards = state.myHand.filter((card) =>
    selectedPassIds.includes(card.id)
  );
  const displayTrick = completedTrickPreview?.data.trick ?? state.currentRound?.currentTrick;
  const displayedTrickCards = displayTrick?.cards ?? [];
  const startPlayer = state.players.find(
    (player) => player.id === state.currentRound?.firstLeaderId
  );
  const leadPlayer = state.players.find((player) => player.id === displayTrick?.leaderId);
  const currentTurnPlayer = state.players.find((player) => player.id === currentTurnId);
  const displayedWinner = completedTrickPreview?.data.trick.winnerId
    ? state.players.find((player) => player.id === completedTrickPreview.data.trick.winnerId)
    : undefined;
  const isPreviewingCompletedTrick = completedTrickPreview !== null;
  const isPreviewingPreviousRound =
    completedTrickPreview !== null && completedTrickPreview.data.roundNumber !== state.roundNumber;
  const displayPhase = isPreviewingCompletedTrick ? "playing" : state.phase;
  const displayRoundNumber = completedTrickPreview?.data.roundNumber ?? state.roundNumber;
  const useMiniPlayedCards = tablePlayers.length >= 10;
  const displayCanceledKeys = canceledCardKeys(
    displayedTrickCards,
    displayTrick?.canceledKeys ?? []
  );
  const winningPlayed = isPreviewingCompletedTrick
    ? winningPlayedCard(displayTrick)
    : undefined;

  const showHandHint = (cardId: string, message: string) => {
    if (handHintTimer.current) {
      window.clearTimeout(handHintTimer.current);
    }
    setHandHint({ cardId, message });
    handHintTimer.current = window.setTimeout(() => {
      setHandHint(null);
      handHintTimer.current = null;
    }, 1600);
  };

  const unavailableReason = (card: Card): string => {
    if (isPreviewingCompletedTrick) {
      return "トリック確認中です。次の手番までお待ちください。";
    }
    if (state.phase === "passing") {
      if (me.passedThisRound) {
        return "カード交換は完了しています。";
      }
      return "交換するカードは3枚までです。";
    }
    if (state.phase !== "playing") {
      return "今はカードを出せません。";
    }
    if (currentTurnId !== myPlayerId) {
      return "今はあなたの手番ではありません。";
    }

    const leadSuit = displayTrick?.leadSuit;
    const hasLeadSuit = leadSuit
      ? state.myHand.some((handCard) => handCard.suit === leadSuit)
      : false;
    if (leadSuit && hasLeadSuit && card.suit !== leadSuit) {
      return `マストフォローです。${SUIT_LABEL[leadSuit]}を出してください。`;
    }
    if (
      !leadSuit &&
      card.suit === "hearts" &&
      state.currentRound?.heartsBroken === false &&
      state.myHand.some((handCard) => handCard.suit !== "hearts")
    ) {
      return "ハートブレイク前はハートでリードできません。";
    }
    return "このカードは今は出せません。";
  };

  const handlePassSelect = (cardId: string) => {
    if (selectedPassIds.includes(cardId)) {
      setSelectedPassIds((current) => current.filter((id) => id !== cardId));
      return;
    }
    if (selectedPassIds.length >= 3) {
      showHandHint(cardId, "交換するカードは3枚までです。");
      return;
    }
    setSelectedPassIds((current) => [...current, cardId]);
  };

  const submitPass = () => {
    setActionError(null);
    passCards({ cardIds: selectedPassIds }, (response) => {
      if (response.error) {
        setActionError(response.error);
      }
    });
  };

  const submitPlay = (cardId: string) => {
    setActionError(null);
    playCard({ cardId }, (response) => {
      if (response.error) {
        setActionError(response.error);
      }
    });
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,#e2e8f0,#f8fafc_35%,#fde68a)] p-3 text-slate-900">
      <div className="mx-auto grid max-w-7xl gap-3 lg:grid-cols-[1fr_320px]">
        <section
          data-testid="game-table"
          className="relative min-h-[calc(100vh-1.5rem)] overflow-hidden rounded-md border border-white/60 bg-emerald-900 shadow-sm"
        >
          <div className="absolute inset-6 rounded-full border border-emerald-700 bg-emerald-800 shadow-inner" />
          <div className="absolute left-4 top-4 z-20 rounded-md bg-white/90 px-4 py-3 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Room {state.roomId}
            </div>
            <div className="mt-1 text-lg font-bold">
              {displayPhase === "waiting" && "待機中"}
              {displayPhase === "passing" && "カード交換"}
              {displayPhase === "playing" && "プレイ中"}
              {displayPhase === "finished" && "ゲーム終了"}
            </div>
            <div className="mt-1 text-sm text-slate-600">
              Round {displayRoundNumber || "-"} / {state.maxRounds || "-"}
            </div>
          </div>

          <div className="absolute right-4 top-4 z-20 w-44 rounded-md bg-white/90 px-2.5 py-2 text-xs shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Trick
            </div>
            <div className="mt-2 space-y-1 text-slate-700">
              <div className="flex justify-between gap-2">
                <span>開始</span>
                <span className="max-w-24 truncate font-semibold">
                  {startPlayer?.name ?? "-"}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span>親</span>
                <span className="max-w-24 truncate font-semibold">
                  {leadPlayer?.name ?? "-"}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span>手番</span>
                <span className="max-w-24 truncate font-semibold">
                  {isPreviewingCompletedTrick ? "-" : currentTurnPlayer?.name ?? "-"}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span>スート</span>
                <span className="font-semibold">
                  {displayTrick?.leadSuit
                    ? SUIT_LABEL[displayTrick.leadSuit]
                    : "-"}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span>場</span>
                <span className="font-semibold">
                  {displayedTrickCards.length} / {state.players.length}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span>ハートブレイク</span>
                <span className="font-semibold">
                  {isPreviewingCompletedTrick ? "-" : state.currentRound?.heartsBroken ? "済" : "未"}
                </span>
              </div>
            </div>
          </div>

          {tablePlayers.map((player, index) => {
            const position = seatPosition(index, tablePlayers.length);
            return (
              <div
                key={player.id}
                data-testid="player-seat"
                data-player-name={player.name}
                className={`absolute z-10 ${position.className}`}
                style={position.style}
              >
                <PlayerSeat
                  player={player}
                  active={player.id === currentTurnId}
                  me={player.id === myPlayerId}
                  start={player.id === state.currentRound?.firstLeaderId}
                  leader={player.id === displayTrick?.leaderId}
                  compact={tablePlayers.length >= 7}
                />
              </div>
            );
          })}

          {state.phase === "waiting" && !isPreviewingCompletedTrick && (
            <div className="absolute left-1/2 top-[46%] z-20 w-[min(92%,520px)] -translate-x-1/2 -translate-y-1/2 rounded-md border border-white/40 bg-white/90 p-4 text-center shadow-sm">
              <div className="text-lg font-bold">プレイヤー待機中</div>
              <p className="mt-1 text-sm text-slate-600">
                4人以上で開始できます。現在 {state.players.length} 人。
              </p>
              {isHost ? (
                <button
                  type="button"
                  data-testid="start-game-button"
                  className="mt-4 rounded-md bg-slate-950 px-6 py-3 font-semibold text-white disabled:bg-slate-400"
                  disabled={!canStart}
                  onClick={() =>
                    startGame({}, (response) => {
                      if (response.error) {
                        setActionError(response.error);
                      }
                    })
                  }
                >
                  ゲーム開始
                </button>
              ) : (
                <p className="mt-3 text-sm text-slate-500">
                  ホストの開始を待っています。
                </p>
              )}
            </div>
          )}

          {actionError && (
            <div className="absolute left-1/2 top-[16%] z-40 w-[min(92%,520px)] -translate-x-1/2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 shadow-sm">
              {actionError}
            </div>
          )}

          {completedTrickPreview && (
            <div
              data-testid="trick-winner-preview"
              className="absolute left-1/2 top-[43%] z-30 -translate-x-1/2 rounded-md border border-white/60 bg-emerald-950/80 px-3 py-1.5 text-sm font-semibold text-white shadow-sm"
            >
              {`${displayedWinner?.name ?? "勝者"} が獲得`}
            </div>
          )}

          {displayedTrickCards.map((played, order) => {
              const tableIndex = tablePlayers.findIndex(
                (item) => item.id === played.playerId
              );
              const winnerIndex = tablePlayers.findIndex(
                (item) => item.id === completedTrickPreview?.data.trick.winnerId
              );
              const positionIndex =
                completedTrickPreview?.collecting && winnerIndex >= 0
                  ? winnerIndex
                  : tableIndex >= 0
                  ? tableIndex
                  : order;
              const position = playedCardPosition(
                positionIndex,
                tablePlayers.length
              );
              const isCanceled = displayCanceledKeys.has(cardKey(played.card));
              const isOffLeadSuit = Boolean(
                isPreviewingCompletedTrick &&
                  displayTrick?.leadSuit &&
                  played.card.suit !== displayTrick.leadSuit
              );
              const isWinningCard =
                winningPlayed?.playerId === played.playerId &&
                winningPlayed.card.id === played.card.id;
              const dimmed = isCanceled || isOffLeadSuit;
              const playedCardZIndex = completedTrickPreview?.collecting
                ? isWinningCard
                  ? 48
                  : 28 + order
                : isWinningCard
                ? 42
                : 25 + order;

              return (
                <div
                  key={`${played.playerId}-${played.card.id}`}
                  data-testid="played-card"
                  data-player-id={played.playerId}
                  data-canceled={isCanceled ? "true" : "false"}
                  data-off-lead-suit={isOffLeadSuit ? "true" : "false"}
                  data-winning-card={isWinningCard ? "true" : "false"}
                  className={`absolute z-[25] transition-[left,top,transform,opacity] duration-700 ease-in-out ${position.className} ${
                    completedTrickPreview?.collecting ? "opacity-80" : ""
                  }`}
                  style={{ ...position.style, zIndex: playedCardZIndex }}
                >
                  <div
                    className={`relative flex flex-col items-center rounded-md transition ${
                      dimmed ? "opacity-45 grayscale saturate-50" : ""
                    } ${
                      isWinningCard
                        ? "animate-pulse ring-4 ring-amber-300 shadow-[0_0_22px_rgba(251,191,36,0.9)]"
                        : ""
                    }`}
                  >
                    <span className="absolute -left-2 -top-2 z-30 flex h-6 w-6 items-center justify-center rounded-full border border-white bg-slate-950 text-xs font-bold text-white shadow-sm">
                      {order + 1}
                    </span>
                    {isCanceled && (
                      <span className="pointer-events-none absolute left-1/2 top-1/2 z-40 h-1 w-[140%] -translate-x-1/2 -translate-y-1/2 -rotate-45 rounded-full bg-rose-600/90 shadow-sm" />
                    )}
                    <PlayingCardV2
                      card={played.card}
                      compact
                      mini={useMiniPlayedCards}
                      simple
                    />
                  </div>
                </div>
              );
            })}

          {state.phase === "passing" && !isPreviewingCompletedTrick && (
            <div className="absolute bottom-[13.5rem] left-1/2 z-20 w-[min(92%,560px)] -translate-x-1/2 rounded-md border border-white/50 bg-white/92 p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-lg font-bold">3枚渡す</div>
                  <div className="text-sm text-slate-600">
                    渡す相手: {passTarget?.name ?? "-"}
                  </div>
                </div>
                <button
                  type="button"
                  className="rounded-md bg-slate-950 px-4 py-2 font-semibold text-white disabled:bg-slate-400"
                  disabled={selectedPassIds.length !== 3 || me.passedThisRound}
                  onClick={submitPass}
                >
                  交換確定 {selectedPassIds.length}/3
                </button>
              </div>
              {selectedPassCards.length > 0 && (
                <div className="mt-3 flex gap-2">
                  {selectedPassCards.map((card) => (
                    <span
                      key={card.id}
                      className="rounded bg-slate-100 px-2 py-1 text-sm"
                    >
                      {card.rank} {SUIT_LABEL[card.suit]}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          <div
            data-testid="hand-zone"
            className="absolute bottom-3 left-1/2 z-30 w-[min(100%,980px)] -translate-x-1/2 px-3"
          >
            {handHint && (
              <div
                data-testid="hand-hint"
                className="pointer-events-none absolute left-1/2 top-0 z-40 w-max max-w-[min(92vw,420px)] -translate-x-1/2 -translate-y-[calc(100%+0.5rem)] rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-center text-sm font-semibold text-white shadow-lg"
              >
                {handHint.message}
              </div>
            )}
            <div className="overflow-x-auto rounded-md border border-white/50 bg-white/92 p-3 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-bold">
                  {isPreviewingPreviousRound ? "トリック確認中" : `${me.name} の手札`}
                </span>
                <span className="text-sm text-slate-500">
                  {isPreviewingPreviousRound ? "" : `${state.myHand.length}枚`}
                </span>
              </div>
              <div className="flex min-h-32 gap-2">
                {!isPreviewingPreviousRound &&
                  state.myHand.map((card) => {
                    const selected = selectedPassIds.includes(card.id);
                    const canSelectForPassing =
                      state.phase === "passing" && !me.passedThisRound;
                    const canPlayCard =
                      state.phase === "playing" &&
                      !isPreviewingCompletedTrick &&
                      playableIds.has(card.id);
                    const canShowUnavailableReason =
                      (state.phase === "playing" || state.phase === "passing") &&
                      !canPlayCard &&
                      !canSelectForPassing;
                    const unavailable =
                      canShowUnavailableReason ||
                      (state.phase === "playing" && !canPlayCard);

                    return (
                      <PlayingCardV2
                        key={card.id}
                        card={card}
                        selected={selected}
                        playable={canSelectForPassing || canPlayCard}
                        unavailable={unavailable}
                        onClick={
                          canSelectForPassing
                            ? () => handlePassSelect(card.id)
                            : canPlayCard
                            ? () => submitPlay(card.id)
                            : canShowUnavailableReason || state.phase === "playing"
                            ? () => showHandHint(card.id, unavailableReason(card))
                            : undefined
                        }
                      />
                    );
                  })}
              </div>
            </div>
          </div>
        </section>

        <aside className="space-y-3">
          <section className="rounded-md border border-white/60 bg-white/90 p-4 shadow-sm">
            <h2 className="text-lg font-bold">スコア</h2>
            <div className="mt-3 space-y-2">
              {state.players
                .slice()
                .sort((a, b) => b.totalScore - a.totalScore)
                .map((player, index) => (
                  <div
                    key={player.id}
                    className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2"
                  >
                    <span>
                      {index + 1}. {player.name}
                    </span>
                    <span className="font-mono font-bold">{player.totalScore}</span>
                  </div>
                ))}
            </div>
          </section>

          {latestSummary && (
            <section className="rounded-md border border-white/60 bg-white/90 p-4 shadow-sm">
              <h2 className="text-lg font-bold">
                Round {latestSummary.roundNumber} 結果
              </h2>
              <div className="mt-3 space-y-2 text-sm">
                {latestSummary.scores.map((score) => (
                  <div
                    key={score.playerId}
                    className="grid grid-cols-[1fr_auto] rounded-md bg-slate-50 px-3 py-2"
                  >
                    <span>{score.playerName}</span>
                    <span className="font-mono">
                      {score.penalty} + {score.bonus} = {score.total}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {state.phase === "finished" && (
            <section className="rounded-md border border-amber-200 bg-amber-50 p-4 shadow-sm">
              <h2 className="text-lg font-bold">ゲーム終了</h2>
              <div className="mt-3 space-y-2">
                {rankings.map((player) => (
                  <div
                    key={player.name}
                    className="flex justify-between rounded-md bg-white px-3 py-2"
                  >
                    <span>{player.rank}位 {player.name}</span>
                    <span className="font-mono font-bold">{player.totalScore}</span>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="mt-4 w-full rounded-md bg-slate-950 px-4 py-2 font-semibold text-white"
                onClick={() =>
                  restartGame({}, (response) => {
                    if (response.error) {
                      setActionError(response.error);
                    }
                  })
                }
              >
                同じメンバーで新しく始める
              </button>
            </section>
          )}

          <button
            type="button"
            className="w-full rounded-md border border-slate-300 bg-white px-4 py-2 font-semibold"
            onClick={() => navigate("/")}
          >
            ロビーへ戻る
          </button>
        </aside>
      </div>
    </main>
  );
}
