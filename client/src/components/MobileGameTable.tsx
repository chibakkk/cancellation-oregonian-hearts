import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGame } from "../context/useGame";
import type { Card, CompletedTrickView, PlayedCard, PlayerView, StoredResult, Trick } from "../types/coh";
import { PlayingCardV2 } from "./PlayingCardV2";
import { RulesContent } from "./RulesContent";

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

function signedScore(value: number): string {
  return value > 0 ? `+${value}` : String(value);
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

function phaseLabel(phase: string): string {
  if (phase === "waiting") return "待機中";
  if (phase === "passing") return "カード交換";
  if (phase === "playing") return "プレイ中";
  if (phase === "finished") return "ゲーム終了";
  return phase;
}

function MobilePlayerPill({
  player,
  active,
  me,
  start,
  leader,
}: {
  player: PlayerView;
  active: boolean;
  me: boolean;
  start: boolean;
  leader: boolean;
}) {
  return (
    <div
      data-testid="player-seat"
      data-player-name={player.name}
      className={`min-w-[8.25rem] rounded-md border px-3 py-2 shadow-sm ${
        active
          ? "border-sky-300 bg-sky-50"
          : me
            ? "border-emerald-300 bg-emerald-50"
            : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-black text-slate-950">
          {player.name}
        </span>
        <div className="flex shrink-0 gap-1">
          {start && (
            <span
              data-testid="start-player-badge"
              className="rounded bg-amber-500 px-1 py-0.5 text-[9px] font-black text-white"
            >
              START
            </span>
          )}
          {leader && (
            <span className="rounded bg-emerald-700 px-1 py-0.5 text-[9px] font-black text-white">
              LEAD
            </span>
          )}
        </div>
      </div>
      <div className="mt-1 flex justify-between gap-2 text-[11px] font-semibold text-slate-500">
        <span>獲得 {player.capturedCount}</span>
        <span>合計 {player.totalScore}</span>
      </div>
      {player.passedThisRound && (
        <div className="mt-1 text-[11px] font-bold text-emerald-700">交換済み</div>
      )}
    </div>
  );
}

export function MobileGameTable() {
  const navigate = useNavigate();
  const { state, myPlayerId, startGame, passCards, playCard, restartGame } =
    useGame();
  const [selectedPassIds, setSelectedPassIds] = useState<string[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [completedTrickPreview, setCompletedTrickPreview] = useState<{
    data: CompletedTrickView;
    collecting: boolean;
  } | null>(null);
  const [handHint, setHandHint] = useState<string | null>(null);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [showScoreSheet, setShowScoreSheet] = useState(false);
  const [dismissedRoundResultId, setDismissedRoundResultId] = useState<string | null>(null);
  const previewTimers = useRef<number[]>([]);
  const handHintTimer = useRef<number | null>(null);
  const savedResultId = useRef<string | null>(null);

  const me = state?.players.find((player) => player.id === myPlayerId);
  const currentTurnId = state?.currentRound?.currentTurnPlayerId;
  const latestSummary = state?.roundSummaries[state.roundSummaries.length - 1];
  const latestSummaryId =
    state && latestSummary ? `${state.roomId}:${latestSummary.roundNumber}` : null;
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
    setDismissedRoundResultId(null);
  }, [latestSummaryId]);

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
  const displayTrick = completedTrickPreview?.data.trick ?? state.currentRound?.currentTrick;
  const displayedTrickCards = displayTrick?.cards ?? [];
  const displayCanceledKeys = canceledCardKeys(
    displayedTrickCards,
    displayTrick?.canceledKeys ?? []
  );
  const winningPlayed = completedTrickPreview ? winningPlayedCard(displayTrick) : undefined;
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
  const passTargetId = state.currentRound?.passTargetByPlayerId[myPlayerId];
  const passTarget = state.players.find((player) => player.id === passTargetId);
  const selectedPassCards = state.myHand.filter((card) => selectedPassIds.includes(card.id));
  const roundResultScores = latestSummary
    ? [...latestSummary.scores].sort((a, b) => b.total - a.total)
    : [];
  const showRoundResultPanel = Boolean(
    latestSummary &&
      latestSummaryId &&
      dismissedRoundResultId !== latestSummaryId &&
      state.phase !== "finished" &&
      !isPreviewingCompletedTrick
  );
  const isRoundResultBlocking = showRoundResultPanel;

  const showHint = (message: string) => {
    if (handHintTimer.current) {
      window.clearTimeout(handHintTimer.current);
    }
    setHandHint(message);
    handHintTimer.current = window.setTimeout(() => {
      setHandHint(null);
      handHintTimer.current = null;
    }, 1600);
  };

  const unavailableReason = (card: Card): string => {
    if (isPreviewingCompletedTrick) {
      return "トリック確認中です。";
    }
    if (state.phase === "passing") {
      return me.passedThisRound ? "カード交換は完了しています。" : "交換するカードは3枚までです。";
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
      showHint("交換するカードは3枚までです。");
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
    <main
      data-testid="mobile-game-table"
      className="min-h-screen bg-[linear-gradient(180deg,#064e3b,#0f766e_42%,#f8fafc_42%)] pb-[11.5rem] text-slate-950"
    >
      <header className="sticky top-0 z-40 border-b border-white/15 bg-emerald-950/95 px-3 py-2 text-white shadow-sm backdrop-blur">
        <div className="flex items-start justify-between gap-2 pr-24">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-100/70">
              Room {state.roomId}
            </div>
            <div className="mt-0.5 flex items-center gap-2">
              <span className="text-lg font-black">{phaseLabel(displayPhase)}</span>
              <span className="rounded bg-white/12 px-2 py-0.5 text-xs font-bold">
                Round {displayRoundNumber || "-"} / {state.maxRounds || "-"}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-2 grid grid-cols-3 gap-1 text-[11px]">
          <div className="rounded bg-white/10 px-2 py-1">
            <span className="text-emerald-100/70">手番 </span>
            <span className="font-bold">{isPreviewingCompletedTrick ? "-" : currentTurnPlayer?.name ?? "-"}</span>
          </div>
          <div className="rounded bg-white/10 px-2 py-1">
            <span className="text-emerald-100/70">スート </span>
            <span className="font-bold">{displayTrick?.leadSuit ? SUIT_LABEL[displayTrick.leadSuit] : "-"}</span>
          </div>
          <div className="rounded bg-white/10 px-2 py-1">
            <span className="text-emerald-100/70">場 </span>
            <span className="font-bold">{displayedTrickCards.length}/{state.players.length}</span>
          </div>
        </div>
      </header>

      <section className="px-3 pt-3">
        <div className="overflow-x-auto pb-2">
          <div className="flex min-w-max gap-2">
            {tablePlayers.map((player) => (
              <MobilePlayerPill
                key={player.id}
                player={player}
                active={player.id === currentTurnId}
                me={player.id === myPlayerId}
                start={player.id === state.currentRound?.firstLeaderId}
                leader={player.id === displayTrick?.leaderId}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="px-3 pb-4">
        <div
          data-testid="game-table"
          className="min-h-[16rem] rounded-md border border-white/25 bg-emerald-900 p-3 shadow-inner"
        >
          <div className="flex items-center justify-between gap-3 text-white">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-100/70">
                Trick
              </div>
              <div className="mt-0.5 text-sm font-bold">
                親 {leadPlayer?.name ?? "-"} / 開始 {startPlayer?.name ?? "-"}
              </div>
            </div>
            <div className="rounded bg-white/10 px-2 py-1 text-xs font-bold">
              ハートブレイク {isPreviewingCompletedTrick ? "-" : state.currentRound?.heartsBroken ? "済" : "未"}
            </div>
          </div>

          {completedTrickPreview && (
            <div
              data-testid="trick-winner-preview"
              className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-black text-amber-900"
            >
              {displayedWinner?.name ?? "勝者"} が獲得
            </div>
          )}

          <div className="mt-3 grid gap-2">
            {displayedTrickCards.length === 0 && (
              <div className="flex min-h-36 items-center justify-center rounded-md border border-dashed border-white/20 bg-white/8 px-4 text-center text-sm font-semibold text-emerald-50/80">
                まだカードは出ていません。
              </div>
            )}
            {displayedTrickCards.map((played, order) => {
              const player = state.players.find((item) => item.id === played.playerId);
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

              return (
                <div
                  key={`${played.playerId}-${played.card.id}`}
                  data-testid="played-card"
                  data-player-id={played.playerId}
                  data-canceled={isCanceled ? "true" : "false"}
                  data-off-lead-suit={isOffLeadSuit ? "true" : "false"}
                  data-winning-card={isWinningCard ? "true" : "false"}
                  className={`grid grid-cols-[2rem_1fr_auto] items-center gap-2 rounded-md border bg-white/95 px-2 py-2 transition ${
                    isWinningCard ? "border-amber-300 ring-2 ring-amber-200" : "border-white/70"
                  } ${dimmed ? "opacity-55 grayscale saturate-50" : ""}`}
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-950 text-xs font-black text-white">
                    {order + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-black text-slate-950">
                      {player?.name ?? played.playerId}
                    </div>
                    <div className="text-[11px] font-semibold text-slate-500">
                      {isCanceled ? "キャンセル" : isOffLeadSuit ? "リード外" : isWinningCard ? "勝利候補" : "場札"}
                    </div>
                  </div>
                  <div className="relative">
                    {isCanceled && (
                      <span className="pointer-events-none absolute left-1/2 top-1/2 z-20 h-1 w-[140%] -translate-x-1/2 -translate-y-1/2 -rotate-45 rounded-full bg-rose-600/90" />
                    )}
                    <PlayingCardV2 card={played.card} compact simple />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {state.phase === "waiting" && !isPreviewingCompletedTrick && (
        <section className="px-3 pb-4">
          <div className="rounded-md border border-slate-200 bg-white p-4 text-center shadow-sm">
            <div className="text-lg font-black">プレイヤー待機中</div>
            <p className="mt-1 text-sm text-slate-500">
              4人以上で開始できます。現在 {state.players.length} 人。
            </p>
            {isHost ? (
              <button
                type="button"
                data-testid="start-game-button"
                className="mt-4 w-full rounded-md bg-slate-950 px-4 py-3 font-black text-white disabled:bg-slate-400"
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
              <p className="mt-3 text-sm font-semibold text-slate-500">
                ホストの開始を待っています。
              </p>
            )}
          </div>
        </section>
      )}

      {state.phase === "passing" && !isPreviewingCompletedTrick && !isRoundResultBlocking && (
        <section className="px-3 pb-4">
          <div
            data-testid="pass-panel"
            className="rounded-md border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-lg font-black">3枚渡す</div>
                <div className="text-sm text-slate-500">
                  渡す相手: {passTarget?.name ?? "-"}
                </div>
              </div>
              <button
                type="button"
                className="rounded-md bg-slate-950 px-4 py-2 text-sm font-black text-white disabled:bg-slate-400"
                disabled={selectedPassIds.length !== 3 || me.passedThisRound}
                onClick={submitPass}
              >
                確定 {selectedPassIds.length}/3
              </button>
            </div>
            {selectedPassCards.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {selectedPassCards.map((card) => (
                  <span key={card.id} className="rounded bg-slate-100 px-2 py-1 font-bold">
                    {card.rank} {SUIT_LABEL[card.suit]}
                  </span>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {actionError && (
        <div className="fixed left-3 right-3 top-24 z-50 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700 shadow-lg">
          {actionError}
        </div>
      )}

      {handHint && (
        <div
          data-testid="hand-hint"
          className="fixed bottom-[11.75rem] left-3 right-3 z-50 rounded-md bg-slate-950 px-3 py-2 text-center text-sm font-bold text-white shadow-lg"
        >
          {handHint}
        </div>
      )}

      {showRoundResultPanel && latestSummary && (
        <div
          data-testid="round-result-panel"
          className="fixed inset-x-3 top-20 z-[55] max-h-[70vh] overflow-y-auto rounded-md border border-white/70 bg-white p-4 shadow-2xl"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                Round Complete
              </p>
              <h2 className="mt-1 text-2xl font-black">Round {latestSummary.roundNumber} 終了</h2>
            </div>
            <button
              type="button"
              data-testid="round-result-close-button"
              className="animate-pulse rounded-md border border-slate-950 bg-slate-950 px-3 py-1.5 text-sm font-bold text-white shadow-sm"
              onClick={() => latestSummaryId && setDismissedRoundResultId(latestSummaryId)}
            >
              閉じる
            </button>
          </div>
          <div className="mt-4 space-y-2">
            {roundResultScores.map((score) => (
              <div
                key={score.playerId}
                className="grid grid-cols-[1fr_auto] rounded-md bg-slate-50 px-3 py-2 text-sm"
              >
                <span className="truncate font-bold">{score.playerName}</span>
                <span className="font-mono">
                  {signedScore(score.penalty)} + {signedScore(score.bonus)} ={" "}
                  <strong>{signedScore(score.total)}</strong>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {state.phase === "finished" && !isPreviewingCompletedTrick && (
        <div
          data-testid="game-result-panel"
          className="fixed inset-x-3 top-16 z-[60] max-h-[78vh] overflow-y-auto rounded-md border border-amber-200 bg-amber-50 p-4 shadow-2xl"
        >
          <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-700">
            Final Result
          </p>
          <h2 className="mt-1 text-3xl font-black">ゲーム終了</h2>
          <div className="mt-4 space-y-2">
            {rankings.map((player) => (
              <div
                key={player.name}
                className="flex items-center justify-between rounded-md bg-white px-3 py-3"
              >
                <span className="truncate font-black">
                  {player.rank}. {player.name}
                </span>
                <span className="font-mono font-black">{player.totalScore}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-2">
            {isHost ? (
              <button
                type="button"
                className="rounded-md bg-slate-950 px-4 py-3 font-black text-white"
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
            ) : (
              <div className="rounded-md border border-amber-200 bg-white px-4 py-3 text-center text-sm font-bold">
                ホストが新しいゲームを開始するのを待っています
              </div>
            )}
            <button
              type="button"
              className="rounded-md border border-slate-300 bg-white px-4 py-3 font-black"
              onClick={() => navigate("/")}
            >
              ロビーへ戻る
            </button>
          </div>
        </div>
      )}

      <section
        data-testid="hand-zone"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-3 pb-3 pt-2 shadow-2xl backdrop-blur"
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-black">
              {isPreviewingPreviousRound ? "トリック確認中" : `${me.name} の手札`}
            </div>
            <div className="text-xs font-semibold text-slate-500">
              {isPreviewingPreviousRound ? "" : `${state.myHand.length}枚`}
            </div>
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              data-testid="open-rules-modal-button"
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-black"
              onClick={() => setShowRulesModal(true)}
            >
              ルール
            </button>
            <button
              type="button"
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-black"
              onClick={() => setShowScoreSheet(true)}
            >
              スコア
            </button>
            <button
              type="button"
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-black"
              onClick={() => navigate("/")}
            >
              ロビー
            </button>
          </div>
        </div>
        <div className="overflow-x-auto pb-1">
          <div className="flex min-h-28 gap-2">
            {!isPreviewingPreviousRound &&
              !isRoundResultBlocking &&
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
                  canShowUnavailableReason || (state.phase === "playing" && !canPlayCard);

                return (
                  <PlayingCardV2
                    key={card.id}
                    card={card}
                    compact
                    selected={selected}
                    playable={canSelectForPassing || canPlayCard}
                    unavailable={unavailable}
                    onClick={
                      canSelectForPassing
                        ? () => handlePassSelect(card.id)
                        : canPlayCard
                          ? () => submitPlay(card.id)
                          : canShowUnavailableReason || state.phase === "playing"
                            ? () => showHint(unavailableReason(card))
                            : undefined
                    }
                  />
                );
              })}
          </div>
        </div>
      </section>

      {showScoreSheet && (
        <div className="fixed inset-0 z-[70] bg-slate-950/60 p-3 backdrop-blur-sm">
          <div className="mt-12 max-h-[78vh] overflow-y-auto rounded-md bg-white p-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black">スコア</h2>
              <button
                type="button"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-bold"
                onClick={() => setShowScoreSheet(false)}
              >
                閉じる
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {state.players
                .slice()
                .sort((a, b) => b.totalScore - a.totalScore)
                .map((player, index) => (
                  <div
                    key={player.id}
                    className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2"
                  >
                    <span className="truncate font-bold">
                      {index + 1}. {player.name}
                    </span>
                    <span className="font-mono font-black">{player.totalScore}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {showRulesModal && (
        <div
          data-testid="rules-modal"
          className="fixed inset-0 z-[80] bg-slate-950/70 p-3 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rules-heading"
        >
          <div className="flex max-h-[calc(100vh-1.5rem)] flex-col overflow-hidden rounded-md border border-white/40 bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                Rule Reference
              </span>
              <button
                type="button"
                data-testid="rules-modal-close-button"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-bold text-slate-700"
                onClick={() => setShowRulesModal(false)}
              >
                閉じる
              </button>
            </div>
            <div className="overflow-y-auto bg-[linear-gradient(135deg,#06382f,#0f766e_55%,#fde68a_190%)] p-3">
              <RulesContent compact />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
