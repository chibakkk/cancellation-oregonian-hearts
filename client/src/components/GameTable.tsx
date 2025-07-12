import React, { useContext, useEffect, useRef, useState } from "react";
import type SimpleBarCore from "simplebar";
import SimpleBar from "simplebar-react";
import "simplebar-react/dist/simplebar.min.css";
import { GameContext } from "../context/GameContextContext";
import type { Card as CardType } from "../types/game";
import Card from "./Card";

const GameTable: React.FC = () => {
  const gameContext = useContext(GameContext);
  const { state, playCard, myPlayerId } = gameContext || {};
  const myPlayer =
    state && myPlayerId
      ? state.players?.find((p) => p.id === myPlayerId)
      : undefined;
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [exchangeSelectedIdxs, setExchangeSelectedIdxs] = useState<number[]>(
    []
  );
  const [isExchanging, setIsExchanging] = useState(false);
  const [showExchangeAnimation, setShowExchangeAnimation] = useState(false);
  const [receivedCards, setReceivedCards] = useState<CardType[]>([]);
  const [showLeadNotice, setShowLeadNotice] = useState(false);
  const prevIsMyTurn = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const simpleBarRef = useRef<SimpleBarCore | null>(null);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const scrollStartX = useRef(0);

  // スクロール処理
  const scrollBy = (delta: number) => {
    if (simpleBarRef.current) {
      const scrollElement = simpleBarRef.current.getScrollElement();
      if (scrollElement) {
        scrollElement.scrollLeft += delta;
      }
    }
  };

  // ドラッグスクロール処理
  const handleMouseUp = () => {
    isDragging.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  };

  // 自分のターン判定
  const isMyTurn = (() => {
    if (!state || !myPlayerId || state.phase !== "playing") return false;

    const currentRound = state.rounds[state.currentRound];
    if (!currentRound) return false;

    const trick = currentRound.tricks[currentRound.tricks.length - 1];
    if (!trick) return false;

    // 現在のトリックで最後にカードを出したプレイヤーの次のプレイヤーが自分のターン
    const lastPlayedIndex = trick.cards.length - 1;
    if (lastPlayedIndex < 0) {
      // トリックの最初のカードの場合、リードプレイヤーが自分のターン
      return currentRound.leadPlayerId === myPlayerId;
    }

    // 最後にカードを出したプレイヤーの次のプレイヤーを計算
    const lastPlayerId = trick.cards[lastPlayedIndex].playerId;
    const lastPlayerIndex = state.players.findIndex(
      (p) => p.id === lastPlayerId
    );
    const nextPlayerIndex = (lastPlayerIndex + 1) % state.players.length;
    const nextPlayerId = state.players[nextPlayerIndex].id;

    return nextPlayerId === myPlayerId;
  })();

  // エラーハンドリング
  let errorMessage: string | null = null;
  try {
    if (!gameContext) {
      errorMessage = "ゲームコンテキストが見つかりません";
    } else if (!state) {
      errorMessage = "ゲーム状態が読み込まれていません";
    } else if (!myPlayerId) {
      errorMessage = "プレイヤーIDが設定されていません";
    } else if (!myPlayer) {
      errorMessage = `プレイヤーが見つかりません: ${myPlayerId}`;
    } else if (!myPlayer.hand || !Array.isArray(myPlayer.hand)) {
      errorMessage = "手札データが不正です";
    }
  } catch (error) {
    console.error("レンダリングエラー:", error);
    errorMessage = `レンダリングエラー: ${
      error instanceof Error ? error.message : String(error)
    }`;
  }

  // デバッグ用：常に表示されるエラー情報
  console.log("=== GameTable レンダリング状態 ===");
  console.log("gameContext存在:", !!gameContext);
  console.log("state存在:", !!state);
  console.log("myPlayerId:", myPlayerId);
  console.log("myPlayer存在:", !!myPlayer);
  console.log("state?.phase:", state?.phase);
  console.log("state?.currentRound:", state?.currentRound);
  console.log("state?.rounds?.length:", state?.rounds?.length);
  if (state?.rounds && state.currentRound !== undefined) {
    console.log("currentRound存在:", !!state.rounds[state.currentRound]);
    if (state.rounds[state.currentRound]) {
      console.log(
        "currentRound.receivedCards:",
        state.rounds[state.currentRound].receivedCards
      );
    }
  }
  console.log("errorMessage:", errorMessage);

  // キーボード矢印キー
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        scrollBy(-100);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        scrollBy(100);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // マウスが手札エリアから離れた時の処理
  useEffect(() => {
    const handleMouseLeave = () => {
      if (isDragging.current) {
        handleMouseUp();
      }
    };

    const element = scrollContainerRef.current;
    if (element) {
      element.addEventListener("mouseleave", handleMouseLeave);
      return () => element.removeEventListener("mouseleave", handleMouseLeave);
    }
  }, []);

  // フェーズが変わったら交換選択状態をリセット
  useEffect(() => {
    console.log("=== フェーズ変更検知 ===");
    console.log("現在のフェーズ:", state?.phase);
    console.log("isExchanging:", isExchanging);
    console.log("showExchangeAnimation:", showExchangeAnimation);

    if (state?.phase !== "exchanging") {
      setExchangeSelectedIdxs([]);
      // アニメーション表示中はリセットしない
      if (!showExchangeAnimation) {
        setIsExchanging(false);
      }
    } else {
      // 交換フェーズに戻った場合は状態をリセット
      setShowExchangeAnimation(false);
      setReceivedCards([]);
    }
  }, [state?.phase, showExchangeAnimation, isExchanging]);

  // 交換完了時のアニメーション表示（シンプル版）
  useEffect(() => {
    console.log("=== アニメーション表示チェック（シンプル版） ===");
    console.log("state?.phase:", state?.phase);
    console.log("myPlayerId:", myPlayerId);
    console.log("state?.rounds:", state?.rounds);
    console.log("state?.currentRound:", state?.currentRound);

    // プレイフェーズで、かつアニメーション未表示の場合のみチェック
    if (
      state?.phase === "playing" &&
      myPlayerId &&
      state.rounds &&
      state.currentRound !== undefined &&
      !showExchangeAnimation
    ) {
      const currentRound = state.rounds[state.currentRound];
      console.log("currentRound:", currentRound);
      console.log("currentRound?.receivedCards:", currentRound?.receivedCards);

      // 受け取ったカードがある場合
      if (
        currentRound?.receivedCards?.[myPlayerId] &&
        currentRound.receivedCards[myPlayerId].length > 0
      ) {
        console.log("受け取ったカードを発見！アニメーション表示開始");
        console.log("カード:", currentRound.receivedCards[myPlayerId]);

        // アニメーション表示
        setReceivedCards(currentRound.receivedCards[myPlayerId]);
        setShowExchangeAnimation(true);
        setIsExchanging(false);

        // 5秒後にアニメーション終了
        const timer = setTimeout(() => {
          console.log("アニメーション終了");
          setShowExchangeAnimation(false);
          setReceivedCards([]);
        }, 5000);

        return () => {
          console.log("アニメーションクリーンアップ");
          clearTimeout(timer);
        };
      }
    }
  }, [
    state?.phase,
    myPlayerId,
    state?.rounds,
    state?.currentRound,
    showExchangeAnimation,
  ]);

  // ターン通知の表示制御
  useEffect(() => {
    if (isMyTurn && !prevIsMyTurn.current) {
      // setShowTurnNotice関連の処理削除
    }
    prevIsMyTurn.current = isMyTurn;
  }, [isMyTurn]);

  // プレイフェーズ開始時に初手番通知を表示
  useEffect(() => {
    if (!state || !myPlayerId) return;
    const currentRound = state.rounds[state.currentRound];
    if (
      state.phase === "playing" &&
      currentRound &&
      currentRound.leadPlayerId === myPlayerId
    ) {
      // トリックの最初だった
      const currentTrick = currentRound.tricks[currentRound.tricks.length - 1];
      if (currentTrick && currentTrick.cards.length === 0) {
        setShowLeadNotice(true);
        setTimeout(() => setShowLeadNotice(false), 2000);
      } else {
        setShowLeadNotice(false);
      }
    } else {
      setShowLeadNotice(false);
    }
  }, [state?.phase, state?.currentRound, myPlayerId, state?.rounds, state]);

  if (errorMessage) {
    return (
      <div className="relative w-full h-screen bg-red-900 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-lg text-center max-w-md">
          <h2 className="text-2xl font-bold text-red-600 mb-4">
            エラーが発生しました
          </h2>
          <p className="text-gray-700 mb-4">{errorMessage}</p>
          <div className="space-y-2">
            <button
              onClick={() => {
                setShowExchangeAnimation(false);
                setReceivedCards([]);
                setIsExchanging(false);
                setExchangeSelectedIdxs([]);
                setSelectedIdx(null);
              }}
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
            >
              再試行
            </button>
            <button
              onClick={() => window.location.reload()}
              className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600 block w-full"
            >
              ページを再読み込み
            </button>
          </div>
          <div className="mt-4 text-xs text-gray-500">
            <p>デバッグ情報:</p>
            <p>gameContext: {gameContext ? "存在" : "なし"}</p>
            <p>state: {gameContext?.state ? "存在" : "なし"}</p>
            <p>myPlayerId: {gameContext?.myPlayerId || "なし"}</p>
            <p>phase: {gameContext?.state?.phase || "なし"}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!state || !myPlayerId || !myPlayer) {
    return (
      <div className="relative w-full h-screen bg-gray-800 flex items-center justify-center">
        <div className="text-white text-xl">読み込み中...</div>
      </div>
    );
  }

  console.log("=== GameTable Debug ===");
  console.log("gameContext:", gameContext);
  console.log("state:", state);
  console.log("myPlayerId:", myPlayerId);
  console.log("isConnected:", gameContext?.isConnected);
  console.log("isMyTurn:", isMyTurn);
  console.log("exchangeSelectedIdxs:", exchangeSelectedIdxs);
  console.log("isExchanging:", isExchanging);
  console.log("receivedCards:", receivedCards);
  console.log("showExchangeAnimation:", showExchangeAnimation);
  console.log("state?.phase:", state?.phase);
  console.log("state?.rounds:", state?.rounds);
  console.log("state?.currentRound:", state?.currentRound);
  if (state?.rounds && state.currentRound !== undefined) {
    console.log("currentRound:", state.rounds[state.currentRound]);
    console.log(
      "currentRound?.receivedCards:",
      state.rounds[state.currentRound]?.receivedCards
    );
  }

  // レンダリング条件の詳細ログ
  console.log("=== レンダリング条件チェック ===");
  console.log("gameContext存在:", !!gameContext);
  console.log("state存在:", !!state);
  console.log("myPlayerId存在:", !!myPlayerId);
  console.log(
    "myPlayer存在:",
    !!state?.players?.find((p) => p.id === myPlayerId)
  );
  console.log(
    "手札枚数:",
    state?.players?.find((p) => p.id === myPlayerId)?.hand?.length || 0
  );

  // マウスホイールスクロール
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    scrollBy(e.deltaX + e.deltaY);
  };

  // ドラッグスクロール
  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    dragStartX.current = e.clientX;
    if (simpleBarRef.current) {
      const scrollElement = simpleBarRef.current.getScrollElement();
      if (scrollElement) {
        scrollStartX.current = scrollElement.scrollLeft;
      }
    }
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;

    const deltaX = dragStartX.current - e.clientX;
    if (simpleBarRef.current) {
      const scrollElement = simpleBarRef.current.getScrollElement();
      if (scrollElement) {
        scrollElement.scrollLeft = scrollStartX.current + deltaX;
      }
    }
  };

  // カード交換選択処理
  const handleExchangeCardSelect = (cardIndex: number) => {
    if (state?.phase !== "exchanging" || isExchanging) return;

    setExchangeSelectedIdxs((prev) => {
      const isSelected = prev.includes(cardIndex);
      if (isSelected) {
        // 選択解除
        return prev.filter((idx) => idx !== cardIndex);
      } else {
        // 選択追加（3枚まで）
        if (prev.length >= 3) return prev;
        return [...prev, cardIndex];
      }
    });
  };

  // 現在の手番プレイヤーIDを取得
  const getCurrentTurnPlayerId = () => {
    if (!state || !state.rounds.length) return null;
    const currentRound = state.rounds[state.currentRound];
    if (!currentRound) return null;
    if (state.phase !== "playing") return null;
    const currentTrick = currentRound.tricks[currentRound.tricks.length - 1];
    if (!currentTrick) return null;
    // カードが1枚も出ていない場合はリードプレイヤー
    if (currentTrick.cards.length === 0) {
      return currentRound.leadPlayerId;
    }
    // それ以降の直前のプレイヤーの次
    const lastPlayerId =
      currentTrick.cards[currentTrick.cards.length - 1].playerId;
    const lastPlayerIndex = state.players.findIndex(
      (p) => p.id === lastPlayerId
    );
    const nextPlayerIndex = (lastPlayerIndex + 1) % state.players.length;
    return state.players[nextPlayerIndex].id;
  };
  const currentTurnPlayerId = getCurrentTurnPlayerId();
  const currentTurnPlayer = state?.players.find(
    (p) => p.id === currentTurnPlayerId
  );
  const isMyTurnNow = currentTurnPlayerId === myPlayerId;

  if (!gameContext) {
    console.log("❌ 早期リターン: gameContextが見つかりません");
    return <div>ゲームコンテキストが見つかりません</div>;
  }

  if (!state || !myPlayerId) {
    console.log("❌ 早期リターン: stateまたはmyPlayerIdがありません", {
      state: !!state,
      myPlayerId: !!myPlayerId,
    });
    return <div>ゲーム状態を読み込み中...</div>;
  }

  // 自分のプレイヤーを取得
  if (!myPlayer) {
    console.log("❌ 早期リターン: 自分のプレイヤーが見つかりません", {
      myPlayerId,
      players: state.players.map((p) => ({ id: p.id, name: p.name })),
    });
    return <div>プレイヤーが見つかりません</div>;
  }

  console.log("✅ レンダリング条件クリア: 正常にレンダリング開始");

  // 自分のプレイヤーを基準にプレイヤーを並び替え
  let sortedPlayers: typeof state.players = [];
  if (state.players.length === 2) {
    // 2人時の場合、自分が下、相手が上
    const myIdx = state.players.findIndex((p) => p.id === myPlayerId);
    if (myIdx === 0) {
      sortedPlayers = [state.players[0], state.players[1]];
    } else {
      sortedPlayers = [state.players[1], state.players[0]];
    }
  } else {
    // 3人以上の場合、自分を最後（下）に
    sortedPlayers = [...state.players].sort((a, b) => {
      if (a.id === myPlayerId) return 1;
      if (b.id === myPlayerId) return -1;
      return 0;
    });
  }

  // ホスト判定
  const isHost = !!(
    state &&
    myPlayerId &&
    state.players.find((p) => p.id === myPlayerId && p.isHost)
  );
  // ゲーム開始可能条件
  const canStart = !!(
    state &&
    state.players.length >= 2 &&
    state.phase === "waiting"
  );

  // ゲーム開始処理
  const handleStartGame = () => {
    if (canStart && isHost && state.roomId) {
      if (typeof gameContext?.startGame === "function") {
        gameContext.startGame({ roomId: state.roomId });
      }
    }
  };

  // 手札をスート順でソート
  const suitOrder = { spades: 0, hearts: 1, diamonds: 2, clubs: 3 };
  const rankOrder = {
    A: 14,
    K: 13,
    Q: 12,
    J: 11,
    10: 10,
    9: 9,
    8: 8,
    7: 7,
    6: 6,
    5: 5,
    4: 4,
    3: 3,
    2: 2,
  };
  const sortedHand = [...myPlayer.hand].sort((a, b) => {
    if (suitOrder[a.suit] !== suitOrder[b.suit]) {
      return suitOrder[a.suit] - suitOrder[b.suit];
    }
    return (
      rankOrder[a.rank as keyof typeof rankOrder] -
      rankOrder[b.rank as keyof typeof rankOrder]
    );
  });

  return (
    <div className="relative w-full h-screen bg-green-800 rounded-lg overflow-hidden">
      {/* ルームID表示 */}
      <div className="absolute top-4 left-4 bg-white/90 rounded-lg px-3 py-2 shadow-lg z-10">
        <div className="text-xs text-gray-600 mb-1">ルームID</div>
        <div className="text-lg font-mono font-bold text-gray-800">
          {state.roomId}
        </div>
      </div>

      {/* ゲーム開始前のみ中央に「ゲーム開始」ボタン */}
      {isHost && state.phase === "waiting" && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
          <button
            className={`px-10 py-5 rounded-xl font-bold text-white shadow-2xl text-2xl
              ${
                canStart
                  ? "bg-orange-500 hover:bg-orange-600"
                  : "bg-gray-400 cursor-not-allowed"
              }
            `}
            disabled={!canStart}
            onClick={handleStartGame}
          >
            ゲーム開始
          </button>
        </div>
      )}

      {/* プレイヤー配置・獲得トリック枚数 */}
      {sortedPlayers.map((player, idx) => {
        const isMe = player.id === myPlayerId;
        let position;
        if (sortedPlayers.length === 2) {
          // 2人の場合、自分が下、相手が上
          position =
            idx === 0 ? { x: "50%", y: "80%" } : { x: "50%", y: "20%" };
        } else if (idx === sortedPlayers.length - 1) {
          // 3人以上の場合、自分を最後（下）に
          position = { x: "50%", y: "80%" };
        } else {
          const N = sortedPlayers.length;
          const angle = (idx / (N - 1)) * Math.PI + Math.PI * 0.1;
          const radius = 38;
          position = {
            x: `${50 + radius * Math.cos(angle)}%`,
            y: `${35 + radius * Math.sin(angle)}%`,
          };
        }
        // 獲得トリック枚数
        const tricks = player.tricks || [];
        const trickCount = tricks.reduce((sum, arr) => sum + arr.length, 0);
        return (
          <div
            key={player.id + "-seat"}
            className={`absolute transform -translate-x-1/2 -translate-y-1/2 w-24 h-32 bg-blue-600 rounded-lg border-2 ${
              isMe ? "border-yellow-400 shadow-lg z-30" : "border-blue-400 z-20"
            } flex flex-col items-center justify-center p-2`}
            style={{ left: position.x, top: position.y }}
          >
            <div
              className={`text-xs font-bold text-center ${
                isMe ? "text-yellow-200" : "text-white"
              }`}
            >
              {player.name}
              {isMe && <span className="block text-yellow-300">あなた！</span>}
            </div>
            <div className="text-xs text-gray-300 mt-1">
              カード {player.hand.length}枚
            </div>
            {/* 獲得トリック枚数表示 */}
            <div className="mt-1 flex items-center gap-1">
              <div className="w-6 h-8 bg-gray-500 rounded shadow-inner flex items-center justify-center text-white text-xs">
                🂠
              </div>
              <span className="text-xs text-white">Á{trickCount}</span>
            </div>

            {/* 現在のスコア表示 */}
            {player.totalScore !== undefined && (
              <div className="mt-1 text-xs">
                <span
                  className={`font-bold ${
                    (player.totalScore || 0) > 0
                      ? "text-green-400"
                      : (player.totalScore || 0) < 0
                      ? "text-red-400"
                      : "text-gray-300"
                  }`}
                >
                  {(player.totalScore || 0) > 0 ? "+" : ""}
                  {player.totalScore || 0}点
                </span>
              </div>
            )}
          </div>
        );
      })}

      {/* 出したカードをチェスト全体に対して絶対配置で表示 */}
      {sortedPlayers.map((player, idx) => {
        // 出したカード（現在のトリック）
        let playedCard = null;
        if (state.phase === "playing" && state.rounds.length > 0) {
          const currentRound = state.rounds[state.currentRound];
          const currentTrick =
            currentRound.tricks[currentRound.tricks.length - 1];
          const played = currentTrick.cards.find(
            (c) => c.playerId === player.id
          );
          if (played) playedCard = played.card;
        }
        if (!playedCard) return null;
        let top;
        if (sortedPlayers.length === 2) {
          top = idx === 0 ? "55%" : "30%";
        } else {
          // 3人以上の場合、従来通り座席の位置
          top = undefined;
        }
        return (
          <div
            key={player.id + "-playedcard"}
            className="absolute left-1/2 -translate-x-1/2 z-50"
            style={
              top
                ? { top }
                : {
                    top: undefined,
                    bottom: undefined,
                    transform: "translate(-50%, -4rem)",
                  }
            }
          >
            <Card
              suit={playedCard.suit}
              rank={playedCard.rank}
              isSelectable={false}
              isSelected={false}
              className={
                player.id === myPlayerId
                  ? "scale-110 ring-4 ring-yellow-400"
                  : ""
              }
            />
          </div>
        );
      })}

      {/* ゲーム状態表示 */}
      <div className="absolute top-1/3 right-4 bg-black bg-opacity-50 text-white p-2 rounded z-10">
        <div>状態 {state.phase}</div>
        <div>プレイヤー数: {state.players.length}人</div>
        {state.rounds.length > 0 && (
          <div>ラウンド {state.rounds[state.currentRound].roundNumber}</div>
        )}
      </div>

      {/* リアルタイムスコアパネル */}
      {state.phase === "playing" && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-black bg-opacity-70 text-white p-3 rounded-lg shadow-lg z-20">
          <div className="text-center mb-2">
            <h3 className="text-sm font-bold text-yellow-300">現在のスコア</h3>
          </div>
          <div className="flex gap-4">
            {state.players.map((player) => {
              const totalScore = player.totalScore || 0;
              const isMe = player.id === myPlayerId;

              // 現在のラウンドでの獲得カードを取得
              const currentRoundCards = player.tricks.flat();
              const heartsCount = currentRoundCards.filter(
                (card) => card.suit === "hearts"
              ).length;
              const hasSpadeQueen = currentRoundCards.some(
                (card) => card.suit === "spades" && card.rank === "Q"
              );

              return (
                <div
                  key={player.id}
                  className={`text-center px-2 py-1 rounded ${
                    isMe
                      ? "bg-yellow-900 bg-opacity-50"
                      : "bg-gray-800 bg-opacity-50"
                  }`}
                >
                  <div
                    className={`text-xs font-bold ${
                      isMe ? "text-yellow-300" : "text-white"
                    }`}
                  >
                    {player.name}
                  </div>
                  <div
                    className={`text-sm font-bold ${
                      totalScore > 0
                        ? "text-green-400"
                        : totalScore < 0
                        ? "text-red-400"
                        : "text-gray-300"
                    }`}
                  >
                    {totalScore > 0 ? "+" : ""}
                    {totalScore}点
                  </div>
                  {(heartsCount > 0 || hasSpadeQueen) && (
                    <div className="text-xs text-gray-400 mt-1">
                      {heartsCount > 0 && <div>♥{heartsCount}</div>}
                      {hasSpadeQueen && <div>♠Q</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* スコア表示 */}
      {state.phase === "scoring" && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-black bg-opacity-90 text-white p-6 rounded-lg shadow-2xl z-50 min-w-96">
          <div className="text-center mb-4">
            <h2 className="text-2xl font-bold text-yellow-400 mb-2">
              ラウンド{state.rounds[state.currentRound]?.roundNumber} 結果
            </h2>
            <div className="text-sm text-gray-300">
              ハート -1点, スペードQ: +13点
            </div>
          </div>

          <div className="space-y-3">
            {state.players.map((player) => {
              const roundScore =
                player.roundScores?.[player.roundScores.length - 1] || 0;
              const totalScore = player.totalScore || 0;
              const isMe = player.id === myPlayerId;

              // 獲得したカードを取得
              const allCards = player.tricks.flat();
              const heartsCount = allCards.filter(
                (card) => card.suit === "hearts"
              ).length;
              const hasSpadeQueen = allCards.some(
                (card) => card.suit === "spades" && card.rank === "Q"
              );

              return (
                <div
                  key={player.id}
                  className={`p-3 rounded border-2 ${
                    isMe
                      ? "border-yellow-400 bg-yellow-900 bg-opacity-30"
                      : "border-gray-600 bg-gray-800 bg-opacity-30"
                  }`}
                >
                  <div className="flex justify-between items-center mb-2">
                    <span
                      className={`font-bold ${
                        isMe ? "text-yellow-300" : "text-white"
                      }`}
                    >
                      {player.name}
                      {isMe && " (あなた)"}
                    </span>
                    <div className="text-right">
                      <div
                        className={`text-lg font-bold ${
                          roundScore > 0
                            ? "text-green-400"
                            : roundScore < 0
                            ? "text-red-400"
                            : "text-gray-300"
                        }`}
                      >
                        {roundScore > 0 ? "+" : ""}
                        {roundScore}点
                      </div>
                      <div className="text-sm text-gray-400">
                        累計 {totalScore}点
                      </div>
                    </div>
                  </div>

                  <div className="text-sm text-gray-300 space-y-1">
                    <div className="flex justify-between">
                      <span>ハート {heartsCount}枚</span>
                      <span className="text-red-400">-{heartsCount}点</span>
                    </div>
                    {hasSpadeQueen && (
                      <div className="flex justify-between">
                        <span>スペードQ: 1点</span>
                        <span className="text-green-400">+13点</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>獲得トリック: {player.tricks.length}個</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 text-center">
            <button
              className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition"
              onClick={() => {
                // 次のラウンド開始はサーバー側で自動的に行われる想定！
                console.log("次のラウンドを開始します");
              }}
            >
              次のラウンドへ
            </button>
          </div>
        </div>
      )}

      {/* ゲーム終了結果表示 */}
      {state.phase === "finished" && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-black bg-opacity-90 text-white p-6 rounded-lg shadow-2xl z-50 min-w-96">
          <div className="text-center mb-4">
            <h2 className="text-3xl font-bold text-yellow-400 mb-2">
              ゲーム終了
            </h2>
            <div className="text-lg text-gray-300">最終結果</div>
          </div>

          <div className="space-y-3">
            {state.players
              .sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0))
              .map((player, index) => {
                const totalScore = player.totalScore || 0;
                const isMe = player.id === myPlayerId;
                const isWinner = index === 0;

                return (
                  <div
                    key={player.id}
                    className={`p-3 rounded border-2 ${
                      isWinner
                        ? "border-yellow-400 bg-yellow-900 bg-opacity-30"
                        : isMe
                        ? "border-blue-400 bg-blue-900 bg-opacity-30"
                        : "border-gray-600 bg-gray-800 bg-opacity-30"
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        {isWinner && <span className="text-2xl">🏆</span>}
                        <span
                          className={`font-bold ${
                            isWinner
                              ? "text-yellow-300"
                              : isMe
                              ? "text-blue-300"
                              : "text-white"
                          }`}
                        >
                          {player.name}
                          {isMe && " (あなた)"}
                        </span>
                      </div>
                      <div className="text-right">
                        <div
                          className={`text-xl font-bold ${
                            totalScore > 0
                              ? "text-green-400"
                              : totalScore < 0
                              ? "text-red-400"
                              : "text-gray-300"
                          }`}
                        >
                          {totalScore > 0 ? "+" : ""}
                          {totalScore}点
                        </div>
                        <div className="text-sm text-gray-400">
                          {index + 1}位
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>

          <div className="mt-4 text-center">
            <button
              className="px-6 py-2 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 transition mr-2"
              onClick={() => {
                // 新しいゲーム開始
                console.log("新しいゲームを開始します");
              }}
            >
              新しいゲーム
            </button>
            <button
              className="px-6 py-2 bg-gray-600 text-white rounded-lg font-bold hover:bg-gray-700 transition"
              onClick={() => {
                // ホームに戻る
                window.location.href = "/";
              }}
            >
              ホームに戻る
            </button>
          </div>
        </div>
      )}

      {/* 誰の手番か常時表示（プレイフェーズ中） */}
      {state.phase === "playing" && currentTurnPlayer && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-40">
          <div
            className={`px-6 py-2 rounded-lg shadow-lg font-bold text-lg ${
              isMyTurnNow
                ? "bg-yellow-400 text-black animate-pulse"
                : "bg-white text-blue-700"
            }`}
          >
            {isMyTurnNow
              ? "あなたの手番です！"
              : `${currentTurnPlayer.name}さんの手番`}
          </div>
        </div>
      )}

      {/* あなたが初手番です通知 */}
      {showLeadNotice && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50">
          <div className="bg-blue-500 text-white px-6 py-3 rounded-lg shadow-lg font-bold text-xl animate-pulse">
            あなたが初手番です！
          </div>
        </div>
      )}

      {/* カード交換アニメーション */}
      {showExchangeAnimation && receivedCards.length > 0 && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded-lg shadow-lg text-center">
            <h3 className="text-xl font-bold mb-4 text-green-600">
              カード交換完了
            </h3>
            <p className="mb-4">左隣のプレイヤーから受け取ったカード</p>
            <div className="flex justify-center gap-2 mb-4">
              {receivedCards.map((card, index) => (
                <div
                  key={`received-${index}`}
                  className="w-16 h-24 bg-white border-2 border-green-500 rounded-lg flex flex-col items-center justify-center shadow-lg transform scale-110"
                >
                  <div className="text-sm font-bold text-green-600">
                    {card.suit === "hearts" && "♥"}
                    {card.suit === "diamonds" && "♦"}
                    {card.suit === "clubs" && "♣"}
                    {card.suit === "spades" && "♠"}
                  </div>
                  <div className="text-lg font-bold">{card.rank}</div>
                </div>
              ))}
            </div>
            <p className="text-sm text-gray-600">
              アニメーション表示中... (5秒)
            </p>
            <div className="mt-2 text-xs text-gray-500">デバッグ情報:</div>
            <div className="mt-1 text-xs text-gray-500">
              showExchangeAnimation: {showExchangeAnimation.toString()}
            </div>
            <div className="mt-1 text-xs text-gray-500">
              receivedCards.length: {receivedCards.length}
            </div>
            <div className="mt-1 text-xs text-gray-500">
              state?.phase: {state?.phase}
            </div>
            <div className="mt-1 text-xs text-gray-500">
              isExchanging: {isExchanging.toString()}
            </div>
            <div className="mt-1 text-xs text-gray-500">
              myPlayerId: {myPlayerId}
            </div>
            <div className="mt-1 text-xs text-gray-500">
              currentRound: {state?.currentRound}
            </div>
            <div className="mt-1 text-xs text-gray-500">
              receivedCards詳細: {JSON.stringify(receivedCards)}
            </div>
            <div className="mt-1 text-xs text-gray-500">
              現在時刻: {new Date().toLocaleTimeString()}
            </div>
            <button
              onClick={() => {
                setShowExchangeAnimation(false);
                setReceivedCards([]);
              }}
              className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              閉じる
            </button>
          </div>
        </div>
      )}

      {/* ゲーム開始前の状態表示（waitingフェーズ） */}
      {state.phase === "waiting" && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50">
          <div className="bg-gray-800 text-white px-8 py-6 rounded-lg shadow-lg text-center relative">
            <div className="text-xl font-bold mb-2">ルーム準備中</div>
            {isHost ? (
              <>
                <div className="mb-4">
                  あなたはホストです。メンバーが揃ったら「ゲーム開始」ボタンを押してください、
                </div>
                <button
                  className={`px-10 py-5 rounded-xl font-bold text-white shadow-2xl text-2xl transition-all duration-200 z-60 ${
                    canStart
                      ? "bg-orange-500 hover:bg-orange-600"
                      : "bg-gray-400 cursor-not-allowed"
                  }`}
                  disabled={!canStart}
                  onClick={handleStartGame}
                  style={{ marginTop: "16px" }}
                >
                  ゲーム開始
                </button>
              </>
            ) : (
              <div>ホストがゲーム開始するのを待っています…</div>
            )}
          </div>
        </div>
      )}

      {/* プレイヤー一覧・交換フェイズUI */}
      {state.phase === "exchanging" && (
        <div className="absolute top-1/4 left-1/2 transform -translate-x-1/2 z-30">
          <div className="bg-blue-600 text-white px-6 py-4 rounded-lg shadow-lg">
            <div className="text-center mb-3">
              <div className="text-lg font-bold mb-2">カード交換</div>
              <div className="text-sm">
                手札から3枚を選択して左隣のプレイヤーに渡してください
              </div>
              <div className="text-sm text-yellow-300">
                選択中: {exchangeSelectedIdxs.length}/3
              </div>
            </div>
            <div className="mb-3">
              <div className="text-sm font-bold mb-2">プレイヤーの状態</div>
              {state.players.map((player) => {
                const currentRound = state.rounds[state.currentRound];
                const isCompleted = currentRound?.exchangeCompleted?.includes(
                  player.id
                );
                const isMe = player.id === myPlayerId;
                const isLead = currentRound?.leadPlayerId === player.id;
                const isHost = player.isHost;
                return (
                  <div
                    key={player.id}
                    className="flex items-center justify-between text-xs mb-1"
                  >
                    <span
                      className={
                        isMe ? "text-yellow-300 font-bold" : "text-white"
                      }
                    >
                      {player.name}
                      {isMe && " (あなた)"}
                      {isHost && (
                        <span className="ml-2 bg-purple-500 text-white px-2 py-0.5 rounded text-xxs font-bold">
                          ホスト
                        </span>
                      )}
                      {isLead && (
                        <span className="ml-2 bg-blue-400 text-white px-2 py-0.5 rounded text-xxs font-bold">
                          先攻
                        </span>
                      )}
                    </span>
                    <span
                      className={
                        isCompleted ? "text-green-300" : "text-yellow-300"
                      }
                    >
                      {isCompleted ? "✅交換完了" : "選択中..."}
                    </span>
                  </div>
                );
              })}
            </div>
            {/* 交換確定ボタン or 交換中表示 */}
            {!isExchanging ? (
              <div className="flex gap-2 justify-center">
                <button
                  className={`px-4 py-2 rounded font-bold ${
                    exchangeSelectedIdxs.length === 3
                      ? "bg-green-500 hover:bg-green-600"
                      : "bg-gray-400 cursor-not-allowed"
                  }`}
                  disabled={exchangeSelectedIdxs.length !== 3}
                  onClick={() => {
                    // ガードチェック
                    if (
                      !sortedHand ||
                      !myPlayerId ||
                      !gameContext?.exchangeCards ||
                      !state ||
                      !state.roomId
                    )
                      return;
                    setIsExchanging(true);
                    const selectedCards = exchangeSelectedIdxs.map(
                      (idx) => sortedHand[idx]
                    );
                    gameContext.exchangeCards(
                      {
                        roomId: state.roomId,
                        selectedCardsMap: {
                          [myPlayerId]: selectedCards,
                        },
                      },
                      (res) => {
                        console.log("exchangeCards応答:", res);
                        if (res?.error) {
                          console.error("カード交換エラー:", res.error);
                          setIsExchanging(false);
                        } else if (res?.isComplete === false) {
                          // 全員の交換が完了していない場合はisExchangingを維持
                          console.log("全員の交換完了待機中...");
                        } else {
                          // 交換完了またはエラーの場合はisExchangingをリセット
                          console.log("カード交換完了またはエラー");
                          setIsExchanging(false);
                        }
                      }
                    );
                  }}
                >
                  交換確定
                </button>
              </div>
            ) : (
              <div className="text-center text-yellow-300 font-bold mt-2">
                他のプレイヤーの交換中...
              </div>
            )}
          </div>
        </div>
      )}
      {/* 交換中はプレイヤー一覧のみ */}
      {state.phase === "waiting" && (
        <div className="absolute top-1/4 left-1/2 transform -translate-x-1/2 z-30">
          <div className="bg-blue-600 text-white px-6 py-4 rounded-lg shadow-lg">
            <div className="text-center mb-3">
              <div className="text-lg font-bold mb-2">プレイヤー一覧</div>
            </div>
            <div className="mb-3">
              {state.players.map((player) => {
                const isMe = player.id === myPlayerId;
                const isHost = player.isHost;
                return (
                  <div
                    key={player.id}
                    className="flex items-center text-xs mb-1"
                  >
                    <span
                      className={
                        isMe ? "text-yellow-300 font-bold" : "text-white"
                      }
                    >
                      {player.name}
                      {isMe && " (あなた)"}
                      {isHost && (
                        <span className="ml-2 bg-purple-500 text-white px-2 py-0.5 rounded text-xxs font-bold">
                          ホスト
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 下部の手札エリア */}
      <div
        ref={scrollContainerRef}
        className="absolute left-1/2 bottom-2 -translate-x-1/2 w-full max-w-3xl px-2 pb-2 z-10"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        style={{ cursor: isDragging.current ? "grabbing" : "grab" }}
      >
        <SimpleBar
          ref={simpleBarRef}
          autoHide={true}
          style={{ cursor: isDragging.current ? "grabbing" : "grab" }}
        >
          <div className="flex flex-nowrap gap-2">
            {state &&
              sortedHand.map((card, i) => {
                // 出せるカードかどうか判定
                let isPlayable = true;
                if (state.phase === "playing" && isMyTurnNow) {
                  const currentRound = state.rounds[state.currentRound];
                  const currentTrick =
                    currentRound.tricks[currentRound.tricks.length - 1];
                  if (currentTrick.cards.length > 0) {
                    const leadSuit =
                      currentTrick.leadSuit || currentTrick.cards[0].card.suit;
                    const hasLeadSuit = sortedHand.some(
                      (c) => c.suit === leadSuit
                    );
                    if (hasLeadSuit && card.suit !== leadSuit) {
                      isPlayable = false;
                    }
                  }
                  // ハートブレイク: リードでハートを出せない
                  if (
                    currentTrick.cards.length === 0 &&
                    card.suit === "hearts" &&
                    !state.heartsBroken
                  ) {
                    const onlyHearts = sortedHand.every(
                      (c) => c.suit === "hearts"
                    );
                    if (!onlyHearts) isPlayable = false;
                  }
                }
                const isSelected = selectedIdx === i;
                const isReceivedCard = receivedCards.some(
                  (rc) => rc.id === card.id
                );
                return (
                  <div
                    key={card.id}
                    className="flex-shrink-0"
                  >
                    <Card
                      suit={card.suit}
                      rank={card.rank}
                      isSelectable={
                        (state.phase === "exchanging" && !isExchanging) ||
                        (state.phase === "playing" && isMyTurnNow && isPlayable)
                      }
                      isSelected={
                        state.phase === "exchanging"
                          ? exchangeSelectedIdxs.includes(i)
                          : isSelected
                      }
                      onClick={() => {
                        if (state.phase === "exchanging" && !isExchanging) {
                          handleExchangeCardSelect(i);
                        } else if (
                          state.phase === "playing" &&
                          isMyTurnNow &&
                          isPlayable
                        ) {
                          setSelectedIdx(i);
                        }
                      }}
                      className={
                        !isPlayable && state.phase === "playing" && isMyTurnNow
                          ? "opacity-40"
                          : isReceivedCard && state.phase === "playing"
                          ? "ring-4 ring-green-400 animate-pulse"
                          : ""
                      }
                    />
                    {isReceivedCard && (
                      <div className="absolute -top-1 -right-1 bg-green-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                        ✅
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </SimpleBar>
        {/* カードを出すボタン */}
        {state.phase === "playing" && isMyTurnNow && selectedIdx !== null && (
          <div className="flex justify-center mt-4">
            <button
              className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold shadow-lg hover:bg-blue-700 transition"
              onClick={() => {
                if (!state || !myPlayerId || !playCard || selectedIdx === null)
                  return;
                const card = sortedHand[selectedIdx];
                playCard({
                  roomId: state.roomId,
                  playerId: myPlayerId,
                  card,
                });
                setSelectedIdx(null);
              }}
            >
              カードを出す
            </button>
          </div>
        )}
      </div>

      {/* テスト用: デバッグボタン群 */}
      <div className="absolute top-4 right-4 z-50 space-y-2">
        {/* 強制アニメーション表示ボタン */}
        {state?.phase === "playing" && (
          <button
            onClick={() => {
              console.log("テスト: 強制アニメーション表示");
              setShowExchangeAnimation(true);
              setReceivedCards([
                { suit: "hearts", rank: "A", id: "test-1" },
                { suit: "spades", rank: "K", id: "test-2" },
                { suit: "diamonds", rank: "Q", id: "test-3" },
              ]);
              setTimeout(() => {
                setShowExchangeAnimation(false);
                setReceivedCards([]);
              }, 5000);
            }}
            className="bg-red-500 text-white px-4 py-2 rounded text-sm block w-full"
          >
            テスト: アニメーション表示
          </button>
        )}

        {/* 状態リセットボタン */}
        <button
          onClick={() => {
            console.log("テスト: 状態リセット");
            setShowExchangeAnimation(false);
            setReceivedCards([]);
            setIsExchanging(false);
            setExchangeSelectedIdxs([]);
            setSelectedIdx(null);
          }}
          className="bg-orange-500 text-white px-4 py-2 rounded text-sm block w-full"
        >
          状態リセット
        </button>

        {/* デバッグ情報表示ボタン */}
        <button
          onClick={() => {
            console.log("=== 現在の状態詳細 ===");
            console.log("state:", state);
            console.log("myPlayerId:", myPlayerId);
            console.log("showExchangeAnimation:", showExchangeAnimation);
            console.log("receivedCards:", receivedCards);
            console.log("isExchanging:", isExchanging);
            console.log("exchangeSelectedIdxs:", exchangeSelectedIdxs);
            console.log("selectedIdx:", selectedIdx);

            // 現在のラウンド情報も表示
            if (state?.rounds && state.currentRound !== undefined) {
              const currentRound = state.rounds[state.currentRound];
              console.log("currentRound:", currentRound);
              console.log(
                "currentRound?.receivedCards:",
                currentRound?.receivedCards
              );
              console.log(
                "currentRound?.receivedCards[myPlayerId]:",
                currentRound?.receivedCards?.[myPlayerId]
              );
            }

            alert("デバッグ情報をコンソールに出力しました");
          }}
          className="bg-blue-500 text-white px-4 py-2 rounded text-sm block w-full"
        >
          デバッグ情報
        </button>

        {/* 強制アニメーション表示ボタン（詳細版） */}
        <button
          onClick={() => {
            console.log("テスト: 強制アニメーション表示（詳細版）");
            const testCards: CardType[] = [
              { suit: "hearts", rank: "A", id: "test-1" },
              { suit: "spades", rank: "K", id: "test-2" },
              { suit: "diamonds", rank: "Q", id: "test-3" },
            ];
            console.log("テストカード:", testCards);
            setReceivedCards(testCards);
            setShowExchangeAnimation(true);
            setIsExchanging(false);
          }}
          className="bg-purple-500 text-white px-4 py-2 rounded text-sm block w-full"
        >
          強制アニメーション
        </button>

        {/* 現在のラウンド情報確認ボタン */}
        <button
          onClick={() => {
            console.log("=== 現在のラウンド情報詳細 ===");
            console.log("myPlayerId:", myPlayerId);
            console.log("state?.currentRound:", state?.currentRound);
            console.log("state?.rounds:", state?.rounds);

            if (state?.rounds && state.currentRound !== undefined) {
              const currentRound = state.rounds[state.currentRound];
              console.log("currentRound:", currentRound);
              console.log(
                "currentRound.receivedCards:",
                currentRound.receivedCards
              );

              if (myPlayerId && currentRound.receivedCards) {
                console.log(
                  "自分のreceivedCards:",
                  currentRound.receivedCards[myPlayerId]
                );
                console.log(
                  "receivedCardsのキー:",
                  Object.keys(currentRound.receivedCards)
                );
              } else {
                console.log("myPlayerIdまたはreceivedCardsが存在しません");
              }
            }

            alert("ラウンド情報をコンソールに出力しました");
          }}
          className="bg-green-500 text-white px-4 py-2 rounded text-sm block w-full"
        >
          ラウンド情報確認
        </button>
      </div>
    </div>
  );
};

export default GameTable;
