import React, { useCallback, useState } from "react";
// @ts-nocheck
import { useSocket } from "../hooks/useSocket";
import type { Card, GameState } from "../types/game";
import { GameContext } from "./GameContextContext";

interface CreateRoomData {
  roomId: string;
  password: string;
  playerName: string;
}
interface JoinRoomData {
  roomId: string;
  playerName: string;
  password: string;
}
interface StartGameData {
  roomId: string;
}
interface ExchangeCardsData {
  roomId: string;
  selectedCardsMap: Record<string, Card[]>;
}
interface PlayCardData {
  roomId: string;
  playerId: string;
  card: Card;
}

type Callback = (res: {
  error?: string;
  myPlayerId?: string;
  isComplete?: boolean;
}) => void;

export const GameProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [state, setState] = useState<GameState | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<string>("");
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [stateValidationError, setStateValidationError] = useState<
    string | null
  >(null);

  // ゲーム状態の整合性チェック
  const validateGameState = useCallback(
    (gameState: GameState): { isValid: boolean; errors: string[] } => {
      const errors: string[] = [];

      // 基本的なチェック
      if (!gameState.players || gameState.players.length === 0) {
        errors.push("プレイヤー情報が不正です");
      }

      if (!gameState.roomId) {
        errors.push("ルームIDが設定されていません");
      }

      // フェーズの整合性チェック
      if (gameState.phase === "playing") {
        if (!gameState.rounds || gameState.rounds.length === 0) {
          errors.push("プレイ中ですがラウンド情報がありません");
        }

        if (gameState.currentRound >= gameState.rounds.length) {
          errors.push("現在のラウンドインデックスが不正です");
        }
      }

      // プレイヤーの手札チェック
      if (gameState.phase === "playing" || gameState.phase === "exchanging") {
        for (const player of gameState.players) {
          if (!Array.isArray(player.hand)) {
            errors.push(`${player.name}の手札データが不正です`);
          }
        }
      }

      return {
        isValid: errors.length === 0,
        errors,
      };
    },
    []
  );

  const socket = useSocket({
    onUpdate: (newState) => {
      console.log("=== GameContext 状態更新 ===");
      console.log("新しい状態:", newState);
      const gameState = newState as GameState;

      // 状態の整合性チェック
      const validation = validateGameState(gameState);
      if (!validation.isValid) {
        console.error("ゲーム状態の整合性エラー:", validation.errors);
        setStateValidationError(validation.errors.join(", "));
        // 状態は更新するが、エラーを記録
      } else {
        setStateValidationError(null);
      }

      console.log("フェーズ:", gameState.phase);
      console.log("現在のラウンド:", gameState.currentRound);
      console.log("ラウンド数:", gameState.rounds.length);
      console.log("現在のmyPlayerId:", myPlayerId);

      if (gameState.rounds[gameState.currentRound]) {
        const currentRound = gameState.rounds[gameState.currentRound];
        console.log("現在のラウンド詳細:", currentRound);
        console.log("ラウンドのreceivedCards:", currentRound.receivedCards);
        if (myPlayerId && currentRound.receivedCards) {
          console.log(
            "自分のreceivedCards:",
            currentRound.receivedCards[myPlayerId]
          );
        } else {
          console.log("myPlayerIdまたはreceivedCardsが存在しません");
          console.log("myPlayerId:", myPlayerId);
          console.log("receivedCards:", currentRound.receivedCards);
        }
      }
      console.log("状態更新前のstate:", state);
      setState(gameState);
      console.log("状態更新完了");
    },
    onConnect: () => setConnectionStatus("接続完了"),
    onDisconnect: () => setConnectionStatus("接続切断"),
    onError: (error) => setConnectionStatus(`エラー: ${error}`),
  });

  // ソケットイベントをラップ
  const createRoom = useCallback(
    (data: CreateRoomData, cb?: Callback) => {
      socket.createRoom(data, (res) => {
        if (res?.myPlayerId) {
          setMyPlayerId(res.myPlayerId);
        }
        cb?.(res);
      });
    },
    [socket]
  );
  const joinRoom = useCallback(
    (data: JoinRoomData, cb?: Callback) => {
      socket.joinRoom(data, (res) => {
        if (res?.myPlayerId) {
          setMyPlayerId(res.myPlayerId);
        }
        cb?.(res);
      });
    },
    [socket]
  );
  const startGame = useCallback(
    (data: StartGameData, cb?: Callback) => {
      socket.startGame(data, cb);
    },
    [socket]
  );
  const exchangeCards = useCallback(
    (data: ExchangeCardsData, cb?: Callback) => {
      socket.exchangeCards(data, cb);
    },
    [socket]
  );
  const playCard = useCallback(
    (data: PlayCardData, cb?: Callback) => {
      socket.playCard(data, cb);
    },
    [socket]
  );

  const forceFinishRound = useCallback(
    (data: { roomId: string }, cb?: Callback) => {
      socket.forceFinishRound(data, cb);
    },
    [socket]
  );

  const restartGame = useCallback(
    (data: { roomId: string }, cb?: Callback) => {
      socket.restartGame(data, cb);
    },
    [socket]
  );

  const resetGame = useCallback(() => {
    // ゲーム状態をリセット
    setState(null);
    setMyPlayerId(null);
    setConnectionStatus("");
    console.log("ゲーム状態をリセットしました");
  }, []);

  return (
    <GameContext.Provider
      value={{
        state,
        myPlayerId,
        connectionStatus,
        isConnected: socket.isConnected,
        connectionError: socket.connectionError,
        stateValidationError,
        reconnect: socket.reconnect,
        createRoom,
        joinRoom,
        startGame,
        exchangeCards,
        playCard,
        forceFinishRound,
        restartGame,
        resetGame,
      }}
    >
      {children}
    </GameContext.Provider>
  );
};
