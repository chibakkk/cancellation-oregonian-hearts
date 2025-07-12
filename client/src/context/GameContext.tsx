import React, { useCallback, useState } from "react";
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

type Callback = (res: { error?: string; myPlayerId?: string }) => void;

export const GameProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [state, setState] = useState<GameState | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<string>("");
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);

  const socket = useSocket({
    onUpdate: (newState) => {
      console.log("=== GameContext 状態更新 ===");
      console.log("新しい状態:", newState);
      const gameState = newState as GameState;
      console.log("フェーズ:", gameState.phase);
      console.log("現在のラウンド:", gameState.currentRound);
      if (gameState.rounds[gameState.currentRound]) {
        console.log(
          "ラウンドのreceivedCards:",
          gameState.rounds[gameState.currentRound].receivedCards
        );
      }
      setState(gameState);
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

  return (
    <GameContext.Provider
      value={{
        state,
        myPlayerId,
        connectionStatus,
        isConnected: socket.isConnected,
        connectionError: socket.connectionError,
        reconnect: socket.reconnect,
        createRoom,
        joinRoom,
        startGame,
        exchangeCards,
        playCard,
      }}
    >
      {children}
    </GameContext.Provider>
  );
};
