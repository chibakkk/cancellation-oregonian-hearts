import { useCallback, useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import type { GameView } from "../types/coh";

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "http://localhost:3001";

export type ConnectionPhase =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";

type ServerResponse = {
  success?: boolean;
  error?: string;
  myPlayerId?: string;
  sessionToken?: string;
  state?: GameView;
};

interface UseSocketOptions {
  onUpdate?: (state: GameView) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: string) => void;
}

type DebugWindow = Window & {
  __cohSocketDebug?: {
    disconnect: () => void;
    reconnect: () => void;
    closeTransport: () => void;
  };
};

export function useCohSocket(options: UseSocketOptions) {
  const socketRef = useRef<ReturnType<typeof io> | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionPhase, setConnectionPhase] =
    useState<ConnectionPhase>("connecting");
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);

  useEffect(() => {
    const socket = io(SERVER_URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 800,
      reconnectionDelayMax: 4_000,
    });
    socketRef.current = socket;

    const manager = socket.io;

    socket.on("connect", () => {
      setIsConnected(true);
      setConnectionPhase("connected");
      setConnectionError(null);
      setReconnectAttempt(0);
      options.onConnect?.();
    });

    socket.on("disconnect", (reason: string) => {
      setIsConnected(false);
      options.onDisconnect?.();

      if (reason === "io client disconnect") {
        setConnectionPhase("disconnected");
        setConnectionError("接続が切断されました。再接続できます。");
        return;
      }

      setConnectionPhase("reconnecting");
      setConnectionError("接続が切断されました。再接続しています。");
    });

    socket.on("connect_error", () => {
      setIsConnected(false);
      setConnectionPhase("reconnecting");
      setConnectionError("サーバーに接続できません。再接続を試行しています。");
      options.onError?.("サーバーに接続できません。再接続を試行しています。");
    });

    const handleReconnectAttempt = (attempt: number) => {
      setConnectionPhase("reconnecting");
      setReconnectAttempt(attempt);
      setConnectionError("サーバーへ再接続しています。");
    };

    const handleReconnect = () => {
      setConnectionPhase("connected");
      setConnectionError(null);
      setReconnectAttempt(0);
    };

    const handleReconnectError = () => {
      setConnectionPhase("reconnecting");
      setConnectionError("再接続を試行しています。");
    };

    const handleReconnectFailed = () => {
      setConnectionPhase("error");
      setConnectionError("再接続に失敗しました。再接続ボタンを押してください。");
    };

    manager.on("reconnect_attempt", handleReconnectAttempt);
    manager.on("reconnect", handleReconnect);
    manager.on("reconnect_error", handleReconnectError);
    manager.on("reconnect_failed", handleReconnectFailed);

    socket.on("update", (state: GameView) => {
      options.onUpdate?.(state);
    });

    if (import.meta.env.MODE !== "production") {
      const debugWindow = window as DebugWindow;
      debugWindow.__cohSocketDebug = {
        disconnect: () => socket.disconnect(),
        reconnect: () => socket.connect(),
        closeTransport: () => {
          const engine = (socket.io as unknown as { engine?: { close: () => void } }).engine;
          engine?.close();
        },
      };
    }

    return () => {
      if (import.meta.env.MODE !== "production") {
        const debugWindow = window as DebugWindow;
        delete debugWindow.__cohSocketDebug;
      }
      manager.off("reconnect_attempt", handleReconnectAttempt);
      manager.off("reconnect", handleReconnect);
      manager.off("reconnect_error", handleReconnectError);
      manager.off("reconnect_failed", handleReconnectFailed);
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const reconnect = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) {
      return;
    }
    setConnectionPhase("reconnecting");
    setConnectionError(null);
    socket.connect();
  }, []);

  const emit = useCallback(
    (
      event: string,
      data: unknown,
      callback?: (response: ServerResponse) => void
    ) => {
      const socket = socketRef.current;
      if (!socket?.connected) {
        const response = { error: "サーバーに接続されていません" };
        callback?.(response);
        return;
      }
      socket.emit(event, data, callback);
    },
    []
  );

  return {
    isConnected,
    connectionPhase,
    connectionError,
    reconnectAttempt,
    reconnect,
    createRoom: (
      data: { roomId: string; password: string; playerName: string },
      callback?: (response: ServerResponse) => void
    ) => emit("createRoom", data, callback),
    joinRoom: (
      data: { roomId: string; password: string; playerName: string },
      callback?: (response: ServerResponse) => void
    ) => emit("joinRoom", data, callback),
    resumeSession: (
      data: { roomId: string; playerId: string; sessionToken: string },
      callback?: (response: ServerResponse) => void
    ) => emit("resumeSession", data, callback),
    startGame: (
      data: { roomId?: string },
      callback?: (response: ServerResponse) => void
    ) => emit("startGame", data, callback),
    passCards: (
      data: { cardIds: string[] },
      callback?: (response: ServerResponse) => void
    ) => emit("passCards", data, callback),
    playCard: (
      data: { cardId: string },
      callback?: (response: ServerResponse) => void
    ) => emit("playCard", data, callback),
    restartGame: (
      data: { roomId?: string },
      callback?: (response: ServerResponse) => void
    ) => emit("restartGame", data, callback),
  };
}
