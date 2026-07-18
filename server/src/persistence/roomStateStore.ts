import crypto from "crypto";
import fs from "fs/promises";
import net from "net";
import path from "path";
import tls from "tls";
import type { RoomGameSnapshot } from "../game/RoomGame";

export interface PersistedRoomState {
  version: 1;
  roomId: string;
  room: RoomGameSnapshot;
  sessionTokens: Record<string, string>;
  updatedAt: string;
}

export interface RoomStateStore {
  readonly description: string;
  healthCheck(): Promise<void>;
  loadRooms(): Promise<Record<string, PersistedRoomState>>;
  loadRoom(roomId: string): Promise<PersistedRoomState | null>;
  saveRoom(roomId: string, state: PersistedRoomState): Promise<void>;
  deleteRoom(roomId: string): Promise<void>;
  withRoomLock<T>(roomId: string, task: () => Promise<T>): Promise<T>;
}

export function createRoomStateStore(): RoomStateStore {
  if (process.env.REDIS_URL) {
    return new RedisRoomStateStore(process.env.REDIS_URL);
  }
  if (process.env.COH_STATE_BACKEND === "memory") {
    return new MemoryRoomStateStore();
  }
  return new JsonRoomStateStore(
    process.env.COH_STATE_DIR ?? path.join(process.cwd(), ".data", "rooms"),
    process.env.COH_STATE_FILE ?? path.join(process.cwd(), ".data", "server-state.json")
  );
}

export function createPersistedRoomState(
  roomId: string,
  room: RoomGameSnapshot,
  sessionTokens: Record<string, string>
): PersistedRoomState {
  return {
    version: 1,
    roomId,
    room,
    sessionTokens,
    updatedAt: new Date().toISOString(),
  };
}

class MemoryRoomStateStore implements RoomStateStore {
  readonly description = "memory:per-room";
  private readonly rooms: Record<string, PersistedRoomState> = {};
  private readonly locks = new LocalRoomLocks();

  async healthCheck(): Promise<void> {
    return;
  }

  async loadRooms(): Promise<Record<string, PersistedRoomState>> {
    return cloneJson(this.rooms);
  }

  async loadRoom(roomId: string): Promise<PersistedRoomState | null> {
    return this.rooms[roomId] ? cloneJson(this.rooms[roomId]) : null;
  }

  async saveRoom(roomId: string, state: PersistedRoomState): Promise<void> {
    this.rooms[roomId] = cloneJson(state);
  }

  async deleteRoom(roomId: string): Promise<void> {
    delete this.rooms[roomId];
  }

  async withRoomLock<T>(roomId: string, task: () => Promise<T>): Promise<T> {
    return this.locks.run(roomId, task);
  }
}

class JsonRoomStateStore implements RoomStateStore {
  readonly description: string;
  private readonly locks = new LocalRoomLocks();

  constructor(
    private readonly directoryPath: string,
    private readonly legacyFilePath: string
  ) {
    this.description = `json-rooms:${directoryPath}`;
  }

  async healthCheck(): Promise<void> {
    await fs.mkdir(this.directoryPath, { recursive: true });
  }

  async loadRooms(): Promise<Record<string, PersistedRoomState>> {
    const rooms: Record<string, PersistedRoomState> = {};
    for (const state of await this.loadRoomFiles()) {
      rooms[state.roomId] = state;
    }

    if (Object.keys(rooms).length === 0) {
      for (const state of Object.values(await this.loadLegacyState())) {
        rooms[state.roomId] = state;
        await this.saveRoom(state.roomId, state);
      }
    }

    return rooms;
  }

  async loadRoom(roomId: string): Promise<PersistedRoomState | null> {
    try {
      const raw = await fs.readFile(this.roomFilePath(roomId), "utf8");
      return normalizeRoomState(JSON.parse(raw));
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        const legacy = await this.loadLegacyState();
        return legacy[roomId] ?? null;
      }
      throw error;
    }
  }

  async saveRoom(roomId: string, state: PersistedRoomState): Promise<void> {
    await fs.mkdir(this.directoryPath, { recursive: true });
    const filePath = this.roomFilePath(roomId);
    const tmpPath = `${filePath}.${process.pid}.tmp`;
    await fs.writeFile(tmpPath, `${JSON.stringify(state)}\n`, "utf8");
    await fs.rename(tmpPath, filePath);
  }

  async deleteRoom(roomId: string): Promise<void> {
    await fs.rm(this.roomFilePath(roomId), { force: true });
  }

  async withRoomLock<T>(roomId: string, task: () => Promise<T>): Promise<T> {
    return this.locks.run(roomId, task);
  }

  private async loadRoomFiles(): Promise<PersistedRoomState[]> {
    try {
      const entries = await fs.readdir(this.directoryPath);
      const states: PersistedRoomState[] = [];
      for (const entry of entries) {
        if (!entry.endsWith(".json")) {
          continue;
        }
        const raw = await fs.readFile(path.join(this.directoryPath, entry), "utf8");
        states.push(normalizeRoomState(JSON.parse(raw)));
      }
      return states;
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  private async loadLegacyState(): Promise<Record<string, PersistedRoomState>> {
    try {
      const raw = await fs.readFile(this.legacyFilePath, "utf8");
      const legacy = JSON.parse(raw) as {
        rooms?: Record<string, RoomGameSnapshot>;
        sessionTokens?: Record<string, Record<string, string>>;
      };
      return Object.fromEntries(
        Object.entries(legacy.rooms ?? {}).map(([roomId, room]) => [
          roomId,
          createPersistedRoomState(roomId, room, legacy.sessionTokens?.[roomId] ?? {}),
        ])
      );
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return {};
      }
      throw error;
    }
  }

  private roomFilePath(roomId: string): string {
    return path.join(this.directoryPath, `${roomId}.json`);
  }
}

class RedisRoomStateStore implements RoomStateStore {
  readonly description: string;
  private readonly keyPrefix: string;
  private readonly lockTtlMs: number;

  constructor(private readonly redisUrl: string) {
    this.keyPrefix = process.env.COH_REDIS_KEY_PREFIX ?? "coh";
    this.lockTtlMs = Number(process.env.COH_REDIS_LOCK_TTL_MS ?? 10_000);
    this.description = `redis-rooms:${this.keyPrefix}:room:*`;
  }

  async healthCheck(): Promise<void> {
    const result = await this.command(["PING"]);
    if (result !== "PONG") {
      throw new Error("Unexpected Redis PING response");
    }
  }

  async loadRooms(): Promise<Record<string, PersistedRoomState>> {
    const rooms: Record<string, PersistedRoomState> = {};
    for (const key of await this.scanKeys(`${this.keyPrefix}:room:*`)) {
      const raw = await this.command(["GET", key]);
      if (typeof raw === "string") {
        const state = normalizeRoomState(JSON.parse(raw));
        rooms[state.roomId] = state;
      }
    }
    return rooms;
  }

  async loadRoom(roomId: string): Promise<PersistedRoomState | null> {
    const raw = await this.command(["GET", this.roomKey(roomId)]);
    if (raw == null) {
      return null;
    }
    if (typeof raw !== "string") {
      throw new Error("Redis room state value is not a string");
    }
    return normalizeRoomState(JSON.parse(raw));
  }

  async saveRoom(roomId: string, state: PersistedRoomState): Promise<void> {
    await this.command(["SET", this.roomKey(roomId), JSON.stringify(state)]);
  }

  async deleteRoom(roomId: string): Promise<void> {
    await this.command(["DEL", this.roomKey(roomId)]);
  }

  async withRoomLock<T>(roomId: string, task: () => Promise<T>): Promise<T> {
    const lockKey = `${this.keyPrefix}:lock:${roomId}`;
    const lockToken = crypto.randomBytes(16).toString("hex");
    await this.acquireLock(lockKey, lockToken);
    try {
      return await task();
    } finally {
      await this.releaseLock(lockKey, lockToken);
    }
  }

  private async acquireLock(lockKey: string, lockToken: string): Promise<void> {
    const deadline = Date.now() + this.lockTtlMs;
    while (Date.now() < deadline) {
      const result = await this.command([
        "SET",
        lockKey,
        lockToken,
        "NX",
        "PX",
        String(this.lockTtlMs),
      ]);
      if (result === "OK") {
        return;
      }
      await delay(50);
    }
    throw new Error("ルームの処理が混み合っています。少し待ってから再試行してください。");
  }

  private async releaseLock(lockKey: string, lockToken: string): Promise<void> {
    await this.command([
      "EVAL",
      "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end",
      "1",
      lockKey,
      lockToken,
    ]);
  }

  private async scanKeys(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = "0";
    do {
      const result = await this.command(["SCAN", cursor, "MATCH", pattern, "COUNT", "100"]);
      if (!Array.isArray(result) || typeof result[0] !== "string" || !Array.isArray(result[1])) {
        throw new Error("Unexpected Redis SCAN response");
      }
      cursor = result[0];
      keys.push(...result[1].filter((item): item is string => typeof item === "string"));
    } while (cursor !== "0");
    return keys;
  }

  private roomKey(roomId: string): string {
    return `${this.keyPrefix}:room:${roomId}`;
  }

  private async command(args: string[]): Promise<RedisValue> {
    const parsed = new URL(this.redisUrl);
    const port = parsed.port ? Number(parsed.port) : 6379;
    const host = parsed.hostname || "127.0.0.1";
    const useTls = parsed.protocol === "rediss:";
    const dbIndex = parsed.pathname.length > 1 ? parsed.pathname.slice(1) : "";
    const commands: string[][] = [];

    if (parsed.password) {
      commands.push(
        parsed.username
          ? ["AUTH", decodeURIComponent(parsed.username), decodeURIComponent(parsed.password)]
          : ["AUTH", decodeURIComponent(parsed.password)]
      );
    }
    if (dbIndex) {
      commands.push(["SELECT", dbIndex]);
    }
    commands.push(args);

    return new Promise<RedisValue>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const socket = useTls
        ? tls.connect({ host, port, servername: host })
        : net.connect({ host, port });

      socket.once("connect", () => {
        socket.end(commands.map(encodeRedisCommand).join(""));
      });
      socket.on("data", (chunk) => chunks.push(chunk));
      socket.once("error", reject);
      socket.once("end", () => {
        try {
          const parser = new RedisResponseParser(Buffer.concat(chunks));
          let result: RedisValue = null;
          for (let i = 0; i < commands.length; i += 1) {
            result = parser.parse();
          }
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
    });
  }
}

class LocalRoomLocks {
  private readonly locks: Record<string, Promise<void>> = {};

  async run<T>(roomId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.locks[roomId] ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = previous.then(() => current, () => current);
    this.locks[roomId] = queued;

    await previous.catch(() => undefined);
    try {
      return await task();
    } finally {
      release();
      if (this.locks[roomId] === queued) {
        delete this.locks[roomId];
      }
    }
  }
}

type RedisValue = string | number | null | RedisValue[];

class RedisResponseParser {
  private offset = 0;
  private readonly delimiter = Buffer.from("\r\n");

  constructor(private readonly input: Buffer) {}

  parse(): RedisValue {
    const type = String.fromCharCode(this.input[this.offset]);
    this.offset += 1;
    if (type === "+") {
      return this.readLine();
    }
    if (type === "-") {
      throw new Error(this.readLine());
    }
    if (type === ":") {
      return Number(this.readLine());
    }
    if (type === "$") {
      const length = Number(this.readLine());
      if (length === -1) {
        return null;
      }
      const value = this.input.toString("utf8", this.offset, this.offset + length);
      this.offset += length + 2;
      return value;
    }
    if (type === "*") {
      const length = Number(this.readLine());
      if (length === -1) {
        return null;
      }
      const values: RedisValue[] = [];
      for (let i = 0; i < length; i += 1) {
        values.push(this.parse());
      }
      return values;
    }
    throw new Error(`Unsupported Redis response type: ${type}`);
  }

  private readLine(): string {
    const end = this.input.indexOf(this.delimiter, this.offset);
    if (end < 0) {
      throw new Error("Invalid Redis response");
    }
    const line = this.input.toString("utf8", this.offset, end);
    this.offset = end + 2;
    return line;
  }
}

function normalizeRoomState(value: unknown): PersistedRoomState {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid persisted room state");
  }
  const state = value as Partial<PersistedRoomState>;
  if (!state.roomId || !state.room) {
    throw new Error("Invalid persisted room state");
  }
  return {
    version: 1,
    roomId: state.roomId,
    room: state.room,
    sessionTokens: state.sessionTokens ?? {},
    updatedAt: state.updatedAt ?? new Date().toISOString(),
  };
}

function encodeRedisCommand(args: string[]): string {
  return `*${args.length}\r\n${args
    .map((arg) => {
      const value = Buffer.from(arg);
      return `$${value.length}\r\n${arg}\r\n`;
    })
    .join("")}`;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
