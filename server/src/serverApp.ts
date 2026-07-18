import cors from "cors";
import crypto from "crypto";
import express from "express";
import http from "http";
import { Server, Socket } from "socket.io";
import { RoomGame } from "./game/RoomGame";
import {
  createPersistedRoomState,
  createRoomStateStore,
  PersistedRoomState,
} from "./persistence/roomStateStore";
import { createRateLimitStore, RateLimitRule } from "./persistence/rateLimitStore";

type Callback<T = unknown> = (response: T) => void;

interface ClientResponse {
  success?: boolean;
  error?: string;
  myPlayerId?: string;
  sessionToken?: string;
  state?: unknown;
}

interface AuthedSocket extends Socket {
  data: {
    roomId?: string;
    playerId?: string;
  };
}

const app = express();
const corsOrigin = process.env.CORS_ORIGIN ?? "*";
app.use(cors({ origin: corsOrigin }));
app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: corsOrigin },
});

type CreateRoomPayload = {
  roomId: string;
  password: string;
  playerName: string;
};

type JoinRoomPayload = CreateRoomPayload;

type ResumeSessionPayload = {
  roomId: string;
  playerId: string;
  sessionToken: string;
};

type PassCardsPayload = {
  cardIds: string[];
};

type PlayCardPayload = {
  cardId: string;
};

type RateLimitedEvent =
  | "createRoom"
  | "joinRoom"
  | "resumeSession"
  | "startGame"
  | "passCards"
  | "playCard"
  | "restartGame"
  | "getState";

let rooms: Record<string, RoomGame> = {};
let sessionTokens: Record<string, Record<string, string>> = {};
const stateStore = createRoomStateStore();
const rateLimitStore = createRateLimitStore();

app.get("/ready", async (_req, res) => {
  try {
    await Promise.all([stateStore.healthCheck(), rateLimitStore.healthCheck()]);
    res.json({
      ok: true,
      stateStore: stateStore.description,
      rateLimitStore: rateLimitStore.description,
    });
  } catch (error) {
    res.status(503).json({
      ok: false,
      error: "Server dependencies are not ready",
      stateStore: stateStore.description,
      rateLimitStore: rateLimitStore.description,
    });
  }
});

const RATE_LIMIT_ERROR = "操作が多すぎます。少し待ってから再試行してください。";
const RATE_LIMITS: Record<RateLimitedEvent, RateLimitRule> = {
  createRoom: { limit: 5, windowMs: 10_000 },
  joinRoom: { limit: 15, windowMs: 10_000 },
  resumeSession: { limit: 30, windowMs: 10_000 },
  startGame: { limit: 10, windowMs: 10_000 },
  passCards: { limit: 40, windowMs: 10_000 },
  playCard: { limit: 120, windowMs: 10_000 },
  restartGame: { limit: 10, windowMs: 10_000 },
  getState: { limit: 600, windowMs: 10_000 },
};
const JOIN_ROOM_ATTEMPT_RATE_LIMIT: RateLimitRule = {
  limit: readDurationEnv("COH_JOIN_ROOM_ATTEMPT_LIMIT", 12),
  windowMs: readDurationEnv("COH_JOIN_ROOM_ATTEMPT_WINDOW_MS", 60_000),
};
const RESUME_SESSION_ATTEMPT_RATE_LIMIT: RateLimitRule = {
  limit: readDurationEnv("COH_RESUME_SESSION_ATTEMPT_LIMIT", 30),
  windowMs: readDurationEnv("COH_RESUME_SESSION_ATTEMPT_WINDOW_MS", 60_000),
};
const ROOM_TTL_MS = readDurationEnv("COH_ROOM_TTL_MS", 24 * 60 * 60 * 1000);
const ROOM_CLEANUP_INTERVAL_MS = readDurationEnv(
  "COH_ROOM_CLEANUP_INTERVAL_MS",
  60 * 60 * 1000
);
let roomCleanupTimer: NodeJS.Timeout | undefined;

function readDurationEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
}

function rateLimitIdentity(socket: Socket): string {
  const playerId = (socket as AuthedSocket).data.playerId;
  const roomId = (socket as AuthedSocket).data.roomId;
  if (roomId && playerId) {
    return `player:${roomId}:${playerId}`;
  }
  return `socket:${socket.id}`;
}

function rateLimitKey(socket: Socket, event: RateLimitedEvent): string {
  return `${rateLimitIdentity(socket)}:${event}`;
}

function clientAddress(socket: Socket): string {
  const forwardedFor = socket.handshake.headers["x-forwarded-for"];
  if (process.env.COH_TRUST_PROXY_HEADERS === "true" && typeof forwardedFor === "string") {
    return forwardedFor.split(",")[0]?.trim() || socket.handshake.address || socket.id;
  }
  return socket.handshake.address || socket.id;
}

function hashRateLimitPart(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
}

async function enforceRateLimit(socket: Socket, event: RateLimitedEvent): Promise<void> {
  const rule = RATE_LIMITS[event];
  const result = await rateLimitStore.consume(rateLimitKey(socket, event), rule);
  if (!result.allowed) {
    throw new Error(RATE_LIMIT_ERROR);
  }
}

async function enforceRoomJoinAttemptRateLimit(socket: Socket, roomId: string): Promise<void> {
  const key = `join-room-attempt:${roomId}:${hashRateLimitPart(clientAddress(socket))}`;
  const result = await rateLimitStore.consume(key, JOIN_ROOM_ATTEMPT_RATE_LIMIT);
  if (!result.allowed) {
    throw new Error(RATE_LIMIT_ERROR);
  }
}

async function enforceResumeSessionAttemptRateLimit(
  socket: Socket,
  roomId: string,
  playerId: string
): Promise<void> {
  const key = `resume-session-attempt:${roomId}:${playerId}:${hashRateLimitPart(
    clientAddress(socket)
  )}`;
  const result = await rateLimitStore.consume(key, RESUME_SESSION_ATTEMPT_RATE_LIMIT);
  if (!result.allowed) {
    throw new Error(RATE_LIMIT_ERROR);
  }
}

function isRoomExpired(state: PersistedRoomState, now = Date.now()): boolean {
  if (ROOM_TTL_MS <= 0) {
    return false;
  }
  const updatedAt = Date.parse(state.updatedAt);
  if (!Number.isFinite(updatedAt)) {
    return true;
  }
  return updatedAt + ROOM_TTL_MS <= now;
}

async function deleteRoomState(roomId: string): Promise<void> {
  delete rooms[roomId];
  delete sessionTokens[roomId];
  await stateStore.deleteRoom(roomId);
}

function assertRecord(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("リクエスト形式が不正です");
  }
  return data as Record<string, unknown>;
}

function readStringField(
  data: Record<string, unknown>,
  field: string,
  label: string,
  maxLength = 100
): string {
  const value = data[field];
  if (typeof value !== "string") {
    throw new Error(`${label}を指定してください`);
  }
  if (value.length > maxLength) {
    throw new Error(`${label}が長すぎます`);
  }
  return value;
}

function parseCreateRoomPayload(data: unknown): CreateRoomPayload {
  const payload = assertRecord(data);
  return {
    roomId: readStringField(payload, "roomId", "ルームID", 20),
    password: readStringField(payload, "password", "パスワード", 20),
    playerName: readStringField(payload, "playerName", "プレイヤー名", 100),
  };
}

function parseJoinRoomPayload(data: unknown): JoinRoomPayload {
  return parseCreateRoomPayload(data);
}

function parseResumeSessionPayload(data: unknown): ResumeSessionPayload {
  const payload = assertRecord(data);
  return {
    roomId: readStringField(payload, "roomId", "ルームID", 20),
    playerId: readStringField(payload, "playerId", "プレイヤーID", 80),
    sessionToken: readStringField(payload, "sessionToken", "セッショントークン", 200),
  };
}

function parsePassCardsPayload(data: unknown): PassCardsPayload {
  const payload = assertRecord(data);
  const cardIds = payload.cardIds;
  if (!Array.isArray(cardIds)) {
    throw new Error("交換するカードIDを配列で指定してください");
  }
  if (cardIds.length > 10) {
    throw new Error("交換するカードIDが多すぎます");
  }
  if (cardIds.some((cardId) => typeof cardId !== "string")) {
    throw new Error("交換するカードIDは文字列で指定してください");
  }
  return { cardIds };
}

function parsePlayCardPayload(data: unknown): PlayCardPayload {
  const payload = assertRecord(data);
  return {
    cardId: readStringField(payload, "cardId", "カードID", 80),
  };
}

function assertRoomId(roomId: string): void {
  if (!/^[A-Z0-9]{5}$/.test(roomId)) {
    throw new Error("ルームIDは5文字の英数字で指定してください");
  }
}

function assertPassword(password: string): void {
  if (!/^\d{4}$/.test(password)) {
    throw new Error("パスワードは4桁の数字で指定してください");
  }
}

function cleanName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("プレイヤー名を入力してください");
  }
  if (trimmed.length > 20) {
    throw new Error("プレイヤー名は20文字以内にしてください");
  }
  return trimmed;
}

async function restoreServerState(): Promise<void> {
  const persistedRooms = await stateStore.loadRooms();
  const activeRooms: Record<string, PersistedRoomState> = {};
  for (const [roomId, state] of Object.entries(persistedRooms)) {
    if (isRoomExpired(state)) {
      await deleteRoomState(roomId);
      continue;
    }
    activeRooms[roomId] = state;
  }
  rooms = Object.fromEntries(
    Object.entries(activeRooms).map(([roomId, state]) => [
      roomId,
      RoomGame.fromSnapshot(state.room),
    ])
  );
  sessionTokens = Object.fromEntries(
    Object.entries(activeRooms).map(([roomId, state]) => [
      roomId,
      state.sessionTokens,
    ])
  );
}

async function loadRoomIntoMemory(roomId: string): Promise<RoomGame | null> {
  const persisted = await stateStore.loadRoom(roomId);
  if (!persisted) {
    delete rooms[roomId];
    delete sessionTokens[roomId];
    return null;
  }
  if (isRoomExpired(persisted)) {
    await deleteRoomState(roomId);
    return null;
  }

  const room = RoomGame.fromSnapshot(persisted.room);
  rooms[roomId] = room;
  sessionTokens[roomId] = persisted.sessionTokens;
  return room;
}

async function persistRoomState(roomId: string): Promise<void> {
  const room = rooms[roomId];
  if (!room) {
    return;
  }
  await stateStore.saveRoom(
    roomId,
    createPersistedRoomState(roomId, room.snapshot(), sessionTokens[roomId] ?? {})
  );
}

function emitRoom(roomId: string): void {
  const room = rooms[roomId];
  if (!room) {
    return;
  }

  const socketIds = io.sockets.adapter.rooms.get(roomId);
  if (!socketIds) {
    return;
  }

  for (const socketId of socketIds) {
    const socket = io.sockets.sockets.get(socketId) as AuthedSocket | undefined;
    if (socket?.data.playerId) {
      socket.emit("update", room.getView(socket.data.playerId));
    }
  }
}

function bindSocketToPlayer(socket: AuthedSocket, roomId: string, playerId: string): void {
  socket.data.roomId = roomId;
  socket.data.playerId = playerId;
  socket.join(roomId);
}

function createSessionToken(roomId: string, playerId: string): string {
  const token = crypto.randomBytes(24).toString("hex");
  sessionTokens[roomId] = {
    ...(sessionTokens[roomId] ?? {}),
    [playerId]: token,
  };
  return token;
}

function getSessionToken(roomId: string, playerId: string): string {
  const existing = sessionTokens[roomId]?.[playerId];
  return existing ?? createSessionToken(roomId, playerId);
}

function assertSession(roomId: string, playerId: string, sessionToken: string): void {
  const expectedToken = sessionTokens[roomId]?.[playerId];
  if (!expectedToken || expectedToken !== sessionToken) {
    throw new Error("セッションの復帰に失敗しました。もう一度ルームに参加してください。");
  }
}

io.on("connection", (socket: AuthedSocket) => {
  socket.on("disconnect", async () => {
    await Promise.all(
      Object.keys(RATE_LIMITS).map((event) =>
        rateLimitStore.clear(`socket:${socket.id}:${event}`)
      )
    ).catch((error) => {
      console.error("Failed to clear socket rate limit buckets:", error);
    });
  });

  socket.on(
    "createRoom",
    async (
      data: unknown,
      callback?: Callback<ClientResponse>
    ) => {
      try {
        await enforceRateLimit(socket, "createRoom");
        const payload = parseCreateRoomPayload(data);
        const roomId = payload.roomId.toUpperCase();
        assertRoomId(roomId);
        assertPassword(payload.password);
        const playerName = cleanName(payload.playerName);
        let response: ClientResponse | undefined;

        await stateStore.withRoomLock(roomId, async () => {
          const existingRoom = await loadRoomIntoMemory(roomId);
          if (existingRoom) {
            throw new Error("そのルームIDは既に使われています");
          }

          const room = new RoomGame(roomId, payload.password, playerName);
          rooms[roomId] = room;
          const playerId = room.getView().players[0].id;
          const sessionToken = createSessionToken(roomId, playerId);
          response = {
            success: true,
            myPlayerId: playerId,
            sessionToken,
            state: room.getView(playerId),
          };
          await persistRoomState(roomId);
        });

        if (response?.myPlayerId) {
          bindSocketToPlayer(socket, roomId, response.myPlayerId);
        }
        if (response) {
          callback?.(response);
        }
        emitRoom(roomId);
      } catch (error) {
        callback?.({ error: error instanceof Error ? error.message : String(error) });
      }
    }
  );

  socket.on(
    "joinRoom",
    async (
      data: unknown,
      callback?: Callback<ClientResponse>
    ) => {
      try {
        await enforceRateLimit(socket, "joinRoom");
        const payload = parseJoinRoomPayload(data);
        const roomId = payload.roomId.toUpperCase();
        assertRoomId(roomId);
        await enforceRoomJoinAttemptRateLimit(socket, roomId);
        assertPassword(payload.password);
        const playerName = cleanName(payload.playerName);
        let response: ClientResponse | undefined;

        await stateStore.withRoomLock(roomId, async () => {
          const room = await loadRoomIntoMemory(roomId);
          if (!room) {
            throw new Error("ルームが見つかりません");
          }
          if (room.password !== payload.password) {
            throw new Error("パスワードが正しくありません");
          }
          const player = room.addPlayer(playerName);
          const sessionToken = createSessionToken(roomId, player.id);
          response = {
            success: true,
            myPlayerId: player.id,
            sessionToken,
            state: room.getView(player.id),
          };
          await persistRoomState(roomId);
        });

        if (response?.myPlayerId) {
          bindSocketToPlayer(socket, roomId, response.myPlayerId);
        }
        if (response) {
          callback?.(response);
        }
        emitRoom(roomId);
      } catch (error) {
        callback?.({ error: error instanceof Error ? error.message : String(error) });
      }
    }
  );

  socket.on(
    "resumeSession",
    async (
      data: unknown,
      callback?: Callback<ClientResponse>
    ) => {
      try {
        await enforceRateLimit(socket, "resumeSession");
        const payload = parseResumeSessionPayload(data);
        const roomId = payload.roomId.toUpperCase();
        assertRoomId(roomId);
        const playerId = payload.playerId;
        await enforceResumeSessionAttemptRateLimit(socket, roomId, playerId);
        let response: ClientResponse | undefined;

        await stateStore.withRoomLock(roomId, async () => {
          const room = await loadRoomIntoMemory(roomId);
          if (!room) {
            throw new Error("ルームが見つかりません。サーバーが再起動された可能性があります。");
          }
          if (!room.hasPlayer(playerId)) {
            throw new Error("プレイヤーが見つかりません。もう一度ルームに参加してください。");
          }
          assertSession(roomId, playerId, payload.sessionToken);
          response = {
            success: true,
            myPlayerId: playerId,
            sessionToken: getSessionToken(roomId, playerId),
            state: room.getView(playerId),
          };
          await persistRoomState(roomId);
        });

        bindSocketToPlayer(socket, roomId, playerId);
        if (response) {
          callback?.(response);
        }
        emitRoom(roomId);
      } catch (error) {
        callback?.({ error: error instanceof Error ? error.message : String(error) });
      }
    }
  );

  socket.on(
    "startGame",
    async (_data: { roomId?: string }, callback?: Callback<ClientResponse>) => {
      try {
        await enforceRateLimit(socket, "startGame");
        const roomId = socket.data.roomId;
        const playerId = socket.data.playerId;
        if (!roomId || !playerId) {
          throw new Error("ルームに参加していません");
        }
        let response: ClientResponse | undefined;

        await stateStore.withRoomLock(roomId, async () => {
          const room = await loadRoomIntoMemory(roomId);
          if (!room) {
            throw new Error("ルームが見つかりません");
          }
          if (!room.isHost(playerId)) {
            throw new Error("ゲーム開始はホストのみ可能です");
          }
          room.startGame();
          await persistRoomState(roomId);
          response = { success: true, state: room.getView(playerId) };
        });

        if (response) {
          callback?.(response);
        }
        emitRoom(roomId);
      } catch (error) {
        callback?.({ error: error instanceof Error ? error.message : String(error) });
      }
    }
  );

  socket.on(
    "passCards",
    async (data: unknown, callback?: Callback<ClientResponse>) => {
      try {
        await enforceRateLimit(socket, "passCards");
        const payload = parsePassCardsPayload(data);
        const roomId = socket.data.roomId;
        const playerId = socket.data.playerId;
        if (!roomId || !playerId) {
          throw new Error("ルームに参加していません");
        }
        let response: ClientResponse | undefined;

        await stateStore.withRoomLock(roomId, async () => {
          const room = await loadRoomIntoMemory(roomId);
          if (!room) {
            throw new Error("ルームが見つかりません");
          }
          room.passCards(playerId, payload.cardIds);
          await persistRoomState(roomId);
          response = { success: true, state: room.getView(playerId) };
        });

        if (response) {
          callback?.(response);
        }
        emitRoom(roomId);
      } catch (error) {
        callback?.({ error: error instanceof Error ? error.message : String(error) });
      }
    }
  );

  socket.on(
    "playCard",
    async (data: unknown, callback?: Callback<ClientResponse>) => {
      try {
        await enforceRateLimit(socket, "playCard");
        const payload = parsePlayCardPayload(data);
        const roomId = socket.data.roomId;
        const playerId = socket.data.playerId;
        if (!roomId || !playerId) {
          throw new Error("ルームに参加していません");
        }
        let response: ClientResponse | undefined;

        await stateStore.withRoomLock(roomId, async () => {
          const room = await loadRoomIntoMemory(roomId);
          if (!room) {
            throw new Error("ルームが見つかりません");
          }
          room.playCard(playerId, payload.cardId);
          await persistRoomState(roomId);
          response = { success: true, state: room.getView(playerId) };
        });

        if (response) {
          callback?.(response);
        }
        emitRoom(roomId);
      } catch (error) {
        callback?.({ error: error instanceof Error ? error.message : String(error) });
      }
    }
  );

  socket.on(
    "restartGame",
    async (_data: { roomId?: string }, callback?: Callback<ClientResponse>) => {
      try {
        await enforceRateLimit(socket, "restartGame");
        const roomId = socket.data.roomId;
        const playerId = socket.data.playerId;
        if (!roomId || !playerId) {
          throw new Error("ルームに参加していません");
        }
        let response: ClientResponse | undefined;

        await stateStore.withRoomLock(roomId, async () => {
          const room = await loadRoomIntoMemory(roomId);
          if (!room) {
            throw new Error("ルームが見つかりません");
          }
          if (!room.isHost(playerId)) {
            throw new Error("再開はホストのみ可能です");
          }
          room.restart();
          await persistRoomState(roomId);
          response = { success: true, state: room.getView(playerId) };
        });

        if (response) {
          callback?.(response);
        }
        emitRoom(roomId);
      } catch (error) {
        callback?.({ error: error instanceof Error ? error.message : String(error) });
      }
    }
  );

  socket.on("getState", async (_data: unknown, callback?: Callback<ClientResponse>) => {
    try {
      await enforceRateLimit(socket, "getState");
      const roomId = socket.data.roomId;
      const playerId = socket.data.playerId;
      if (!roomId || !playerId) {
        throw new Error("ルームに参加していません");
      }
      const room = await loadRoomIntoMemory(roomId);
      if (!room) {
        throw new Error("ルームが見つかりません");
      }
      callback?.({ success: true, state: room.getView(playerId) });
    } catch (error) {
      callback?.({ error: error instanceof Error ? error.message : String(error) });
    }
  });
});

async function cleanupExpiredRooms(): Promise<number> {
  const persistedRooms = await stateStore.loadRooms();
  let deletedCount = 0;

  for (const [roomId, state] of Object.entries(persistedRooms)) {
    if (!isRoomExpired(state)) {
      continue;
    }
    await stateStore.withRoomLock(roomId, async () => {
      const latestState = await stateStore.loadRoom(roomId);
      if (!latestState || !isRoomExpired(latestState)) {
        return;
      }
      await deleteRoomState(roomId);
      deletedCount += 1;
    });
  }

  return deletedCount;
}

function startExpiredRoomCleanup(): void {
  if (ROOM_TTL_MS <= 0 || ROOM_CLEANUP_INTERVAL_MS <= 0 || roomCleanupTimer) {
    return;
  }

  roomCleanupTimer = setInterval(() => {
    cleanupExpiredRooms().catch((error) => {
      console.error("Failed to cleanup expired rooms:", error);
    });
  }, ROOM_CLEANUP_INTERVAL_MS);
  roomCleanupTimer.unref?.();
}

function stopExpiredRoomCleanup(): void {
  if (!roomCleanupTimer) {
    return;
  }
  clearInterval(roomCleanupTimer);
  roomCleanupTimer = undefined;
}

const PORT = process.env.PORT || 3001;

export async function startServer(port: string | number = PORT): Promise<http.Server> {
  await restoreServerState();
  return new Promise((resolve) => {
    server.listen(port, () => {
      startExpiredRoomCleanup();
      server.once("close", stopExpiredRoomCleanup);
      const address = server.address();
      const actualPort = typeof address === "object" && address ? address.port : port;
      console.log(`COH server running on http://localhost:${actualPort}`);
      console.log(`State store: ${stateStore.description}`);
      console.log(`Rate limit store: ${rateLimitStore.description}`);
      resolve(server);
    });
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error("Failed to start COH server:", error);
    process.exit(1);
  });
}
