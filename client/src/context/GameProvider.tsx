import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCohSocket, type ConnectionPhase } from "../hooks/useCohSocket";
import type { GameView } from "../types/coh";
import { GameContext } from "./GameContextContext";

const SESSION_STORAGE_KEY = "coh:session";

interface StoredSession {
  roomId: string;
  playerId: string;
  sessionToken: string;
}

type Callback = (res: {
  success?: boolean;
  error?: string;
  myPlayerId?: string;
  sessionToken?: string;
  state?: GameView;
}) => void;

function loadStoredSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (!parsed.roomId || !parsed.playerId || !parsed.sessionToken) {
      return null;
    }
    return {
      roomId: parsed.roomId,
      playerId: parsed.playerId,
      sessionToken: parsed.sessionToken,
    };
  } catch {
    return null;
  }
}

function saveStoredSession(session: StoredSession): void {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

function clearStoredSession(): void {
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

function statusFromConnection(
  phase: ConnectionPhase,
  reconnectAttempt: number,
  error: string | null
): string {
  if (phase === "connected") {
    return "接続中";
  }
  if (phase === "connecting") {
    return "接続中...";
  }
  if (phase === "reconnecting") {
    return reconnectAttempt > 0
      ? `再接続中... (${reconnectAttempt}回目)`
      : "再接続中...";
  }
  if (phase === "disconnected") {
    return "切断中";
  }
  return error ?? "接続エラー";
}

export const GameProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [state, setState] = useState<GameView | null>(null);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<string | null>(null);
  const resumeAttemptedRef = useRef(false);

  const socket = useCohSocket({
    onUpdate: (newState) => {
      setState(newState);
      if (newState.myPlayerId) {
        setMyPlayerId(newState.myPlayerId);
      }
    },
    onConnect: () => {
      resumeAttemptedRef.current = false;
    },
    onDisconnect: () => {
      resumeAttemptedRef.current = false;
    },
  });

  const connectionStatus = useMemo(
    () =>
      sessionStatus ??
      statusFromConnection(
        socket.connectionPhase,
        socket.reconnectAttempt,
        socket.connectionError
      ),
    [
      sessionStatus,
      socket.connectionPhase,
      socket.reconnectAttempt,
      socket.connectionError,
    ]
  );

  const handleResponse = useCallback(
    (res: Parameters<Callback>[0], cb?: Callback) => {
      if (res.myPlayerId) {
        setMyPlayerId(res.myPlayerId);
      }
      if (res.state) {
        setState(res.state);
      }
      if (res.state?.roomId && res.myPlayerId && res.sessionToken) {
        resumeAttemptedRef.current = true;
        saveStoredSession({
          roomId: res.state.roomId,
          playerId: res.myPlayerId,
          sessionToken: res.sessionToken,
        });
        setSessionStatus(null);
      }
      cb?.(res);
    },
    []
  );

  useEffect(() => {
    if (!socket.isConnected || resumeAttemptedRef.current) {
      return;
    }
    const storedSession = loadStoredSession();
    if (!storedSession) {
      return;
    }

    resumeAttemptedRef.current = true;
    setSessionStatus("セッション復帰中...");
    socket.resumeSession(storedSession, (res) => {
      if (res.error) {
        clearStoredSession();
        setSessionStatus("セッション復帰に失敗しました。ロビーから参加し直してください。");
        return;
      }
      handleResponse(res);
      setSessionStatus(null);
    });
  }, [handleResponse, socket, socket.isConnected]);

  return (
    <GameContext.Provider
      value={{
        state,
        myPlayerId,
        connectionStatus,
        connectionPhase: socket.connectionPhase,
        isConnected: socket.isConnected,
        connectionError: socket.connectionError,
        reconnectAttempt: socket.reconnectAttempt,
        reconnect: socket.reconnect,
        createRoom: (data, cb) =>
          socket.createRoom(data, (res) => handleResponse(res, cb)),
        joinRoom: (data, cb) =>
          socket.joinRoom(data, (res) => handleResponse(res, cb)),
        startGame: (data, cb) =>
          socket.startGame(data, (res) => handleResponse(res, cb)),
        passCards: (data, cb) =>
          socket.passCards(data, (res) => handleResponse(res, cb)),
        playCard: (data, cb) =>
          socket.playCard(data, (res) => handleResponse(res, cb)),
        restartGame: (data, cb) =>
          socket.restartGame(data ?? {}, (res) => handleResponse(res, cb)),
        resetGame: () => {
          clearStoredSession();
          resumeAttemptedRef.current = false;
          setSessionStatus(null);
          setState(null);
          setMyPlayerId(null);
        },
      }}
    >
      {children}
    </GameContext.Provider>
  );
};
