import cors from "cors";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import { GameManager } from "./game/GameManager";

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
  pingTimeout: 60000, // 60秒
  pingInterval: 25000, // 25秒
  transports: ["websocket", "polling"], // WebSocket優先
});

// ルームごとにGameManagerを管理
const games: Record<string, GameManager> = {};

// 接続数の監視
let connectionCount = 0;
const connectedSockets = new Set<string>();

io.on("connection", (socket) => {
  // 重複接続チェック
  if (connectedSockets.has(socket.id)) {
    console.log(`重複接続を拒否: ${socket.id}`);
    socket.disconnect();
    return;
  }

  connectionCount++;
  connectedSockets.add(socket.id);
  console.log(`クライアント接続: ${socket.id} (総接続数: ${connectionCount})`);

  // ルーム作成
  socket.on("createRoom", ({ roomId, password, playerName }, callback) => {
    console.log("ルーム作成リクエスト", { roomId, playerName });

    try {
      if (games[roomId]) {
        console.log("ルームID重複エラー:", roomId);
        callback({ error: "そのルームIDは既に使用されています" });
        return;
      }
      // ルームIDの形式チェック（5文字の英数字）
      if (!/^[A-Z0-9]{5}$/.test(roomId)) {
        console.log("ルームID形式エラー:", roomId);
        callback({ error: "ルームIDは5文字の英数字で入力してください" });
        return;
      }
      console.log("ルーム作成成功:", roomId);
      const game = new GameManager(roomId, password, [playerName]);
      games[roomId] = game;
      socket.join(roomId);

      // 作成者のプレイヤーIDを取得
      const myPlayerId = game.state.players[0].id;

      console.log("ルーム作成callback呼び出し", { success: true, myPlayerId });
      callback({ success: true, state: game.getState(), myPlayerId });
      console.log("ルーム作成update emit呼び出し", roomId);
      io.to(roomId).emit("update", game.getState());
    } catch (error) {
      console.error("ルーム作成エラー:", error);
      callback({ error: "ルーム作成中にエラーが発生しました" });
    }
  });

  // ルーム参加
  socket.on("joinRoom", ({ roomId, playerName, password }, callback) => {
    console.log("ルーム参加リクエスト", { roomId, playerName });

    try {
      const game = games[roomId];
      if (!game) {
        console.log("ルームが見つかりません:", roomId);
        callback({ error: "ルームが見つかりません" });
        return;
      }

      // パスワードチェック
      if (game.state.password !== password) {
        console.log("パスワードが一致しません:", roomId);
        callback({ error: "パスワードが正しくありません" });
        return;
      }

      // プレイヤー名の重複チェック
      const existingPlayer = game.state.players.find(
        (p) => p.name === playerName
      );
      if (existingPlayer) {
        console.log("プレイヤー名が重複しています:", playerName);
        callback({ error: "そのプレイヤー名は既に使用されています" });
        return;
      }

      // 最大プレイヤー数チェック（10人まで）
      if (game.state.players.length >= 10) {
        console.log("ルームが満員です:", roomId);
        callback({ error: "ルームが満員です" });
        return;
      }

      // ゲームが既に開始されているかチェック
      if (game.state.phase !== "waiting") {
        console.log("ゲームが既に開始されています:", roomId);
        callback({ error: "ゲームが既に開始されています" });
        return;
      }

      // 新しいプレイヤーを追加
      const newPlayerId = `P${game.state.players.length + 1}`;
      const newPlayer = {
        id: newPlayerId,
        name: playerName,
        hand: [],
        tricks: [],
        isHost: false,
      };
      game.state.players.push(newPlayer);

      // ソケットをルームに参加させる
      socket.join(roomId);

      console.log("ルーム参加成功:", {
        roomId,
        playerName,
        playerId: newPlayerId,
      });
      callback({
        success: true,
        state: game.getState(),
        myPlayerId: newPlayerId,
      });
      io.to(roomId).emit("update", game.getState());
    } catch (error) {
      console.error("ルーム参加エラー:", error);
      callback({ error: "ルーム参加中にエラーが発生しました" });
    }
  });

  // ゲーム開始
  socket.on("startGame", ({ roomId }, callback) => {
    console.log("ゲーム開始リクエスト", roomId);

    try {
      const game = games[roomId];
      if (!game) {
        callback?.({ error: "ルームが見つかりません" });
        return;
      }
      game.dealCards();
      game.startNextRound();
      console.log("ゲーム開始成功", roomId);
      callback?.({ success: true, state: game.getState() });
      io.to(roomId).emit("update", game.getState());
    } catch (error) {
      console.error("ゲーム開始エラー:", error);
      callback?.({ error: "ゲーム開始中にエラーが発生しました" });
    }
  });

  // カード交換
  socket.on("exchangeCards", ({ roomId, selectedCardsMap }, callback) => {
    console.log("=== カード交換リクエスト ===");
    console.log("roomId:", roomId);
    console.log("selectedCardsMap:", selectedCardsMap);
    console.log("playerCount:", Object.keys(selectedCardsMap).length);

    try {
      const game = games[roomId];
      if (!game) {
        console.log("ルームが見つかりません:", roomId);
        callback?.({ error: "ルームが見つかりません" });
        return;
      }

      console.log("交換前の状態:");
      console.log("フェーズ:", game.state.phase);
      console.log("プレイヤー数:", game.state.players.length);
      console.log("現在のラウンド:", game.state.currentRound);

      const result = game.exchangeCards(selectedCardsMap);
      console.log("カード交換結果:", result);

      if (result.success) {
        // 状態更新送信前のチェック
        const state = game.getState();
        console.log("交換後の状態:");
        console.log("フェーズ:", state.phase);
        console.log("現在のラウンド:", state.currentRound);
        if (state.rounds[state.currentRound]) {
          console.log(
            "ラウンドのreceivedCards:",
            state.rounds[state.currentRound].receivedCards
          );
        }

        callback?.({
          success: true,
          state: state,
          isComplete: result.isComplete,
        });
        console.log("クライアントに応答送信完了");
        io.to(roomId).emit("update", state);
        console.log("全クライアントに状態更新送信完了");
      } else {
        console.log("カード交換に失敗");
        callback?.({ error: "カード交換に失敗しました" });
      }
    } catch (error) {
      console.error("カード交換エラー:", error);
      callback?.({ error: "カード交換中にエラーが発生しました" });
    }
  });

  // カードプレイ
  socket.on("playCard", ({ roomId, playerId, card }, callback) => {
    console.log("カードプレイリクエスト", {
      roomId,
      playerId,
      card: `${card.suit}${card.rank}`,
    });

    try {
      const game = games[roomId];
      if (!game) {
        callback?.({ error: "ルームが見つかりません" });
        return;
      }
      game.playCard(playerId, card);
      // トリックが終わったら勝者判定・スコア計算
      const round = game["getCurrentRound"]();
      const trick = round?.tricks[round.tricks.length - 1];
      if (trick && trick.cards.length === game.state.players.length) {
        const winnerId = game.judgeTrickWinner(trick);
        trick.winnerId = winnerId;
        // 勝者のトリックのカードを追加
        const winner = game.state.players.find((p) => p.id === winnerId);
        if (winner) winner.tricks.push(trick.cards.map((c) => c.card));
        // ラウンド終了判定
        const allHandsEmpty = game.state.players.every(
          (p) => p.hand.length === 0
        );
        if (allHandsEmpty) {
          game.finishRound();
        } else {
          game.startTrick();
        }
      }
      console.log("カードプレイ成功:", {
        roomId,
        playerId,
        card: `${card.suit}${card.rank}`,
      });
      callback?.({ success: true, state: game.getState() });
      io.to(roomId).emit("update", game.getState());
    } catch (e) {
      console.error("カードプレイエラー:", e);
      if (e instanceof Error) {
        callback?.({ error: e.message });
      } else {
        callback?.({ error: String(e) });
      }
    }
  });

  // 状態同期リクエスト
  socket.on("getState", ({ roomId }, callback) => {
    console.log("状態取得リクエスト", roomId);

    try {
      const game = games[roomId];
      if (!game) {
        callback?.({ error: "ルームが見つかりません" });
        return;
      }
      callback?.({ state: game.getState() });
    } catch (error) {
      console.error("状態取得エラー:", error);
      callback?.({ error: "状態取得中にエラーが発生しました" });
    }
  });

  // 切断
  socket.on("disconnect", (reason) => {
    connectionCount--;
    connectedSockets.delete(socket.id);
    console.log(
      `クライアント切断: ${socket.id} (理由: ${reason}, 総接続数: ${connectionCount})`
    );

    // 切断に応じてクリーンアップ
    // TODO: プレイヤーが切断した場合の処理
  });

  // エラーハンドリング
  socket.on("error", (error) => {
    console.error("Socketエラー:", error);
  });
});

// サーバーエラーハンドリング
server.on("error", (error) => {
  console.error("サーバーエラー:", error);
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`サーバーが${PORT}で起動しました`);
  console.log(`接続: http://localhost:${PORT}`);
});
