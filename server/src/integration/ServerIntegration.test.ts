import assert from "assert";
import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import { createRequire } from "module";

type AckResponse = {
  success?: boolean;
  error?: string;
  myPlayerId?: string;
  sessionToken?: string;
  state?: GameView;
};

type GamePhase = "waiting" | "passing" | "playing" | "finished";

type GameView = {
  roomId: string;
  phase: GamePhase;
  roundNumber: number;
  players: Array<{
    id: string;
    name: string;
    isHost: boolean;
    handCount: number;
    totalScore: number;
  }>;
  myPlayerId?: string;
  myHand: Array<{ id: string; suit: string; rank: string }>;
  playableCardIds: string[];
  currentRound?: {
    currentTurnPlayerId?: string;
    currentTrick?: {
      cards: Array<{ playerId: string; card: { id: string; suit: string; rank: string } }>;
    };
  };
};

type TestSocket = {
  connected: boolean;
  on(event: string, callback: (...args: any[]) => void): void;
  emit(event: string, data: unknown, callback?: (response: AckResponse) => void): void;
  disconnect(): void;
};

type HttpJsonResponse = {
  statusCode: number;
  body: Record<string, unknown>;
};

const requireFromRoot = createRequire(path.resolve(__dirname, "../../../package.json"));
const { io } = requireFromRoot("./client/node_modules/socket.io-client") as {
  io: (url: string, options: Record<string, unknown>) => TestSocket;
};

const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "coh-server-integration-"));
process.env.COH_STATE_DIR = path.join(stateDir, "rooms");
process.env.COH_STATE_FILE = path.join(stateDir, "legacy.json");

let server: http.Server;
let baseUrl = "";

async function bootServer(): Promise<void> {
  const app = await import("../serverApp");
  server = await app.startServer(0);
  const address = server.address();
  assert.ok(address && typeof address === "object", "server should listen on a TCP port");
  baseUrl = `http://127.0.0.1:${address.port}`;
}

async function closeServer(): Promise<void> {
  if (!server.listening) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function connectSocket(): Promise<TestSocket> {
  const socket = io(baseUrl, {
    transports: ["websocket", "polling"],
    forceNew: true,
    reconnection: false,
  });
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("socket connect timeout")), 5000);
    socket.on("connect", () => {
      clearTimeout(timeout);
      resolve();
    });
    socket.on("connect_error", (error: Error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
  return socket;
}

function emit(socket: TestSocket, event: string, data: unknown): Promise<AckResponse> {
  return new Promise((resolve) => {
    socket.emit(event, data, resolve);
  });
}

function getJson(pathname: string): Promise<HttpJsonResponse> {
  return new Promise((resolve, reject) => {
    const request = http.get(new URL(pathname, baseUrl), (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        try {
          const rawBody = Buffer.concat(chunks).toString("utf8");
          resolve({
            statusCode: response.statusCode ?? 0,
            body: rawBody ? JSON.parse(rawBody) : {},
          });
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on("error", reject);
  });
}

function assertErrorMessage(response: AckResponse, expected: string): void {
  assert.equal(response.error, expected);
  assert.equal(response.success, undefined);
}

function roomId(prefix: string): string {
  return `${prefix}${Math.random().toString(36).slice(2, 6)}`.toUpperCase().slice(0, 5);
}

async function createRoom(name = "Host"): Promise<{
  socket: TestSocket;
  roomId: string;
  playerId: string;
  sessionToken: string;
}> {
  const socket = await connectSocket();
  const id = roomId("R");
  const response = await emit(socket, "createRoom", {
    roomId: id,
    password: "1234",
    playerName: name,
  });
  assert.equal(response.error, undefined);
  assert.ok(response.myPlayerId);
  assert.ok(response.sessionToken);
  return {
    socket,
    roomId: id,
    playerId: response.myPlayerId,
    sessionToken: response.sessionToken,
  };
}

async function testHealthAndReadinessEndpoints(): Promise<void> {
  const health = await getJson("/health");
  assert.equal(health.statusCode, 200);
  assert.equal(health.body.ok, true);

  const ready = await getJson("/ready");
  assert.equal(ready.statusCode, 200);
  assert.equal(ready.body.ok, true);
  assert.equal(typeof ready.body.stateStore, "string");
  assert.equal(String(ready.body.stateStore).startsWith("json-rooms:"), true);
  assert.equal(ready.body.rateLimitStore, "memory:rate-limit");
}

async function joinRoom(id: string, playerName: string): Promise<{
  socket: TestSocket;
  playerId: string;
  sessionToken: string;
}> {
  const socket = await connectSocket();
  const response = await emit(socket, "joinRoom", {
    roomId: id,
    password: "1234",
    playerName,
  });
  assert.equal(response.error, undefined);
  assert.ok(response.myPlayerId);
  assert.ok(response.sessionToken);
  return {
    socket,
    playerId: response.myPlayerId,
    sessionToken: response.sessionToken,
  };
}

async function resumeSession(
  roomId: string,
  playerId: string,
  sessionToken: string
): Promise<{
  socket: TestSocket;
  state: GameView;
}> {
  const socket = await connectSocket();
  const response = await emit(socket, "resumeSession", {
    roomId,
    playerId,
    sessionToken,
  });
  assert.equal(response.error, undefined);
  assert.equal(response.myPlayerId, playerId);
  assert.ok(response.state);
  return {
    socket,
    state: response.state,
  };
}

async function playUntilRoundNumber(
  socketsByPlayerId: Record<string, TestSocket>,
  observerSocket: TestSocket,
  targetRoundNumber: number,
  maxActions = 160
): Promise<number> {
  for (let action = 0; action < maxActions; action += 1) {
    const state = await emit(observerSocket, "getState", {});
    assert.equal(state.error, undefined);
    assert.ok(state.state);
    if (state.state.roundNumber >= targetRoundNumber) {
      return action;
    }
    assert.equal(state.state.phase, "playing");
    const turnPlayerId = state.state.currentRound?.currentTurnPlayerId;
    assert.ok(turnPlayerId);

    const turnState = await emit(socketsByPlayerId[turnPlayerId], "getState", {});
    assert.equal(turnState.error, undefined);
    const cardId = turnState.state?.playableCardIds[0];
    assert.ok(cardId);
    const played = await emit(socketsByPlayerId[turnPlayerId], "playCard", { cardId });
    assert.equal(played.error, undefined);
  }

  throw new Error(`Round did not reach ${targetRoundNumber} within ${maxActions} actions`);
}

async function testCreateJoinAndRejectDuplicateNames(): Promise<void> {
  const host = await createRoom("HostA");
  const joined = await joinRoom(host.roomId, "GuestA");
  const duplicateSocket = await connectSocket();
  const duplicate = await emit(duplicateSocket, "joinRoom", {
    roomId: host.roomId,
    password: "1234",
    playerName: "GuestA",
  });
  assertErrorMessage(duplicate, "同じ名前のプレイヤーが既に参加しています");

  const state = await emit(host.socket, "getState", {});
  assert.equal(state.state?.players.length, 2);
  assert.equal(state.state?.players.some((player) => player.name === "GuestA"), true);

  duplicateSocket.disconnect();
  joined.socket.disconnect();
  host.socket.disconnect();
}

async function testReadableValidationErrors(): Promise<void> {
  const socket = await connectSocket();
  const invalidRoomId = await emit(socket, "createRoom", {
    roomId: "ABC",
    password: "1234",
    playerName: "Host",
  });
  assertErrorMessage(invalidRoomId, "ルームIDは5文字の英数字で指定してください");

  const invalidPassword = await emit(socket, "createRoom", {
    roomId: roomId("V"),
    password: "12",
    playerName: "Host",
  });
  assertErrorMessage(invalidPassword, "パスワードは4桁の数字で指定してください");

  const blankName = await emit(socket, "createRoom", {
    roomId: roomId("N"),
    password: "1234",
    playerName: "   ",
  });
  assertErrorMessage(blankName, "プレイヤー名を入力してください");

  const longName = await emit(socket, "createRoom", {
    roomId: roomId("L"),
    password: "1234",
    playerName: "123456789012345678901",
  });
  assertErrorMessage(longName, "プレイヤー名は20文字以内にしてください");

  const missingRoom = await emit(socket, "joinRoom", {
    roomId: roomId("M"),
    password: "1234",
    playerName: "Guest",
  });
  assertErrorMessage(missingRoom, "ルームが見つかりません");

  const unauthenticatedState = await emit(socket, "getState", {});
  assertErrorMessage(unauthenticatedState, "ルームに参加していません");
  socket.disconnect();
}

async function testInvalidSocketPayloadsAreRejected(): Promise<void> {
  const socket = await connectSocket();

  assertErrorMessage(
    await emit(socket, "createRoom", null),
    "リクエスト形式が不正です"
  );
  assertErrorMessage(
    await emit(socket, "createRoom", {
      password: "1234",
      playerName: "Host",
    }),
    "ルームIDを指定してください"
  );
  assertErrorMessage(
    await emit(socket, "joinRoom", {
      roomId: "ABCDE",
      password: 1234,
      playerName: "Guest",
    }),
    "パスワードを指定してください"
  );
  assertErrorMessage(
    await emit(socket, "resumeSession", []),
    "リクエスト形式が不正です"
  );
  assertErrorMessage(
    await emit(socket, "resumeSession", {
      roomId: "ABCDE",
      playerId: "P1",
    }),
    "セッショントークンを指定してください"
  );
  assertErrorMessage(
    await emit(socket, "passCards", {}),
    "交換するカードIDを配列で指定してください"
  );
  assertErrorMessage(
    await emit(socket, "passCards", {
      cardIds: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"],
    }),
    "交換するカードIDが多すぎます"
  );
  assertErrorMessage(
    await emit(socket, "passCards", { cardIds: ["1", 2, "3"] }),
    "交換するカードIDは文字列で指定してください"
  );
  assertErrorMessage(
    await emit(socket, "playCard", { cardId: 10 }),
    "カードIDを指定してください"
  );

  socket.disconnect();
}

async function testSocketRateLimitRejectsBursts(): Promise<void> {
  const socket = await connectSocket();
  let response: AckResponse | undefined;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    response = await emit(socket, "createRoom", {
      roomId: "BAD",
      password: "1234",
      playerName: "BurstHost",
    });
  }

  assert.ok(response);
  assertErrorMessage(response, "操作が多すぎます。少し待ってから再試行してください。");
  socket.disconnect();

  const freshSocket = await connectSocket();
  const freshResponse = await emit(freshSocket, "createRoom", {
    roomId: "BAD",
    password: "1234",
    playerName: "FreshHost",
  });
  assertErrorMessage(freshResponse, "ルームIDは5文字の英数字で指定してください");
  freshSocket.disconnect();
}

async function testRoomJoinAttemptRateLimitSurvivesSocketReconnects(): Promise<void> {
  const host = await createRoom("JoinLimitHost");
  const sockets: TestSocket[] = [];
  let response: AckResponse | undefined;

  for (let attempt = 0; attempt < 13; attempt += 1) {
    const socket = await connectSocket();
    sockets.push(socket);
    response = await emit(socket, "joinRoom", {
      roomId: host.roomId,
      password: "9999",
      playerName: `Guess${attempt}`,
    });

    if (attempt < 12) {
      assertErrorMessage(response, "パスワードが正しくありません");
    }
  }

  assert.ok(response);
  assertErrorMessage(response, "操作が多すぎます。少し待ってから再試行してください。");
  sockets.forEach((socket) => socket.disconnect());
  host.socket.disconnect();
}

async function testReadableJoinAndActionErrors(): Promise<void> {
  const host = await createRoom("ActionHost");
  const guest = await joinRoom(host.roomId, "ActionGuest");
  const wrongPasswordSocket = await connectSocket();
  const wrongPassword = await emit(wrongPasswordSocket, "joinRoom", {
    roomId: host.roomId,
    password: "9999",
    playerName: "WrongPassword",
  });
  assertErrorMessage(wrongPassword, "パスワードが正しくありません");

  const nonHostStart = await emit(guest.socket, "startGame", {});
  assertErrorMessage(nonHostStart, "ゲーム開始はホストのみ可能です");

  const tooFewPlayersStart = await emit(host.socket, "startGame", {});
  assertErrorMessage(tooFewPlayersStart, "プレイヤーは4人から10人で開始できます");

  const moreGuests = await Promise.all([
    joinRoom(host.roomId, "ActionP3"),
    joinRoom(host.roomId, "ActionP4"),
  ]);
  const started = await emit(host.socket, "startGame", {});
  assert.equal(started.error, undefined);

  const startedJoinSocket = await connectSocket();
  const startedJoin = await emit(startedJoinSocket, "joinRoom", {
    roomId: host.roomId,
    password: "1234",
    playerName: "LateGuest",
  });
  assertErrorMessage(startedJoin, "ゲーム開始後は参加できません");

  const badResumeSocket = await connectSocket();
  const badResume = await emit(badResumeSocket, "resumeSession", {
    roomId: host.roomId,
    playerId: host.playerId,
    sessionToken: "bad-token",
  });
  assertErrorMessage(
    badResume,
    "セッションの復帰に失敗しました。もう一度ルームに参加してください。"
  );

  wrongPasswordSocket.disconnect();
  startedJoinSocket.disconnect();
  badResumeSocket.disconnect();
  moreGuests.forEach((player) => player.socket.disconnect());
  guest.socket.disconnect();
  host.socket.disconnect();
}

async function testConcurrentJoinsAreSerialized(): Promise<void> {
  const host = await createRoom("LockHost");
  const names = ["JoinA", "JoinB", "JoinC"];
  const sockets = await Promise.all(
    names.map(async (name) => {
      const socket = await connectSocket();
      const response = await emit(socket, "joinRoom", {
        roomId: host.roomId,
        password: "1234",
        playerName: name,
      });
      assert.equal(response.error, undefined);
      return socket;
    })
  );

  const state = await emit(host.socket, "getState", {});
  assert.deepEqual(
    state.state?.players.map((player) => player.name).sort(),
    ["JoinA", "JoinB", "JoinC", "LockHost"].sort()
  );

  sockets.forEach((socket) => socket.disconnect());
  host.socket.disconnect();
}

async function testServerRestartResumeSession(): Promise<void> {
  const host = await createRoom("ResumeHost");
  host.socket.disconnect();
  await closeServer();
  await bootServer();

  const socket = await connectSocket();
  const resumed = await emit(socket, "resumeSession", {
    roomId: host.roomId,
    playerId: host.playerId,
    sessionToken: host.sessionToken,
  });
  assert.equal(resumed.error, undefined);
  assert.equal(resumed.myPlayerId, host.playerId);
  assert.equal(resumed.state?.players.some((player) => player.name === "ResumeHost"), true);
  socket.disconnect();
}

async function testExpiredRoomIsDeletedOnRestart(): Promise<void> {
  const host = await createRoom("ExpiredHost");
  const roomFilePath = path.join(process.env.COH_STATE_DIR!, `${host.roomId}.json`);
  assert.equal(fs.existsSync(roomFilePath), true);

  host.socket.disconnect();
  await closeServer();

  const persisted = JSON.parse(fs.readFileSync(roomFilePath, "utf8"));
  persisted.updatedAt = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  fs.writeFileSync(roomFilePath, `${JSON.stringify(persisted)}\n`, "utf8");

  await bootServer();

  const socket = await connectSocket();
  const expiredResume = await emit(socket, "resumeSession", {
    roomId: host.roomId,
    playerId: host.playerId,
    sessionToken: host.sessionToken,
  });
  assert.equal(expiredResume.success, undefined);
  assert.ok(expiredResume.error);
  assert.equal(fs.existsSync(roomFilePath), false);
  socket.disconnect();
}

async function testServerRestartDuringGameResumeAndContinue(): Promise<void> {
  const host = await createRoom("RestartHost");
  const joined = await Promise.all([
    joinRoom(host.roomId, "RestartP2"),
    joinRoom(host.roomId, "RestartP3"),
    joinRoom(host.roomId, "RestartP4"),
  ]);
  const sessions = [
    host,
    ...joined.map((player) => ({
      roomId: host.roomId,
      ...player,
    })),
  ];
  const socketsByPlayerId: Record<string, TestSocket> = {
    [host.playerId]: host.socket,
  };
  for (const player of joined) {
    socketsByPlayerId[player.playerId] = player.socket;
  }

  const started = await emit(host.socket, "startGame", {});
  assert.equal(started.error, undefined);
  assert.equal(started.state?.phase, "playing");
  assert.equal(started.state?.roundNumber, 1);

  const beforeFirstPlay = await emit(host.socket, "getState", {});
  const firstTurnPlayerId = beforeFirstPlay.state?.currentRound?.currentTurnPlayerId;
  assert.ok(firstTurnPlayerId);
  const firstTurnState = await emit(socketsByPlayerId[firstTurnPlayerId], "getState", {});
  const firstCardId = firstTurnState.state?.playableCardIds[0];
  assert.ok(firstCardId);
  const firstPlay = await emit(socketsByPlayerId[firstTurnPlayerId], "playCard", {
    cardId: firstCardId,
  });
  assert.equal(firstPlay.error, undefined);

  const hostStateBeforeRestart = await emit(host.socket, "getState", {});
  assert.equal(hostStateBeforeRestart.error, undefined);
  assert.equal(hostStateBeforeRestart.state?.phase, "playing");
  assert.equal(hostStateBeforeRestart.state?.roundNumber, 1);
  assert.equal(hostStateBeforeRestart.state?.currentRound?.currentTrick?.cards.length, 1);
  const hostHandBeforeRestart = hostStateBeforeRestart.state?.myHand.map((card) => card.id);
  assert.ok(hostHandBeforeRestart);
  assert.equal(
    fs.existsSync(path.join(process.env.COH_STATE_DIR!, `${host.roomId}.json`)),
    true,
    "room state should be persisted to disk before restart"
  );

  Object.values(socketsByPlayerId).forEach((socket) => socket.disconnect());
  await closeServer();
  await bootServer();

  const resumedSocketsByPlayerId: Record<string, TestSocket> = {};
  for (const session of sessions) {
    const resumed = await resumeSession(
      host.roomId,
      session.playerId,
      session.sessionToken
    );
    resumedSocketsByPlayerId[session.playerId] = resumed.socket;
    assert.equal(resumed.state.phase, "playing");
    assert.equal(resumed.state.roundNumber, 1);
    assert.equal(resumed.state.players.length, 4);
  }

  const resumedHostState = await emit(resumedSocketsByPlayerId[host.playerId], "getState", {});
  assert.equal(resumedHostState.error, undefined);
  assert.deepEqual(
    resumedHostState.state?.myHand.map((card) => card.id),
    hostHandBeforeRestart
  );
  assert.equal(resumedHostState.state?.currentRound?.currentTrick?.cards.length, 1);

  const actionCount = await playUntilRoundNumber(
    resumedSocketsByPlayerId,
    resumedSocketsByPlayerId[host.playerId],
    2
  );
  assert.ok(actionCount > 0);
  const round2 = await emit(resumedSocketsByPlayerId[host.playerId], "getState", {});
  assert.equal(round2.error, undefined);
  assert.equal(round2.state?.roundNumber, 2);

  Object.values(resumedSocketsByPlayerId).forEach((socket) => socket.disconnect());
}

async function testBadResumeTokenIsRejected(): Promise<void> {
  const host = await createRoom("TokenHost");
  host.socket.disconnect();
  const socket = await connectSocket();
  const resumed = await emit(socket, "resumeSession", {
    roomId: host.roomId,
    playerId: host.playerId,
    sessionToken: "bad-token",
  });
  assertErrorMessage(
    resumed,
    "セッションの復帰に失敗しました。もう一度ルームに参加してください。"
  );
  socket.disconnect();
}

async function testStartGameAndRejectIllegalCard(): Promise<void> {
  const host = await createRoom("GameHost");
  const joined = await Promise.all([
    joinRoom(host.roomId, "GameP2"),
    joinRoom(host.roomId, "GameP3"),
    joinRoom(host.roomId, "GameP4"),
  ]);
  const socketsByPlayerId: Record<string, TestSocket> = {
    [host.playerId]: host.socket,
  };
  for (const player of joined) {
    socketsByPlayerId[player.playerId] = player.socket;
  }

  const started = await emit(host.socket, "startGame", {});
  assert.equal(started.error, undefined);
  assert.equal(started.state?.phase, "playing");

  let rejectedIllegalPlay = false;
  for (let i = 0; i < 120 && !rejectedIllegalPlay; i += 1) {
    const state = await emit(host.socket, "getState", {});
    assert.equal(state.error, undefined);
    const turnPlayerId = state.state?.currentRound?.currentTurnPlayerId;
    assert.ok(turnPlayerId);
    const turnState = await emit(socketsByPlayerId[turnPlayerId], "getState", {});
    const illegalCard = turnState.state?.myHand.find(
      (card) => !turnState.state?.playableCardIds.includes(card.id)
    );
    if (illegalCard) {
      const rejected = await emit(socketsByPlayerId[turnPlayerId], "playCard", {
        cardId: illegalCard.id,
      });
      assert.ok(rejected.error, "non-playable card should be rejected");
      rejectedIllegalPlay = true;
      break;
    }

    const cardId = turnState.state?.playableCardIds[0];
    assert.ok(cardId);
    const played = await emit(socketsByPlayerId[turnPlayerId], "playCard", { cardId });
    assert.equal(played.error, undefined);
  }

  assert.equal(rejectedIllegalPlay, true, "scenario should encounter a restricted hand");
  Object.values(socketsByPlayerId).forEach((socket) => socket.disconnect());
}

async function run(): Promise<void> {
  await bootServer();
  try {
    await testHealthAndReadinessEndpoints();
    await testReadableValidationErrors();
    await testInvalidSocketPayloadsAreRejected();
    await testSocketRateLimitRejectsBursts();
    await testRoomJoinAttemptRateLimitSurvivesSocketReconnects();
    await testCreateJoinAndRejectDuplicateNames();
    await testReadableJoinAndActionErrors();
    await testConcurrentJoinsAreSerialized();
    await testServerRestartResumeSession();
    await testExpiredRoomIsDeletedOnRestart();
    await testServerRestartDuringGameResumeAndContinue();
    await testBadResumeTokenIsRejected();
    await testStartGameAndRejectIllegalCard();
  } finally {
    await closeServer();
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
}

run()
  .then(() => console.log("Server integration tests passed"))
  .catch(async (error) => {
    await closeServer().catch(() => undefined);
    fs.rmSync(stateDir, { recursive: true, force: true });
    console.error(error);
    process.exit(1);
  });
