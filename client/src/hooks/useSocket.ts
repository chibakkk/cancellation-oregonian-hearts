import { useCallback, useEffect, useRef, useState } from "react";
import io from "socket.io-client";

const SERVER_URL = "http://localhost:3001"; // サーバーURLに合わせて変更

export interface UseSocketOptions {
  onUpdate?: (state: unknown) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: string) => void;
}

export function useSocket(options?: UseSocketOptions) {
  const socketRef = useRef<ReturnType<typeof io> | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const isConnectingRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectDelayRef = useRef(1000);

  const connect = useCallback(() => {
    if (isConnectingRef.current || socketRef.current?.connected) {
      return;
    }

    try {
      console.log("Socket接続開始:", SERVER_URL);
      isConnectingRef.current = true;
      setConnectionError(null);

      const socket = io(SERVER_URL, {
        timeout: 10000,
        reconnection: false, // 自動再接続を無効化（手動で制御）
        forceNew: false, // 既存の接続を再利用
      });

      socketRef.current = socket;

      socket.on("connect", () => {
        console.log("Socket接続成功:", socket.id);
        setIsConnected(true);
        setConnectionError(null);
        isConnectingRef.current = false;
        reconnectAttemptsRef.current = 0; // 接続成功時にリセット
        reconnectDelayRef.current = 1000; // 遅延時間をリセット
        options?.onConnect?.();
      });

      socket.on("connect_error", (error: Error) => {
        console.error("Socket接続エラー:", error);
        setIsConnected(false);
        isConnectingRef.current = false;

        const errorMessage = `接続エラー: ${error.message}`;
        setConnectionError(errorMessage);
        options?.onError?.(errorMessage);

        // 自動再接続の試行
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          console.log(
            `再接続試行 ${
              reconnectAttemptsRef.current + 1
            }/${maxReconnectAttempts}`
          );
          setTimeout(() => {
            reconnectAttemptsRef.current++;
            reconnectDelayRef.current = Math.min(
              reconnectDelayRef.current * 2,
              10000
            ); // 指数バックオフ
            connect();
          }, reconnectDelayRef.current);
        } else {
          setConnectionError("接続に失敗しました。手動で再接続してください。");
        }
      });

      socket.on("disconnect", (reason: string) => {
        console.log("Socket切断:", reason);
        setIsConnected(false);
        isConnectingRef.current = false;

        let errorMessage = "接続が切断されました";
        if (reason === "io server disconnect") {
          errorMessage = "サーバーから切断されました";
        } else if (reason === "io client disconnect") {
          errorMessage = "接続が切断されました";
        } else {
          errorMessage = "ネットワークエラーにより切断されました";
        }

        setConnectionError(errorMessage);
        options?.onDisconnect?.();

        // 意図的な切断でない場合は自動再接続
        if (
          reason !== "io client disconnect" &&
          reconnectAttemptsRef.current < maxReconnectAttempts
        ) {
          console.log(
            `切断後の再接続試行 ${
              reconnectAttemptsRef.current + 1
            }/${maxReconnectAttempts}`
          );
          setTimeout(() => {
            reconnectAttemptsRef.current++;
            connect();
          }, reconnectDelayRef.current);
        }
      });

      // サーバーからの状態更新
      if (options?.onUpdate) {
        socket.on("update", (data: unknown) => {
          console.log("Socket update受信:", data);
          options.onUpdate!(data);
        });
      }
    } catch (err) {
      console.error("Socket初期化エラー:", err);
      setIsConnected(false);
      isConnectingRef.current = false;
      const errorMessage = "接続の初期化に失敗しました";
      setConnectionError(errorMessage);
      options?.onError?.(errorMessage);
    }
  }, [
    options?.onConnect,
    options?.onDisconnect,
    options?.onError,
    options?.onUpdate,
  ]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setIsConnected(false);
    isConnectingRef.current = false;
  }, []);

  const reconnect = useCallback(() => {
    disconnect();
    setTimeout(() => {
      connect();
    }, 1000); // 1秒待ってから再接続
  }, [disconnect, connect]);

  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, []); // 依存関係を空にして、1回のみ実行

  // 主要イベント送信関数（接続確認付き）
  const emitWithConnectionCheck = useCallback(
    (
      event: string,
      data: unknown,
      callback?: (res: { error?: string; myPlayerId?: string }) => void
    ) => {
      if (!socketRef.current || !isConnected) {
        const error = "サーバーに接続されていません";
        console.error(error);
        callback?.({ error });
        return;
      }

      console.log(`Socket emit ${event}:`, data);
      socketRef.current.emit(
        event,
        data,
        (res: {
          error?: string;
          myPlayerId?: string;
          success?: boolean;
          state?: unknown;
        }) => {
          console.log(`Socket callback ${event}:`, res);
          callback?.(res);
        }
      );
    },
    [isConnected]
  );

  const createRoom = useCallback(
    (
      data: { roomId: string; password: string; playerName: string },
      callback?: (res: { error?: string; myPlayerId?: string }) => void
    ) => {
      emitWithConnectionCheck("createRoom", data, callback);
    },
    [emitWithConnectionCheck]
  );

  const joinRoom = useCallback(
    (
      data: { roomId: string; playerName: string; password: string },
      callback?: (res: { error?: string; myPlayerId?: string }) => void
    ) => {
      emitWithConnectionCheck("joinRoom", data, callback);
    },
    [emitWithConnectionCheck]
  );

  const startGame = useCallback(
    (
      data: { roomId: string },
      callback?: (res: { error?: string; myPlayerId?: string }) => void
    ) => {
      emitWithConnectionCheck("startGame", data, callback);
    },
    [emitWithConnectionCheck]
  );

  const exchangeCards = useCallback(
    (
      data: { roomId: string; selectedCardsMap: Record<string, unknown[]> },
      callback?: (res: { error?: string; myPlayerId?: string }) => void
    ) => {
      console.log("=== useSocket exchangeCards ===");
      console.log("送信データ:", data);
      emitWithConnectionCheck("exchangeCards", data, (res) => {
        console.log("exchangeCards応答:", res);
        callback?.(res);
      });
    },
    [emitWithConnectionCheck]
  );

  const playCard = useCallback(
    (
      data: { roomId: string; playerId: string; card: unknown },
      callback?: (res: { error?: string; myPlayerId?: string }) => void
    ) => {
      emitWithConnectionCheck("playCard", data, callback);
    },
    [emitWithConnectionCheck]
  );

  const forceFinishRound = useCallback(
    (
      data: { roomId: string },
      callback?: (res: { error?: string; myPlayerId?: string }) => void
    ) => {
      emitWithConnectionCheck("debug:force-finish-round", data, callback);
    },
    [emitWithConnectionCheck]
  );

  const restartGame = useCallback(
    (
      data: { roomId: string },
      callback?: (res: { error?: string; myPlayerId?: string }) => void
    ) => {
      emitWithConnectionCheck("restartGame", data, callback);
    },
    [emitWithConnectionCheck]
  );

  const getState = useCallback(
    (
      data: { roomId: string },
      callback?: (res: { error?: string; myPlayerId?: string }) => void
    ) => {
      emitWithConnectionCheck("getState", data, callback);
    },
    [emitWithConnectionCheck]
  );

  return {
    socket: socketRef.current,
    isConnected,
    connectionError,
    reconnect,
    disconnect,
    createRoom,
    joinRoom,
    startGame,
    exchangeCards,
    playCard,
    getState,
    forceFinishRound,
    restartGame,
  };
}
